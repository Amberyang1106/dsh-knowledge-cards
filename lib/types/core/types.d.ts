/**
 * Shared type layer for the dsh-knowledge-cards plugin. Card = one wiki page
 * in the llm_wiki sense: YAML frontmatter (type/title/description/tags/
 * related/sources/dates) + a markdown body with [[wikilink]] cross-refs.
 * A knowledge base is a directory following the three-layer layout
 * (raw/sources → wiki/ → schema.md + purpose.md).
 * @module dsh-knowledge-cards/core/types
 */
/** Known page types (llm_wiki BASE_SCHEMA_TYPES); schema.md may extend them. */
export declare const CARD_TYPES: readonly ["entity", "concept", "source", "query", "comparison", "synthesis", "overview"];
export type CardType = (typeof CARD_TYPES)[number] | (string & {});
/** Directory (wiki-relative) a page type maps to by default. */
export declare const TYPE_DIRS: Record<string, string>;
/** Card metadata as parsed from frontmatter (no body). */
export interface CardMeta {
    /** File stem of the page, e.g. `attention-mechanism` (CJK titles keep CJK). */
    slug: string;
    /** wiki-relative path, e.g. `concepts/attention-mechanism.md`. */
    path: string;
    type: CardType;
    title: string;
    description?: string;
    tags: string[];
    /** Bare slugs of related pages ([[wikilink]] targets). */
    related: string[];
    /** Source filenames this card was distilled from. */
    sources: string[];
    created?: string;
    updated?: string;
}
/** A full card: metadata + body markdown + raw file content. */
export interface Card extends CardMeta {
    body: string;
    raw: string;
}
/** One configured knowledge base. */
export interface KbConfig {
    id: string;
    name: string;
    /** Absolute directory of the KB (holds raw/, wiki/, schema.md, purpose.md). */
    path: string;
    description?: string;
    createdAt: number;
}
/** KB summary with live stats for the panel/agent surfaces. */
export interface KbSummary {
    id: string;
    name: string;
    path: string;
    description?: string;
    createdAt: number;
    stats: {
        total: number;
        byType: Record<string, number>;
        sourceCount: number;
        /** Raw code files stored under code/ (no LLM processing). */
        codeCount: number;
        updatedAt?: string;
    };
}
/** Ingest status of one raw source file. */
export interface SourceStatus {
    relPath: string;
    sha256: string;
    status: 'new' | 'changed' | 'up-to-date';
    lastIngestedAt?: number;
    /** Slugs of wiki pages that cite this source. */
    pages: string[];
}
/** One lint finding. */
export interface LintIssue {
    severity: 'error' | 'warn';
    kind: 'broken-wikilink' | 'orphan' | 'missing-description' | 'missing-frontmatter' | 'missing-source' | 'empty-body';
    path?: string;
    message: string;
}
/** A page handed to the commit path (agent-generated or bulk-imported). */
export interface PageInput {
    /** Page type; unknown types fall back to the entities directory. */
    type: string;
    title: string;
    description?: string;
    tags?: string[];
    /** Bare slugs. */
    related?: string[];
    /** Source filenames this page distills. */
    sources?: string[];
    /** Markdown body (without frontmatter). */
    body: string;
    /** Optional explicit wiki-relative path; default derives from type+title. */
    path?: string;
    /** Optional created/updated dates (bulk import preserves originals). */
    created?: string;
    updated?: string;
}
/** Result of a commit operation. */
export interface CommitResult {
    created: string[];
    updated: string[];
    indexUpdated: boolean;
    logEntry: string;
    overviewUpdated: boolean;
    cachedSources: string[];
}
/** llm_wiki review kinds: things the LLM flags during ingest for human judgment. */
export type ReviewKind = 'contradiction' | 'duplicate' | 'missing-page' | 'suggestion';
/** One async human-in-the-loop review item (llm_wiki's 审核系统). */
export interface ReviewItem {
    id: string;
    kbId: string;
    kind: ReviewKind;
    /** Short subject, e.g. the entity/concept involved. */
    title: string;
    /** Why this needs human judgment. */
    summary: string;
    /** Source file or card that raised the flag. */
    source?: string;
    /** Predefined actions the human may take (constrained, no free-form ops). */
    options: string[];
    /** Pre-generated web search query for deep research. */
    searchQuery?: string;
    status: 'pending' | 'resolved' | 'skipped';
    createdAt: number;
    resolvedAt?: number;
    resolution?: string;
}
/** Default predefined options per kind (llm_wiki constrains actions). */
export declare const REVIEW_OPTIONS: Record<ReviewKind, string[]>;
/** One soft-deleted card sitting in a KB's recycle bin (.trash/cards/). */
export interface TrashCardEntry {
    /** File stem of the card (same as when it lived in wiki/). */
    slug: string;
    /** wiki-relative path before deletion (e.g. `concepts/foo.md`). */
    originalPath: string;
    type: string;
    title: string;
    description?: string;
    /** Absolute path inside the recycle bin. */
    trashPath: string;
    deletedAt: number;
}
/** One soft-deleted knowledge base in the config-root recycle bin (.trash/kbs/). */
export interface TrashKbEntry {
    id: string;
    name: string;
    /** Absolute path of the KB directory before deletion. */
    originalPath: string;
    description?: string;
    createdAt?: number;
    deletedAt: number;
    /** Absolute path of the trashed KB directory. */
    trashPath: string;
}
//# sourceMappingURL=types.d.ts.map