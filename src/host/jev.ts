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
 * Endpoint/limits (docs.typesafe.ai): POST https://api.typesafe.ai/v1/systemone,
 * Bearer key, model jev-latest, 64k context, $42/Btok input (output free).
 * @module dsh-knowledge-cards/host/jev
 */

import { parseFrontmatter } from '../core/frontmatter.ts'
import type { KbConfig, LineageProposal } from '../core/types.ts'
import { listCards, readCard } from './store.ts'

/** Endpoint and model (the docs' single evaluation endpoint). */
const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const JEV_MODEL = 'jev-latest'
/** Guard: pairwise questions grow as N² — refuse to send a giant batch. */
const MAX_CARDS = 20
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
  model: string
  proposals: LineageProposal[]
  /** Token accounting from the API response when present. */
  usage?: Record<string, unknown>
  /** What was actually sent (for transparency / auditing). */
  sentCards: number
  stateChars: number
  questionCount: number
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
  | { type: 'noul'; instructions: unknown; criteria?: Record<string, unknown> }
  | { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> }
  | { type: 'score'; instructions: unknown; criteria: string[] }

/**
 * Atomic questions: one noul per ordered pair asking whether the first card's
 * documented logic derives from the second (direct dependency only). Keys are
 * local to us (the API never sends them to the model).
 */
export function buildJevQuestions(states: JevCardState[]): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {}
  for (const source of states) {
    for (const target of states) {
      if (source.slug === target.slug) continue
      questions[`dep::${source.slug}::${target.slug}`] = {
        type: 'noul',
        instructions: {
          source_card: {
            slug: source.slug,
            title: source.title,
            description: source.description,
            source_table: source.source_table,
            excerpt: source.excerpt,
          },
          target_card: {
            slug: target.slug,
            title: target.title,
            description: target.description,
            source_table: target.source_table,
            excerpt: target.excerpt,
          },
          question: `Does \`source_card\`'s documented logic derive its values FROM \`target_card\` as a DIRECT dependency (its own formula/取数步骤 reads the target), rather than merely mentioning it, being a sibling attribute of the same object, or depending on it only indirectly through a third card?`,
        },
        criteria: {
          true: 'source_card directly reads/computes from target_card (direct dependency).',
          false: 'No such direct dependency: sibling attribute, mere mention, external table/tool, or transitive dependency.',
        },
      }
    }
    questions[`kind::${source.slug}`] = {
      type: 'choice',
      instructions: `Which field_kind best describes \`card\` (slug ${source.slug}, title ${source.title}, data_type ${source.data_type ?? 'unknown'})?`,
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
      instructions: `Is it correct to treat \`card\` (slug ${source.slug}, field_kind ${source.field_kind ?? 'unknown'}, data_type ${source.data_type ?? 'unknown'}) as 'additive' — i.e. summing it across rows produces a meaningful total?`,
      criteria: { true: 'Summing the values is meaningful.', false: 'Summing is meaningless (dimension/ratio/percentage/flag).' },
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

/** Call the TypeSafe evaluation endpoint. Throws on transport/API errors. */
export async function callJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: { apiKey: string; timeoutMs?: number },
): Promise<{ model: string; answers: Record<string, JevAnswer>; usage?: Record<string, unknown> }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)
  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ state, model: JEV_MODEL, questions }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`jev HTTP ${response.status}: ${text.slice(0, 300)}`)
    }
    const parsed = JSON.parse(text) as { model?: string; answers?: Record<string, JevAnswer>; usage?: Record<string, unknown> }
    return { model: parsed.model ?? JEV_MODEL, answers: parsed.answers ?? {}, usage: parsed.usage }
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

/** Full JEV round: state → questions → API → proposals. */
export async function runJevLineage(kb: KbConfig, apiKey: string): Promise<JevResult> {
  const states = await buildJevState(kb)
  if (states.length === 0) throw new Error('该知识库没有字段卡（type=field）')
  if (states.length > MAX_CARDS) {
    throw new Error(`字段卡 ${states.length} 张，超过 JEV 单轮上限 ${MAX_CARDS} 张；请按 subject_area 分批，或先用确定性预扫`)
  }
  const questions = buildJevQuestions(states)
  const state = { kb: kb.id, cards: states }
  const stateJson = JSON.stringify(state)
  const response = await callJev(state, questions, { apiKey })
  return {
    kb: kb.id,
    model: response.model,
    proposals: jevProposals(kb, states, response.answers),
    usage: response.usage,
    sentCards: states.length,
    stateChars: stateJson.length,
    questionCount: Object.keys(questions).length,
  }
}
