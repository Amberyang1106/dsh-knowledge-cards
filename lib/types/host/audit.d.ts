/**
 * Knowledge-base audit (导入现成知识库后的主动审核):
 *
 * 1. Deterministic scan (zero LLM, instant): duplicates (normalized-title
 *    collisions), missing pages ([[wikilinks]] pointing at cards that do not
 *    exist) — each becomes a review item in the queue (deduped against
 *    pending items, so re-running never spams).
 * 2. A deep-audit prompt for the agent: semantic checks (contradictions,
 *    suggestions, cross-card synthesis) that need LLM judgment — the agent
 *    runs it and submits findings via wiki_review_submit.
 *
 * Both feed the SAME queue the ingest-time flags use, so the 审核 tab is the
 * single human-in-the-loop surface.
 * @module dsh-knowledge-cards/host/audit
 */
import type { KbConfig } from '../core/types.ts';
export interface AuditResult {
    submitted: Array<{
        id: string;
        kind: string;
        title: string;
    }>;
    skippedExisting: number;
    summary: {
        duplicate: number;
        missingPage: number;
    };
    /** Prompt the user/agent can run for the semantic (LLM) part of the audit. */
    deepAuditPrompt: string;
}
/** Build the deep-audit prompt for the current KB (no side effects). */
export declare function buildDeepAuditPromptForKb(kb: KbConfig): Promise<string>;
/**
 * Deterministic audit: scan cards for duplicates and broken wikilinks, and
 * submit them as review items (deduped against existing pending items).
 * Returns the audit result incl. the deep-audit prompt for the LLM part.
 */
export declare function auditKb(kb: KbConfig): Promise<AuditResult>;
//# sourceMappingURL=audit.d.ts.map