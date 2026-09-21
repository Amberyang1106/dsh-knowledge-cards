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
    'rules',
    'field',
];
/** Directory (wiki-relative) a page type maps to by default. */
export const TYPE_DIRS = {
    entity: 'entities',
    concept: 'concepts',
    source: 'sources',
    query: 'queries',
    comparison: 'comparisons',
    synthesis: 'synthesis',
    rules: 'rules',
    field: 'fields',
};
/** Default predefined options per kind (llm_wiki constrains actions). */
export const REVIEW_OPTIONS = {
    contradiction: ['创建页面', '深度研究', '跳过'],
    duplicate: ['合并页面', '跳过'],
    'missing-page': ['创建页面', '深度研究', '跳过'],
    suggestion: ['创建页面', '深度研究', '跳过'],
};
export const RULE_STATUSES = ['draft', 'review', 'active', 'deprecated'];
/** Whitelisted comparison operators for rule conditions (spec §7.4). */
export const RULE_OPERATORS = [
    'eq', 'ne', 'gt', 'ge', 'lt', 'le',
    'in', 'not_in', 'is_blank', 'is_not_blank', 'contains',
];
// ---------------------------------------------------------------------------
// field cards (type=field): one card per BUSINESS SEMANTIC FIELD (e.g. Revenue),
// not per physical database column — its physical implementations across
// systems live inside the card. Structured identity/logic/governance metadata
// sits in the frontmatter (nested YAML); narrative sections live in the body.
// Relations (depends_on / used_by / implemented_in / governed_by) plus
// [[wikilink]] cross-references form the seed of a lightweight finance
// semantic graph for impact analysis.
// ---------------------------------------------------------------------------
/** What kind of field this is (one type `field`, discriminated by this key). */
export const FIELD_KINDS = [
    'dimension', 'measure', 'calculated_field', 'flag', 'key', 'mapping', 'date', 'attribute', 'parameter',
];
export const FIELD_DATA_TYPES = [
    'string', 'amount', 'percentage', 'integer', 'ratio', 'date', 'boolean',
];
/** How the value may be aggregated across rows. */
export const FIELD_AGGREGATIONS = ['additive', 'semi-additive', 'non-additive'];
export const FIELD_STATUSES = ['draft', 'active', 'deprecated', 'retired'];
/** Trust level of the recorded logic (AI-inferred vs owner-confirmed). */
export const FIELD_REVIEW_STATUSES = ['draft', 'inferred', 'confirmed', 'disputed', 'deprecated'];
/** What the logic is based on — keeps inferred knowledge clearly marked. */
export const FIELD_EVIDENCE_LEVELS = ['source_code', 'business_document', 'business_confirmation', 'inferred'];
/** Structured relation keys carried in a field card's frontmatter. */
export const FIELD_RELATION_KEYS = ['depends_on', 'used_by', 'implemented_in', 'governed_by'];
