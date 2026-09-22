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
import type { KbConfig } from '../src/core/types.ts'
import { LINEAGE_CONFIG_DEFAULTS } from '../src/host/lineage-config.ts'
import {
  buildJevCardScopes, buildJevQuestions, buildJevState, credentialLookup, jevProposals, planJevScope, resolveJevConfig,
  runJevLineage,
} from '../src/host/jev.ts'
import type { JevCardScope } from '../src/host/jev.ts'
import { confirmFieldCards } from '../src/host/lineage.ts'
import { createCard, createKb, editCard, getKb } from '../src/host/store.ts'

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

  it('keeps card content in the state only: questions reference cards by slug', async () => {
    const states = await buildJevState((await getKb(kbId))!)
    const questions = buildJevQuestions(states)
    const mix = states.find((state) => state.slug === 'Premium-Mix')
    expect(mix).toBeDefined()
    const serialized = JSON.stringify(questions)
    // the excerpt/metadata live once, in state.cards — not in every question
    expect(serialized).not.toContain(mix?.excerpt)
    expect(serialized).not.toContain('Premium revenue amount.')
    for (const question of Object.values(questions)) {
      expect(question.instructions).toContain('state.cards')
    }
    expect(serialized).toContain('Premium-Mix')
  })
})

describe('JEV line resolution', () => {
  it('prefers OpenRouter, falls back to the TypeSafe line, and reports nothing without a key', async () => {
    const both = await resolveJevConfig({ OPENROUTER_API_KEY: 'or-key', TYPESAFE_API_KEY: 'ts-key' })
    expect(both?.line).toBe('openrouter')
    expect(both?.endpoint).toBe('https://openrouter.ai/api/v1/systemone')
    expect(both?.model).toBe('jev-1.13')
    expect(both?.apiKey).toBe('or-key')
    expect(both?.keySource).toBe('env')

    const typesafeOnly = await resolveJevConfig({ TYPESAFE_API_KEY: 'ts-key' })
    expect(typesafeOnly?.line).toBe('typesafe')
    expect(typesafeOnly?.endpoint).toBe('https://api.typesafe.ai/v1/systemone')
    expect(typesafeOnly?.model).toBe('jev-latest')
    expect(typesafeOnly?.apiKey).toBe('ts-key')

    expect(await resolveJevConfig({})).toBeNull()
    expect(await resolveJevConfig({ OPENROUTER_API_KEY: '   ' })).toBeNull()

    const overridden = await resolveJevConfig({ OPENROUTER_API_KEY: 'k', JEV_MODEL: 'jev-latest', JEV_ENDPOINT: 'https://gw.test/v1/systemone' })
    expect(overridden?.model).toBe('jev-latest')
    expect(overridden?.endpoint).toBe('https://gw.test/v1/systemone')
  })

  it('reads the key from the credentials service and names the layer it came from', async () => {
    const store: Record<string, { value: string; source: string }> = {
      OPENROUTER_API_KEY: { value: 'or-from-store', source: 'file' },
    }
    const lookup = async (ref: string): Promise<{ value: string; source: string } | undefined> => store[ref]

    // an empty environment is fine: the managed store is the authority
    const fromStore = await resolveJevConfig({}, lookup)
    expect(fromStore?.line).toBe('openrouter')
    expect(fromStore?.apiKey).toBe('or-from-store')
    expect(fromStore?.keySource).toBe('file')

    // only a TypeSafe key in the store → the direct line
    const typesafeStore = await resolveJevConfig({}, async (ref) =>
      ref === 'TYPESAFE_API_KEY' ? { value: 'ts-from-store', source: 'user-env' } : undefined,
    )
    expect(typesafeStore?.line).toBe('typesafe')
    expect(typesafeStore?.keySource).toBe('user-env')

    // the service outranks the raw environment (it already layers env on top)
    const bothSet = await resolveJevConfig({ OPENROUTER_API_KEY: 'or-env' }, lookup)
    expect(bothSet?.apiKey).toBe('or-from-store')

    // a blank stored value can never masquerade as configured
    const blank = await resolveJevConfig({}, async (ref) =>
      ref === 'OPENROUTER_API_KEY' ? { value: '   ', source: 'file' } : undefined,
    )
    expect(blank).toBeNull()
  })

  it('tolerates a host without the credentials service and ignores a malformed one', () => {
    expect(credentialLookup({ reflect: { get: () => undefined } })).toBeUndefined()
    expect(credentialLookup({ reflect: { get: () => ({}) } })).toBeUndefined()
    expect(credentialLookup({ reflect: { get: () => ({ resolve: 'nope' }) } })).toBeUndefined()
    const ok = credentialLookup({ reflect: { get: () => ({ resolve: async () => ({ value: 'v', source: 'env' }) }) } })
    expect(typeof ok).toBe('function')
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
  it('posts state+questions to the OpenRouter System One endpoint and maps the response', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', async (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> })
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          model: 'typesafe/jev-1.13-20260917',
          answers: { 'dep::Premium-Mix::Premium-Revenue': { type: 'noul', noul: 0.88 } },
          usage: { input_tokens: 1234, output_tokens: 12, cost: 0.000052 },
        }),
      } as unknown as Response
    })

    const result = await runJevLineage(
      (await getKb(kbId))!,
      { line: 'openrouter', endpoint: 'https://openrouter.ai/api/v1/systemone', model: 'jev-1.13', apiKey: 'test-key' },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/systemone')
    expect(calls[0].body.model).toBe('jev-1.13')
    expect(Object.keys(calls[0].body.questions as Record<string, unknown>).length).toBeGreaterThan(0)
    const state = calls[0].body.state as { cards: Array<{ slug: string }> }
    expect(state.cards.map((card) => card.slug)).toContain('Premium-Mix')

    // the versioned id OpenRouter routed to is reported as-is
    expect(result.model).toBe('typesafe/jev-1.13-20260917')
    expect(result.line).toBe('openrouter')
    expect(result.sentCards).toBe(3)
    expect(result.requests).toBe(1)
    expect(result.payloadChars).toBeGreaterThan(0)
    expect(result.payloadChars).toBeLessThanOrEqual(result.budgetChars)
    expect(result.usage).toEqual({ input_tokens: 1234, output_tokens: 12, cost: 0.000052 })
    expect(result.proposals.some((p) => p.slug === 'Premium-Mix' && p.source === 'jev')).toBe(true)
  })

  it('splits a big round into batches and merges answers and usage', async () => {
    const kb = await createKb({ name: 'JEV 批量测试库' })
    for (let i = 0; i < 8; i += 1) {
      const current = await getKb(kb.id)
      await createCard(current!, {
        type: 'field',
        title: `Batch Field ${i}`,
        description: `Batch field ${i} 定义`,
        body: `Field ${i} amount.`,
        frontmatter: { field_kind: 'measure', data_type: 'amount' },
      })
    }
    const calls: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(String(init.body)) as { questions: Record<string, unknown> }
      calls.push(body as unknown as Record<string, unknown>)
      const answers: Record<string, unknown> = {}
      for (const key of Object.keys(body.questions)) {
        answers[key] = key.startsWith('dep::') ? { type: 'noul', noul: 0.91 } : { type: 'noul', noul: 0.1 }
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'typesafe/jev-1.13-20260917',
            answers,
            usage: { input_tokens: 100, output_tokens: 5, cost: 0.003 },
          }),
      } as unknown as Response
    })

    const result = await runJevLineage(await getKb(kb.id)!, {
      line: 'openrouter',
      endpoint: 'https://openrouter.ai/api/v1/systemone',
      model: 'jev-1.13',
      apiKey: 'k',
    })

    // 8 cards → 8*7 dep + 8 kind + 8 agg = 72 questions → 60 + 12
    expect(result.questionCount).toBe(72)
    expect(result.requests).toBe(2)
    expect(calls).toHaveLength(2)
    const firstKeys = Object.keys((calls[0].questions ?? {}) as Record<string, unknown>)
    const secondKeys = Object.keys((calls[1].questions ?? {}) as Record<string, unknown>)
    expect(firstKeys).toHaveLength(60)
    expect(secondKeys).toHaveLength(12)
    // answers from BOTH batches reach the proposals
    const fromSecondBatch = secondKeys.find((key) => key.startsWith('dep::'))
    expect(fromSecondBatch).toBeDefined()
    const slugFrom = String(fromSecondBatch).split('::')[1]
    expect(result.proposals.some((p) => p.slug === slugFrom && (p.relations.depends_on?.length ?? 0) > 0)).toBe(true)
    // usage is summed across the requests
    expect(result.usage?.input_tokens).toBe(200)
    expect(result.usage?.output_tokens).toBe(10)
    expect(Number(result.usage?.cost)).toBeCloseTo(0.006, 8)
  })

  it('surfaces API failures loudly instead of returning empty proposals', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, text: async () => 'rate limited' }) as unknown as Response)
    await expect(
      runJevLineage((await getKb(kbId))!, {
        line: 'typesafe',
        endpoint: 'https://api.typesafe.ai/v1/systemone',
        model: 'jev-latest',
        apiKey: 'test-key',
      }),
    ).rejects.toThrow(/jev HTTP 429/)
  })
})

describe('JEV scope: skipping confirmed cards', () => {
  const kbStub = { id: 'stub' } as unknown as KbConfig
  const scopeOf = (slug: string, reviewStatus: string): JevCardScope => ({ reviewStatus, state: { slug, title: slug } })

  it('skips only pairs whose BOTH ends are confirmed (pair level, never card level)', () => {
    const scopes = [scopeOf('a', 'confirmed'), scopeOf('b', 'confirmed'), scopeOf('c', 'draft')]
    const plan = planJevScope(scopes, LINEAGE_CONFIG_DEFAULTS)
    expect(plan.skipped.sort()).toEqual(['a', 'b'])
    expect(plan.judged).toEqual(['c'])
    // 3*2 total pairs, minus the (a,b)/(b,a) pair whose both ends are done,
    // plus 2 metadata questions for the single judged card.
    expect(plan.skippedPairCount).toBe(2)
    expect(plan.questionCount).toBe(6 - 2 + 2)

    // a NEW card still gets asked against every confirmed card, both directions
    const questions = buildJevQuestions(plan.sent, { isJudged: (slug) => plan.judged.includes(slug) })
    expect(Object.keys(questions)).toContain('dep::c::a')
    expect(Object.keys(questions)).toContain('dep::a::c')
    expect(Object.keys(questions)).not.toContain('dep::a::b')
    // and the confirmed cards get no metadata questions of their own
    expect(Object.keys(questions)).not.toContain('kind::a')
    expect(Object.keys(questions)).not.toContain('agg::b')
    expect(Object.keys(questions)).toContain('kind::c')
  })

  it('counts nothing as skipped when the switch is off, and honours force flags', () => {
    const scopes = [scopeOf('a', 'confirmed'), scopeOf('b', 'confirmed')]
    expect(planJevScope(scopes, { ...LINEAGE_CONFIG_DEFAULTS, skipConfirmed: false }).skipped).toEqual([])
    expect(planJevScope(scopes, LINEAGE_CONFIG_DEFAULTS).judgedCardCount).toBe(0)

    const forced = planJevScope(scopes, LINEAGE_CONFIG_DEFAULTS, { slugs: ['a'] })
    expect(forced.skipped).toEqual(['b'])
    expect(forced.judged).toEqual(['a'])
    expect(forced.skippedPairCount).toBe(0)

    const all = planJevScope(scopes, LINEAGE_CONFIG_DEFAULTS, { all: true })
    expect(all.skipped).toEqual([])
    expect(all.judgedCardCount).toBe(2)
  })

  it('end to end: confirmed cards leave the question set but stay reachable as targets', async () => {
    const kb = await createKb({ name: 'JEV 跳过测试库' })
    for (const title of ['Alpha Field', 'Beta Field', 'Gamma Field']) {
      const current = await getKb(kb.id)
      await createCard(current!, {
        type: 'field',
        title,
        description: `${title} 定义`,
        body: `${title} amount.`,
        frontmatter: { field_kind: 'measure', data_type: 'amount' },
      })
    }
    const confirmed = await confirmFieldCards(kb, ['Gamma-Field'])
    expect(confirmed.confirmed).toEqual(['Gamma-Field'])

    const calls: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', async (_url: string, init: { body?: string }) => {
      calls.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return { ok: true, status: 200, text: async () => JSON.stringify({ model: 'm', answers: {}, usage: { input_tokens: 5 } }) } as unknown as Response
    })

    const result = await runJevLineage(await getKb(kb.id)!, {
      line: 'openrouter',
      endpoint: 'https://openrouter.ai/api/v1/systemone',
      model: 'jev-1.13',
      apiKey: 'k',
    })
    expect(result.sentCards).toBe(3)
    expect(result.judgedCards).toBe(2)
    expect(result.skippedCards).toEqual(['Gamma-Field'])
    const keys = Object.keys((calls[0].questions ?? {}) as Record<string, unknown>)
    expect(keys).not.toContain('kind::Gamma-Field')
    expect(keys).toContain('dep::Alpha-Field::Gamma-Field')
    expect(result.paramsFingerprint).toHaveLength(12)

    // forcing it back in widens the round again
    calls.length = 0
    const forced = await runJevLineage(
      await getKb(kb.id)!,
      { line: 'openrouter', endpoint: 'https://openrouter.ai/api/v1/systemone', model: 'jev-1.13', apiKey: 'k' },
      { forceSlugs: ['Gamma-Field'] },
    )
    expect(forced.skippedCards).toEqual([])
    expect(Object.keys((calls[0].questions ?? {}) as Record<string, unknown>)).toContain('kind::Gamma-Field')
  })

  it('refuses a round with nothing to judge, and applies the card cap to judged cards', async () => {
    // Any accidental fetch would mean a real (billable, networked) call: make
    // that fail loudly instead. Both cases below must trip a guard first.
    vi.stubGlobal('fetch', async () => {
      throw new Error('unexpected fetch: the guard should have blocked this round')
    })
    const transport = { line: 'openrouter' as const, endpoint: 'https://openrouter.ai/api/v1/systemone', model: 'jev-1.13', apiKey: 'k' }

    const allKb = await createKb({ name: 'JEV 全确认库' })
    for (const title of ['One Field', 'Two Field']) {
      const current = await getKb(allKb.id)
      await createCard(current!, {
        type: 'field',
        title,
        description: `${title} 定义`,
        body: `${title} amount.`,
        frontmatter: { field_kind: 'measure', data_type: 'amount' },
      })
    }
    await confirmFieldCards(allKb, ['One-Field', 'Two-Field'])
    await expect(runJevLineage(await getKb(allKb.id)!, transport)).rejects.toThrow(/无卡可判/)

    // The cap counts cards UNDER JUDGEMENT: 1 of 3 confirmed leaves 2, which
    // exceeds maxCards=1 even though the KB holds only 3 cards.
    const capKb = await createKb({ name: 'JEV 上限库' })
    for (const title of ['Alpha One', 'Beta Two', 'Gamma Three']) {
      const current = await getKb(capKb.id)
      await createCard(current!, {
        type: 'field',
        title,
        description: `${title} 定义`,
        body: `${title} amount.`,
        frontmatter: { field_kind: 'measure', data_type: 'amount' },
      })
    }
    await confirmFieldCards(capKb, ['Gamma-Three'])
    await expect(
      runJevLineage(await getKb(capKb.id)!, transport, { params: { ...LINEAGE_CONFIG_DEFAULTS, maxCards: 1 } }),
    ).rejects.toThrow(/参与判定的字段卡 2 张/)

    // Raising the cap lets the same round run (fetch stub still blocks it, which
    // proves the guard is what stopped it before).
    await expect(
      runJevLineage(await getKb(capKb.id)!, transport, { params: { ...LINEAGE_CONFIG_DEFAULTS, maxCards: 5 } }),
    ).rejects.toThrow(/unexpected fetch/)
  })

  it('honours the parameter thresholds and stamps the fingerprint on proposals', () => {
    const states = [{ slug: 'x', title: 'X', field_kind: 'dimension', aggregation: 'additive', data_type: 'string' }]
    const answers = {
      'dep::x::x2': { type: 'noul', noul: 0.7 },
      'kind::x': { type: 'choice', choice: 'dimension', confidence: 0.7 },
    }
    const strict = jevProposals(kbStub, [...states, { slug: 'x2', title: 'X2' }], answers, {
      confidenceHigh: 0.8, confidenceMedium: 0.5, depThreshold: 0.9, additiveThreshold: 0.2, paramsFingerprint: 'fp0000000000',
    })
    // 0.7 is below the raised depThreshold → no edge at all
    expect(strict.some((proposal) => proposal.relations.depends_on !== undefined)).toBe(false)

    const loose = jevProposals(kbStub, [...states, { slug: 'x2', title: 'X2' }], answers, {
      confidenceHigh: 0.6, confidenceMedium: 0.4, depThreshold: 0.5, additiveThreshold: 0.2, paramsFingerprint: 'fp1111111111',
    })
    const edge = loose.find((proposal) => proposal.relations.depends_on !== undefined)
    expect(edge).toBeDefined()
    // 0.7 ≥ confidenceHigh(0.6) → high, and the note carries the fingerprint
    expect(edge?.confidence).toBe('high')
    expect(edge?.note).toContain('fp1111111111')
  })
})
