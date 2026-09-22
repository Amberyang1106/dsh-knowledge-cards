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
import type { KbConfig, LineageProposal } from '../core/types.ts';
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
    model: string;
    proposals: LineageProposal[];
    /** Token accounting from the API response when present. */
    usage?: Record<string, unknown>;
    /** What was actually sent (for transparency / auditing). */
    sentCards: number;
    stateChars: number;
    questionCount: number;
}
/** Load the field cards of one KB as minimized JEV state entries. */
export declare function buildJevState(kb: KbConfig): Promise<JevCardState[]>;
type JevQuestion = {
    type: 'noul';
    instructions: unknown;
    criteria?: Record<string, unknown>;
} | {
    type: 'choice';
    instructions: unknown;
    criteria: Record<string, unknown>;
} | {
    type: 'score';
    instructions: unknown;
    criteria: string[];
};
/**
 * Atomic questions: one noul per ordered pair asking whether the first card's
 * documented logic derives from the second (direct dependency only). Keys are
 * local to us (the API never sends them to the model).
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
/** Call the TypeSafe evaluation endpoint. Throws on transport/API errors. */
export declare function callJev(state: unknown, questions: Record<string, JevQuestion>, options: {
    apiKey: string;
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
/** Full JEV round: state → questions → API → proposals. */
export declare function runJevLineage(kb: KbConfig, apiKey: string): Promise<JevResult>;
export {};
//# sourceMappingURL=jev.d.ts.map