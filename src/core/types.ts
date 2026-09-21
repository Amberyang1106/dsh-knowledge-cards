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
] as const

export type CardType = (typeof CARD_TYPES)[number] | (string & {})

/** Directory (wiki-relative) a page type maps to by default. */
export const TYPE_DIRS: Record<string, string> = {
  entity: 'entities',
  concept: 'concepts',
  source: 'sources',
  query: 'queries',
  comparison: 'comparisons',
  synthesis: 'synthesis',
  rules: 'rules',
  field: 'fields',
}

/** Card metadata as parsed from frontmatter (no body). */
export interface CardMeta {
  /** File stem of the page, e.g. `attention-mechanism` (CJK titles keep CJK). */
  slug: string
  /** wiki-relative path, e.g. `concepts/attention-mechanism.md`. */
  path: string
  type: CardType
  title: string
  description?: string
  tags: string[]
  /** Bare slugs of related pages ([[wikilink]] targets). */
  related: string[]
  /** Source filenames this card was distilled from. */
  sources: string[]
  created?: string
  updated?: string
}

/** A full card: metadata + body markdown + raw file content. */
export interface Card extends CardMeta {
  body: string
  raw: string
}

/** One configured knowledge base. */
export interface KbConfig {
  id: string
  name: string
  /** Absolute directory of the KB (holds raw/, wiki/, schema.md, purpose.md). */
  path: string
  description?: string
  createdAt: number
}

/** KB summary with live stats for the panel/agent surfaces. */
export interface KbSummary {
  id: string
  name: string
  path: string
  description?: string
  createdAt: number
  stats: {
    total: number
    byType: Record<string, number>
    sourceCount: number
    /** Raw code files stored under code/ (no LLM processing). */
    codeCount: number
    updatedAt?: string
  }
}

/** Ingest status of one raw source file. */
export interface SourceStatus {
  relPath: string
  sha256: string
  status: 'new' | 'changed' | 'up-to-date'
  lastIngestedAt?: number
  /** Slugs of wiki pages that cite this source. */
  pages: string[]
}

/** One lint finding. */
export interface LintIssue {
  severity: 'error' | 'warn'
  kind:
    | 'broken-wikilink'
    | 'orphan'
    | 'missing-description'
    | 'missing-frontmatter'
    | 'missing-source'
    | 'empty-body'
    | 'relation-dangling'
    | 'relation-asymmetric'
    | 'relation-self'
    | 'relation-cycle'
  path?: string
  message: string
}

/** A page handed to the commit path (agent-generated or bulk-imported). */
export interface PageInput {
  /** Page type; unknown types fall back to the entities directory. */
  type: string
  title: string
  description?: string
  tags?: string[]
  /** Bare slugs. */
  related?: string[]
  /** Source filenames this page distills. */
  sources?: string[]
  /** Markdown body (without frontmatter). */
  body: string
  /** Optional explicit wiki-relative path; default derives from type+title. */
  path?: string
  /** Optional created/updated dates (bulk import preserves originals). */
  created?: string
  updated?: string
  /**
   * Optional extra frontmatter keys beyond the managed ones (type/title/
   * description/tags/related/sources/created/updated) — used by rule cards
   * (type=rules) whose executable spec lives in the frontmatter. Managed keys
   * always win over these.
   */
  frontmatter?: Record<string, unknown>
}

/** Result of a commit operation. */
export interface CommitResult {
  created: string[]
  updated: string[]
  indexUpdated: boolean
  logEntry: string
  overviewUpdated: boolean
  cachedSources: string[]
}

/** llm_wiki review kinds: things the LLM flags during ingest for human judgment. */
export type ReviewKind = 'contradiction' | 'duplicate' | 'missing-page' | 'suggestion'

/** One async human-in-the-loop review item (llm_wiki's 审核系统). */
export interface ReviewItem {
  id: string
  kbId: string
  kind: ReviewKind
  /** Short subject, e.g. the entity/concept involved. */
  title: string
  /** Why this needs human judgment. */
  summary: string
  /** Source file or card that raised the flag. */
  source?: string
  /** Predefined actions the human may take (constrained, no free-form ops). */
  options: string[]
  /** Pre-generated web search query for deep research. */
  searchQuery?: string
  status: 'pending' | 'resolved' | 'skipped'
  createdAt: number
  resolvedAt?: number
  resolution?: string
}

/** Default predefined options per kind (llm_wiki constrains actions). */
export const REVIEW_OPTIONS: Record<ReviewKind, string[]> = {
  contradiction: ['创建页面', '深度研究', '跳过'],
  duplicate: ['合并页面', '跳过'],
  'missing-page': ['创建页面', '深度研究', '跳过'],
  suggestion: ['创建页面', '深度研究', '跳过'],
}

/** One soft-deleted card sitting in a KB's recycle bin (.trash/cards/). */
export interface TrashCardEntry {
  /** File stem of the card (same as when it lived in wiki/). */
  slug: string
  /** wiki-relative path before deletion (e.g. `concepts/foo.md`). */
  originalPath: string
  type: string
  title: string
  description?: string
  /** Absolute path inside the recycle bin. */
  trashPath: string
  deletedAt: number
}

/** One soft-deleted knowledge base in the config-root recycle bin (.trash/kbs/). */
export interface TrashKbEntry {
  id: string
  name: string
  /** Absolute path of the KB directory before deletion. */
  originalPath: string
  description?: string
  createdAt?: number
  deletedAt: number
  /** Absolute path of the trashed KB directory. */
  trashPath: string
}

// ---------------------------------------------------------------------------
// rule cards (type=rules): declarative, machine-executable validation rules
// stored in the card FRONTMATTER as nested YAML (rule_id / rule_set / status /
// conditions / outcome / test_cases …). The row-psd recon pipeline reads a
// rule set via GET /api/dsh-knowledge/rules and evaluates it deterministically
// (no LLM). Lifecycle: draft → review → active → deprecated.
// ---------------------------------------------------------------------------

/** Lifecycle of one rule card; only `active` (and in-effect) rules run. */
export type RuleStatus = 'draft' | 'review' | 'active' | 'deprecated'

export const RULE_STATUSES: RuleStatus[] = ['draft', 'review', 'active', 'deprecated']

/** Whitelisted comparison operators for rule conditions (spec §7.4). */
export const RULE_OPERATORS = [
  'eq', 'ne', 'gt', 'ge', 'lt', 'le',
  'in', 'not_in', 'is_blank', 'is_not_blank', 'contains',
] as const

export type RuleOperator = (typeof RULE_OPERATORS)[number]

export type RuleMatch = 'all' | 'any'

/** One condition inside a rule: a registered fact + fixed operator (+ value). */
export interface RuleCondition {
  fact: string
  operator: RuleOperator | (string & {})
  value?: string | number | boolean | Array<string | number> | null
}

/** What a matched rule claims, for display and aggregation. */
export interface RuleOutcome {
  category: string
  label?: string
  explanation?: string
  suggested_action?: string
}

/** A supported/ excluded test case bundled with the rule. */
export interface RuleTestCase {
  name: string
  facts?: Record<string, string | number | boolean | null>
  expected?: string
}

/** Executable rule spec as parsed from a rule card's frontmatter. */
export interface RuleSpec {
  rule_id: string
  rule_set: string
  applies_to?: string[]
  status?: RuleStatus | string
  priority?: number
  owner?: string
  effective_from?: string
  effective_to?: string
  version?: string | number
  match?: RuleMatch | string
  conditions: RuleCondition[]
  outcome: RuleOutcome
  test_cases?: RuleTestCase[]
  /** Any additional frontmatter keys beyond the known rule fields. */
  [key: string]: unknown
}

/** One validated, runnable rule (a rule card that passed structural checks). */
export interface CompiledRule {
  slug: string
  title: string
  description?: string
  updated?: string
  spec: RuleSpec
  /** Card body markdown (business explanation, evidence, notes). */
  body: string
}

/** A rule card that failed structural validation (still listed, never run). */
export interface InvalidRule {
  slug: string
  title: string
  issues: string[]
}

/** Result of GET /api/dsh-knowledge/rules: one rule set, versioned & validated. */
export interface RulesResult {
  kb: string
  ruleSet: string
  /** Content hash over the canonical active specs — fixed per run for tracing. */
  version: string
  hash: string
  generatedAt: string
  statusFilter: string
  rules: CompiledRule[]
  invalidRules: InvalidRule[]
}

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
] as const

export const FIELD_DATA_TYPES = [
  'string', 'amount', 'percentage', 'integer', 'ratio', 'date', 'boolean',
] as const

/** How the value may be aggregated across rows. */
export const FIELD_AGGREGATIONS = ['additive', 'semi-additive', 'non-additive'] as const

export const FIELD_STATUSES = ['draft', 'active', 'deprecated', 'retired'] as const

/** Trust level of the recorded logic (AI-inferred vs owner-confirmed). */
export const FIELD_REVIEW_STATUSES = ['draft', 'inferred', 'confirmed', 'disputed', 'deprecated'] as const

/** What the logic is based on — keeps inferred knowledge clearly marked. */
export const FIELD_EVIDENCE_LEVELS = ['source_code', 'business_document', 'business_confirmation', 'inferred'] as const

/** Structured relation keys carried in a field card's frontmatter. */
export const FIELD_RELATION_KEYS = ['depends_on', 'used_by', 'implemented_in', 'governed_by'] as const

/** Structured metadata of one field card (frontmatter view). */
export interface FieldMeta {
  field_id?: string
  canonical_name?: string
  field_kind?: string
  data_type?: string
  aggregation?: string
  unit?: string
  status?: string
  review_status?: string
  evidence_level?: string
  domain?: string
  workstream?: string
  subject_area?: string
  business_owner?: string
  technical_owner?: string
  source_table?: string
  source_field?: string
  depends_on?: string[]
  used_by?: string[]
  implemented_in?: string[]
  governed_by?: string[]
  effective_from?: string
  last_reviewed?: string
  /** Any additional frontmatter keys. */
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// lineage assistance (panel button): a deterministic scan proposes candidate
// edges from card bodies + metadata gaps; optionally an agent run adds
// semantic proposals; the user reviews them and a deterministic apply writes
// the accepted ones (marked inferred, never downgrading a confirmed card).
// ---------------------------------------------------------------------------

/** One candidate change for one field card, with its evidence. */
export interface LineageProposal {
  /** Slug of the card to update. */
  slug: string
  title: string
  /** Where the proposal came from. */
  source: 'scan' | 'llm' | 'manual'
  confidence: 'high' | 'medium' | 'low'
  /** Human-readable evidence (quoted card text or metadata rule). */
  evidence: string
  /** Relation keys to add (union with what the card already has). */
  relations: Partial<Record<'depends_on' | 'used_by' | 'implemented_in' | 'governed_by', string[]>>
  /** Metadata keys to set (empty value = remove the key). */
  metadata?: Record<string, unknown>
  /** Extra note surfaced in the preview (e.g. dangling target). */
  note?: string
}

/** Result of the deterministic lineage scan of one KB. */
export interface LineageScanResult {
  kb: string
  generatedAt: string
  fieldCards: number
  proposals: LineageProposal[]
  notes: string[]
}

/** One accepted proposal's outcome after the deterministic apply. */
export interface LineageAppliedCard {
  slug: string
  title: string
  changed: string[]
  relations: Record<string, string[]>
}

/** Result of applying accepted proposals. */
export interface LineageApplyResult {
  kb: string
  applied: LineageAppliedCard[]
  skipped: Array<{ slug: string; reason: string }>
  generatedAt: string
}

/** An agent-side lineage proposal batch parked for panel review. */
export interface LineageProposalFile {
  kb: string
  requestedAt: string
  childId?: string
  proposals: LineageProposal[]
  notes: string[]
}
