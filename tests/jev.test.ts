/**
 * JEV (TypeSafe System One) lineage branch: state minimization, atomic question
 * shaping, typed-answer → proposal mapping, and the end-to-end round with a
 * stubbed fetch (no network, no API spend).
 * @module dsh-knowledge-cards/tests/jev
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildJevQuestions, buildJevState, jevProposals, runJevLineage } from '../src/host/jev.ts'
import { createCard, createKb, getKb } from '../src/host/store.ts'

let root: string
let kbId: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-jev-'))
  process.env.DSH_KNOWLEDGE_CARDS_ROOT = root
  const kb = await createKb({ name: 'JEV 测试库' })
  kbId = kb.id
  const seed = async (title: string, body: string, frontmatter: Record<string, unknown>): Promise<void> => {
    const current = await getKb(kbId)
    if (current === null) throw new Error('kb missing')
    await createCard(current, { type: 'field', title, description: `${title} 定义`, body, frontmatter })
  }
  await seed('Premium Mix %', 'Premium Mix = Premium Revenue / Eligible PC Revenue. 金额 1,234,567 与 SQL:\n```sql\nSELECT ttl_rev_amt FROM cam_fi.fact_x\n```', { field_kind: 'measure', data_type: 'percentage', aggregation: 'non-additive', source_table: 'cam_fi.fact_x' })
  await seed('Premium Revenue', 'Premium revenue amount.', { field_kind: 'measure', data_type: 'amount', aggregation: 'additive', source_table: 'cam_fi.fact_x' })
  await seed('Sales Office', 'Sales office text attribute.', { field_kind: 'dimension', data_type: 'string', aggregation: 'additive', source_table: 'PBI' })
})

afterAll(async () => {
  delete process.env.DSH_KNOWLEDGE_CARDS_ROOT
  await rm(root, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('JEV state + questions', () => {
  it('minimizes the state: no fenced code, no long numbers, truncated excerpt', async () => {
    const states = await buildJevState((await getKb(kbId))!)
    const mix = states.find((state) => state.slug === 'Premium-Mix')
    expect(mix).toBeDefined()
    expect(mix?.excerpt).toBeDefined()
    expect(mix?.excerpt).not.toContain('SELECT')
    expect(mix?.excerpt).not.toContain('ttl_rev_amt')
    expect(mix?.excerpt).not.toContain('1,234,567')
    expect((mix?.excerpt ?? '').length).toBeLessThanOrEqual(400)
    // metadata still travels (it is what the judging needs)
    expect(mix?.field_kind).toBe('measure')
    expect(mix?.source_table).toBe('cam_fi.fact_x')
  })

  it('asks one noul per ordered pair plus metadata questions', async () => {
    const states = await buildJevState((await getKb(kbId))!)
    const questions = buildJevQuestions(states)
    const n = states.length
    expect(Object.keys(questions).filter((key) => key.startsWith('dep::'))).toHaveLength(n * (n - 1))
    expect(Object.keys(questions).filter((key) => key.startsWith('kind::'))).toHaveLength(n)
    expect(Object.keys(questions).filter((key) => key.startsWith('agg::'))).toHaveLength(n)
  })
})

describe('JEV typed answers → proposals', () => {
  it('maps confident noul answers into both edge directions with scores', async () => {
    const kb = (await getKb(kbId))!
    const states = await buildJevState(kb)
    const proposals = jevProposals(kb, states, {
      'dep::Premium-Mix::Premium-Revenue': { type: 'noul', noul: 0.93 },
      'dep::Premium-Revenue::Premium-Mix': { type: 'noul', noul: 0.2 },
      'kind::Sales-Office': { type: 'choice', choice: 'dimension', confidence: 0.9 },
      'agg::Sales-Office': { type: 'noul', noul: 0.05 },
    })
    const forward = proposals.find((p) => p.slug === 'Premium-Mix')
    expect(forward?.relations.depends_on).toEqual(['Premium-Revenue'])
    expect(forward?.confidence).toBe('high')
    expect(forward?.score).toBeCloseTo(0.93, 2)
    const reverse = proposals.find((p) => p.slug === 'Premium-Revenue')
    expect(reverse?.relations.used_by).toEqual(['Premium-Mix'])
    // kind unchanged (dimension already recorded) → no proposal for it
    expect(proposals.some((p) => p.metadata?.field_kind !== undefined)).toBe(false)
    // confident "not additive" on a dimension → aggregation correction
    const agg = proposals.find((p) => p.metadata?.aggregation === 'non-additive')
    expect(agg?.slug).toBe('Sales-Office')
  })
})

describe('JEV round trip (stubbed fetch)', () => {
  it('posts state+questions to the TypeSafe endpoint and maps the response', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'jev-1.13.0',
          answers: { 'dep::Premium-Mix::Premium-Revenue': { type: 'noul', noul: 0.88 } },
          usage: { input_tokens: 1234, output_tokens: 12 },
        }),
      } as unknown as Response
    })

    const result = await runJevLineage((await getKb(kbId))!, 'test-key')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(calls[0].body.model).toBe('jev-latest')
    expect(Object.keys(calls[0].body.questions as Record<string, unknown>).length).toBeGreaterThan(0)
    const state = calls[0].body.state as { cards: Array<{ slug: string }> }
    expect(state.cards.map((card) => card.slug)).toContain('Premium-Mix')

    expect(result.model).toBe('jev-1.13.0')
    expect(result.sentCards).toBe(3)
    expect(result.usage).toEqual({ input_tokens: 1234, output_tokens: 12 })
    expect(result.proposals.some((p) => p.slug === 'Premium-Mix' && p.source === 'jev')).toBe(true)
  })

  it('surfaces API failures loudly instead of returning empty proposals', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, text: async () => 'rate limited' }) as unknown as Response)
    await expect(runJevLineage((await getKb(kbId))!, 'test-key')).rejects.toThrow(/jev HTTP 429/)
  })
})
