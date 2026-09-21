/**
 * KnowledgeCards panel: the center-column view toggled by the sidebar entry.
 * Tabs — 卡片 (card wall + search + detail + manual create), 资料 (raw sources
 * with ingest status + copy-prompt for the agent), 代码 (code files), 看板
 * (activity log), 审核 (review queue), 知识库 (multi-KB management), 回收站
 * (deleted cards/KBs, restore or purge). All data rides the host
 * /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client/panel
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Card, CardMeta, KbSummary, LintIssue, SourceStatus } from '../core/types.ts'
import type { PanelController } from './controller.ts'
import { t, type KnowledgeCardsKey } from './locales.ts'
import css from './panel.module.css'

interface ApiEnvelope<T> {
  ok?: boolean
  error?: string
  [key: string]: unknown
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const data = (await response.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!response.ok || data.ok === false) {
    throw new Error(String(data.error ?? `HTTP ${response.status}`))
  }
  return data as T
}

function query(params: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined) search.set(key, value)
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

/** Extract the frontmatter payload (between the `---` fences) of a raw card
 * file — used to prefill the YAML editor of rule cards. */
function frontmatterPayloadOf(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const start = lines[0]?.trim() === '---' ? 1 : 0
  const payload: string[] = []
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') break
    payload.push(lines[index])
  }
  return payload.join('\n').replace(/\n+$/, '')
}

const KB_STORAGE_KEY = 'dsh-knowledge-cards:kb'

const TYPE_FILTERS = ['all', 'entity', 'concept', 'source', 'query', 'comparison', 'synthesis', 'rules', 'field'] as const

/** Types offered by the manual create form (overview is auto-maintained). */
const CREATE_TYPES = ['concept', 'entity', 'source', 'query', 'comparison', 'synthesis', 'rules', 'field'] as const

/** Types whose whole frontmatter is edited as one canonical YAML payload.
 * (`field` uses the dedicated 5-section structured form below instead.) */
const YAML_EDITOR_TYPES: readonly string[] = ['rules']

// ---------------------------------------------------------------------------
// field card structured form (type=field): five sections over the frontmatter
// metadata — Overview / Logic / Implementation / Lineage & Impact / Governance.
// Narrative sections (business definition, calculation, scope, validation …)
// stay in the card body and are completed by the agent.
// ---------------------------------------------------------------------------

interface FieldDraft {
  title: string
  description: string
  aliases: string
  fieldId: string
  canonicalName: string
  fieldKind: string
  dataType: string
  status: string
  domain: string
  workstream: string
  subjectArea: string
  aggregation: string
  unit: string
  sourceTable: string
  sourceField: string
  implementedIn: string
  dependsOn: string
  usedBy: string
  governedBy: string
  businessOwner: string
  technicalOwner: string
  effectiveFrom: string
  lastReviewed: string
  reviewStatus: string
  evidenceLevel: string
  tags: string
  sources: string
}

const FIELD_KIND_OPTIONS = ['measure', 'dimension', 'calculated_field', 'flag', 'key', 'mapping', 'date', 'attribute', 'parameter'] as const
const FIELD_DATA_TYPE_OPTIONS = ['amount', 'percentage', 'ratio', 'integer', 'string', 'date', 'boolean'] as const
const FIELD_AGGREGATION_OPTIONS = ['additive', 'semi-additive', 'non-additive'] as const
const FIELD_STATUS_OPTIONS = ['draft', 'active', 'deprecated', 'retired'] as const
const FIELD_REVIEW_OPTIONS = ['draft', 'inferred', 'confirmed', 'disputed', 'deprecated'] as const
const FIELD_EVIDENCE_OPTIONS = ['source_code', 'business_document', 'business_confirmation', 'inferred'] as const

function emptyFieldDraft(): FieldDraft {
  return {
    title: '', description: '', aliases: '', fieldId: '', canonicalName: '',
    fieldKind: 'measure', dataType: 'amount', status: 'draft',
    domain: 'Finance', workstream: '', subjectArea: '',
    aggregation: 'non-additive', unit: '', sourceTable: '', sourceField: '',
    implementedIn: '', dependsOn: '', usedBy: '', governedBy: '',
    businessOwner: '', technicalOwner: '', effectiveFrom: '', lastReviewed: '',
    reviewStatus: 'draft', evidenceLevel: '', tags: '', sources: '',
  }
}

/** Split a list input on newlines or commas. */
const splitFieldList = (text: string): string[] =>
  text.split(/[\n,]/).map((item) => item.trim()).filter((item) => item !== '')

/** Render a frontmatter value back into a list-editor string. */
const joinFieldList = (value: unknown): string => {
  if (Array.isArray(value)) return value.map((item) => String(item)).join('\n')
  if (typeof value === 'string') return value
  return ''
}

/** Build the non-managed frontmatter object from the structured draft. */
function buildFieldFrontmatter(draft: FieldDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const put = (key: string, value: string): void => {
    const text = value.trim()
    if (text !== '') out[key] = text
  }
  const putList = (key: string, value: string): void => {
    const items = splitFieldList(value)
    if (items.length > 0) out[key] = items
  }
  put('field_id', draft.fieldId)
  put('canonical_name', draft.canonicalName)
  putList('aliases', draft.aliases)
  put('field_kind', draft.fieldKind)
  put('data_type', draft.dataType)
  put('status', draft.status)
  put('domain', draft.domain)
  put('workstream', draft.workstream)
  put('subject_area', draft.subjectArea)
  put('aggregation', draft.aggregation)
  put('unit', draft.unit)
  put('source_table', draft.sourceTable)
  put('source_field', draft.sourceField)
  putList('implemented_in', draft.implementedIn)
  putList('depends_on', draft.dependsOn)
  putList('used_by', draft.usedBy)
  putList('governed_by', draft.governedBy)
  put('business_owner', draft.businessOwner)
  put('technical_owner', draft.technicalOwner)
  put('effective_from', draft.effectiveFrom)
  put('last_reviewed', draft.lastReviewed)
  put('review_status', draft.reviewStatus)
  put('evidence_level', draft.evidenceLevel)
  return out
}

/** Prefill the structured draft from a card + its parsed frontmatter. */
function fieldDraftFrom(card: CardMeta, fm: Record<string, unknown>): FieldDraft {
  const text = (value: unknown): string => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value))
  const base = emptyFieldDraft()
  return {
    ...base,
    title: card.title,
    description: card.description ?? '',
    aliases: joinFieldList(fm.aliases),
    fieldId: text(fm.field_id),
    canonicalName: text(fm.canonical_name),
    fieldKind: text(fm.field_kind) || base.fieldKind,
    dataType: text(fm.data_type) || base.dataType,
    status: text(fm.status) || base.status,
    domain: text(fm.domain) || base.domain,
    workstream: text(fm.workstream),
    subjectArea: text(fm.subject_area),
    aggregation: text(fm.aggregation) || base.aggregation,
    unit: text(fm.unit),
    sourceTable: text(fm.source_table),
    sourceField: text(fm.source_field),
    implementedIn: joinFieldList(fm.implemented_in),
    dependsOn: joinFieldList(fm.depends_on),
    usedBy: joinFieldList(fm.used_by),
    governedBy: joinFieldList(fm.governed_by),
    businessOwner: text(fm.business_owner),
    technicalOwner: text(fm.technical_owner),
    effectiveFrom: text(fm.effective_from),
    lastReviewed: text(fm.last_reviewed),
    reviewStatus: text(fm.review_status) || base.reviewStatus,
    evidenceLevel: text(fm.evidence_level),
    tags: card.tags.join(', '),
    sources: card.sources.join(', '),
  }
}

interface FieldControlSpec {
  key: keyof FieldDraft
  labelKey: KnowledgeCardsKey
  kind: 'text' | 'list' | 'select'
  options?: readonly string[]
}

interface FieldSectionSpec {
  titleKey: KnowledgeCardsKey
  open?: boolean
  controls: FieldControlSpec[]
}

const FIELD_SECTIONS: FieldSectionSpec[] = [
  {
    titleKey: 'field.section.overview',
    open: true,
    controls: [
      { key: 'title', labelKey: 'card.title', kind: 'text' },
      { key: 'description', labelKey: 'card.desc', kind: 'text' },
      { key: 'aliases', labelKey: 'field.aliases', kind: 'text' },
      { key: 'fieldId', labelKey: 'field.id', kind: 'text' },
      { key: 'canonicalName', labelKey: 'field.canonical', kind: 'text' },
      { key: 'fieldKind', labelKey: 'field.kind', kind: 'select', options: FIELD_KIND_OPTIONS },
      { key: 'dataType', labelKey: 'field.dataType', kind: 'select', options: FIELD_DATA_TYPE_OPTIONS },
      { key: 'status', labelKey: 'field.status', kind: 'select', options: FIELD_STATUS_OPTIONS },
      { key: 'domain', labelKey: 'field.domain', kind: 'text' },
      { key: 'workstream', labelKey: 'field.workstream', kind: 'text' },
      { key: 'subjectArea', labelKey: 'field.subjectArea', kind: 'text' },
    ],
  },
  {
    titleKey: 'field.section.logic',
    open: true,
    controls: [
      { key: 'aggregation', labelKey: 'field.aggregation', kind: 'select', options: FIELD_AGGREGATION_OPTIONS },
      { key: 'unit', labelKey: 'field.unit', kind: 'text' },
      { key: 'sourceTable', labelKey: 'field.sourceTable', kind: 'text' },
      { key: 'sourceField', labelKey: 'field.sourceField', kind: 'text' },
    ],
  },
  {
    titleKey: 'field.section.implementation',
    controls: [{ key: 'implementedIn', labelKey: 'field.implementedIn', kind: 'list' }],
  },
  {
    titleKey: 'field.section.lineage',
    controls: [
      { key: 'dependsOn', labelKey: 'field.dependsOn', kind: 'list' },
      { key: 'usedBy', labelKey: 'field.usedBy', kind: 'list' },
      { key: 'governedBy', labelKey: 'field.governedBy', kind: 'list' },
    ],
  },
  {
    titleKey: 'field.section.governance',
    controls: [
      { key: 'businessOwner', labelKey: 'field.businessOwner', kind: 'text' },
      { key: 'technicalOwner', labelKey: 'field.technicalOwner', kind: 'text' },
      { key: 'effectiveFrom', labelKey: 'field.effectiveFrom', kind: 'text' },
      { key: 'lastReviewed', labelKey: 'field.lastReviewed', kind: 'text' },
      { key: 'reviewStatus', labelKey: 'field.reviewStatus', kind: 'select', options: FIELD_REVIEW_OPTIONS },
      { key: 'evidenceLevel', labelKey: 'field.evidenceLevel', kind: 'select', options: FIELD_EVIDENCE_OPTIONS },
      { key: 'tags', labelKey: 'form.tags', kind: 'text' },
      { key: 'sources', labelKey: 'form.sources', kind: 'text' },
    ],
  },
]

/** Five-section structured editor for a field card's metadata. */
function FieldForm({ draft, onChange }: { draft: FieldDraft; onChange: (next: FieldDraft) => void }): ReactElement {
  const set = (key: keyof FieldDraft, value: string): void => onChange({ ...draft, [key]: value })
  return (
    <div>
      <p className={css.note}>{t(undefined, 'field.formHint')}</p>
      {FIELD_SECTIONS.map((section) => (
        <details key={section.titleKey} className={css.formSection} open={section.open}>
          <summary className={css.formSummary}>{t(undefined, section.titleKey)}</summary>
          <div className={css.formBody}>
            {section.controls.map((control) => (
              <label key={control.key} className={css.editLabel}>{t(undefined, control.labelKey)}
                {control.kind === 'select' ? (
                  <select className={css.select} value={draft[control.key]} onChange={(event) => set(control.key, event.target.value)}>
                    {(control.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : control.kind === 'list' ? (
                  <textarea className={css.editorTextarea} rows={3} value={draft[control.key]} placeholder={t(undefined, 'field.lineHint')} onChange={(event) => set(control.key, event.target.value)} />
                ) : (
                  <input className={css.input} value={draft[control.key]} onChange={(event) => set(control.key, event.target.value)} />
                )}
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

/** Starter template for a rule card (type=rules) — canonical YAML frontmatter. */
const RULE_YAML_TEMPLATE = [
  'type: rules',
  'title: ', // 必填：规则标题（生成 slug）
  'description: 一句话说明',
  'rule_id: ', // 必填：唯一标识，如 B3-NOWBS-001
  'rule_set: b3-b4-no-wbs', // 必填：规则集，对账程序按此拉取
  'applies_to: [B3]',
  'status: draft', // draft → review → active → deprecated
  'priority: 30',
  'owner: Finance Transformation',
  'effective_from: ',
  'effective_to: ',
  'version: 1',
  'match: all', // all | any
  'conditions:', // 至少一条：{fact, operator, value}
  '  - fact: mspa03_customer_row_count',
  '    operator: gt',
  '    value: 0',
  'outcome:',
  '  category: WBS_FORMAT', // 必填
  '  label: 结论标签',
  '  explanation: 结论说明',
  '  suggested_action: 建议动作',
  'test_cases:',
  '  - name: 支持案例',
  '    facts:',
  '      mspa03_customer_row_count: 1',
  '    expected: SUPPORTED',
].join('\n')

// ---------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string }): ReactElement {
  const className = css[`type-${type}`] ?? css.typeOther
  return <span className={`${css.typeBadge} ${className}`}>{type}</span>
}

/** Minimal body renderer: plain text with clickable [[wikilinks]]. */
function BodyText({ body, onOpen }: { body: string; onOpen: (slug: string) => void }): ReactElement {
  const parts = useMemo(() => {
    const output: Array<{ kind: 'text' | 'link'; value: string }> = []
    const pattern = /\[\[([^\]]+)\]\]/g
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(body)) !== null) {
      if (match.index > last) output.push({ kind: 'text', value: body.slice(last, match.index) })
      output.push({ kind: 'link', value: match[1].split('|')[0].trim() })
      last = match.index + match[0].length
    }
    if (last < body.length) output.push({ kind: 'text', value: body.slice(last) })
    return output
  }, [body])

  return (
    <div className={css.body}>
      {parts.map((part, index) =>
        part.kind === 'link'
          ? (
            <button
              key={index}
              className={css.bodyLink}
              title={t(undefined, 'card.wikilink', { slug: part.value })}
              onClick={() => onOpen(part.value)}
            >
              [[{part.value}]]
            </button>
          )
          : <span key={index}>{part.value}</span>,
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// cards tab
// ---------------------------------------------------------------------------

function CardsTab({
  kbId,
  onOpenCard,
}: {
  kbId: string
  onOpenCard: (card: CardMeta) => void
}): ReactElement {
  const [cards, setCards] = useState<CardMeta[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const load = useCallback((queryText: string, type: string): void => {
    setLoading(true)
    api<{ cards: CardMeta[]; total: number }>(`/api/dsh-knowledge/cards${query({ kb: kbId, q: queryText, type, limit: '200' })}`)
      .then((data) => {
        setCards(data.cards)
        setTotal(data.total)
        setError(null)
      })
      .catch((err) => setError(String((err as Error).message ?? err)))
      .finally(() => setLoading(false))
  }, [kbId])

  useEffect(() => {
    load('', typeFilter)
  }, [load, typeFilter])

  useEffect(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => load(search, typeFilter), 250)
    return () => { if (timerRef.current !== undefined) window.clearTimeout(timerRef.current) }
  }, [search, load, typeFilter])

  // ---- manual create form (手写建卡) ----
  const [creating, setCreating] = useState(false)
  const [draftType, setDraftType] = useState('concept')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [draftRelated, setDraftRelated] = useState('')
  const [draftSources, setDraftSources] = useState('')
  const [draftBody, setDraftBody] = useState('')
  // Rule cards (type=rules) are authored as one canonical YAML frontmatter.
  const [draftYaml, setDraftYaml] = useState('')
  // Field cards (type=field) are authored through the 5-section form.
  const [fieldDraft, setFieldDraft] = useState<FieldDraft>(emptyFieldDraft)
  const [savingDraft, setSavingDraft] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdNote, setCreatedNote] = useState<string | null>(null)

  const isYamlDraft = YAML_EDITOR_TYPES.includes(draftType)
  const isFieldDraft = draftType === 'field'

  const openCreate = (): void => {
    setDraftType('concept')
    setDraftTitle('')
    setDraftDesc('')
    setDraftTags('')
    setDraftRelated('')
    setDraftSources('')
    setDraftBody('')
    setDraftYaml('')
    setFieldDraft(emptyFieldDraft())
    setCreateError(null)
    setCreatedNote(null)
    setCreating(true)
  }

  const switchDraftType = (type: string): void => {
    setDraftType(type)
    if (type === 'rules' && draftYaml.trim() === '') setDraftYaml(RULE_YAML_TEMPLATE)
    if (type === 'field') setFieldDraft(emptyFieldDraft())
  }

  const canSaveDraft = isFieldDraft
    ? fieldDraft.title.trim() !== ''
    : isYamlDraft ? draftYaml.trim() !== '' : draftTitle.trim() !== ''

  const saveCreate = async (): Promise<void> => {
    if (!canSaveDraft) return
    setSavingDraft(true)
    setCreateError(null)
    try {
      const data = await api<{ result: { card: CardMeta } }>('/api/dsh-knowledge/card/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: isFieldDraft
          ? JSON.stringify({
              kb: kbId,
              type: 'field',
              title: fieldDraft.title.trim(),
              description: fieldDraft.description.trim(),
              tags: splitFieldList(fieldDraft.tags),
              sources: splitFieldList(fieldDraft.sources),
              frontmatter: buildFieldFrontmatter(fieldDraft),
              body: draftBody,
            })
          : isYamlDraft
            ? JSON.stringify({ kb: kbId, type: draftType, frontmatterYaml: draftYaml, body: draftBody })
            : JSON.stringify({
                kb: kbId,
                type: draftType,
                title: draftTitle.trim(),
                description: draftDesc.trim(),
                tags: draftTags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
                related: draftRelated.split(',').map((item) => item.trim()).filter((item) => item !== ''),
                sources: draftSources.split(',').map((item) => item.trim()).filter((item) => item !== ''),
                body: draftBody,
              }),
      })
      setCreating(false)
      setCreatedNote(t(undefined, 'create.created', { title: data.result.card.title }))
      window.setTimeout(() => setCreatedNote(null), 4000)
      load(search, typeFilter)
    } catch (err) {
      setCreateError(String((err as Error).message ?? err))
    } finally {
      setSavingDraft(false)
    }
  }

  if (creating) {
    return (
      <div>
        <div className={css.detailHeader}>
          <button className={css.back} onClick={() => setCreating(false)}>{t(undefined, 'card.cancel')}</button>
        </div>
        <h2 className={css.detailTitle}>+ {t(undefined, 'create.title')}</h2>
        {createError !== null && <div className={css.error}>{createError}</div>}
        <div className={css.editForm}>
          <label className={css.editLabel}>{t(undefined, 'create.type')}
            <select className={css.select} value={draftType} onChange={(event) => switchDraftType(event.target.value)}>
              {CREATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          {isFieldDraft ? (
            <>
              <p className={css.note}>{t(undefined, 'create.fieldHint')}</p>
              <FieldForm draft={fieldDraft} onChange={setFieldDraft} />
              <label className={css.editLabel}>{t(undefined, 'card.body')}
                <textarea className={css.editorTextarea} rows={10} value={draftBody} placeholder="业务定义 / 计算逻辑 / 口径条件 / 血缘 / 校验与例外（Markdown，[[wikilink]] 互链）" onChange={(event) => setDraftBody(event.target.value)} />
              </label>
            </>
          ) : isYamlDraft ? (
            <>
              <p className={css.note}>{t(undefined, 'create.ruleHint')}</p>
              <label className={css.editLabel}>{t(undefined, 'create.ruleYaml')}
                <textarea
                  className={css.editorTextarea}
                  rows={22}
                  value={draftYaml}
                  spellCheck={false}
                  onChange={(event) => setDraftYaml(event.target.value)}
                />
              </label>
              <label className={css.editLabel}>{t(undefined, 'card.body')}
                <textarea className={css.editorTextarea} rows={6} value={draftBody} placeholder="业务说明 / 证据 / 备注（Markdown）" onChange={(event) => setDraftBody(event.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className={css.editLabel}>{t(undefined, 'card.title')}
                <input className={css.input} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'card.desc')}
                <input className={css.input} value={draftDesc} onChange={(event) => setDraftDesc(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'form.tags')}
                <input className={css.input} value={draftTags} placeholder="财务, allocation" onChange={(event) => setDraftTags(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'form.related')}
                <input className={css.input} value={draftRelated} placeholder="利润中心, 成本分摊" onChange={(event) => setDraftRelated(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'form.sources')}
                <input className={css.input} value={draftSources} placeholder="policy-2024.pdf" onChange={(event) => setDraftSources(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'card.body')}
                <textarea className={css.editorTextarea} rows={14} value={draftBody} placeholder="Markdown，[[wikilink]] 互链" onChange={(event) => setDraftBody(event.target.value)} />
              </label>
            </>
          )}
          <div className={css.editActions}>
            <button className={css.run} disabled={savingDraft || !canSaveDraft} onClick={() => void saveCreate()}>
              {savingDraft ? '…' : t(undefined, 'create.save')}
            </button>
            <button className={css.runSmall} onClick={() => setCreating(false)}>{t(undefined, 'card.cancel')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={css.controls}>
        <input
          className={css.input}
          placeholder={t(undefined, 'search.placeholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className={css.run} onClick={openCreate}>+ {t(undefined, 'cards.create')}</button>
      </div>
      <div className={css.chips}>
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter}
            className={filter === typeFilter ? css.chipActive : css.chip}
            onClick={() => setTypeFilter(filter)}
          >
            {filter === 'all' ? t(undefined, 'filter.all') : filter}
          </button>
        ))}
        <span className={css.hint}>{t(undefined, 'cards.total', { total })}</span>
      </div>
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {createdNote !== null && <div className={css.lintResult}>{createdNote}</div>}
      {!loading && cards.length === 0 && error === null && <div className={css.empty}>{t(undefined, 'cards.empty')}</div>}
      <div className={css.grid}>
        {cards.map((card) => (
          <button key={card.slug} className={css.card} onClick={() => onOpenCard(card)}>
            <div className={css.cardTop}>
              <TypeBadge type={card.type} />
              <span className={css.cardSources}>{card.sources.length > 0 ? `${card.sources.length} 📎` : ''}</span>
            </div>
            <div className={css.cardTitle}>{card.title}</div>
            {card.description !== undefined && <div className={css.cardDesc}>{card.description}</div>}
            {card.tags.length > 0 && (
              <div className={css.cardTags}>{card.tags.slice(0, 4).map((tag) => <span key={tag} className={css.tag}>#{tag}</span>)}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// card detail
// ---------------------------------------------------------------------------

function CardDetail({ kbId, slug, onBack, onOpenCard, onDeleted }: {
  kbId: string
  slug: string
  onBack: () => void
  onOpenCard: (card: CardMeta) => void
  onDeleted: () => void
}): ReactElement {
  const [card, setCard] = useState<Card | null>(null)
  const [cardFm, setCardFm] = useState<Record<string, unknown>>({})
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editBody, setEditBody] = useState('')
  // Rule cards (type=rules) edit their whole frontmatter as one YAML payload.
  const [editYaml, setEditYaml] = useState('')
  // Field cards (type=field) edit metadata through the 5-section form.
  const [editField, setEditField] = useState<FieldDraft>(emptyFieldDraft)
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setCard(null)
    setEditing(false)
    api<{ card: Card; frontmatter?: Record<string, unknown> }>(`/api/dsh-knowledge/card${query({ kb: kbId, slug })}`)
      .then((data) => { setCard(data.card); setCardFm(data.frontmatter ?? {}); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId, slug])

  const startEdit = (): void => {
    if (card === null) return
    setEditTitle(card.title)
    setEditDesc(card.description ?? '')
    setEditTags(card.tags.join(', '))
    setEditBody(card.body)
    setEditYaml(frontmatterPayloadOf(card.raw))
    if (card.type === 'field') setEditField(fieldDraftFrom(card, cardFm))
    setSavedNote(null)
    setEditing(true)
  }

  const saveEdit = async (): Promise<void> => {
    if (card === null) return
    setSaving(true)
    setError(null)
    try {
      const useFieldForm = card.type === 'field'
      const useYamlEditor = YAML_EDITOR_TYPES.includes(card.type)
      const payload = useFieldForm
        ? JSON.stringify({
            kb: kbId,
            slug: card.slug,
            title: editField.title.trim() || card.title,
            description: editField.description.trim(),
            tags: splitFieldList(editField.tags),
            sources: splitFieldList(editField.sources),
            frontmatter: buildFieldFrontmatter(editField),
            body: editBody,
          })
        : useYamlEditor
          ? JSON.stringify({ kb: kbId, slug: card.slug, frontmatterYaml: editYaml, body: editBody })
          : JSON.stringify({
              kb: kbId,
              slug: card.slug,
              title: editTitle,
              description: editDesc,
              tags: editTags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
              body: editBody,
            })
      const data = await api<{ result: { card: Card; changed: string[] } }>('/api/dsh-knowledge/card/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })
      setCard(data.result.card)
      setEditing(false)
      setSavedNote(data.result.changed.length > 0
        ? `已保存：修改字段 ${data.result.changed.join('、')}`
        : '已保存（无字段变化）')
      window.setTimeout(() => setSavedNote(null), 4000)
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setSaving(false)
    }
  }

  if (error !== null) return <div className={css.error}>{error}</div>
  if (card === null) return <div className={css.empty}>…</div>

  const openFromSlug = (target: string): void => onOpenCard({ slug: target } as CardMeta)

  const removeCard = async (): Promise<void> => {
    if (card === null) return
    if (!window.confirm(t(undefined, 'card.delete.confirm', { title: card.title }))) return
    setDeleting(true)
    try {
      await api('/api/dsh-knowledge/card/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId, slug: card.slug }),
      })
      onDeleted()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <div>
        <div className={css.detailHeader}>
          <button className={css.back} onClick={() => setEditing(false)}>{t(undefined, 'card.cancel')}</button>
          <button className={css.close} onClick={() => setEditing(false)}>✕</button>
        </div>
        <h2 className={css.detailTitle}>{t(undefined, 'edit.title')}</h2>
        {savedNote !== null && <div className={css.lintResult}>{savedNote}</div>}
        <div className={css.editForm}>
          {card.type === 'field' ? (
            <>
              <p className={css.note}>{t(undefined, 'create.fieldHint')}</p>
              <FieldForm draft={editField} onChange={setEditField} />
            </>
          ) : YAML_EDITOR_TYPES.includes(card.type) ? (
            <>
              <p className={css.note}>{t(undefined, 'create.ruleHint')}</p>
              <label className={css.editLabel}>{t(undefined, 'create.ruleYaml')}
                <textarea
                  className={css.editorTextarea}
                  rows={22}
                  value={editYaml}
                  spellCheck={false}
                  onChange={(event) => setEditYaml(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label className={css.editLabel}>{t(undefined, 'card.title')}
                <input className={css.input} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'card.desc')}
                <input className={css.input} value={editDesc} onChange={(event) => setEditDesc(event.target.value)} />
              </label>
              <label className={css.editLabel}>{t(undefined, 'card.tags')}
                <input className={css.input} value={editTags} placeholder="逗号分隔，如 财务, allocation" onChange={(event) => setEditTags(event.target.value)} />
              </label>
            </>
          )}
          <label className={css.editLabel}>{t(undefined, 'card.body')}
            <textarea className={css.editorTextarea} rows={card.type === 'field' ? 10 : YAML_EDITOR_TYPES.includes(card.type) ? 6 : 14} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
          </label>
          <div className={css.editActions}>
            <button className={css.run} disabled={saving} onClick={() => void saveEdit()}>{saving ? '…' : t(undefined, 'edit.save')}</button>
            <button className={css.runSmall} onClick={() => setEditing(false)}>{t(undefined, 'card.cancel')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={css.detailHeader}>
        <button className={css.back} onClick={onBack}>{t(undefined, 'card.back')}</button>
        <div className={css.headerActions}>
          <button className={css.runSmall} onClick={startEdit}>{t(undefined, 'edit.button')}</button>
          <button className={css.dangerSmall} disabled={deleting} onClick={() => void removeCard()}>🗑 {t(undefined, 'card.delete')}</button>
          <button className={css.close} onClick={onBack}>✕</button>
        </div>
      </div>
      {savedNote !== null && <div className={css.lintResult}>{savedNote}</div>}
      <h2 className={css.detailTitle}>{card.title}</h2>
      <div className={css.cardTop}>
        <TypeBadge type={card.type} />
        {card.updated !== undefined && <span className={css.meta}>{t(undefined, 'card.updated')}: {card.updated}</span>}
      </div>
      {card.description !== undefined && <p className={css.detailDesc}>{card.description}</p>}
      <div className={css.kv}>
        {card.tags.length > 0 && (
          <div className={css.kvItem}><span className={css.kvKey}>{t(undefined, 'card.tags')}:</span>
            <span>{card.tags.map((tag) => <span key={tag} className={css.tag}>#{tag}</span>)}</span>
          </div>
        )}
        {card.sources.length > 0 && (
          <div className={css.kvItem}><span className={css.kvKey}>{t(undefined, 'card.sources')}:</span>
            <span>{card.sources.join(', ')}</span>
          </div>
        )}
        {card.related.length > 0 && (
          <div className={css.kvItem}><span className={css.kvKey}>{t(undefined, 'card.related')}:</span>
            <span>{card.related.map((related) => (
              <button key={related} className={css.relatedLink} onClick={() => openFromSlug(related)}>[[{related}]]</button>
            ))}</span>
          </div>
        )}
      </div>
      <BodyText body={card.body} onOpen={openFromSlug} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// sources tab
// ---------------------------------------------------------------------------

function buildIngestPrompt(kbName: string, pending: SourceStatus[]): string {
  const list = pending.map((source) => `- ${source.relPath}（${source.status === 'new' ? '新增' : '变更'}）`).join('\n')
  return `请用知识卡片插件摄入以下资料到知识库「${kbName}」：\n${list}\n\n流程：先 wiki_ingest 取资料全文与知识库上下文（分析关键实体/概念、与现有卡片的关联），再用 wiki_commit 生成并提交卡片（frontmatter 含 type/title/description/tags/related/sources，正文用 [[wikilink]] 互链），完成后跑一次 wiki_lint。\n重要：分析中若发现与现有知识矛盾、疑似已有同名卡片、重要概念缺页面、或值得深挖的点，用 wiki_review_submit 提交审核项（kind + 简短说明 + 预定义操作 + 可选的预生成搜索查询），不要擅自下结论——用户稍后在「审核」tab 处理。`
}

function SourcesTab({ kbId, kbName }: { kbId: string; kbName: string }): ReactElement {
  const [sources, setSources] = useState<SourceStatus[]>([])
  const [pending, setPending] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((): void => {
    api<{ sources: SourceStatus[]; pending: number }>(`/api/dsh-knowledge/sources${query({ kb: kbId })}`)
      .then((data) => { setSources(data.sources); setPending(data.pending); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId])

  useEffect(() => { load() }, [load])

  const pendingSources = sources.filter((source) => source.status !== 'up-to-date')

  const copyPrompt = async (): Promise<void> => {
    const prompt = buildIngestPrompt(kbName, pendingSources)
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — fall back to a prompt textarea the user can copy
      window.prompt('复制以下摄入指令发给 agent：', prompt)
    }
  }

  return (
    <div>
      <div className={css.controls}>
        <span className={css.hint}>{t(undefined, 'sources.pending', { n: pending })}</span>
        <button className={css.run} disabled={pendingSources.length === 0} onClick={() => void copyPrompt()}>
          {copied ? '✓ ' : ''}{t(undefined, 'sources.copyPrompt')}
        </button>
        <button className={css.run} onClick={load}>{t(undefined, 'refresh')}</button>
      </div>
      <p className={css.note}>{t(undefined, 'sources.ingestHint')}</p>
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {sources.length === 0 && error === null && <div className={css.empty}>{t(undefined, 'sources.empty')}</div>}
      <table className={css.table}>
        <thead>
          <tr>
            <th>文件</th>
            <th>状态</th>
            <th>SHA256</th>
            <th>关联卡片</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.relPath}>
              <td>{source.relPath}</td>
              <td>
                <span className={source.status === 'up-to-date' ? css.badgeSuccess : source.status === 'new' ? css.badgeNew : css.badgeChanged}>
                  {source.status === 'up-to-date' ? t(undefined, 'sources.status.up-to-date') : source.status === 'new' ? t(undefined, 'sources.status.new') : t(undefined, 'sources.status.changed')}
                </span>
              </td>
              <td className={css.mono}>{source.sha256.slice(0, 10)}…</td>
              <td>{source.pages.length > 0 ? source.pages.join(', ') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// knowledge bases tab
// ---------------------------------------------------------------------------

function KbsTab({ kbs, activeId, onSelect, onCreated, onDeleted }: {
  kbs: KbSummary[]
  activeId: string
  onSelect: (id: string) => void
  onCreated: () => void
  onDeleted: (id: string) => void
}): ReactElement {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const remove = async (kb: KbSummary): Promise<void> => {
    if (!window.confirm(t(undefined, 'kbs.delete.confirm', { name: kb.name }))) return
    setDeletingId(kb.id)
    setError(null)
    try {
      await api('/api/dsh-knowledge/kbs/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kb.id }),
      })
      onDeleted(kb.id)
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setDeletingId(null)
    }
  }

  const create = async (): Promise<void> => {
    if (name.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const data = await api<{ kb: KbSummary }>('/api/dsh-knowledge/kbs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), path: path.trim() || undefined, description: description.trim() || undefined }),
      })
      onSelect(data.kb.id)
      setName('')
      setPath('')
      setDescription('')
      onCreated()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error !== null && <div className={css.error}>{error}</div>}
      {kbs.length === 0 && <div className={css.empty}>{t(undefined, 'kbs.empty')}</div>}
      {kbs.map((kb) => (
        <div key={kb.id} className={kb.id === activeId ? css.kbRowActive : css.kbRow} onClick={() => onSelect(kb.id)}>
          <div className={css.kbRowTop}>
            <span className={css.kbName}>{kb.name}{kb.id === activeId && ' ✓'}</span>
            <button
              className={css.dangerSmall}
              disabled={deletingId === kb.id}
              title={t(undefined, 'kbs.delete')}
              onClick={(event) => { event.stopPropagation(); void remove(kb) }}
            >
              🗑 {t(undefined, 'kbs.delete')}
            </button>
          </div>
          <div className={css.kbMeta}>{t(undefined, 'kbs.stats', { total: kb.stats.total, sources: kb.stats.sourceCount })}</div>
          <div className={css.kbPath}>{kb.path}</div>
          {kb.description !== undefined && <div className={css.kbDesc}>{kb.description}</div>}
        </div>
      ))}
      <div className={css.kbForm}>
        <div className={css.kbFormTitle}>{t(undefined, 'kbs.add')}</div>
        <input className={css.input} placeholder={t(undefined, 'kbs.name')} value={name} onChange={(event) => setName(event.target.value)} />
        <input className={css.input} placeholder={t(undefined, 'kbs.path')} value={path} onChange={(event) => setPath(event.target.value)} />
        <input className={css.input} placeholder={t(undefined, 'kbs.description')} value={description} onChange={(event) => setDescription(event.target.value)} />
        <button className={css.run} disabled={busy || name.trim() === ''} onClick={() => void create()}>{t(undefined, 'kbs.create')}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// code tab (raw files, no LLM processing)
// ---------------------------------------------------------------------------

interface CodeFileInfo {
  relPath: string
  size: number
  mtime: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function CodeTab({ kbId }: { kbId: string }): ReactElement {
  const [files, setFiles] = useState<CodeFileInfo[]>([])
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback((): void => {
    api<{ files: CodeFileInfo[] }>(`/api/dsh-knowledge/code${query({ kb: kbId })}`)
      .then((data) => { setFiles(data.files); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId])

  useEffect(() => { load() }, [load])

  const openPreview = (relPath: string): void => {
    api<{ content: string }>(`/api/dsh-knowledge/code/content${query({ kb: kbId, path: relPath })}`)
      .then((data) => { setPreview({ path: relPath, content: data.content }); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }

  const removeFile = async (relPath: string): Promise<void> => {
    await api<{ deleted: boolean }>('/api/dsh-knowledge/code/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kb: kbId, path: relPath }),
    })
    if (preview?.path === relPath) setPreview(null)
    load()
  }

  const uploadFiles = async (selected: FileList | null): Promise<void> => {
    if (selected === null || selected.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(selected)) {
        const content = await file.text()
        const path = file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name
        await api<{ file: CodeFileInfo }>('/api/dsh-knowledge/code', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kb: kbId, path, content }),
        })
      }
      load()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(false)
      if (fileInputRef.current !== null) fileInputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className={css.controls}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className={css.hiddenInput}
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        <button className={css.run} disabled={busy} onClick={() => fileInputRef.current?.click()}>
          {busy ? '…' : '⬆ '}{t(undefined, 'code.upload')}
        </button>
        <button className={css.run} onClick={load}>{t(undefined, 'refresh')}</button>
        <span className={css.hint}>{t(undefined, 'code.count', { n: files.length })}</span>
      </div>
      <p className={css.note}>{t(undefined, 'code.hint')}</p>
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {preview !== null ? (
        <div>
          <div className={css.detailHeader}>
            <button className={css.back} onClick={() => setPreview(null)}>{t(undefined, 'card.back')}</button>
            <span className={css.codePath}>{preview.path}</span>
          </div>
          <pre className={css.codeBlock}>{preview.content}</pre>
        </div>
      ) : (
        <table className={css.table}>
          <thead>
            <tr><th>文件</th><th>大小</th><th>操作</th></tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.relPath}>
                <td><button className={css.fileRow} onClick={() => openPreview(file.relPath)}>{file.relPath}</button></td>
                <td className={css.mono}>{formatBytes(file.size)}</td>
                <td><button className={css.dangerSmall} onClick={() => void removeFile(file.relPath)}>🗑</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {files.length === 0 && preview === null && error === null && <div className={css.empty}>{t(undefined, 'code.empty')}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// log board (修改日志看板)
// ---------------------------------------------------------------------------

interface LogEntry {
  date: string
  action: string
  subject: string
  /** Detailed change notes, one per line (e.g. `摘要: "旧" → "新"`, `标签: +x -y`). */
  notes: string[]
}

const LOG_ACTIONS = ['all', 'edit', 'ingest', 'import'] as const

function LogBoard({ kbId }: { kbId: string }): ReactElement {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((action: string): void => {
    api<{ entries: LogEntry[]; total: number }>(`/api/dsh-knowledge/log${query({ kb: kbId, action })}`)
      .then((data) => { setEntries(data.entries); setTotal(data.total); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId])

  useEffect(() => { load(filter) }, [load, filter])

  const actionLabel = (action: string): string => {
    if (action === 'edit') return '✏️'
    if (action === 'ingest') return '📥'
    if (action === 'import') return '📦'
    return '·'
  }

  return (
    <div>
      <div className={css.controls}>
        {LOG_ACTIONS.map((action) => (
          <button key={action} className={action === filter ? css.chipActive : css.chip} onClick={() => setFilter(action)}>
            {action === 'all' ? t(undefined, 'log.all') : action}
          </button>
        ))}
        <span className={css.hint}>{t(undefined, 'log.count', { n: entries.length, total })}</span>
      </div>
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {entries.length === 0 && error === null && <div className={css.empty}>{t(undefined, 'log.empty')}</div>}
      <div className={css.logList}>
        {entries.map((entry, index) => (
          <div key={`${entry.date}-${entry.action}-${index}`} className={css.logRow}>
            <span className={css.logIcon}>{actionLabel(entry.action)}</span>
            <span className={css.logDate}>{entry.date}</span>
            <span className={entry.action === 'edit' ? css.logActionEdit : css.logAction}>{entry.action}</span>
            <span className={css.logSubject}>{entry.subject}</span>
            {(entry.notes ?? []).map((note, noteIndex) => (
              <span key={noteIndex} className={css.logNote}>{note}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// review queue tab (llm_wiki 审核系统: async human-in-the-loop)
// ---------------------------------------------------------------------------

interface ReviewItemFace {
  id: string
  kind: string
  title: string
  summary: string
  source?: string
  options: string[]
  searchQuery?: string
  status: 'pending' | 'resolved' | 'skipped'
  createdAt: number
}

const REVIEW_STATUSES = ['all', 'pending', 'resolved', 'skipped'] as const

function ReviewsTab({ kbId }: { kbId: string }): ReactElement {
  const [items, setItems] = useState<ReviewItemFace[]>([])
  const [pending, setPending] = useState(0)
  const [filter, setFilter] = useState<string>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [auditing, setAuditing] = useState(false)
  const [auditResult, setAuditResult] = useState<string | null>(null)
  const [deepPrompt, setDeepPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((status: string): void => {
    api<{ items: ReviewItemFace[]; pending: number }>(`/api/dsh-knowledge/reviews${query({ kb: kbId, status })}`)
      .then((data) => { setItems(data.items); setPending(data.pending); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId])

  useEffect(() => { load(filter) }, [load, filter])

  /** Run the deterministic audit over existing cards (duplicates + missing pages). */
  const runAudit = async (): Promise<void> => {
    setAuditing(true)
    setError(null)
    try {
      const data = await api<{ result: { submitted: Array<{ id: string; kind: string; title: string }>; skippedExisting: number; summary: { duplicate: number; missingPage: number }; deepAuditPrompt: string } }>('/api/dsh-knowledge/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId }),
      })
      const { submitted, skippedExisting, summary, deepAuditPrompt } = data.result
      setAuditResult(t(undefined, 'audit.result', {
        n: submitted.length,
        dup: summary.duplicate,
        missing: summary.missingPage,
        skipped: skippedExisting,
      }))
      setDeepPrompt(deepAuditPrompt)
      load(filter)
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setAuditing(false)
    }
  }

  const copyDeepPrompt = async (): Promise<void> => {
    try {
      let prompt = deepPrompt
      if (prompt === null) {
        // 指令随时可生成（无需先跑确定性审核）
        const data = await api<{ prompt: string }>(`/api/dsh-knowledge/audit-prompt${query({ kb: kbId })}`)
        prompt = data.prompt
        setDeepPrompt(prompt)
      }
      await navigator.clipboard.writeText(prompt)
      setAuditResult(t(undefined, 'audit.copied'))
      window.setTimeout(() => setAuditResult(null), 3000)
    } catch {
      if (deepPrompt !== null) window.prompt(t(undefined, 'audit.copied'), deepPrompt)
    }
  }

  const resolve = async (id: string, status: 'resolved' | 'skipped', resolution?: string): Promise<void> => {
    setBusyId(id)
    try {
      await api<{ item: ReviewItemFace }>('/api/dsh-knowledge/reviews/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId, id, status, resolution }),
      })
      load(filter)
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusyId(null)
    }
  }

  /** 深度研究指令：agent 拿 searchQuery 做网络搜索并沉淀卡片。 */
  const buildResearchPrompt = (item: ReviewItemFace): string => [
    `请对以下审核项做深度研究（网络搜索），并把结论沉淀为知识卡片：`,
    `主题: ${item.title}`,
    `背景: ${item.summary}`,
    item.searchQuery !== undefined && item.searchQuery !== '' ? `搜索方向: ${item.searchQuery}` : '',
    item.source !== undefined ? `来源: ${item.source}` : '',
    `流程：用 web 搜索查「${item.searchQuery ?? item.title}」→ 综合结论 → 用 wiki_commit 创建卡片（frontmatter 含 type/description/tags/sources，正文 [[wikilink]] 互链）→ 完成后把该审核项标记为已完成（wiki_reviews 查看）。`,
  ].filter((line) => line !== '').join('\n')

  /** 合并指令：agent 读取涉及卡片判断是否同一事物并合并。 */
  const buildMergePrompt = (item: ReviewItemFace): string => [
    `请处理以下疑似重复的审核项：`,
    `主题: ${item.title}`,
    `判断要点: ${item.summary}`,
    item.source !== undefined ? `涉及卡片: ${item.source}` : '',
    `流程：wiki_read 读取涉及卡片 → 判断是否同一事物 → 若是，保留信息更完整的卡片（可用 wiki_edit_card 补充），多余的用 wiki_commit 重建或直接删除 → 完成后把该审核项标记为已完成。`,
  ].filter((line) => line !== '').join('\n')

  const copyText = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setAuditResult(t(undefined, 'audit.copied'))
      window.setTimeout(() => setAuditResult(null), 3000)
    } catch {
      window.prompt(t(undefined, 'audit.copied'), text)
    }
  }

  // ---- 创建页面（从审核项直接建卡） ----
  const [creating, setCreating] = useState<ReviewItemFace | null>(null)
  const [draftType, setDraftType] = useState('concept')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)

  const openCreate = (item: ReviewItemFace): void => {
    setCreating(item)
    setDraftType('concept')
    setDraftTitle(item.title)
    setDraftDesc(item.summary)
    setDraftBody([
      `<!-- 由审核项（${item.kind}）创建，请补充完善。 -->`,
      '',
      item.summary,
      '',
      '## 待补充',
      '',
      '- ',
      item.searchQuery !== undefined && item.searchQuery !== '' ? `\n> 参考搜索: ${item.searchQuery}` : '',
    ].join('\n'))
  }

  const saveDraft = async (): Promise<void> => {
    if (creating === null) return
    setSavingDraft(true)
    setError(null)
    try {
      await api('/api/dsh-knowledge/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId, pages: [{ type: draftType, title: draftTitle, description: draftDesc, body: draftBody }], sourceFiles: [] }),
      })
      await resolve(creating.id, 'resolved', '已创建页面')
      setCreating(null)
      load(filter)
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setSavingDraft(false)
    }
  }

  if (creating !== null) {
    return (
      <div>
        <div className={css.detailHeader}>
          <button className={css.back} onClick={() => setCreating(null)}>{t(undefined, 'card.cancel')}</button>
        </div>
        <h2 className={css.detailTitle}>{t(undefined, 'review.create.title')}</h2>
        <div className={css.editForm}>
          <label className={css.editLabel}>{t(undefined, 'card.title')}
            <input className={css.input} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <label className={css.editLabel}>{t(undefined, 'card.desc')}
            <input className={css.input} value={draftDesc} onChange={(event) => setDraftDesc(event.target.value)} />
          </label>
          <label className={css.editLabel}>type
            <select className={css.select} value={draftType} onChange={(event) => setDraftType(event.target.value)}>
              {CREATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className={css.editLabel}>{t(undefined, 'card.body')}
            <textarea className={css.editorTextarea} rows={12} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} />
          </label>
          <div className={css.editActions}>
            <button className={css.run} disabled={savingDraft || draftTitle.trim() === ''} onClick={() => void saveDraft()}>{savingDraft ? '…' : t(undefined, 'review.create.save')}</button>
            <button className={css.runSmall} onClick={() => setCreating(null)}>{t(undefined, 'card.cancel')}</button>
          </div>
        </div>
      </div>
    )
  }

  const kindLabel = (kind: string): string => {
    if (kind === 'contradiction') return '⚠️ 矛盾'
    if (kind === 'duplicate') return '🔁 疑似重复'
    if (kind === 'missing-page') return '📄 缺失页面'
    if (kind === 'suggestion') return '💡 建议'
    return kind
  }

  return (
    <div>
      <div className={css.controls}>
        {REVIEW_STATUSES.map((status) => (
          <button key={status} className={status === filter ? css.chipActive : css.chip} onClick={() => setFilter(status)}>
            {status === 'all' ? t(undefined, 'review.all') : status === 'pending' ? t(undefined, 'review.pending', { n: pending }) : status}
          </button>
        ))}
        <span className={css.hint}>{t(undefined, 'review.hint')}</span>
      </div>
      <div className={css.auditBar}>
        <button className={css.run} disabled={auditing} onClick={() => void runAudit()}>
          {auditing ? '…' : '🔍 '}{t(undefined, 'audit.run')}
        </button>
        <button className={css.runSmall} onClick={() => void copyDeepPrompt()}>{t(undefined, 'audit.deep')}</button>
        <span className={css.hint}>{t(undefined, 'audit.hint')}</span>
      </div>
      {auditResult !== null && <div className={css.lintResult}>{auditResult}</div>}
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {items.length === 0 && error === null && <div className={css.empty}>{t(undefined, 'review.empty')}</div>}
      <div className={css.reviewList}>
        {items.map((item) => (
          <div key={item.id} className={item.status === 'pending' ? css.reviewItem : `${css.reviewItem} ${css.reviewDone}`}>
            <div className={css.reviewTop}>
              <span className={item.kind === 'contradiction' ? css.reviewKindDanger : item.kind === 'suggestion' ? css.reviewKindWarn : css.reviewKind}>{kindLabel(item.kind)}</span>
              <span className={css.reviewStatus}>{item.status === 'pending' ? t(undefined, 'review.status.pending') : item.status === 'skipped' ? t(undefined, 'review.status.skipped') : t(undefined, 'review.status.resolved')}</span>
            </div>
            <div className={css.reviewTitle}>{item.title}</div>
            <div className={css.reviewSummary}>{item.summary}</div>
            {item.source !== undefined && <div className={css.reviewSource}>来源: {item.source}</div>}
            {item.searchQuery !== undefined && item.searchQuery !== '' && (
              <div className={css.reviewSearch}>🔎 {item.searchQuery}</div>
            )}
            {item.status === 'pending' && (
              <div className={css.reviewActions}>
                {item.options.map((option) => {
                  if (option === '创建页面') {
                    return <button key={option} className={css.runSmall} disabled={busyId === item.id} onClick={() => openCreate(item)}>{option}</button>
                  }
                  if (option === '深度研究') {
                    return <button key={option} className={css.runSmall} disabled={busyId === item.id} onClick={() => void copyText(buildResearchPrompt(item))}>{option}</button>
                  }
                  if (option === '合并页面') {
                    return <button key={option} className={css.runSmall} disabled={busyId === item.id} onClick={() => void copyText(buildMergePrompt(item))}>{option}</button>
                  }
                  if (option === '跳过') {
                    return <button key={option} className={css.runSmall} disabled={busyId === item.id} onClick={() => void resolve(item.id, 'skipped')}>{option}</button>
                  }
                  return <span key={option} className={css.tag}>{option}</span>
                })}
                <button className={css.runSmall} disabled={busyId === item.id} onClick={() => void resolve(item.id, 'resolved')}>{t(undefined, 'review.resolve')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// recycle bin tab (回收站)
// ---------------------------------------------------------------------------

interface TrashCardFace {
  slug: string
  originalPath: string
  type: string
  title: string
  deletedAt: number
}

interface TrashKbFace {
  id: string
  name: string
  originalPath: string
  deletedAt: number
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function TrashTab({ kbId, onKbChanged }: {
  kbId: string
  /** Fired after a KB is restored/purged — refresh the KB list. */
  onKbChanged: () => void
}): ReactElement {
  const [cards, setCards] = useState<TrashCardFace[]>([])
  const [kbs, setKbs] = useState<TrashKbFace[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback((): void => {
    api<{ cards: TrashCardFace[]; kbs: TrashKbFace[] }>(`/api/dsh-knowledge/trash${query({ kb: kbId })}`)
      .then((data) => { setCards(data.cards); setKbs(data.kbs); setError(null) })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [kbId])

  useEffect(() => { load() }, [load])

  const flash = (message: string): void => {
    setNote(message)
    window.setTimeout(() => setNote(null), 2500)
  }

  const restoreCard = async (card: TrashCardFace): Promise<void> => {
    setBusy(`c:${card.slug}`)
    setError(null)
    try {
      await api('/api/dsh-knowledge/card/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId, slug: card.slug }),
      })
      flash(t(undefined, 'trash.restored'))
      load()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(null)
    }
  }

  const purgeCard = async (card: TrashCardFace): Promise<void> => {
    if (!window.confirm(t(undefined, 'trash.purge.confirm', { title: card.title }))) return
    setBusy(`c:${card.slug}`)
    setError(null)
    try {
      await api('/api/dsh-knowledge/card/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId, slug: card.slug }),
      })
      flash(t(undefined, 'trash.purged'))
      load()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(null)
    }
  }

  const restoreKb = async (kb: TrashKbFace): Promise<void> => {
    setBusy(`k:${kb.id}`)
    setError(null)
    try {
      await api('/api/dsh-knowledge/kbs/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kb.id }),
      })
      flash(t(undefined, 'trash.restored'))
      load()
      onKbChanged()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(null)
    }
  }

  const purgeKb = async (kb: TrashKbFace): Promise<void> => {
    if (!window.confirm(t(undefined, 'trash.purge.confirm', { title: kb.name }))) return
    setBusy(`k:${kb.id}`)
    setError(null)
    try {
      await api('/api/dsh-knowledge/kbs/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kb.id }),
      })
      flash(t(undefined, 'trash.purged'))
      load()
      onKbChanged()
    } catch (err) {
      setError(String((err as Error).message ?? err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className={css.controls}>
        <span className={css.hint}>{t(undefined, 'trash.hint')}</span>
        <button className={css.run} onClick={load}>{t(undefined, 'refresh')}</button>
      </div>
      {note !== null && <div className={css.lintResult}>{note}</div>}
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {kbs.length === 0 && cards.length === 0 && error === null && <div className={css.empty}>{t(undefined, 'trash.empty')}</div>}
      {kbs.length > 0 && (
        <>
          <h3 className={css.sectionTitle}>📚 {t(undefined, 'trash.kbs')}（{kbs.length}）</h3>
          {kbs.map((kb) => (
            <div key={kb.id} className={css.trashItem}>
              <div className={css.trashTop}>
                <span className={css.trashTitle}>{kb.name}</span>
                <span className={css.trashMeta}>{kb.id} · {t(undefined, 'trash.deletedAt')} {formatDate(kb.deletedAt)}</span>
              </div>
              <div className={css.trashMeta}>📁 {kb.originalPath}</div>
              <div className={css.trashActions}>
                <button className={css.runSmall} disabled={busy === `k:${kb.id}`} onClick={() => void restoreKb(kb)}>↩ {t(undefined, 'trash.restore')}</button>
                <button className={css.dangerSmall} disabled={busy === `k:${kb.id}`} onClick={() => void purgeKb(kb)}>{t(undefined, 'trash.purge')}</button>
              </div>
            </div>
          ))}
        </>
      )}
      {cards.length > 0 && (
        <>
          <h3 className={css.sectionTitle}>🗂 {t(undefined, 'trash.cards')}（{cards.length}）</h3>
          {cards.map((card) => (
            <div key={card.slug} className={css.trashItem}>
              <div className={css.trashTop}>
                <span className={css.trashTitle}><TypeBadge type={card.type} /> {card.title}</span>
                <span className={css.trashMeta}>{t(undefined, 'trash.deletedAt')} {formatDate(card.deletedAt)}</span>
              </div>
              <div className={css.trashMeta}>wiki/{card.originalPath}</div>
              <div className={css.trashActions}>
                <button className={css.runSmall} disabled={busy === `c:${card.slug}`} onClick={() => void restoreCard(card)}>↩ {t(undefined, 'trash.restore')}</button>
                <button className={css.dangerSmall} disabled={busy === `c:${card.slug}`} onClick={() => void purgeCard(card)}>{t(undefined, 'trash.purge')}</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// panel root
// ---------------------------------------------------------------------------

export function KnowledgePanel({ controller }: { controller: PanelController }): ReactElement {
  const [kbs, setKbs] = useState<KbSummary[]>([])
  const [kbId, setKbId] = useState<string>('')
  const [tab, setTab] = useState<'cards' | 'sources' | 'code' | 'board' | 'review' | 'kbs' | 'trash'>('cards')
  const [selected, setSelected] = useState<CardMeta | null>(null)
  const [lintResult, setLintResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadKbs = useCallback((): void => {
    api<{ kbs: KbSummary[] }>('/api/dsh-knowledge/kbs')
      .then((data) => {
        setKbs(data.kbs)
        if (data.kbs.length === 0) return
        const stored = window.localStorage.getItem(KB_STORAGE_KEY)
        const preferred = data.kbs.some((kb) => kb.id === stored) ? stored ?? '' : ''
        const active = preferred !== '' ? preferred : data.kbs[0].id
        setKbId((current) => current !== '' ? current : active)
        if (preferred !== '') setKbId(preferred)
      })
      .catch((err) => setError(String((err as Error).message ?? err)))
  }, [])

  useEffect(() => { loadKbs() }, [loadKbs])

  const selectKb = (id: string): void => {
    setKbId(id)
    window.localStorage.setItem(KB_STORAGE_KEY, id)
    setSelected(null)
  }

  /** After a KB is deleted: drop its local preference and fall back to the first remaining KB. */
  const handleKbDeleted = (deletedId: string): void => {
    if (kbId === deletedId) window.localStorage.removeItem(KB_STORAGE_KEY)
    setKbId((current) => {
      if (current !== deletedId) return current
      const remaining = kbs.filter((kb) => kb.id !== deletedId)
      return remaining.length > 0 ? remaining[0].id : ''
    })
    loadKbs()
  }

  const openCard = (card: CardMeta): void => setSelected(card)
  const closeCard = (): void => setSelected(null)

  const runLint = async (): Promise<void> => {
    if (kbId === '') return
    try {
      const data = await api<{ issues: LintIssue[] }>('/api/dsh-knowledge/lint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kb: kbId }),
      })
      const errors = data.issues.filter((issue) => issue.severity === 'error').length
      const warns = data.issues.filter((issue) => issue.severity === 'warn').length
      setLintResult(t(undefined, 'lint.result', { errors, warns }))
      window.setTimeout(() => setLintResult(null), 4000)
    } catch (err) {
      setLintResult(String((err as Error).message ?? err))
    }
  }

  const activeKb = kbs.find((kb) => kb.id === kbId)

  return (
    <div className={css.panel}>
      <div className={css.header}>
        <h2 className={css.title}>📇 {t(undefined, 'panel.title')}</h2>
        <div className={css.headerActions}>
          {kbs.length > 0 && (
            <select className={css.select} value={kbId} onChange={(event) => selectKb(event.target.value)}>
              {kbs.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
            </select>
          )}
          <button className={css.close} title={t(undefined, 'close')} onClick={() => controller.close()}>✕</button>
        </div>
      </div>
      {error !== null && <div className={css.error}>{t(undefined, 'error.load', { message: error })}</div>}
      {lintResult !== null && <div className={css.lintResult}>{lintResult}</div>}
      {kbs.length === 0 ? (
        <KbsTab kbs={kbs} activeId={kbId} onSelect={selectKb} onCreated={loadKbs} onDeleted={handleKbDeleted} />
      ) : (
        <>
          <div className={css.tabs}>
            <button className={tab === 'cards' ? css.tabActive : css.tab} onClick={() => setTab('cards')}>{t(undefined, 'tab.cards')}</button>
            <button className={tab === 'sources' ? css.tabActive : css.tab} onClick={() => setTab('sources')}>{t(undefined, 'tab.sources')}</button>
            <button className={tab === 'code' ? css.tabActive : css.tab} onClick={() => setTab('code')}>{t(undefined, 'tab.code')}</button>
            <button className={tab === 'board' ? css.tabActive : css.tab} onClick={() => setTab('board')}>{t(undefined, 'tab.board')}</button>
            <button className={tab === 'review' ? css.tabActive : css.tab} onClick={() => setTab('review')}>{t(undefined, 'tab.review')}</button>
            <button className={tab === 'kbs' ? css.tabActive : css.tab} onClick={() => setTab('kbs')}>{t(undefined, 'tab.kbs')}</button>
            <button className={tab === 'trash' ? css.tabActive : css.tab} onClick={() => setTab('trash')}>{t(undefined, 'tab.trash')}</button>
            <span className={css.tabSpacer} />
            <button className={css.runSmall} onClick={() => void runLint()}>{t(undefined, 'lint.run')}</button>
          </div>
          {tab === 'cards' && (
            selected === null
              ? <CardsTab kbId={kbId} onOpenCard={openCard} />
              : <CardDetail kbId={kbId} slug={selected.slug} onBack={closeCard} onOpenCard={openCard} onDeleted={closeCard} />
          )}
          {tab === 'sources' && <SourcesTab kbId={kbId} kbName={activeKb?.name ?? kbId} />}
          {tab === 'code' && <CodeTab kbId={kbId} />}
          {tab === 'board' && <LogBoard kbId={kbId} />}
          {tab === 'review' && <ReviewsTab kbId={kbId} />}
          {tab === 'kbs' && <KbsTab kbs={kbs} activeId={kbId} onSelect={selectKb} onCreated={loadKbs} onDeleted={handleKbDeleted} />}
          {tab === 'trash' && <TrashTab kbId={kbId} onKbChanged={loadKbs} />}
        </>
      )}
    </div>
  )
}
