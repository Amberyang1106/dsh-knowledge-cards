/**
 * Field-card lineage: agent-side structured writes (wiki_edit_card relations /
 * metadata) plus the lint lineage checks (dangling depends_on, one-way
 * dependency, self reference, cycles).
 * @module dsh-knowledge-cards/tests/field-lineage
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFrontmatter } from '../src/core/frontmatter.ts'
import { lintKb } from '../src/host/lint.ts'
import { createCard, createKb, getKb, readCard } from '../src/host/store.ts'
import { wikiEditCardTool } from '../src/host/tools.ts'

let root: string
let kbId: string

async function seedField(title: string, relations: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
  const kb = await getKb(kbId)
  if (kb === null) throw new Error('kb missing')
  await createCard(kb, {
    type: 'field',
    title,
    description: `${title} 的业务定义`,
    body: `${title} 正文，含计算逻辑说明。`,
    frontmatter: { field_kind: 'measure', review_status: 'inferred', evidence_level: 'inferred', ...relations, ...extra },
  })
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-lineage-'))
  process.env.DSH_KNOWLEDGE_CARDS_ROOT = root
  const kb = await createKb({ name: '血缘测试库' })
  kbId = kb.id
})

afterAll(async () => {
  delete process.env.DSH_KNOWLEDGE_CARDS_ROOT
  await rm(root, { recursive: true, force: true })
})

describe('field lineage lint', () => {
  it('flags dangling depends_on, one-way dependency and self reference', async () => {
    await seedField('Lineage A', { depends_on: ['Lineage-B'] })
    await seedField('Lineage B', { depends_on: ['Lineage-Missing'] })
    await seedField('Lineage C', { depends_on: ['Lineage C'] })

    const kb = await getKb(kbId)
    const issues = await lintKb(kb)
    const kinds = issues.map((issue) => issue.kind)
    expect(kinds).toContain('relation-dangling')
    expect(kinds).toContain('relation-asymmetric')
    expect(kinds).toContain('relation-self')

    const dangling = issues.find((issue) => issue.kind === 'relation-dangling')
    expect(dangling?.message).toContain('Lineage-Missing')
  })

  it('flags cycles over depends_on', async () => {
    await seedField('Lineage D', { depends_on: ['Lineage-E'] })
    await seedField('Lineage E', { depends_on: ['Lineage-D'], used_by: ['Lineage-D'] })
    const kb = await getKb(kbId)
    const issues = await lintKb(kb)
    const cycle = issues.find((issue) => issue.kind === 'relation-cycle')
    expect(cycle).toBeDefined()
    expect(cycle?.message).toContain('Lineage')
  })
})

describe('wiki_edit_card structured writes (AI lineage completion)', () => {
  it('writes relations + metadata, keeps unrelated keys, and can clear asymmetry', async () => {
    const tool = wikiEditCardTool()
    const kb = await getKb(kbId)

    // AI-style write: inferred relations + explicit provenance marking
    const written = await tool.execute({
      kb: kbId,
      slug: 'Lineage-B',
      relations: { depends_on: ['Lineage-A'], used_by: [] },
      metadata: { review_status: 'confirmed', evidence_level: 'business_confirmation', aggregation: 'additive' },
    })
    expect(written.changed).toContain('字段元数据')
    expect(written.relations.depends_on).toEqual(['Lineage-A'])

    const fm = parseFrontmatter((await readCard(kb, 'Lineage-B')).raw).frontmatter ?? {}
    expect(fm.depends_on).toEqual(['Lineage-A'])
    expect(fm.review_status).toBe('confirmed')
    expect(fm.evidence_level).toBe('business_confirmation')
    expect(fm.aggregation).toBe('additive')
    expect(fm.field_kind).toBe('measure') // untouched key survives

    // Complete the reverse edges (A ⇄ B) — the asymmetry warning clears
    await tool.execute({ kb: kbId, slug: 'Lineage-A', relations: { depends_on: ['Lineage-B'], used_by: ['Lineage-B'] } })
    await tool.execute({ kb: kbId, slug: 'Lineage-B', relations: { depends_on: ['Lineage-A'], used_by: ['Lineage-A'] } })

    const issues = await lintKb(await getKb(kbId))
    const asymmetricOnA = issues.filter((issue) => issue.kind === 'relation-asymmetric' && (issue.path ?? '').includes('Lineage-A'))
    expect(asymmetricOnA).toHaveLength(0)
  })

  it('keeps multiple identifiers resolvable (title, canonical_name, aliases)', async () => {
    await seedField('Period Revenue', { depends_on: [] }, { canonical_name: 'period_revenue', aliases: ['Period Rev'] })
    const tool = wikiEditCardTool()
    await tool.execute({ kb: kbId, slug: 'Lineage-A', relations: { depends_on: ['period_revenue'] } })
    const issues = await lintKb(await getKb(kbId))
    const danglingOnA = issues.filter((issue) => issue.kind === 'relation-dangling' && (issue.message.includes('period_revenue')))
    expect(danglingOnA).toHaveLength(0)
  })
})
