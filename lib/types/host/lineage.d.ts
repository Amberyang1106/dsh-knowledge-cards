/**
 * Lineage assistance for field cards — the engine behind the panel's
 * 「血缘补齐」button.
 *
 * Three deterministic pieces plus one agent hand-off:
 *   1. scanLineage()      — candidate edges mined from card bodies/metadata
 *                           (mention + derivation-keyword matching, metadata
 *                           gap rules). No LLM, no writes.
 *   2. buildLineagePrompt()/proposal file — an agent run analyses the KB and
 *                           parks structured proposals for review.
 *   3. applyLineage()     — writes the accepted proposals through editCard's
 *                           structured channel (union semantics, provenance
 *                           marked inferred, confirmed cards never downgraded).
 * @module dsh-knowledge-cards/host/lineage
 */
import type { FieldCardScopeEntry, KbConfig, LineageApplyResult, LineageProposal, LineageProposalFile, LineageScanResult } from '../core/types.ts';
/**
 * Deterministic lineage scan: candidate edges + metadata gaps for every field
 * card of one KB. Read-only.
 */
export declare function scanLineage(kb: KbConfig): Promise<LineageScanResult>;
/** Path of the parked agent-proposal file for one KB. */
export declare function lineageProposalFile(kb: KbConfig): string;
export declare function readLineageProposals(kb: KbConfig): Promise<LineageProposalFile | null>;
/** Park one agent-produced proposal batch (called by the wiki_lineage_propose tool). */
export declare function writeLineageProposals(kb: KbConfig, proposals: LineageProposal[], extra?: {
    requestedAt?: string;
    childId?: string;
    notes?: string[];
}): Promise<LineageProposalFile>;
/**
 * Prompt handed to an agent run: analyse the KB's field cards and park the
 * candidate edges — explicitly WITHOUT editing the cards (the human reviews
 * and a deterministic apply writes them).
 */
export declare function buildLineagePrompt(kb: KbConfig, cards: FieldCardMeta[]): string;
interface FieldCardMeta {
    slug: string;
    title: string;
}
/** Slugs+titles of the field cards (for prompts). */
export declare function listFieldCardMeta(kb: KbConfig): Promise<FieldCardMeta[]>;
/**
 * One row per field card for the scope picker: review status (drives the
 * confirmed-card skip), whether it is confirmed, and how much lineage it
 * already carries. Read-only.
 */
export declare function listFieldCardScopes(kb: KbConfig): Promise<FieldCardScopeEntry[]>;
/**
 * Mark field cards as owner-confirmed (review_status=confirmed), which is what
 * takes them out of the default JEV scope. Only review_status is touched —
 * evidence_level keeps describing where the evidence came from. Non-field cards
 * and unknown slugs are reported, never silently dropped.
 */
export declare function confirmFieldCards(kb: KbConfig, slugs: string[]): Promise<{
    kb: string;
    confirmed: string[];
    skipped: Array<{
        slug: string;
        reason: string;
    }>;
    generatedAt: string;
}>;
/**
 * Deterministic apply: write the accepted proposals (union semantics for
 * relations, metadata set/remove), marking provenance inferred unless the
 * card is already confirmed. Never touches cards that are not field cards.
 */
export declare function applyLineage(kb: KbConfig, accepted: LineageProposal[]): Promise<LineageApplyResult>;
export {};
//# sourceMappingURL=lineage.d.ts.map