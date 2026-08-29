/**
 * Knowledge-base store (host side): multi-KB config, llm_wiki directory
 * structure seeding, card listing/reading, deterministic commit maintenance
 * (index.md / log.md / overview.md are app-maintained, never LLM-rewritten —
 * llm_wiki's rule), and the SHA256 incremental ingest cache.
 *
 * Layout of one KB (Karpathy / llm_wiki three layers):
 *   <path>/purpose.md            why this wiki exists
 *   <path>/schema.md             page types + conventions
 *   <path>/raw/sources/          immutable source documents
 *   <path>/wiki/index.md         content catalog (auto)
 *   <path>/wiki/log.md           chronological activity log (auto)
 *   <path>/wiki/overview.md      global summary (auto)
 *   <path>/wiki/<type-dirs>/     entity/concept/source/query/... cards
 *
 * Config + cache live in $DSH_KNOWLEDGE_CARDS_ROOT (default ~/.dsh/knowledge-cards).
 * @module dsh-knowledge-cards/host/store
 */
import { extractWikilinks } from '../core/search.ts';
import type { Card, CardMeta, CommitResult, KbConfig, KbSummary, PageInput, ReviewItem, ReviewKind, SourceStatus } from '../core/types.ts';
/** Config/cache root for the plugin. Override via env for tests. */
export declare function configRoot(): string;
export declare function sha256Of(buffer: Buffer): string;
export declare function today(): string;
export declare function listKbs(): Promise<KbConfig[]>;
export declare function getKb(id: string): Promise<KbConfig | null>;
export declare function defaultKbId(): string;
/** Seed the three-layer structure for a KB directory (idempotent). */
export declare function ensureKbStructure(kbPath: string): Promise<void>;
export declare function createKb(input: {
    name: string;
    path?: string;
    description?: string;
}): Promise<KbConfig>;
export declare function listCards(kb: KbConfig): Promise<CardMeta[]>;
export declare function readCard(kb: KbConfig, slug: string): Promise<Card | null>;
/** Resolve every wikilink target to an existing card slug. */
export declare function resolveLinkTargets(kb: KbConfig): Promise<Set<string>>;
/** One parsed log.md entry (reverse-chronological). */
export interface LogEntry {
    date: string;
    action: string;
    subject: string;
    /** Detailed change notes, one per line (e.g. `摘要: "旧" → "新"`, `标签: +x -y`). */
    notes: string[];
}
/** Parse wiki/log.md into entries (`## [YYYY-MM-DD] action | subject` + note lines). */
export declare function listLogEntries(kb: KbConfig): Promise<LogEntry[]>;
/** Write agent-generated pages into the wiki + maintain aggregates + cache. */
export declare function commitPages(kb: KbConfig, pages: PageInput[], sourceFiles: string[], options?: {
    logAction?: 'ingest' | 'import';
    extraNotes?: string[];
}): Promise<CommitResult>;
export declare function listSources(kb: KbConfig): Promise<SourceStatus[]>;
/** Sources that still need ingest (new or changed). */
export declare function pendingSources(kb: KbConfig): Promise<SourceStatus[]>;
export declare function kbSummary(kb: KbConfig): Promise<KbSummary>;
export declare function listKbSummaries(): Promise<KbSummary[]>;
/** Rebuild index.md + overview.md from the current wiki content (used when
 * cards are dropped into wiki/ directly, or after a bulk import). */
export declare function rebuildAggregates(kb: KbConfig): Promise<{
    index: boolean;
    overview: boolean;
}>;
/**
 * Bulk-import already-split knowledge cards (markdown files with YAML
 * frontmatter) from a local directory into the KB — the "I already have
 * cards, just import them" path. Deterministic, no LLM: files are parsed,
 * validated and written via commitPages (which maintains index/log/overview
 * and the SHA cache for any referenced raw sources).
 */
export declare function importCards(kb: KbConfig, dir: string): Promise<{
    imported: string[];
    skipped: Array<{
        file: string;
        reason: string;
    }>;
    sourceFiles: string[];
}>;
/** Editable fields of a card (manual edit; absent fields keep their values). */
export interface CardEditInput {
    title?: string;
    description?: string;
    tags?: string[];
    related?: string[];
    sources?: string[];
    body?: string;
}
/**
 * Manually edit one card in place (same slug/path — inbound [[wikilinks]]
 * keep resolving), stamp updated=today, append an `edit` log entry listing
 * the changed fields, and rebuild the index. Replace semantics: fields the
 * caller provides replace the card's values; absent fields are untouched.
 */
export declare function editCard(kb: KbConfig, slug: string, input: CardEditInput): Promise<{
    card: Card;
    changed: string[];
}>;
export interface CodeFileInfo {
    relPath: string;
    size: number;
    mtime: number;
}
/** List code files (recursive) under the KB's code/ directory. */
export declare function listCodeFiles(kb: KbConfig): Promise<CodeFileInfo[]>;
/** Read one code file (full content, UTF-8). Throws when the path escapes code/. */
export declare function readCodeFile(kb: KbConfig, relPath: string): Promise<string>;
/** Write one code file (UTF-8, raw content — no frontmatter, no LLM). */
export declare function writeCodeFile(kb: KbConfig, relPath: string, content: string): Promise<CodeFileInfo>;
/** Delete one code file. */
export declare function deleteCodeFile(kb: KbConfig, relPath: string): Promise<boolean>;
/** Add one review item (agent-flagged during ingest, or manual). */
export declare function addReview(kb: KbConfig, input: {
    kind: ReviewKind;
    title: string;
    summary: string;
    source?: string;
    options?: string[];
    searchQuery?: string;
}): Promise<ReviewItem>;
/** List review items, optionally filtered by status. */
export declare function listReviews(kb: KbConfig, status?: string): Promise<ReviewItem[]>;
/** Resolve a review item (resolved / skipped) with an optional note. */
export declare function resolveReview(kb: KbConfig, id: string, status: 'resolved' | 'skipped', resolution?: string): Promise<ReviewItem | null>;
export { extractWikilinks };
//# sourceMappingURL=store.d.ts.map