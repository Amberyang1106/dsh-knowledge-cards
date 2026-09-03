/**
 * Rule-set compilation for rule cards (type=rules) — the stable interface
 * between a knowledge base and external check pipelines (e.g. ROW PSD Recon).
 *
 * Reads rule cards from the KB, parses their structured frontmatter (nested
 * YAML), validates shape (required fields / status lifecycle / operator
 * whitelist), filters by rule set + status + effective window, and returns a
 * versioned batch JSON via GET /api/dsh-knowledge/rules. Deterministic — no
 * LLM. The caller pins the returned version/hash per run for traceability.
 * @module dsh-knowledge-cards/host/rules
 */

import { createHash } from 'node:crypto'
import { parseFrontmatter } from '../core/frontmatter.ts'
import { RULE_OPERATORS, RULE_STATUSES } from '../core/types.ts'
import type { CompiledRule, InvalidRule, KbConfig, RulesResult, RuleSpec } from '../core/types.ts'
import { listCards, readCard, today } from './store.ts'

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function inEffectWindow(effectiveFrom: string | undefined, effectiveTo: string | undefined): boolean {
  const now = today() // YYYY-MM-DD — string comparison is chronological.
  if (effectiveFrom !== undefined && effectiveFrom > now) return false
  if (effectiveTo !== undefined && effectiveTo < now) return false
  return true
}

/** Structural validation of one rule spec (fact registry stays with the
 * evaluator side; unknown facts surface there at run time). */
function validateSpec(fm: Record<string, unknown>): string[] {
  const issues: string[] = []
  if (asString(fm.rule_id) === undefined) issues.push('缺 rule_id')
  const ruleSet = asString(fm.rule_set)
  if (ruleSet === undefined) issues.push('缺 rule_set')
  const status = asString(fm.status) ?? 'draft'
  if (!(RULE_STATUSES as readonly string[]).includes(status)) issues.push(`status 非法: ${status}（应为 ${RULE_STATUSES.join('|')}）`)

  const conditions = Array.isArray(fm.conditions) ? fm.conditions : []
  if (conditions.length === 0) issues.push('conditions 为空：至少一条 {fact, operator, value} 条件')
  conditions.forEach((entry, index) => {
    const prefix = `conditions[${index}]`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      issues.push(`${prefix} 非对象`)
      return
    }
    const condition = entry as Record<string, unknown>
    if (asString(condition.fact) === undefined) issues.push(`${prefix} 缺 fact`)
    const operator = asString(condition.operator)
    if (operator === undefined) {
      issues.push(`${prefix} 缺 operator`)
    } else if (!(RULE_OPERATORS as readonly string[]).includes(operator)) {
      issues.push(`${prefix} operator 不支持: ${operator}（应为 ${RULE_OPERATORS.join('|')}）`)
    }
  })

  const outcome = fm.outcome
  if (typeof outcome !== 'object' || outcome === null || Array.isArray(outcome)) {
    issues.push('outcome 缺失或非对象')
  } else if (asString((outcome as Record<string, unknown>).category) === undefined) {
    issues.push('outcome.category 缺失（必填）')
  }
  return issues
}

/**
 * Compile the rule set of one knowledge base.
 * @param opts.ruleSet  only rules of this rule_set (bare default = all sets)
 * @param opts.status   'active' (default) | 'all' | draft/review/deprecated
 */
export async function compileRuleSet(
  kb: KbConfig,
  opts: { ruleSet?: string; status?: string } = {},
): Promise<RulesResult> {
  const ruleSet = opts.ruleSet !== undefined && opts.ruleSet.trim() !== '' ? opts.ruleSet.trim() : undefined
  const statusFilter = opts.status !== undefined && opts.status.trim() !== '' ? opts.status.trim() : 'active'
  const wantedSet = (candidate: string | undefined): boolean => ruleSet === undefined || candidate === ruleSet

  const compiled: CompiledRule[] = []
  const invalid: InvalidRule[] = []
  const cards = (await listCards(kb)).filter((card) => card.type === 'rules')

  for (const meta of cards) {
    const card = await readCard(kb, meta.slug)
    if (card === null) continue
    const fm = parseFrontmatter(card.raw).frontmatter ?? {}
    const title = String(fm.title ?? meta.title)
    if (!wantedSet(asString(fm.rule_set))) continue

    const issues = validateSpec(fm)
    const status = asString(fm.status) ?? 'draft'
    const effectiveFrom = asString(fm.effective_from)
    const effectiveTo = asString(fm.effective_to)

    if (issues.length > 0) {
      invalid.push({ slug: meta.slug, title, issues })
      continue
    }
    if (statusFilter !== 'all' && status !== statusFilter) continue
    if (status === 'active' && !inEffectWindow(effectiveFrom, effectiveTo)) {
      invalid.push({ slug: meta.slug, title, issues: ['status 为 active 但当前日期不在生效期（effective_from/to）内'] })
      continue
    }
    compiled.push({
      slug: meta.slug,
      title,
      description: meta.description,
      updated: meta.updated,
      spec: fm as unknown as RuleSpec,
      body: card.body,
    })
  }

  compiled.sort((a, b) => (a.spec.rule_id ?? '').localeCompare(b.spec.rule_id ?? ''))
  // Content-addressed version: deterministic over the compiled active specs
  // (rules already sorted by rule_id; object key order follows file order).
  const canonical = JSON.stringify(compiled.map((rule) => rule.spec))
  const hash = createHash('sha256').update(canonical).digest('hex')
  const version = `sha256:${hash.slice(0, 8)}`

  return {
    kb: kb.id,
    ruleSet: ruleSet ?? '',
    version,
    hash,
    generatedAt: new Date().toISOString(),
    statusFilter,
    rules: compiled,
    invalidRules: invalid,
  }
}
