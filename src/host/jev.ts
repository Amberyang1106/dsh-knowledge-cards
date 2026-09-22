/**
 * JEV (TypeSafe System One) lineage judging — the "② JEV 判断" branch.
 *
 * Jev is not a chat model: it evaluates a `state` against a map of typed
 * questions (noul / choice / score) and returns structured answers with
 * confidence. We therefore decompose lineage completion into atomic questions
 * (one noul per ordered card pair + a few metadata questions), send a
 * MINIMIZED state (no SQL bodies, no numbers, truncated excerpts), and turn
 * the typed answers back into ordinary LineageProposals — the preview/apply
 * path stays exactly the same.
 *
 * Two interchangeable lines carry the same NATIVE System One shape, so the
 * request body is identical either way:
 *  - OpenRouter (default): POST https://openrouter.ai/api/v1/systemone with
 *    model typesafe/jev-1.13 (bare `jev-1.13` / `jev-latest` are mapped onto
 *    the typesafe/ namespace). Verified 2026-09: the route answers 401 rather
 *    than 404 without a key, and the model is missing from GET /api/v1/models
 *    only because its output modality is `decisions`, not `text`. OpenRouter
 *    does NOT expose Jev through the OpenAI-compatible chat endpoint.
 *  - TypeSafe direct (fallback): POST https://api.typesafe.ai/v1/systemone.
 * Request {model, state, questions} → response {model, answers, usage};
 * OpenRouter additionally returns id / provider / usage.cost.
 * Context is 32k tokens, $0.042/M input, output free, no parameters supported.
 * @module dsh-knowledge-cards/host/jev
 */

import { parseFrontmatter } from '../core/frontmatter.ts'
import type { KbConfig, LineageProposal } from '../core/types.ts'
import { listCards, readCard } from './store.ts'

/** Which line serves the request. */
export type JevLine = 'openrouter' | 'typesafe'

export interface JevConfig {
  line: JevLine
  endpoint: string
  model: string
  apiKey: string
  /** Which layer supplied the key (`env` / `file` / `project-env` / `user-env`). */
  keySource: string
}

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TYPESAFE_MODEL = 'jev-latest'
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/systemone'
const OPENROUTER_MODEL = 'jev-1.13'

/**
 * Resolve one credential by reference. The host half plugs in DSH's
 * `ctx.credentials` service here; without it we fall back to the process
 * environment.
 */
export type JevKeyLookup = (ref: string) => Promise<{ value: string; source: string } | undefined>

/**
 * The `credentials` service, duck-typed on purpose: a plugin tree does not
 * carry `@deepseek-ai/dsh-credentials`, and its `credentialRef()` is only a
 * runtime pattern check that hands back the same string, so passing the
 * variable name straight through is the identical call. Accessing the service
 * through the reflection API (and tolerating its absence) is what keeps this
 * plugin loading in a profile that has no credential provider.
 */
interface CredentialServiceLike {
  resolve: (ref: string) => Promise<{ value: string; source: string } | undefined>
}

export function credentialLookup(ctx: { reflect: { get: (name: string, required?: false) => unknown } }): JevKeyLookup | undefined {
  const service = ctx.reflect.get('credentials', false) as CredentialServiceLike | undefined
  if (service === undefined || service === null || typeof service.resolve !== 'function') return undefined
  return async (ref) => {
    const hit = await service.resolve(ref)
    if (hit === undefined || hit === null) return undefined
    const value = typeof hit.value === 'string' ? hit.value : ''
    const source = typeof hit.source === 'string' ? hit.source : 'credentials'
    return { value, source }
  }
}

/**
 * Resolve the line and its key. OpenRouter wins when its key is set (one key
 * for the whole setup, plus per-call usage.cost); a TypeSafe-only setup keeps
 * working untouched.
 *
 * The credential lookup is consulted BEFORE the raw environment, because DSH's
 * provider layers the inherited environment over `$DSH_HOME/.credentials.yaml`
 * and then the project/user `.env` files — so it is a superset of what
 * `process.env` holds, and it is the only view that can say where a key came
 * from. The environment remains the fallback for hosts without the service.
 * JEV_ENDPOINT / JEV_MODEL are not secrets and stay environment-only.
 */
export async function resolveJevConfig(
  env: NodeJS.ProcessEnv = process.env,
  lookup?: JevKeyLookup,
): Promise<JevConfig | null> {
  const candidates: Array<{ ref: string; line: JevLine }> = [
    { ref: 'OPENROUTER_API_KEY', line: 'openrouter' },
    { ref: 'TYPESAFE_API_KEY', line: 'typesafe' },
  ]
  let chosen: { line: JevLine; apiKey: string; keySource: string } | null = null
  for (const candidate of candidates) {
    if (lookup !== undefined) {
      const hit = await lookup(candidate.ref)
      const value = (hit?.value ?? '').trim()
      if (value !== '') {
        chosen = { line: candidate.line, apiKey: value, keySource: hit?.source ?? 'credentials' }
        break
      }
    }
    const fromEnv = (env[candidate.ref] ?? '').trim()
    if (fromEnv !== '') {
      chosen = { line: candidate.line, apiKey: fromEnv, keySource: 'env' }
      break
    }
  }
  if (chosen === null) return null
  const endpointOverride = (env.JEV_ENDPOINT ?? '').trim()
  const modelOverride = (env.JEV_MODEL ?? '').trim()
  return {
    line: chosen.line,
    endpoint:
      endpointOverride !== '' ? endpointOverride : chosen.line === 'openrouter' ? OPENROUTER_ENDPOINT : TYPESAFE_ENDPOINT,
    model: modelOverride !== '' ? modelOverride : chosen.line === 'openrouter' ? OPENROUTER_MODEL : TYPESAFE_MODEL,
    apiKey: chosen.apiKey,
    keySource: chosen.keySource,
  }
}

/** Guard: pairwise questions grow as N² — refuse to send a giant batch. */
const MAX_CARDS = 20
/**
 * Questions per HTTP request. Pairwise reasoning costs N(N-1) questions, which
 * no single 32k request can hold past ~11 cards, so a round is split into
 * consecutive batches of this size and the answers are merged. Each batch
 * re-sends the state (~470 chars per card), which is cheap next to the
 * questions: at 20 cards that is 7 requests and roughly $0.004 of input.
 */
const QUESTIONS_PER_REQUEST = 60
/**
 * Per-request budget in characters. The System One context is 32k tokens and
 * the tokenizer is undocumented ("Other"), so we assume a conservative ≤3
 * chars/token → 96k chars ≈ 32k tokens. Measured against the real ISG cards a
 * 60-question batch lands near 40k chars, well inside it; every run reports
 * back the largest request it built so this can be calibrated against a live
 * usage.input_tokens reading.
 */
const MAX_PAYLOAD_CHARS = 96_000
/** Excerpt budget per card in the minimized state. */
const EXCERPT_CHARS = 400

export interface JevCardState {
  slug: string
  title: string
  description?: string
  aliases?: string[]
  field_kind?: string
  data_type?: string
  aggregation?: string
  unit?: string
  source_table?: string
  source_field?: string
  depends_on?: string[]
  used_by?: string[]
  excerpt?: string
}

export interface JevResult {
  kb: string
  /** Which line served the request (openrouter | typesafe). */
  line: JevLine
  /** Layer that supplied the key (env / file / project-env / user-env). */
  keySource: string
  model: string
  proposals: LineageProposal[]
  /** Token accounting from the API response when present. */
  usage?: Record<string, unknown>
  /** What was actually sent (for transparency / auditing). */
  sentCards: number
  stateChars: number
  questionCount: number
  /** HTTP requests the round was split into (questions are batched). */
  requests: number
  /** Largest single request body, and the per-request guard it had to clear. */
  payloadChars: number
  budgetChars: number
}

/**
 * Minimized state: metadata + a short excerpt with code fences and long digit
 * runs removed. Raw SQL, amounts and long identifiers never leave the machine.
 */
function minimizeExcerpt(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ') // drop fenced code (SQL etc.)
    .replace(/`[^`]*`/g, ' ') // drop inline code
    .replace(/\d[\d,.\s]{4,}/g, ' ') // drop long numeric runs (amounts/ids)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, EXCERPT_CHARS)
}

/** Load the field cards of one KB as minimized JEV state entries. */
export async function buildJevState(kb: KbConfig): Promise<JevCardState[]> {
  const states: JevCardState[] = []
  for (const meta of (await listCards(kb)).filter((card) => card.type === 'field')) {
    const card = await readCard(kb, meta.slug)
    if (card === null) continue
    const fm = parseFrontmatter(card.raw).frontmatter ?? {}
    const listOf = (value: unknown): string[] | undefined =>
      Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim() !== '') : undefined
    const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)
    states.push({
      slug: meta.slug,
      title: meta.title,
      description: meta.description,
      aliases: listOf(fm.aliases),
      field_kind: text(fm.field_kind),
      data_type: text(fm.data_type),
      aggregation: text(fm.aggregation),
      unit: text(fm.unit),
      source_table: text(fm.source_table),
      source_field: text(fm.source_field),
      depends_on: listOf(fm.depends_on),
      used_by: listOf(fm.used_by),
      excerpt: minimizeExcerpt(card.body) || undefined,
    })
  }
  return states
}

type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: Record<string, string> }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }

/**
 * Atomic questions. Card content lives in `state.cards` exactly once and every
 * question refers to a card only by slug — that is what keeps the body inside
 * the 32k context. (The first version inlined both cards of every ordered pair
 * into the question, so the request grew as N² and already hit the wall at ten
 * cards.) Keys are local to us; the API never sees them.
 * `dep::A::B` asks whether A derives its values from B as a DIRECT dependency.
 */
export function buildJevQuestions(states: JevCardState[]): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  for (const source of states) {
    for (const target of states) {
      if (source.slug === target.slug) continue
      questions[`dep::${source.slug}::${target.slug}`] = {
        type: 'noul',
        instructions: `In state.cards, does slug "${source.slug}" derive its values FROM slug "${target.slug}" as a DIRECT dependency (its own documented formula or 取数步骤 reads that card), rather than merely mentioning it, being a sibling attribute of the same object, or depending on it only indirectly through a third card?`,
        criteria: {
          true: `state.cards["${source.slug}"] directly reads or computes from state.cards["${target.slug}"].`,
          false:
            'No direct dependency: sibling attribute, mere mention, external table/tool, or only an indirect dependency.',
        },
      }
    }
    questions[`kind::${source.slug}`] = {
      type: 'choice',
      instructions: `Which field_kind best describes state.cards["${source.slug}"]?`,
      criteria: {
        measure: 'A numeric amount/quantity that is aggregated (revenue, cost, count).',
        dimension: 'A descriptive attribute used for grouping/filtering (id, name, number, office).',
        calculated_field: 'Derived by a formula over other fields rather than stored.',
        flag: 'A yes/no indicator.',
        key: 'A join/business key.',
        mapping: 'A lookup/translation mapping.',
        date: 'A date/period.',
        attribute: 'Other descriptive attribute that is not a grouping dimension.',
        parameter: 'A run-time parameter.',
      },
    }
    questions[`agg::${source.slug}`] = {
      type: 'noul',
      instructions: `Is it correct to treat state.cards["${source.slug}"] as 'additive' — i.e. summing it across rows produces a meaningful total?`,
      criteria: {
        true: 'Summing the values is meaningful.',
        false: 'Summing is meaningless (dimension/ratio/percentage/flag).',
      },
    }
  }
  return questions
}

interface JevAnswer {
  type?: string
  noul?: number
  choice?: string
  score?: number
  confidence?: number
  probabilities?: Record<string, number>
}

/** Call the System One endpoint. Throws on transport/API errors. */
export async function callJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: Pick<JevConfig, 'apiKey' | 'endpoint' | 'model'> & { timeoutMs?: number },
): Promise<{ model: string; answers: Record<string, JevAnswer>; usage?: Record<string, unknown> }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)
  try {
    const response = await fetch(options.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state, model: options.model, questions }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`jev HTTP ${response.status}: ${text.slice(0, 300)}`)
    }
    const parsed = JSON.parse(text) as {
      model?: string
      answers?: Record<string, JevAnswer>
      usage?: Record<string, unknown>
    }
    // OpenRouter answers with the versioned id it routed to (e.g.
    // typesafe/jev-1.13-20260917), so the reply is reported as-is rather than
    // compared against the requested model.
    return { model: parsed.model ?? options.model, answers: parsed.answers ?? {}, usage: parsed.usage }
  } finally {
    clearTimeout(timer)
  }
}

const bandToLabel = (value: number): 'high' | 'medium' | 'low' => (value >= 0.8 ? 'high' : value >= 0.5 ? 'medium' : 'low')

/**
 * Map typed answers to ordinary lineage proposals:
 *  - `dep::A::B` (noul ≥ 0.5) → A depends_on B (+ the reverse used_by edge)
 *  - `kind::X` (choice) → metadata correction when it disagrees with the card
 *  - `agg::X` (noul) with a dimension-ish card → aggregation correction
 */
export function jevProposals(
  kb: KbConfig,
  states: JevCardState[],
  answers: Record<string, JevAnswer>,
): LineageProposal[] {
  const proposals: LineageProposal[] = []
  const bySlug = new Map(states.map((state) => [state.slug, state]))
  for (const [key, answer] of Object.entries(answers)) {
    const [kind, from, to] = key.split('::')
    if (kind === 'dep' && typeof answer.noul === 'number' && answer.noul >= 0.5) {
      const source = bySlug.get(from)
      const target = bySlug.get(to)
      if (source === undefined || target === undefined) continue
      const score = answer.noul
      const evidence = `JEV noul=${score.toFixed(2)}（${bandToLabel(score)}）：${source.title} 的取数逻辑直接依赖 ${target.title}`
      proposals.push({
        slug: from,
        title: source.title,
        source: 'jev',
        confidence: bandToLabel(score),
        score,
        evidence,
        relations: { depends_on: [to] },
        note: 'JEV 判断（待人工确认）',
      })
      proposals.push({
        slug: to,
        title: target.title,
        source: 'jev',
        confidence: bandToLabel(score),
        score,
        evidence: `反向边：JEV 判定 ${source.title} 依赖本卡`,
        relations: { used_by: [from] },
        note: 'JEV 判断（待人工确认）',
      })
    }
    if (kind === 'kind' && typeof answer.choice === 'string') {
      const state = bySlug.get(from)
      if (state === undefined || state.field_kind === answer.choice) continue
      proposals.push({
        slug: from,
        title: state.title,
        source: 'jev',
        confidence: bandToLabel(answer.confidence ?? 0.5),
        score: answer.confidence,
        evidence: `JEV 判定 field_kind 应为 ${answer.choice}（当前 ${state.field_kind ?? '未填'}）`,
        relations: {},
        metadata: { field_kind: answer.choice },
        note: 'JEV 判断（待人工确认）',
      })
    }
    if (kind === 'agg' && typeof answer.noul === 'number') {
      const state = bySlug.get(from)
      if (state === undefined) continue
      const dimensionLike = state.field_kind === 'dimension' || state.field_kind === 'key' || state.data_type === 'string'
      // noul asks "is additive correct?" — a confident NO on a dimension-like
      // field means the recorded 'additive' value should be corrected.
      if (answer.noul <= 0.2 && dimensionLike && state.aggregation === 'additive') {
        proposals.push({
          slug: from,
          title: state.title,
          source: 'jev',
          confidence: bandToLabel(1 - answer.noul),
          score: 1 - answer.noul,
          evidence: `JEV noul=${answer.noul.toFixed(2)}：${state.title} 不应可加总（当前 aggregation=additive）`,
          relations: {},
          metadata: { aggregation: 'non-additive' },
          note: 'JEV 判断（待人工确认）',
        })
      }
    }
  }
  return proposals
}

/** Split a question map into consecutive batches of at most `size` entries. */
function chunkQuestions(
  questions: Record<string, JevQuestion>,
  size: number,
): Array<Record<string, JevQuestion>> {
  const entries = Object.entries(questions)
  const batches: Array<Record<string, JevQuestion>> = []
  for (let index = 0; index < entries.length; index += size) {
    batches.push(Object.fromEntries(entries.slice(index, index + size)))
  }
  return batches.length > 0 ? batches : [{}]
}

/** Sum the numeric counters of successive usage reports (tokens, cost). */
function mergeUsage(target: Record<string, unknown>, extra?: Record<string, unknown>): void {
  if (extra === undefined) return
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'number' && typeof target[key] === 'number') {
      target[key] = (target[key] as number) + value
    } else {
      target[key] = value
    }
  }
}

/**
 * Full JEV round: state → questions → batches → budget gate → API → proposals.
 * Answers from every batch are merged into one map, so the downstream
 * proposal/preview/apply path is unaffected by how the round was split.
 */
export async function runJevLineage(kb: KbConfig, config?: JevConfig): Promise<JevResult> {
  const resolved = config ?? (await resolveJevConfig())
  if (resolved === null) {
    throw new Error(
      '未配置 JEV key：请在 DSH 凭据库（~/.dsh/.credentials.yaml）或环境变量设置 OPENROUTER_API_KEY（默认线路）或 TYPESAFE_API_KEY',
    )
  }
  const states = await buildJevState(kb)
  if (states.length === 0) throw new Error('该知识库没有字段卡（type=field）')
  if (states.length > MAX_CARDS) {
    throw new Error(
      `字段卡 ${states.length} 张，超过 JEV 单轮上限 ${MAX_CARDS} 张（问题数随卡片数平方增长）；请按 subject_area 分批，或先用确定性预扫`,
    )
  }
  const questions = buildJevQuestions(states)
  const state = { kb: kb.id, cards: states }
  const stateJson = JSON.stringify(state)
  const batches = chunkQuestions(questions, QUESTIONS_PER_REQUEST)
  const answers: Record<string, JevAnswer> = {}
  const usage: Record<string, unknown> = {}
  let sawUsage = false
  let model = resolved.model
  let payloadChars = 0
  for (const batch of batches) {
    const batchChars = JSON.stringify({ state, model: resolved.model, questions: batch }).length
    if (batchChars > MAX_PAYLOAD_CHARS) {
      throw new Error(
        `JEV 单批请求体 ${batchChars} 字符，超过预算 ${MAX_PAYLOAD_CHARS}（32k 上下文的保守估计；本轮字段卡 ${states.length} 张、每批 ${Object.keys(batch).length} 个问题）；请减少字段卡数量后重试`,
      )
    }
    payloadChars = Math.max(payloadChars, batchChars)
    const response = await callJev(state, batch, {
      apiKey: resolved.apiKey,
      endpoint: resolved.endpoint,
      model: resolved.model,
    })
    Object.assign(answers, response.answers)
    if (response.usage !== undefined) sawUsage = true
    mergeUsage(usage, response.usage)
    model = response.model ?? model
  }
  return {
    kb: kb.id,
    line: resolved.line,
    keySource: resolved.keySource,
    model,
    proposals: jevProposals(kb, states, answers),
    usage: sawUsage ? usage : undefined,
    sentCards: states.length,
    stateChars: stateJson.length,
    questionCount: Object.keys(questions).length,
    requests: batches.length,
    payloadChars,
    budgetChars: MAX_PAYLOAD_CHARS,
  }
}
