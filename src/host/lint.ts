/**
 * Lint pass over one knowledge base (llm_wiki's third operation): broken
 * wikilinks, orphan pages, missing descriptions/frontmatter, dangling source
 * references, empty bodies.
 * @module dsh-knowledge-cards/host/lint
 */

import { basename } from 'node:path'
import { parseFrontmatter } from '../core/frontmatter.ts'
import { extractWikilinks } from '../core/search.ts'
import type { CardMeta, KbConfig, LintIssue } from '../core/types.ts'
import { listCards, readCard, resolveLinkTargets, listSources } from './store.ts'

export async function lintKb(kb: KbConfig): Promise<LintIssue[]> {
  const issues: LintIssue[] = []
  const cards = await listCards(kb)
  const targets = await resolveLinkTargets(kb)
  const sourcePaths = new Set((await listSources(kb)).map((source) => source.relPath))
  const inbound = new Map<string, number>()
  for (const card of cards) inbound.set(card.slug, 0)

  for (const card of cards) {
    const raw = (await readCard(kb, card.slug))?.raw ?? ''
    const parsed = parseFrontmatter(raw)
    const path = card.path

    if (parsed.frontmatter === null) {
      issues.push({ severity: 'error', kind: 'missing-frontmatter', path, message: `页面缺少 YAML frontmatter（type/title 必填）` })
    }
    if (card.description === undefined || card.description.trim() === '') {
      issues.push({ severity: 'warn', kind: 'missing-description', path, message: `页面没有一句话摘要（frontmatter description），卡片墙无法展示` })
    }
    if (parsed.body.trim() === '') {
      issues.push({ severity: 'warn', kind: 'empty-body', path, message: '页面正文为空' })
    }
    for (const link of extractWikilinks(parsed.body)) {
      if (!targets.has(link)) {
        issues.push({ severity: 'error', kind: 'broken-wikilink', path, message: `正文引用了不存在的页面 [[${link}]]` })
      }
    }
    for (const source of card.sources) {
      if (!sourcePaths.has(source)) {
        issues.push({ severity: 'warn', kind: 'missing-source', path, message: `引用的原始资料不存在于 raw/sources: ${source}` })
      }
    }
    // Count inbound links (from other content pages; index.md is not counted).
    for (const other of cards) {
      if (other.slug === card.slug) continue
      const otherRaw = (await readCard(kb, other.slug))?.raw ?? ''
      const links = extractWikilinks(parseFrontmatter(otherRaw).body)
      if (links.includes(card.slug)) inbound.set(card.slug, (inbound.get(card.slug) ?? 0) + 1)
    }
  }

  // ---- field-card lineage checks -------------------------------------------
  // Relations live in the frontmatter (depends_on / used_by / implemented_in /
  // governed_by). Checks: dangling depends_on, self reference, one-way
  // (asymmetric) dependency, and cycles over depends_on. Relation targets that
  // resolve to a card also count as inbound references (so a field card linked
  // only through metadata is not reported as an orphan).
  const fieldCards = cards.filter((card) => card.type === 'field')
  if (fieldCards.length > 0) {
    const normalize = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '')
    const RELATION_KEYS = ['depends_on', 'used_by', 'implemented_in', 'governed_by'] as const
    const relationsOf = new Map<string, Record<string, string[]>>()
    const identifiersOf = new Map<string, string[]>()
    const byIdentifier = new Map<string, string>()

    for (const card of fieldCards) {
      const raw = (await readCard(kb, card.slug))?.raw ?? ''
      const fm = parseFrontmatter(raw).frontmatter ?? {}
      const relations: Record<string, string[]> = {}
      for (const key of RELATION_KEYS) {
        const value = fm[key]
        relations[key] = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      }
      relationsOf.set(card.slug, relations)
      const identifiers = [card.slug, card.title, fm.canonical_name, fm.field_id]
        .concat(Array.isArray(fm.aliases) ? fm.aliases : [])
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      identifiersOf.set(card.slug, identifiers)
      for (const identifier of identifiers) {
        const key = normalize(identifier)
        if (!byIdentifier.has(key)) byIdentifier.set(key, card.slug)
      }
    }
    const resolveTarget = (target: string): string | null => byIdentifier.get(normalize(target)) ?? null

    // Relation targets that resolve to a card count as inbound references.
    for (const card of fieldCards) {
      const relations = relationsOf.get(card.slug) ?? {}
      for (const key of RELATION_KEYS) {
        for (const target of relations[key] ?? []) {
          const targetSlug = resolveTarget(target)
          if (targetSlug !== null && targetSlug !== card.slug) {
            inbound.set(targetSlug, (inbound.get(targetSlug) ?? 0) + 1)
          }
        }
      }
    }

    for (const card of fieldCards) {
      const relations = relationsOf.get(card.slug) ?? {}
      const dependsOn = relations.depends_on ?? []
      for (const target of dependsOn) {
        const targetSlug = resolveTarget(target)
        if (targetSlug === null) {
          issues.push({
            severity: 'warn',
            kind: 'relation-dangling',
            path: card.path,
            message: `depends_on 指向的字段卡不存在：${target}（依赖应指向字段卡；若为外部系统字段请改用 implemented_in，或先建卡）`,
          })
        } else if (targetSlug === card.slug) {
          issues.push({ severity: 'warn', kind: 'relation-self', path: card.path, message: `depends_on 指向自身：${target}` })
        } else {
          const back = (relationsOf.get(targetSlug)?.used_by ?? []).map(normalize)
          const selfIds = identifiersOf.get(card.slug) ?? []
          const hasBackReference = back.some((entry) => selfIds.some((identifier) => normalize(identifier) === entry))
          if (!hasBackReference) {
            issues.push({
              severity: 'warn',
              kind: 'relation-asymmetric',
              path: card.path,
              message: `血缘不对称：本卡 depends_on「${target}」，但对方 used_by 未包含本卡（建议补齐反向边，或确认方向）`,
            })
          }
        }
      }
    }

    // Cycles over depends_on (DFS, report each cycle once).
    const edges = new Map<string, string[]>()
    for (const card of fieldCards) {
      const targets = (relationsOf.get(card.slug)?.depends_on ?? [])
        .map(resolveTarget)
        .filter((slug): slug is string => slug !== null && slug !== card.slug)
      edges.set(card.slug, targets)
    }
    const state = new Map<string, 1 | 2>()
    const stack: string[] = []
    const reported = new Set<string>()
    const visit = (node: string): void => {
      state.set(node, 1)
      stack.push(node)
      for (const next of edges.get(node) ?? []) {
        if (state.get(next) === 1) {
          const cycle = [...stack.slice(stack.indexOf(next)), next].join(' → ')
          if (!reported.has(cycle)) {
            reported.add(cycle)
            issues.push({
              severity: 'warn',
              kind: 'relation-cycle',
              path: fieldCards.find((card) => card.slug === node)?.path,
              message: `血缘存在环：${cycle}`,
            })
          }
        } else if (state.get(next) === undefined) {
          visit(next)
        }
      }
      stack.pop()
      state.set(node, 2)
    }
    for (const card of fieldCards) {
      if (state.get(card.slug) === undefined) visit(card.slug)
    }
  }

  for (const card of cards) {
    const count = inbound.get(card.slug) ?? 0
    if (count === 0 && card.type !== 'overview') {
      // Source pages are reachable through frontmatter sources[] sharing
      // (llm_wiki's "source overlap" signal) — not orphans.
      if (card.type === 'source') {
        const referenced = cards.some(
          (other) => other.slug !== card.slug && other.sources.some((source) => card.sources.includes(source)),
        )
        if (referenced) continue
      }
      issues.push({ severity: 'warn', kind: 'orphan', path: card.path, message: `孤立页面：没有其他页面链接到 [[${card.slug}]]` })
    }
  }

  return issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1
    return (a.path ?? '').localeCompare(b.path ?? '')
  })
}

/** Compact summary for the agent-facing lint tool. */
export function renderLintReport(kbName: string, issues: LintIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === 'error')
  const warns = issues.filter((issue) => issue.severity === 'warn')
  const lines = [`知识库「${kbName}」lint 结果：${errors.length} error / ${warns.length} warn`]
  if (issues.length === 0) {
    lines.push('一切健康 ✅')
    return lines.join('\n')
  }
  for (const issue of issues) {
    lines.push(`- [${issue.severity}] ${issue.path ?? '-'} ${issue.message}`)
  }
  return lines.join('\n')
}
