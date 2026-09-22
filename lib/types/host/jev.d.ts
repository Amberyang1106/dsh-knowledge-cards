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
import type { KbConfig, LineageProposal } from '../core/types.ts';
/** Which line serves the request. */
export type JevLine = 'openrouter' | 'typesafe';
export interface JevConfig {
    line: JevLine;
    endpoint: string;
    model: string;
    apiKey: string;
}
/**
 * Resolve the line from the environment. OpenRouter wins when its key is set
 * (one key for the whole setup, plus per-call usage.cost); a TypeSafe-only
 * setup keeps working untouched. JEV_ENDPOINT / JEV_MODEL override the
 * per-line defaults. Returns null when neither key is configured.
 */
export declare function resolveJevConfig(env?: NodeJS.ProcessEnv): JevConfig | null;
export interface JevCardState {
    slug: string;
    title: string;
    description?: string;
    aliases?: string[];
    field_kind?: string;
    data_type?: string;
    aggregation?: string;
    unit?: string;
    source_table?: string;
    source_field?: string;
    depends_on?: string[];
    used_by?: string[];
    excerpt?: string;
}
export interface JevResult {
    kb: string;
    /** Which line served the request (openrouter | typesafe). */
    line: JevLine;
    model: string;
    proposals: LineageProposal[];
    /** Token accounting from the API response when present. */
    usage?: Record<string, unknown>;
    /** What was actually sent (for transparency / auditing). */
    sentCards: number;
    stateChars: number;
    questionCount: number;
    /** HTTP requests the round was split into (questions are batched). */
    requests: number;
    /** Largest single request body, and the per-request guard it had to clear. */
    payloadChars: number;
    budgetChars: number;
}
/** Load the field cards of one KB as minimized JEV state entries. */
export declare function buildJevState(kb: KbConfig): Promise<JevCardState[]>;
type JevQuestion = {
    type: 'noul';
    instructions: string;
    criteria?: Record<string, string>;
} | {
    type: 'choice';
    instructions: string;
    criteria: Record<string, string>;
} | {
    type: 'score';
    instructions: string;
    criteria: string[];
};
/**
 * Atomic questions. Card content lives in `state.cards` exactly once and every
 * question refers to a card only by slug — that is what keeps the body inside
 * the 32k context. (The first version inlined both cards of every ordered pair
 * into the question, so the request grew as N² and already hit the wall at ten
 * cards.) Keys are local to us; the API never sees them.
 * `dep::A::B` asks whether A derives its values from B as a DIRECT dependency.
 */
export declare function buildJevQuestions(states: JevCardState[]): Record<string, JevQuestion>;
interface JevAnswer {
    type?: string;
    noul?: number;
    choice?: string;
    score?: number;
    confidence?: number;
    probabilities?: Record<string, number>;
}
/** Call the System One endpoint. Throws on transport/API errors. */
export declare function callJev(state: unknown, questions: Record<string, JevQuestion>, options: Pick<JevConfig, 'apiKey' | 'endpoint' | 'model'> & {
    timeoutMs?: number;
}): Promise<{
    model: string;
    answers: Record<string, JevAnswer>;
    usage?: Record<string, unknown>;
}>;
/**
 * Map typed answers to ordinary lineage proposals:
 *  - `dep::A::B` (noul ≥ 0.5) → A depends_on B (+ the reverse used_by edge)
 *  - `kind::X` (choice) → metadata correction when it disagrees with the card
 *  - `agg::X` (noul) with a dimension-ish card → aggregation correction
 */
export declare function jevProposals(kb: KbConfig, states: JevCardState[], answers: Record<string, JevAnswer>): LineageProposal[];
/**
 * Full JEV round: state → questions → batches → budget gate → API → proposals.
 * Answers from every batch are merged into one map, so the downstream
 * proposal/preview/apply path is unaffected by how the round was split.
 */
export declare function runJevLineage(kb: KbConfig, config?: JevConfig): Promise<JevResult>;
export {};
//# sourceMappingURL=jev.d.ts.map