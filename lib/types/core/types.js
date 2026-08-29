/**
 * Shared type layer for the dsh-knowledge-cards plugin. Card = one wiki page
 * in the llm_wiki sense: YAML frontmatter (type/title/description/tags/
 * related/sources/dates) + a markdown body with [[wikilink]] cross-refs.
 * A knowledge base is a directory following the three-layer layout
 * (raw/sources → wiki/ → schema.md + purpose.md).
 * @module dsh-knowledge-cards/core/types
 */
/** Known page types (llm_wiki BASE_SCHEMA_TYPES); schema.md may extend them. */
export const CARD_TYPES = [
    'entity',
    'concept',
    'source',
    'query',
    'comparison',
    'synthesis',
    'overview',
];
/** Directory (wiki-relative) a page type maps to by default. */
export const TYPE_DIRS = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    query: 'queries',
    comparison: 'comparisons',
    synthesis: 'synthesis',
};
/** Default predefined options per kind (llm_wiki constrains actions). */
export const REVIEW_OPTIONS = {
    contradiction: ['创建页面', '深度研究', '跳过'],
    duplicate: ['合并页面', '跳过'],
    'missing-page': ['创建页面', '深度研究', '跳过'],
    suggestion: ['创建页面', '深度研究', '跳过'],
};
