/**
 * Dependency-free token search over wiki cards (llm_wiki stage-1 style):
 * latin word tokens + CJK bigram tokens, title/description/tag/body weighted,
 * title-match bonus. Vector search is deliberately out of scope — Karpathy's
 * note: at ~100-source scale the index + token search is enough.
 * @module dsh-knowledge-cards/core/search
 */
import type { CardMeta } from './types.ts';
/** Tokenize one string: latin words (lowercased) + CJK bigrams. */
export declare function tokenize(text: string): string[];
/** Normalize a query into a set of tokens plus the raw lowercase string. */
export interface Query {
    raw: string;
    tokens: Set<string>;
}
export declare function makeQuery(query: string): Query;
export interface SearchHit {
    card: CardMeta;
    score: number;
}
/**
 * Rank cards against the query. Weighting mirrors llm_wiki's stage 1:
 * title ×10, description ×5, tags ×3, body ×1 (body preview only).
 */
export declare function searchCards(cards: CardMeta[], query: string, limit?: number, bodyPreview?: (card: CardMeta) => string): SearchHit[];
/** Extract [[wikilink]] targets from a markdown body (aliases stripped). */
export declare function extractWikilinks(body: string): string[];
//# sourceMappingURL=search.d.ts.map