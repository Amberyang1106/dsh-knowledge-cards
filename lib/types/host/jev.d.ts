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
 * Every tuning knob (thresholds, question toggles, volume, batching, the
 * confirmed-card skip) comes from LineageConfig so the panel can edit it.
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
import type { KbConfig, LineageConfig, LineageProposal } from '../core/types.ts';
/** Which line serves the request. */
export type JevLine = 'openrouter' | 'typesafe';
/** Transport facts only — tuning parameters live in LineageConfig. */
export interface JevTransport {
    line: JevLine;
    endpoint: string;
    model: string;
    apiKey: string;
    /** Which layer supplied the key (`env` / `file` / `project-env` / `user-env`). */
    keySource: string;
}
/**
 * Resolve one credential by reference. The host half plugs in DSH's
 * `ctx.credentials` service here; without it we fall back to the process
 * environment.
 */
export type JevKeyLookup = (ref: string) => Promise<{
    value: string;
    source: string;
} | undefined>;
export declare function credentialLookup(ctx: {
    reflect: {
        get: (name: string, required?: false) => unknown;
    };
}): JevKeyLookup | undefined;
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
export declare function resolveJevConfig(env?: NodeJS.ProcessEnv, lookup?: JevKeyLookup): Promise<JevTransport | null>;
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
/** One field card plus the frontmatter facts the scope filter needs. */
export interface JevCardScope {
    state: JevCardState;
    /** review_status from the card (only `confirmed` is ever skipped). */
    reviewStatus: string;
}
export interface JevResult {
    kb: string;
    /** Which line served the request (openrouter | typesafe). */
    line: JevLine;
    /** Layer that supplied the key (env / file / project-env / user-env). */
    keySource: string;
    /** Fingerprint of the effective parameters this round ran with. */
    paramsFingerprint: string;
    model: string;
    proposals: LineageProposal[];
    /** Token accounting from the API response when present. */
    usage?: Record<string, unknown>;
    /** Cards sent in the state, cards judged, cards skipped as confirmed. */
    sentCards: number;
    judgedCards: number;
    skippedCards: string[];
    /** Ordered pairs left out because both ends were confirmed. */
    skippedPairCount: number;
    stateChars: number;
    questionCount: number;
    /** HTTP requests the round was split into (questions are batched). */
    requests: number;
    /** Largest single request body, and the per-request guard it had to clear. */
    payloadChars: number;
    budgetChars: number;
}
/** Load the field cards of one KB as minimized JEV state + review status. */
export declare function buildJevCardScopes(kb: KbConfig, excerptChars?: number): Promise<JevCardScope[]>;
/** Just the states (the shape actually sent to the API). */
export declare function buildJevState(kb: KbConfig, excerptChars?: number): Promise<JevCardState[]>;
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
export interface JevQuestionOptions {
    askFieldKind?: boolean;
    askAdditive?: boolean;
    /**
     * Whether a card's answers are still wanted. A pair is asked when AT LEAST
     * ONE side is judged — skipping only pairs whose two ends are both already
     * confirmed is what keeps a new card's edges to old cards from being missed.
     */
    isJudged?: (slug: string) => boolean;
}
/**
 * Atomic questions. Card content lives in `state.cards` exactly once and every
 * question refers to a card only by slug — that is what keeps the body inside
 * the 32k context. (The first version inlined both cards of every ordered pair
 * into the question, so the request grew as N² and already hit the wall at ten
 * cards.) Keys are local to us; the API never sees them.
 * `dep::A::B` asks whether A derives its values from B as a DIRECT dependency.
 */
export declare function buildJevQuestions(states: JevCardState[], options?: JevQuestionOptions): Record<string, JevQuestion>;
/** Which cards and pairs a round actually covers. Pure — unit-testable. */
export interface JevScopePlan {
    /** States to send (a skipped card can still be the target of a question). */
    sent: JevCardState[];
    /** Slugs whose answers are still wanted. */
    judged: string[];
    /** Cards left out of judgement because they are owner-confirmed. */
    skipped: string[];
    judgedCardCount: number;
    skippedPairCount: number;
    questionCount: number;
}
/**
 * Apply the confirmed-card skip at PAIR level and count what the round costs.
 * A card counts as done when skipConfirmed is on, it is `review_status:
 * confirmed`, and it was not forced back in for this run.
 */
export declare function planJevScope(scopes: JevCardScope[], params: LineageConfig, force?: {
    slugs?: string[];
    all?: boolean;
}): JevScopePlan;
interface JevAnswer {
    type?: string;
    noul?: number;
    choice?: string;
    score?: number;
    confidence?: number;
    probabilities?: Record<string, number>;
}
/** Call the System One endpoint. Throws on transport/API errors. */
export declare function callJev(state: unknown, questions: Record<string, JevQuestion>, options: Pick<JevTransport, 'apiKey' | 'endpoint' | 'model'> & {
    timeoutMs?: number;
}): Promise<{
    model: string;
    answers: Record<string, JevAnswer>;
    usage?: Record<string, unknown>;
}>;
export interface JevProposalOptions {
    confidenceHigh: number;
    confidenceMedium: number;
    depThreshold: number;
    additiveThreshold: number;
    /** Stamped into every proposal note so a later reader knows the settings used. */
    paramsFingerprint: string;
}
/**
 * Map typed answers to ordinary lineage proposals:
 *  - `dep::A::B` (noul ≥ depThreshold) → A depends_on B (+ the reverse used_by edge)
 *  - `kind::X` (choice) → metadata correction when it disagrees with the card
 *  - `agg::X` (noul) with a dimension-ish card → aggregation correction
 * Every note carries the parameter fingerprint of the round.
 */
export declare function jevProposals(kb: KbConfig, states: JevCardState[], answers: Record<string, JevAnswer>, options?: JevProposalOptions): LineageProposal[];
export interface JevRunOptions {
    /** Parameters loaded by the caller; omitted → read this KB's config file. */
    params?: LineageConfig;
    /** Cards to re-judge even though they are confirmed. */
    forceSlugs?: string[];
    /** Ignore the confirmed-card skip entirely (full re-run). */
    forceAll?: boolean;
}
/**
 * Full JEV round: scope plan → state → questions → batches → budget gate → API
 * → proposals. Answers from every batch are merged into one map, so the
 * downstream proposal/preview/apply path is unaffected by how the round was
 * split and by which cards were skipped.
 */
export declare function runJevLineage(kb: KbConfig, transport?: JevTransport, options?: JevRunOptions): Promise<JevResult>;
export {};
//# sourceMappingURL=jev.d.ts.map