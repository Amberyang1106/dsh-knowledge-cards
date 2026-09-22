import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * KnowledgeCards panel: the center-column view toggled by the sidebar entry.
 * Tabs — 卡片 (card wall + search + detail + manual create), 资料 (raw sources
 * with ingest status + copy-prompt for the agent), 代码 (code files), 看板
 * (activity log), 审核 (review queue), 知识库 (multi-KB management), 回收站
 * (deleted cards/KBs, restore or purge). All data rides the host
 * /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client/panel
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from "./locales.js";
import css from './panel.module.css';
async function api(path, init) {
    const response = await fetch(path, init);
    const data = (await response.json().catch(() => ({})));
    if (!response.ok || data.ok === false) {
        throw new Error(String(data.error ?? `HTTP ${response.status}`));
    }
    return data;
}
function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== '' && value !== undefined)
            search.set(key, value);
    }
    const text = search.toString();
    return text === '' ? '' : `?${text}`;
}
/** Extract the frontmatter payload (between the `---` fences) of a raw card
 * file — used to prefill the YAML editor of rule cards. */
function frontmatterPayloadOf(raw) {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const start = lines[0]?.trim() === '---' ? 1 : 0;
    const payload = [];
    for (let index = start; index < lines.length; index += 1) {
        if (lines[index].trim() === '---')
            break;
        payload.push(lines[index]);
    }
    return payload.join('\n').replace(/\n+$/, '');
}
const KB_STORAGE_KEY = 'dsh-knowledge-cards:kb';
const TYPE_FILTERS = ['all', 'entity', 'concept', 'source', 'query', 'comparison', 'synthesis', 'rules', 'field'];
/** Types offered by the manual create form (overview is auto-maintained). */
const CREATE_TYPES = ['concept', 'entity', 'source', 'query', 'comparison', 'synthesis', 'rules', 'field'];
/** Types whose whole frontmatter is edited as one canonical YAML payload.
 * (`field` uses the dedicated 5-section structured form below instead.) */
const YAML_EDITOR_TYPES = ['rules'];
const FIELD_KIND_OPTIONS = ['measure', 'dimension', 'calculated_field', 'flag', 'key', 'mapping', 'date', 'attribute', 'parameter'];
const FIELD_DATA_TYPE_OPTIONS = ['amount', 'percentage', 'ratio', 'integer', 'string', 'date', 'boolean'];
const FIELD_AGGREGATION_OPTIONS = ['additive', 'semi-additive', 'non-additive'];
const FIELD_STATUS_OPTIONS = ['draft', 'active', 'deprecated', 'retired'];
const FIELD_REVIEW_OPTIONS = ['draft', 'inferred', 'confirmed', 'disputed', 'deprecated'];
const FIELD_EVIDENCE_OPTIONS = ['source_code', 'business_document', 'business_confirmation', 'inferred'];
function emptyFieldDraft() {
    return {
        title: '', description: '', aliases: '', fieldId: '', canonicalName: '',
        fieldKind: 'measure', dataType: 'amount', status: 'draft',
        domain: 'Finance', workstream: '', subjectArea: '',
        aggregation: 'non-additive', unit: '', sourceTable: '', sourceField: '',
        implementedIn: '', dependsOn: '', usedBy: '', governedBy: '', related: '',
        businessOwner: '', technicalOwner: '', effectiveFrom: '', lastReviewed: '',
        reviewStatus: 'draft', evidenceLevel: '', tags: '', sources: '',
    };
}
/** Split a list input on newlines or commas. */
const splitFieldList = (text) => text.split(/[\n,]/).map((item) => item.trim()).filter((item) => item !== '');
/** Render a frontmatter value back into a list-editor string. */
const joinFieldList = (value) => {
    if (Array.isArray(value))
        return value.map((item) => String(item)).join('\n');
    if (typeof value === 'string')
        return value;
    return '';
};
/** Build the non-managed frontmatter object from the structured draft. */
function buildFieldFrontmatter(draft) {
    const out = {};
    const put = (key, value) => {
        const text = value.trim();
        if (text !== '')
            out[key] = text;
    };
    const putList = (key, value) => {
        const items = splitFieldList(value);
        if (items.length > 0)
            out[key] = items;
    };
    put('field_id', draft.fieldId);
    put('canonical_name', draft.canonicalName);
    putList('aliases', draft.aliases);
    put('field_kind', draft.fieldKind);
    put('data_type', draft.dataType);
    put('status', draft.status);
    put('domain', draft.domain);
    put('workstream', draft.workstream);
    put('subject_area', draft.subjectArea);
    put('aggregation', draft.aggregation);
    put('unit', draft.unit);
    put('source_table', draft.sourceTable);
    put('source_field', draft.sourceField);
    putList('implemented_in', draft.implementedIn);
    putList('depends_on', draft.dependsOn);
    putList('used_by', draft.usedBy);
    putList('governed_by', draft.governedBy);
    put('business_owner', draft.businessOwner);
    put('technical_owner', draft.technicalOwner);
    put('effective_from', draft.effectiveFrom);
    put('last_reviewed', draft.lastReviewed);
    put('review_status', draft.reviewStatus);
    put('evidence_level', draft.evidenceLevel);
    return out;
}
/** Prefill the structured draft from a card + its parsed frontmatter. */
function fieldDraftFrom(card, fm) {
    const text = (value) => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));
    const base = emptyFieldDraft();
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
        related: card.related.join('\n'),
        businessOwner: text(fm.business_owner),
        technicalOwner: text(fm.technical_owner),
        effectiveFrom: text(fm.effective_from),
        lastReviewed: text(fm.last_reviewed),
        reviewStatus: text(fm.review_status) || base.reviewStatus,
        evidenceLevel: text(fm.evidence_level),
        tags: card.tags.join(', '),
        sources: card.sources.join(', '),
    };
}
const FIELD_SECTIONS = [
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
            { key: 'related', labelKey: 'field.related', kind: 'list' },
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
];
/** Five-section structured editor for a field card's metadata. */
function FieldForm({ draft, onChange }) {
    const set = (key, value) => onChange({ ...draft, [key]: value });
    return (_jsxs("div", { children: [_jsx("p", { className: css.note, children: t(undefined, 'field.formHint') }), FIELD_SECTIONS.map((section) => (_jsxs("details", { className: css.formSection, open: section.open, children: [_jsx("summary", { className: css.formSummary, children: t(undefined, section.titleKey) }), _jsx("div", { className: css.formBody, children: section.controls.map((control) => (_jsxs("label", { className: css.editLabel, children: [t(undefined, control.labelKey), control.kind === 'select' ? (_jsx("select", { className: css.select, value: draft[control.key], onChange: (event) => set(control.key, event.target.value), children: (control.options ?? []).map((option) => _jsx("option", { value: option, children: option }, option)) })) : control.kind === 'list' ? (_jsx("textarea", { className: css.editorTextarea, rows: 3, value: draft[control.key], placeholder: t(undefined, 'field.lineHint'), onChange: (event) => set(control.key, event.target.value) })) : (_jsx("input", { className: css.input, value: draft[control.key], onChange: (event) => set(control.key, event.target.value) }))] }, control.key))) })] }, section.titleKey)))] }));
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
].join('\n');
// ---------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------
function TypeBadge({ type }) {
    const className = css[`type-${type}`] ?? css.typeOther;
    return _jsx("span", { className: `${css.typeBadge} ${className}`, children: type });
}
/** Minimal body renderer: plain text with clickable [[wikilinks]]. */
function BodyText({ body, onOpen }) {
    const parts = useMemo(() => {
        const output = [];
        const pattern = /\[\[([^\]]+)\]\]/g;
        let last = 0;
        let match;
        while ((match = pattern.exec(body)) !== null) {
            if (match.index > last)
                output.push({ kind: 'text', value: body.slice(last, match.index) });
            output.push({ kind: 'link', value: match[1].split('|')[0].trim() });
            last = match.index + match[0].length;
        }
        if (last < body.length)
            output.push({ kind: 'text', value: body.slice(last) });
        return output;
    }, [body]);
    return (_jsx("div", { className: css.body, children: parts.map((part, index) => part.kind === 'link'
            ? (_jsxs("button", { className: css.bodyLink, title: t(undefined, 'card.wikilink', { slug: part.value }), onClick: () => onOpen(part.value), children: ["[[", part.value, "]]"] }, index))
            : _jsx("span", { children: part.value }, index)) }));
}
function lineageRowKey(proposal) {
    return `${proposal.slug}|${proposal.source}|${proposal.evidence.slice(0, 60)}|${JSON.stringify(proposal.relations)}`;
}
function draftFromConfig(config) {
    const draft = {};
    for (const [key, value] of Object.entries(config))
        draft[key] = typeof value === 'boolean' ? value : String(value);
    return draft;
}
/** Editable parameter form. Values only take effect once saved (save-to-apply). */
function LineageParams({ state, draft, dirty, busy, onDraft, onSave, onReset }) {
    return (_jsxs("details", { className: css.formSection, children: [_jsxs("summary", { className: css.formSummary, children: [t(undefined, 'lineage.paramsTitle'), state.overridden.length > 0 ? `（${t(undefined, 'lineage.paramsChangedCount', { n: state.overridden.length })}）` : ''] }), _jsxs("div", { className: css.formBody, children: [_jsx("p", { className: css.note, children: t(undefined, 'lineage.paramsHint') }), state.issues.length > 0 && (_jsxs("div", { className: css.error, children: [_jsx("div", { children: t(undefined, 'lineage.paramsFileIssues') }), state.issues.map((issue) => (_jsxs("div", { className: css.mono, children: [issue.field, ": ", issue.message] }, `${issue.field}:${issue.message}`)))] })), state.fields.map((field) => (_jsxs("label", { className: css.editLabel, children: [_jsxs("span", { children: [t(undefined, `param.${field.key}`), state.overridden.includes(field.key) && (_jsxs("span", { className: css.hint, children: [" \u00B7 ", t(undefined, 'lineage.paramChanged', { value: String(field.default) })] }))] }), field.kind === 'boolean' ? (_jsxs("select", { className: css.select, value: draft[field.key] === true ? 'true' : 'false', onChange: (event) => onDraft({ ...draft, [field.key]: event.target.value === 'true' }), children: [_jsx("option", { value: "true", children: "true" }), _jsx("option", { value: "false", children: "false" })] })) : (_jsx("input", { className: css.input, type: "number", min: field.min, max: field.max, step: field.integer === true ? 1 : 0.05, value: String(draft[field.key] ?? ''), onChange: (event) => onDraft({ ...draft, [field.key]: event.target.value }) }))] }, field.key))), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: busy || !dirty, onClick: onSave, children: t(undefined, 'lineage.paramsSave') }), _jsx("button", { className: css.runSmall, disabled: busy, onClick: onReset, children: t(undefined, 'lineage.paramsReset') }), _jsx("span", { className: css.hint, children: t(undefined, 'lineage.paramsMeta', { fp: state.fingerprint, path: state.path }) })] })] })] }));
}
/**
 * Scope picker: which cards this round judges. Confirmed cards are skipped by
 * default, so this is where you force a re-judge (after a field's logic
 * changed) or confirm the ones you have verified.
 */
function LineageScope({ cards, forceSlugs, forceAll, pick, busy, onForce, onForceAll, onPick, onConfirm }) {
    const confirmed = cards.filter((card) => card.confirmed);
    const judged = forceAll ? cards.length : cards.length - confirmed.filter((card) => !forceSlugs.includes(card.slug)).length;
    return (_jsxs("details", { className: css.formSection, children: [_jsx("summary", { className: css.formSummary, children: t(undefined, 'lineage.scopeTitle') }), _jsxs("div", { className: css.formBody, children: [_jsx("p", { className: css.note, children: t(undefined, 'lineage.scopeSummary', { total: cards.length, confirmed: confirmed.length, judged }) }), _jsxs("label", { className: css.editLabel, children: [_jsx("span", { children: t(undefined, 'lineage.scopeForceAll') }), _jsxs("select", { className: css.select, value: forceAll ? 'true' : 'false', onChange: (event) => onForceAll(event.target.value === 'true'), children: [_jsx("option", { value: "false", children: t(undefined, 'lineage.scopeForceAllOff') }), _jsx("option", { value: "true", children: t(undefined, 'lineage.scopeForceAllOn') })] })] }), _jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t(undefined, 'lineage.scopeColForce') }), _jsx("th", { children: t(undefined, 'lineage.scopeColCard') }), _jsx("th", { children: t(undefined, 'lineage.scopeColStatus') }), _jsx("th", { children: t(undefined, 'lineage.scopeColLineage') }), _jsx("th", { children: t(undefined, 'lineage.scopeColConfirm') })] }) }), _jsx("tbody", { children: cards.map((card) => (_jsxs("tr", { children: [_jsx("td", { children: card.confirmed ? (_jsx("input", { type: "checkbox", checked: forceSlugs.includes(card.slug), title: t(undefined, 'lineage.scopeForceHint'), onChange: (event) => onForce(event.target.checked ? [...forceSlugs, card.slug] : forceSlugs.filter((slug) => slug !== card.slug)) })) : (_jsx("span", { className: css.hint, children: "\u2014" })) }), _jsxs("td", { children: [_jsx("div", { children: card.title }), _jsx("div", { className: css.mono, children: card.slug })] }), _jsx("td", { children: card.reviewStatus === '' ? t(undefined, 'lineage.scopeStatusEmpty') : card.reviewStatus }), _jsxs("td", { className: css.mono, children: ["depends_on ", card.dependsOn, " \u00B7 used_by ", card.usedBy] }), _jsx("td", { children: card.confirmed ? (_jsx("span", { className: css.hint, children: t(undefined, 'lineage.scopeConfirmed') })) : (_jsx("input", { type: "checkbox", checked: pick.includes(card.slug), onChange: (event) => onPick(event.target.checked ? [...pick, card.slug] : pick.filter((slug) => slug !== card.slug)) })) })] }, card.slug))) })] }), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.runSmall, disabled: busy || pick.length === 0, onClick: onConfirm, children: t(undefined, 'lineage.scopeConfirm', { n: pick.length }) }), _jsx("span", { className: css.hint, children: t(undefined, 'lineage.scopeConfirmHint') })] })] })] }));
}
function LineagePanel({ kbId, onClose, onApplied }) {
    const [rows, setRows] = useState([]);
    const [notes, setNotes] = useState([]);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [status, setStatus] = useState(null);
    const [fieldCards, setFieldCards] = useState(null);
    const [llmInfo, setLlmInfo] = useState(null);
    const [paramState, setParamState] = useState(null);
    const [paramDraft, setParamDraft] = useState({});
    const [scopeCards, setScopeCards] = useState(null);
    const [forceSlugs, setForceSlugs] = useState([]);
    const [forceAll, setForceAll] = useState(false);
    const [confirmPick, setConfirmPick] = useState([]);
    const paramDirty = paramState !== null && Object.keys(paramDraft).some((key) => String(paramDraft[key]) !== String(draftFromConfig(paramState.config)[key]));
    const refreshParams = useCallback(async () => {
        try {
            const data = await api(`/api/dsh-knowledge/lineage/config${query({ kb: kbId })}`);
            setParamState(data.state);
            setParamDraft(draftFromConfig(data.state.config));
        }
        catch {
            setParamState(null);
        }
    }, [kbId]);
    const refreshScope = useCallback(async () => {
        try {
            const data = await api(`/api/dsh-knowledge/lineage/cards${query({ kb: kbId })}`);
            setScopeCards(data.cards);
            setForceSlugs((current) => current.filter((slug) => data.cards.some((card) => card.slug === slug && card.confirmed)));
            setConfirmPick((current) => current.filter((slug) => data.cards.some((card) => card.slug === slug && !card.confirmed)));
        }
        catch {
            setScopeCards(null);
        }
    }, [kbId]);
    const saveParams = async () => {
        if (paramState === null)
            return;
        setBusy('params');
        setError(null);
        try {
            // Numbers travel as numbers; booleans already are booleans.
            const payload = {};
            for (const field of paramState.fields) {
                const raw = paramDraft[field.key];
                payload[field.key] = field.kind === 'boolean' ? raw === true : Number(raw);
            }
            const data = await api('/api/dsh-knowledge/lineage/config', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, config: payload }),
            });
            setParamState(data.state);
            setParamDraft(draftFromConfig(data.state.config));
            setStatus(t(undefined, 'lineage.paramsSaved', { fp: data.state.fingerprint }));
        }
        catch (err) {
            const message = String(err.message ?? err);
            setError(message.includes('invalid-config') ? t(undefined, 'lineage.paramsInvalid') : message);
        }
        finally {
            setBusy(null);
        }
    };
    const confirmCards = async () => {
        if (confirmPick.length === 0)
            return;
        setBusy('confirm');
        setError(null);
        try {
            const data = await api('/api/dsh-knowledge/lineage/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kb: kbId, slugs: confirmPick }) });
            setStatus(t(undefined, 'lineage.scopeConfirmedDone', { n: data.result.confirmed.length, skipped: data.result.skipped.length }));
            setConfirmPick([]);
            await refreshScope();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    const mergeProposals = useCallback((incoming, extraNotes = []) => {
        setRows((current) => {
            const seen = new Set(current.map((row) => row.key));
            const added = [];
            for (const proposal of incoming) {
                const key = lineageRowKey(proposal);
                if (seen.has(key))
                    continue;
                seen.add(key);
                added.push({ ...proposal, key, selected: proposal.confidence !== 'low' });
            }
            return [...current, ...added];
        });
        if (extraNotes.length > 0)
            setNotes((current) => [...new Set([...current, ...extraNotes])]);
    }, []);
    const scan = async () => {
        setBusy('scan');
        setError(null);
        setStatus(null);
        try {
            const data = await api('/api/dsh-knowledge/lineage/scan', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId }),
            });
            mergeProposals(data.result.proposals, data.result.notes);
            setFieldCards(data.result.fieldCards);
            setStatus(t(undefined, 'lineage.scanDone', { n: data.result.proposals.length, cards: data.result.fieldCards }));
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    const runJev = async () => {
        setBusy('jev');
        setError(null);
        setStatus(t(undefined, 'lineage.jevRunning'));
        try {
            const data = await api('/api/dsh-knowledge/lineage/jev', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                // Scope overrides travel per run; the parameters themselves are read
                // from the saved config server-side.
                body: JSON.stringify({ kb: kbId, forceSlugs, forceAll }),
            });
            mergeProposals(data.result.proposals);
            setStatus(t(undefined, 'lineage.jevDone', {
                n: data.result.proposals.length, line: data.result.line, keySource: data.result.keySource, model: data.result.model,
                questions: data.result.questionCount, cards: data.result.judgedCards, skipped: data.result.skippedCards.length,
                requests: data.result.requests, payload: data.result.payloadChars, fp: data.result.paramsFingerprint,
            }));
        }
        catch (err) {
            const message = String(err.message ?? err);
            setError(message.includes('jev-key-missing') ? t(undefined, 'lineage.jevKeyMissing') : message);
            setStatus(null);
        }
        finally {
            setBusy(null);
        }
    };
    const runAgent = async () => {
        setBusy('run');
        setError(null);
        setStatus(t(undefined, 'lineage.preparing'));
        try {
            const data = await api('/api/dsh-knowledge/lineage/run', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId }),
            });
            const prompt = data.prompt ?? '';
            try {
                await navigator.clipboard.writeText(prompt);
            }
            catch {
                window.prompt(t(undefined, 'lineage.promptCopied'), prompt);
            }
            setStatus(t(undefined, 'lineage.promptCopied'));
            const since = data.requestedAt ?? '';
            for (let attempt = 0; attempt < 40; attempt += 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 3000));
                const polled = await api(`/api/dsh-knowledge/lineage/proposals${query({ kb: kbId })}`);
                const file = polled.proposals;
                if (file !== null && Array.isArray(file.proposals) && file.proposals.length > 0 && (file.requestedAt ?? '') >= since) {
                    mergeProposals(file.proposals, file.notes ?? []);
                    setStatus(t(undefined, 'lineage.llmDone', { n: file.proposals.length }));
                    return;
                }
            }
            setStatus(t(undefined, 'lineage.llmTimeout'));
        }
        catch (err) {
            setError(String(err.message ?? err));
            setStatus(null);
        }
        finally {
            setBusy(null);
        }
    };
    const apply = async () => {
        const accepted = rows.filter((row) => row.selected);
        if (accepted.length === 0)
            return;
        setBusy('apply');
        setError(null);
        try {
            const data = await api('/api/dsh-knowledge/lineage/apply', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, accepted: accepted.map((row) => ({
                        slug: row.slug, title: row.title, evidence: row.evidence, relations: row.relations, metadata: row.metadata,
                    })) }),
            });
            setStatus(t(undefined, 'lineage.applied', { n: data.result.applied.length, skipped: data.result.skipped.length }));
            setRows((current) => current.filter((row) => !row.selected));
            onApplied();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    useEffect(() => {
        api('/api/dsh-knowledge/lineage/llm-status')
            .then(() => setLlmInfo(t(undefined, 'lineage.llmReady')))
            .catch(() => setLlmInfo(null));
        void refreshParams();
        void refreshScope();
    }, [refreshParams, refreshScope]);
    const relationSummary = (row) => Object.entries(row.relations)
        .filter(([, values]) => values.length > 0)
        .map(([key, values]) => `${key} += ${values.join(', ')}`)
        .concat(Object.entries(row.metadata ?? {}).map(([key, value]) => `${key} = ${String(value === '' ? '(清除)' : value)}`))
        .join('；');
    return (_jsxs("div", { children: [_jsx("div", { className: css.detailHeader, children: _jsx("button", { className: css.back, onClick: onClose, children: t(undefined, 'card.back') }) }), _jsxs("h2", { className: css.detailTitle, children: ["\uD83E\uDDEC ", t(undefined, 'lineage.title')] }), _jsx("p", { className: css.note, children: t(undefined, 'lineage.hint') }), _jsxs("div", { className: css.controls, children: [_jsx("button", { className: css.run, disabled: busy !== null, onClick: () => void scan(), children: busy === 'scan' ? '…' : t(undefined, 'lineage.scan') }), _jsx("button", { className: css.run, disabled: busy !== null, onClick: () => void runJev(), children: busy === 'jev' ? '…' : t(undefined, 'lineage.jev') }), _jsx("button", { className: css.runSmall, disabled: busy !== null, onClick: () => void runAgent(), children: busy === 'run' ? '…' : t(undefined, 'lineage.run') }), _jsx("button", { className: css.runSmall, disabled: busy !== null || rows.every((row) => !row.selected), onClick: () => void apply(), children: busy === 'apply' ? '…' : t(undefined, 'lineage.apply', { n: rows.filter((row) => row.selected).length }) }), _jsx("span", { className: css.hint, children: llmInfo ?? '' })] }), status !== null && _jsx("div", { className: css.lintResult, children: status }), error !== null && _jsx("div", { className: css.error, children: error }), scopeCards !== null && scopeCards.length > 0 && (_jsx(LineageScope, { cards: scopeCards, forceSlugs: forceSlugs, forceAll: forceAll, pick: confirmPick, busy: busy !== null, onForce: setForceSlugs, onForceAll: setForceAll, onPick: setConfirmPick, onConfirm: () => void confirmCards() })), paramState !== null && (_jsx(LineageParams, { state: paramState, draft: paramDraft, dirty: paramDirty, busy: busy !== null, onDraft: setParamDraft, onSave: () => void saveParams(), onReset: () => setParamDraft(draftFromConfig(paramState.defaults)) })), rows.length === 0 && busy === null && _jsx("div", { className: css.empty, children: t(undefined, 'lineage.empty') }), rows.length > 0 && (_jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", {}), _jsx("th", { children: t(undefined, 'lineage.colCard') }), _jsx("th", { children: t(undefined, 'lineage.colChange') }), _jsx("th", { children: t(undefined, 'lineage.colConfidence') }), _jsx("th", { children: t(undefined, 'lineage.colEvidence') })] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: row.selected, onChange: (event) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, selected: event.target.checked } : item)) }) }), _jsxs("td", { children: [_jsx("div", { children: row.title || row.slug }), _jsx("div", { className: css.mono, children: row.source })] }), _jsx("td", { className: css.mono, children: relationSummary(row) }), _jsxs("td", { children: [row.confidence, row.score !== undefined ? ` (${row.score.toFixed(2)})` : ''] }), _jsxs("td", { children: [row.evidence, row.note !== undefined ? `（${row.note}）` : ''] })] }, row.key))) })] })), notes.length > 0 && (_jsx("div", { className: css.kv, children: notes.map((note) => _jsxs("div", { className: css.kvItem, children: [_jsx("span", { className: css.kvKey, children: "\u63D0\u793A" }), _jsx("span", { children: note })] }, note)) })), fieldCards !== null && _jsx("div", { className: css.hint, children: t(undefined, 'lineage.fieldCards', { n: fieldCards }) })] }));
}
// ---------------------------------------------------------------------------
// cards tab
// ---------------------------------------------------------------------------
function CardsTab({ kbId, onOpenCard, }) {
    const [cards, setCards] = useState([]);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const timerRef = useRef(undefined);
    const load = useCallback((queryText, type) => {
        setLoading(true);
        api(`/api/dsh-knowledge/cards${query({ kb: kbId, q: queryText, type, limit: '200' })}`)
            .then((data) => {
            setCards(data.cards);
            setTotal(data.total);
            setError(null);
        })
            .catch((err) => setError(String(err.message ?? err)))
            .finally(() => setLoading(false));
    }, [kbId]);
    useEffect(() => {
        load('', typeFilter);
    }, [load, typeFilter]);
    useEffect(() => {
        if (timerRef.current !== undefined)
            window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => load(search, typeFilter), 250);
        return () => { if (timerRef.current !== undefined)
            window.clearTimeout(timerRef.current); };
    }, [search, load, typeFilter]);
    // ---- manual create form (手写建卡) ----
    const [creating, setCreating] = useState(false);
    const [draftType, setDraftType] = useState('concept');
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDesc, setDraftDesc] = useState('');
    const [draftTags, setDraftTags] = useState('');
    const [draftRelated, setDraftRelated] = useState('');
    const [draftSources, setDraftSources] = useState('');
    const [draftBody, setDraftBody] = useState('');
    // Rule cards (type=rules) are authored as one canonical YAML frontmatter.
    const [draftYaml, setDraftYaml] = useState('');
    // Field cards (type=field) are authored through the 5-section form.
    const [fieldDraft, setFieldDraft] = useState(emptyFieldDraft);
    const [savingDraft, setSavingDraft] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [createdNote, setCreatedNote] = useState(null);
    const [lineageOpen, setLineageOpen] = useState(false);
    const isYamlDraft = YAML_EDITOR_TYPES.includes(draftType);
    const isFieldDraft = draftType === 'field';
    const openCreate = () => {
        setDraftType('concept');
        setDraftTitle('');
        setDraftDesc('');
        setDraftTags('');
        setDraftRelated('');
        setDraftSources('');
        setDraftBody('');
        setDraftYaml('');
        setFieldDraft(emptyFieldDraft());
        setCreateError(null);
        setCreatedNote(null);
        setCreating(true);
    };
    const switchDraftType = (type) => {
        setDraftType(type);
        if (type === 'rules' && draftYaml.trim() === '')
            setDraftYaml(RULE_YAML_TEMPLATE);
        if (type === 'field')
            setFieldDraft(emptyFieldDraft());
    };
    const canSaveDraft = isFieldDraft
        ? fieldDraft.title.trim() !== ''
        : isYamlDraft ? draftYaml.trim() !== '' : draftTitle.trim() !== '';
    const saveCreate = async () => {
        if (!canSaveDraft)
            return;
        setSavingDraft(true);
        setCreateError(null);
        try {
            const data = await api('/api/dsh-knowledge/card/create', {
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
                        related: splitFieldList(fieldDraft.related),
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
            });
            setCreating(false);
            setCreatedNote(t(undefined, 'create.created', { title: data.result.card.title }));
            window.setTimeout(() => setCreatedNote(null), 4000);
            load(search, typeFilter);
        }
        catch (err) {
            setCreateError(String(err.message ?? err));
        }
        finally {
            setSavingDraft(false);
        }
    };
    if (creating) {
        return (_jsxs("div", { children: [_jsx("div", { className: css.detailHeader, children: _jsx("button", { className: css.back, onClick: () => setCreating(false), children: t(undefined, 'card.cancel') }) }), _jsxs("h2", { className: css.detailTitle, children: ["+ ", t(undefined, 'create.title')] }), createError !== null && _jsx("div", { className: css.error, children: createError }), _jsxs("div", { className: css.editForm, children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'create.type'), _jsx("select", { className: css.select, value: draftType, onChange: (event) => switchDraftType(event.target.value), children: CREATE_TYPES.map((type) => _jsx("option", { value: type, children: type }, type)) })] }), isFieldDraft ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.note, children: t(undefined, 'create.fieldHint') }), _jsx(FieldForm, { draft: fieldDraft, onChange: setFieldDraft }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 10, value: draftBody, placeholder: "\u4E1A\u52A1\u5B9A\u4E49 / \u8BA1\u7B97\u903B\u8F91 / \u53E3\u5F84\u6761\u4EF6 / \u8840\u7F18 / \u6821\u9A8C\u4E0E\u4F8B\u5916\uFF08Markdown\uFF0C[[wikilink]] \u4E92\u94FE\uFF09", onChange: (event) => setDraftBody(event.target.value) })] })] })) : isYamlDraft ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.note, children: t(undefined, 'create.ruleHint') }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'create.ruleYaml'), _jsx("textarea", { className: css.editorTextarea, rows: 22, value: draftYaml, spellCheck: false, onChange: (event) => setDraftYaml(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 6, value: draftBody, placeholder: "\u4E1A\u52A1\u8BF4\u660E / \u8BC1\u636E / \u5907\u6CE8\uFF08Markdown\uFF09", onChange: (event) => setDraftBody(event.target.value) })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.title'), _jsx("input", { className: css.input, value: draftTitle, onChange: (event) => setDraftTitle(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.desc'), _jsx("input", { className: css.input, value: draftDesc, onChange: (event) => setDraftDesc(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'form.tags'), _jsx("input", { className: css.input, value: draftTags, placeholder: "\u8D22\u52A1, allocation", onChange: (event) => setDraftTags(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'form.related'), _jsx("input", { className: css.input, value: draftRelated, placeholder: "\u5229\u6DA6\u4E2D\u5FC3, \u6210\u672C\u5206\u644A", onChange: (event) => setDraftRelated(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'form.sources'), _jsx("input", { className: css.input, value: draftSources, placeholder: "policy-2024.pdf", onChange: (event) => setDraftSources(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 14, value: draftBody, placeholder: "Markdown\uFF0C[[wikilink]] \u4E92\u94FE", onChange: (event) => setDraftBody(event.target.value) })] })] })), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: savingDraft || !canSaveDraft, onClick: () => void saveCreate(), children: savingDraft ? '…' : t(undefined, 'create.save') }), _jsx("button", { className: css.runSmall, onClick: () => setCreating(false), children: t(undefined, 'card.cancel') })] })] })] }));
    }
    if (lineageOpen) {
        return _jsx(LineagePanel, { kbId: kbId, onClose: () => setLineageOpen(false), onApplied: () => load(search, typeFilter) });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [_jsx("input", { className: css.input, placeholder: t(undefined, 'search.placeholder'), value: search, onChange: (event) => setSearch(event.target.value) }), _jsxs("button", { className: css.run, onClick: openCreate, children: ["+ ", t(undefined, 'cards.create')] }), _jsxs("button", { className: css.runSmall, title: t(undefined, 'lineage.hint'), onClick: () => setLineageOpen(true), children: ["\uD83E\uDDEC ", t(undefined, 'lineage.button')] })] }), _jsxs("div", { className: css.chips, children: [TYPE_FILTERS.map((filter) => (_jsx("button", { className: filter === typeFilter ? css.chipActive : css.chip, onClick: () => setTypeFilter(filter), children: filter === 'all' ? t(undefined, 'filter.all') : filter }, filter))), _jsx("span", { className: css.hint, children: t(undefined, 'cards.total', { total }) })] }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), createdNote !== null && _jsx("div", { className: css.lintResult, children: createdNote }), !loading && cards.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'cards.empty') }), _jsx("div", { className: css.grid, children: cards.map((card) => (_jsxs("button", { className: css.card, onClick: () => onOpenCard(card), children: [_jsxs("div", { className: css.cardTop, children: [_jsx(TypeBadge, { type: card.type }), _jsx("span", { className: css.cardSources, children: card.sources.length > 0 ? `${card.sources.length} 📎` : '' })] }), _jsx("div", { className: css.cardTitle, children: card.title }), card.description !== undefined && _jsx("div", { className: css.cardDesc, children: card.description }), card.tags.length > 0 && (_jsx("div", { className: css.cardTags, children: card.tags.slice(0, 4).map((tag) => _jsxs("span", { className: css.tag, children: ["#", tag] }, tag)) }))] }, card.slug))) })] }));
}
// ---------------------------------------------------------------------------
// card detail
// ---------------------------------------------------------------------------
/** Structured lineage rows shown on a card's detail page (field cards). */
const CARD_RELATION_ROWS = [
    { key: 'depends_on', labelKey: 'card.dependsOn' },
    { key: 'used_by', labelKey: 'card.usedBy' },
    { key: 'implemented_in', labelKey: 'card.implementedIn' },
    { key: 'governed_by', labelKey: 'card.governedBy' },
];
function CardDetail({ kbId, slug, onBack, onOpenCard, onDeleted }) {
    const [card, setCard] = useState(null);
    const [cardFm, setCardFm] = useState({});
    // Identifier (slug / title, lower-cased) → slug, so lineage targets that are
    // real cards become clickable while external ones (tables, reports) do not.
    const [cardIndex, setCardIndex] = useState({});
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editBody, setEditBody] = useState('');
    // Rule cards (type=rules) edit their whole frontmatter as one YAML payload.
    const [editYaml, setEditYaml] = useState('');
    // Field cards (type=field) edit metadata through the 5-section form.
    const [editField, setEditField] = useState(emptyFieldDraft);
    const [saving, setSaving] = useState(false);
    const [savedNote, setSavedNote] = useState(null);
    const [error, setError] = useState(null);
    const [deleting, setDeleting] = useState(false);
    useEffect(() => {
        setCard(null);
        setEditing(false);
        api(`/api/dsh-knowledge/card${query({ kb: kbId, slug })}`)
            .then((data) => { setCard(data.card); setCardFm(data.frontmatter ?? {}); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
        api(`/api/dsh-knowledge/cards${query({ kb: kbId, limit: '500' })}`)
            .then((list) => {
            const index = {};
            for (const entry of list.cards) {
                const bySlug = entry.slug.trim().toLowerCase();
                const byTitle = entry.title.trim().toLowerCase();
                if (bySlug !== '')
                    index[bySlug] = entry.slug;
                if (byTitle !== '')
                    index[byTitle] = entry.slug;
            }
            setCardIndex(index);
        })
            .catch(() => setCardIndex({}));
    }, [kbId, slug]);
    const startEdit = () => {
        if (card === null)
            return;
        setEditTitle(card.title);
        setEditDesc(card.description ?? '');
        setEditTags(card.tags.join(', '));
        setEditBody(card.body);
        setEditYaml(frontmatterPayloadOf(card.raw));
        if (card.type === 'field')
            setEditField(fieldDraftFrom(card, cardFm));
        setSavedNote(null);
        setEditing(true);
    };
    const saveEdit = async () => {
        if (card === null)
            return;
        setSaving(true);
        setError(null);
        try {
            const useFieldForm = card.type === 'field';
            const useYamlEditor = YAML_EDITOR_TYPES.includes(card.type);
            const payload = useFieldForm
                ? JSON.stringify({
                    kb: kbId,
                    slug: card.slug,
                    title: editField.title.trim() || card.title,
                    description: editField.description.trim(),
                    tags: splitFieldList(editField.tags),
                    sources: splitFieldList(editField.sources),
                    related: splitFieldList(editField.related),
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
                    });
            const data = await api('/api/dsh-knowledge/card/edit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: payload,
            });
            setCard(data.result.card);
            setEditing(false);
            setSavedNote(data.result.changed.length > 0
                ? `已保存：修改字段 ${data.result.changed.join('、')}`
                : '已保存（无字段变化）');
            window.setTimeout(() => setSavedNote(null), 4000);
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setSaving(false);
        }
    };
    if (error !== null)
        return _jsx("div", { className: css.error, children: error });
    if (card === null)
        return _jsx("div", { className: css.empty, children: "\u2026" });
    const openFromSlug = (target) => onOpenCard({ slug: target });
    const removeCard = async () => {
        if (card === null)
            return;
        if (!window.confirm(t(undefined, 'card.delete.confirm', { title: card.title })))
            return;
        setDeleting(true);
        try {
            await api('/api/dsh-knowledge/card/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, slug: card.slug }),
            });
            onDeleted();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setDeleting(false);
        }
    };
    if (editing) {
        return (_jsxs("div", { children: [_jsxs("div", { className: css.detailHeader, children: [_jsx("button", { className: css.back, onClick: () => setEditing(false), children: t(undefined, 'card.cancel') }), _jsx("button", { className: css.close, onClick: () => setEditing(false), children: "\u2715" })] }), _jsx("h2", { className: css.detailTitle, children: t(undefined, 'edit.title') }), savedNote !== null && _jsx("div", { className: css.lintResult, children: savedNote }), _jsxs("div", { className: css.editForm, children: [card.type === 'field' ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.note, children: t(undefined, 'create.fieldHint') }), _jsx(FieldForm, { draft: editField, onChange: setEditField })] })) : YAML_EDITOR_TYPES.includes(card.type) ? (_jsxs(_Fragment, { children: [_jsx("p", { className: css.note, children: t(undefined, 'create.ruleHint') }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'create.ruleYaml'), _jsx("textarea", { className: css.editorTextarea, rows: 22, value: editYaml, spellCheck: false, onChange: (event) => setEditYaml(event.target.value) })] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.title'), _jsx("input", { className: css.input, value: editTitle, onChange: (event) => setEditTitle(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.desc'), _jsx("input", { className: css.input, value: editDesc, onChange: (event) => setEditDesc(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.tags'), _jsx("input", { className: css.input, value: editTags, placeholder: "\u9017\u53F7\u5206\u9694\uFF0C\u5982 \u8D22\u52A1, allocation", onChange: (event) => setEditTags(event.target.value) })] })] })), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: card.type === 'field' ? 10 : YAML_EDITOR_TYPES.includes(card.type) ? 6 : 14, value: editBody, onChange: (event) => setEditBody(event.target.value) })] }), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: saving, onClick: () => void saveEdit(), children: saving ? '…' : t(undefined, 'edit.save') }), _jsx("button", { className: css.runSmall, onClick: () => setEditing(false), children: t(undefined, 'card.cancel') })] })] })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: css.detailHeader, children: [_jsx("button", { className: css.back, onClick: onBack, children: t(undefined, 'card.back') }), _jsxs("div", { className: css.headerActions, children: [_jsx("button", { className: css.runSmall, onClick: startEdit, children: t(undefined, 'edit.button') }), _jsxs("button", { className: css.dangerSmall, disabled: deleting, onClick: () => void removeCard(), children: ["\uD83D\uDDD1 ", t(undefined, 'card.delete')] }), _jsx("button", { className: css.close, onClick: onBack, children: "\u2715" })] })] }), savedNote !== null && _jsx("div", { className: css.lintResult, children: savedNote }), _jsx("h2", { className: css.detailTitle, children: card.title }), _jsxs("div", { className: css.cardTop, children: [_jsx(TypeBadge, { type: card.type }), card.updated !== undefined && _jsxs("span", { className: css.meta, children: [t(undefined, 'card.updated'), ": ", card.updated] })] }), card.description !== undefined && _jsx("p", { className: css.detailDesc, children: card.description }), _jsxs("div", { className: css.kv, children: [card.tags.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.tags'), ":"] }), _jsx("span", { children: card.tags.map((tag) => _jsxs("span", { className: css.tag, children: ["#", tag] }, tag)) })] })), card.sources.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.sources'), ":"] }), _jsx("span", { children: card.sources.join(', ') })] })), card.related.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.related'), ":"] }), _jsx("span", { children: card.related.map((related) => (_jsxs("button", { className: css.relatedLink, onClick: () => openFromSlug(related), children: ["[[", related, "]]"] }, related))) })] })), (() => {
                        const relationValues = (key) => {
                            const value = cardFm[key];
                            return Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim() !== '') : [];
                        };
                        const rows = CARD_RELATION_ROWS.filter(({ key }) => relationValues(key).length > 0);
                        if (rows.length === 0)
                            return null;
                        return (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: ["\uD83E\uDDEC ", t(undefined, 'card.lineage'), ":"] }), _jsx("span", { className: css.lineageBlock, children: rows.map(({ key, labelKey }) => (_jsxs("span", { className: css.lineageRow, children: [_jsx("span", { className: css.lineageKey, children: t(undefined, labelKey) }), relationValues(key).map((value) => {
                                                const target = cardIndex[value.trim().toLowerCase()] ?? null;
                                                return target !== null && target !== card.slug
                                                    ? _jsx("button", { className: css.relatedLink, onClick: () => openFromSlug(target), children: value }, value)
                                                    : _jsx("span", { className: css.lineageExternal, title: t(undefined, 'card.externalTarget'), children: value }, value);
                                            })] }, key))) })] }));
                    })()] }), _jsx(BodyText, { body: card.body, onOpen: openFromSlug })] }));
}
// ---------------------------------------------------------------------------
// sources tab
// ---------------------------------------------------------------------------
function buildIngestPrompt(kbName, pending) {
    const list = pending.map((source) => `- ${source.relPath}（${source.status === 'new' ? '新增' : '变更'}）`).join('\n');
    return `请用知识卡片插件摄入以下资料到知识库「${kbName}」：\n${list}\n\n流程：先 wiki_ingest 取资料全文与知识库上下文（分析关键实体/概念、与现有卡片的关联），再用 wiki_commit 生成并提交卡片（frontmatter 含 type/title/description/tags/related/sources，正文用 [[wikilink]] 互链），完成后跑一次 wiki_lint。\n重要：分析中若发现与现有知识矛盾、疑似已有同名卡片、重要概念缺页面、或值得深挖的点，用 wiki_review_submit 提交审核项（kind + 简短说明 + 预定义操作 + 可选的预生成搜索查询），不要擅自下结论——用户稍后在「审核」tab 处理。`;
}
function SourcesTab({ kbId, kbName }) {
    const [sources, setSources] = useState([]);
    const [pending, setPending] = useState(0);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState(null);
    const load = useCallback(() => {
        api(`/api/dsh-knowledge/sources${query({ kb: kbId })}`)
            .then((data) => { setSources(data.sources); setPending(data.pending); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId]);
    useEffect(() => { load(); }, [load]);
    const pendingSources = sources.filter((source) => source.status !== 'up-to-date');
    const copyPrompt = async () => {
        const prompt = buildIngestPrompt(kbName, pendingSources);
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        }
        catch {
            // clipboard unavailable — fall back to a prompt textarea the user can copy
            window.prompt('复制以下摄入指令发给 agent：', prompt);
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [_jsx("span", { className: css.hint, children: t(undefined, 'sources.pending', { n: pending }) }), _jsxs("button", { className: css.run, disabled: pendingSources.length === 0, onClick: () => void copyPrompt(), children: [copied ? '✓ ' : '', t(undefined, 'sources.copyPrompt')] }), _jsx("button", { className: css.run, onClick: load, children: t(undefined, 'refresh') })] }), _jsx("p", { className: css.note, children: t(undefined, 'sources.ingestHint') }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), sources.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'sources.empty') }), _jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u6587\u4EF6" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "SHA256" }), _jsx("th", { children: "\u5173\u8054\u5361\u7247" })] }) }), _jsx("tbody", { children: sources.map((source) => (_jsxs("tr", { children: [_jsx("td", { children: source.relPath }), _jsx("td", { children: _jsx("span", { className: source.status === 'up-to-date' ? css.badgeSuccess : source.status === 'new' ? css.badgeNew : css.badgeChanged, children: source.status === 'up-to-date' ? t(undefined, 'sources.status.up-to-date') : source.status === 'new' ? t(undefined, 'sources.status.new') : t(undefined, 'sources.status.changed') }) }), _jsxs("td", { className: css.mono, children: [source.sha256.slice(0, 10), "\u2026"] }), _jsx("td", { children: source.pages.length > 0 ? source.pages.join(', ') : '-' })] }, source.relPath))) })] })] }));
}
// ---------------------------------------------------------------------------
// knowledge bases tab
// ---------------------------------------------------------------------------
function KbsTab({ kbs, activeId, onSelect, onCreated, onDeleted }) {
    const [name, setName] = useState('');
    const [path, setPath] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const remove = async (kb) => {
        if (!window.confirm(t(undefined, 'kbs.delete.confirm', { name: kb.name })))
            return;
        setDeletingId(kb.id);
        setError(null);
        try {
            await api('/api/dsh-knowledge/kbs/delete', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kb.id }),
            });
            onDeleted(kb.id);
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setDeletingId(null);
        }
    };
    const create = async () => {
        if (name.trim() === '')
            return;
        setBusy(true);
        setError(null);
        try {
            const data = await api('/api/dsh-knowledge/kbs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), path: path.trim() || undefined, description: description.trim() || undefined }),
            });
            onSelect(data.kb.id);
            setName('');
            setPath('');
            setDescription('');
            onCreated();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { children: [error !== null && _jsx("div", { className: css.error, children: error }), kbs.length === 0 && _jsx("div", { className: css.empty, children: t(undefined, 'kbs.empty') }), kbs.map((kb) => (_jsxs("div", { className: kb.id === activeId ? css.kbRowActive : css.kbRow, onClick: () => onSelect(kb.id), children: [_jsxs("div", { className: css.kbRowTop, children: [_jsxs("span", { className: css.kbName, children: [kb.name, kb.id === activeId && ' ✓'] }), _jsxs("button", { className: css.dangerSmall, disabled: deletingId === kb.id, title: t(undefined, 'kbs.delete'), onClick: (event) => { event.stopPropagation(); void remove(kb); }, children: ["\uD83D\uDDD1 ", t(undefined, 'kbs.delete')] })] }), _jsx("div", { className: css.kbMeta, children: t(undefined, 'kbs.stats', { total: kb.stats.total, sources: kb.stats.sourceCount }) }), _jsx("div", { className: css.kbPath, children: kb.path }), kb.description !== undefined && _jsx("div", { className: css.kbDesc, children: kb.description })] }, kb.id))), _jsxs("div", { className: css.kbForm, children: [_jsx("div", { className: css.kbFormTitle, children: t(undefined, 'kbs.add') }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.name'), value: name, onChange: (event) => setName(event.target.value) }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.path'), value: path, onChange: (event) => setPath(event.target.value) }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.description'), value: description, onChange: (event) => setDescription(event.target.value) }), _jsx("button", { className: css.run, disabled: busy || name.trim() === '', onClick: () => void create(), children: t(undefined, 'kbs.create') })] })] }));
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function CodeTab({ kbId }) {
    const [files, setFiles] = useState([]);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const load = useCallback(() => {
        api(`/api/dsh-knowledge/code${query({ kb: kbId })}`)
            .then((data) => { setFiles(data.files); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId]);
    useEffect(() => { load(); }, [load]);
    const openPreview = (relPath) => {
        api(`/api/dsh-knowledge/code/content${query({ kb: kbId, path: relPath })}`)
            .then((data) => { setPreview({ path: relPath, content: data.content }); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    };
    const removeFile = async (relPath) => {
        await api('/api/dsh-knowledge/code/delete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kb: kbId, path: relPath }),
        });
        if (preview?.path === relPath)
            setPreview(null);
        load();
    };
    const uploadFiles = async (selected) => {
        if (selected === null || selected.length === 0)
            return;
        setBusy(true);
        setError(null);
        try {
            for (const file of Array.from(selected)) {
                const content = await file.text();
                const path = file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name;
                await api('/api/dsh-knowledge/code', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ kb: kbId, path, content }),
                });
            }
            load();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(false);
            if (fileInputRef.current !== null)
                fileInputRef.current.value = '';
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [_jsx("input", { ref: fileInputRef, type: "file", multiple: true, className: css.hiddenInput, onChange: (event) => void uploadFiles(event.target.files) }), _jsxs("button", { className: css.run, disabled: busy, onClick: () => fileInputRef.current?.click(), children: [busy ? '…' : '⬆ ', t(undefined, 'code.upload')] }), _jsx("button", { className: css.run, onClick: load, children: t(undefined, 'refresh') }), _jsx("span", { className: css.hint, children: t(undefined, 'code.count', { n: files.length }) })] }), _jsx("p", { className: css.note, children: t(undefined, 'code.hint') }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), preview !== null ? (_jsxs("div", { children: [_jsxs("div", { className: css.detailHeader, children: [_jsx("button", { className: css.back, onClick: () => setPreview(null), children: t(undefined, 'card.back') }), _jsx("span", { className: css.codePath, children: preview.path })] }), _jsx("pre", { className: css.codeBlock, children: preview.content })] })) : (_jsxs("table", { className: css.table, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u6587\u4EF6" }), _jsx("th", { children: "\u5927\u5C0F" }), _jsx("th", { children: "\u64CD\u4F5C" })] }) }), _jsx("tbody", { children: files.map((file) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { className: css.fileRow, onClick: () => openPreview(file.relPath), children: file.relPath }) }), _jsx("td", { className: css.mono, children: formatBytes(file.size) }), _jsx("td", { children: _jsx("button", { className: css.dangerSmall, onClick: () => void removeFile(file.relPath), children: "\uD83D\uDDD1" }) })] }, file.relPath))) })] })), files.length === 0 && preview === null && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'code.empty') })] }));
}
const LOG_ACTIONS = ['all', 'edit', 'ingest', 'import'];
function LogBoard({ kbId }) {
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [filter, setFilter] = useState('all');
    const [error, setError] = useState(null);
    const load = useCallback((action) => {
        api(`/api/dsh-knowledge/log${query({ kb: kbId, action })}`)
            .then((data) => { setEntries(data.entries); setTotal(data.total); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId]);
    useEffect(() => { load(filter); }, [load, filter]);
    const actionLabel = (action) => {
        if (action === 'edit')
            return '✏️';
        if (action === 'ingest')
            return '📥';
        if (action === 'import')
            return '📦';
        return '·';
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [LOG_ACTIONS.map((action) => (_jsx("button", { className: action === filter ? css.chipActive : css.chip, onClick: () => setFilter(action), children: action === 'all' ? t(undefined, 'log.all') : action }, action))), _jsx("span", { className: css.hint, children: t(undefined, 'log.count', { n: entries.length, total }) })] }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), entries.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'log.empty') }), _jsx("div", { className: css.logList, children: entries.map((entry, index) => (_jsxs("div", { className: css.logRow, children: [_jsx("span", { className: css.logIcon, children: actionLabel(entry.action) }), _jsx("span", { className: css.logDate, children: entry.date }), _jsx("span", { className: entry.action === 'edit' ? css.logActionEdit : css.logAction, children: entry.action }), _jsx("span", { className: css.logSubject, children: entry.subject }), (entry.notes ?? []).map((note, noteIndex) => (_jsx("span", { className: css.logNote, children: note }, noteIndex)))] }, `${entry.date}-${entry.action}-${index}`))) })] }));
}
const REVIEW_STATUSES = ['all', 'pending', 'resolved', 'skipped'];
function ReviewsTab({ kbId }) {
    const [items, setItems] = useState([]);
    const [pending, setPending] = useState(0);
    const [filter, setFilter] = useState('pending');
    const [busyId, setBusyId] = useState(null);
    const [auditing, setAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState(null);
    const [deepPrompt, setDeepPrompt] = useState(null);
    const [error, setError] = useState(null);
    const load = useCallback((status) => {
        api(`/api/dsh-knowledge/reviews${query({ kb: kbId, status })}`)
            .then((data) => { setItems(data.items); setPending(data.pending); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId]);
    useEffect(() => { load(filter); }, [load, filter]);
    /** Run the deterministic audit over existing cards (duplicates + missing pages). */
    const runAudit = async () => {
        setAuditing(true);
        setError(null);
        try {
            const data = await api('/api/dsh-knowledge/audit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId }),
            });
            const { submitted, skippedExisting, summary, deepAuditPrompt } = data.result;
            setAuditResult(t(undefined, 'audit.result', {
                n: submitted.length,
                dup: summary.duplicate,
                missing: summary.missingPage,
                skipped: skippedExisting,
            }));
            setDeepPrompt(deepAuditPrompt);
            load(filter);
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setAuditing(false);
        }
    };
    const copyDeepPrompt = async () => {
        try {
            let prompt = deepPrompt;
            if (prompt === null) {
                // 指令随时可生成（无需先跑确定性审核）
                const data = await api(`/api/dsh-knowledge/audit-prompt${query({ kb: kbId })}`);
                prompt = data.prompt;
                setDeepPrompt(prompt);
            }
            await navigator.clipboard.writeText(prompt);
            setAuditResult(t(undefined, 'audit.copied'));
            window.setTimeout(() => setAuditResult(null), 3000);
        }
        catch {
            if (deepPrompt !== null)
                window.prompt(t(undefined, 'audit.copied'), deepPrompt);
        }
    };
    const resolve = async (id, status, resolution) => {
        setBusyId(id);
        try {
            await api('/api/dsh-knowledge/reviews/resolve', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, id, status, resolution }),
            });
            load(filter);
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusyId(null);
        }
    };
    /** 深度研究指令：agent 拿 searchQuery 做网络搜索并沉淀卡片。 */
    const buildResearchPrompt = (item) => [
        `请对以下审核项做深度研究（网络搜索），并把结论沉淀为知识卡片：`,
        `主题: ${item.title}`,
        `背景: ${item.summary}`,
        item.searchQuery !== undefined && item.searchQuery !== '' ? `搜索方向: ${item.searchQuery}` : '',
        item.source !== undefined ? `来源: ${item.source}` : '',
        `流程：用 web 搜索查「${item.searchQuery ?? item.title}」→ 综合结论 → 用 wiki_commit 创建卡片（frontmatter 含 type/description/tags/sources，正文 [[wikilink]] 互链）→ 完成后把该审核项标记为已完成（wiki_reviews 查看）。`,
    ].filter((line) => line !== '').join('\n');
    /** 合并指令：agent 读取涉及卡片判断是否同一事物并合并。 */
    const buildMergePrompt = (item) => [
        `请处理以下疑似重复的审核项：`,
        `主题: ${item.title}`,
        `判断要点: ${item.summary}`,
        item.source !== undefined ? `涉及卡片: ${item.source}` : '',
        `流程：wiki_read 读取涉及卡片 → 判断是否同一事物 → 若是，保留信息更完整的卡片（可用 wiki_edit_card 补充），多余的用 wiki_commit 重建或直接删除 → 完成后把该审核项标记为已完成。`,
    ].filter((line) => line !== '').join('\n');
    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setAuditResult(t(undefined, 'audit.copied'));
            window.setTimeout(() => setAuditResult(null), 3000);
        }
        catch {
            window.prompt(t(undefined, 'audit.copied'), text);
        }
    };
    // ---- 创建页面（从审核项直接建卡） ----
    const [creating, setCreating] = useState(null);
    const [draftType, setDraftType] = useState('concept');
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDesc, setDraftDesc] = useState('');
    const [draftBody, setDraftBody] = useState('');
    const [savingDraft, setSavingDraft] = useState(false);
    const openCreate = (item) => {
        setCreating(item);
        setDraftType('concept');
        setDraftTitle(item.title);
        setDraftDesc(item.summary);
        setDraftBody([
            `<!-- 由审核项（${item.kind}）创建，请补充完善。 -->`,
            '',
            item.summary,
            '',
            '## 待补充',
            '',
            '- ',
            item.searchQuery !== undefined && item.searchQuery !== '' ? `\n> 参考搜索: ${item.searchQuery}` : '',
        ].join('\n'));
    };
    const saveDraft = async () => {
        if (creating === null)
            return;
        setSavingDraft(true);
        setError(null);
        try {
            await api('/api/dsh-knowledge/commit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, pages: [{ type: draftType, title: draftTitle, description: draftDesc, body: draftBody }], sourceFiles: [] }),
            });
            await resolve(creating.id, 'resolved', '已创建页面');
            setCreating(null);
            load(filter);
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setSavingDraft(false);
        }
    };
    if (creating !== null) {
        return (_jsxs("div", { children: [_jsx("div", { className: css.detailHeader, children: _jsx("button", { className: css.back, onClick: () => setCreating(null), children: t(undefined, 'card.cancel') }) }), _jsx("h2", { className: css.detailTitle, children: t(undefined, 'review.create.title') }), _jsxs("div", { className: css.editForm, children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.title'), _jsx("input", { className: css.input, value: draftTitle, onChange: (event) => setDraftTitle(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.desc'), _jsx("input", { className: css.input, value: draftDesc, onChange: (event) => setDraftDesc(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: ["type", _jsx("select", { className: css.select, value: draftType, onChange: (event) => setDraftType(event.target.value), children: CREATE_TYPES.map((type) => _jsx("option", { value: type, children: type }, type)) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 12, value: draftBody, onChange: (event) => setDraftBody(event.target.value) })] }), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: savingDraft || draftTitle.trim() === '', onClick: () => void saveDraft(), children: savingDraft ? '…' : t(undefined, 'review.create.save') }), _jsx("button", { className: css.runSmall, onClick: () => setCreating(null), children: t(undefined, 'card.cancel') })] })] })] }));
    }
    const kindLabel = (kind) => {
        if (kind === 'contradiction')
            return '⚠️ 矛盾';
        if (kind === 'duplicate')
            return '🔁 疑似重复';
        if (kind === 'missing-page')
            return '📄 缺失页面';
        if (kind === 'suggestion')
            return '💡 建议';
        return kind;
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [REVIEW_STATUSES.map((status) => (_jsx("button", { className: status === filter ? css.chipActive : css.chip, onClick: () => setFilter(status), children: status === 'all' ? t(undefined, 'review.all') : status === 'pending' ? t(undefined, 'review.pending', { n: pending }) : status }, status))), _jsx("span", { className: css.hint, children: t(undefined, 'review.hint') })] }), _jsxs("div", { className: css.auditBar, children: [_jsxs("button", { className: css.run, disabled: auditing, onClick: () => void runAudit(), children: [auditing ? '…' : '🔍 ', t(undefined, 'audit.run')] }), _jsx("button", { className: css.runSmall, onClick: () => void copyDeepPrompt(), children: t(undefined, 'audit.deep') }), _jsx("span", { className: css.hint, children: t(undefined, 'audit.hint') })] }), auditResult !== null && _jsx("div", { className: css.lintResult, children: auditResult }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), items.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'review.empty') }), _jsx("div", { className: css.reviewList, children: items.map((item) => (_jsxs("div", { className: item.status === 'pending' ? css.reviewItem : `${css.reviewItem} ${css.reviewDone}`, children: [_jsxs("div", { className: css.reviewTop, children: [_jsx("span", { className: item.kind === 'contradiction' ? css.reviewKindDanger : item.kind === 'suggestion' ? css.reviewKindWarn : css.reviewKind, children: kindLabel(item.kind) }), _jsx("span", { className: css.reviewStatus, children: item.status === 'pending' ? t(undefined, 'review.status.pending') : item.status === 'skipped' ? t(undefined, 'review.status.skipped') : t(undefined, 'review.status.resolved') })] }), _jsx("div", { className: css.reviewTitle, children: item.title }), _jsx("div", { className: css.reviewSummary, children: item.summary }), item.source !== undefined && _jsxs("div", { className: css.reviewSource, children: ["\u6765\u6E90: ", item.source] }), item.searchQuery !== undefined && item.searchQuery !== '' && (_jsxs("div", { className: css.reviewSearch, children: ["\uD83D\uDD0E ", item.searchQuery] })), item.status === 'pending' && (_jsxs("div", { className: css.reviewActions, children: [item.options.map((option) => {
                                    if (option === '创建页面') {
                                        return _jsx("button", { className: css.runSmall, disabled: busyId === item.id, onClick: () => openCreate(item), children: option }, option);
                                    }
                                    if (option === '深度研究') {
                                        return _jsx("button", { className: css.runSmall, disabled: busyId === item.id, onClick: () => void copyText(buildResearchPrompt(item)), children: option }, option);
                                    }
                                    if (option === '合并页面') {
                                        return _jsx("button", { className: css.runSmall, disabled: busyId === item.id, onClick: () => void copyText(buildMergePrompt(item)), children: option }, option);
                                    }
                                    if (option === '跳过') {
                                        return _jsx("button", { className: css.runSmall, disabled: busyId === item.id, onClick: () => void resolve(item.id, 'skipped'), children: option }, option);
                                    }
                                    return _jsx("span", { className: css.tag, children: option }, option);
                                }), _jsx("button", { className: css.runSmall, disabled: busyId === item.id, onClick: () => void resolve(item.id, 'resolved'), children: t(undefined, 'review.resolve') })] }))] }, item.id))) })] }));
}
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}
function TrashTab({ kbId, onKbChanged }) {
    const [cards, setCards] = useState([]);
    const [kbs, setKbs] = useState([]);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [note, setNote] = useState(null);
    const load = useCallback(() => {
        api(`/api/dsh-knowledge/trash${query({ kb: kbId })}`)
            .then((data) => { setCards(data.cards); setKbs(data.kbs); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId]);
    useEffect(() => { load(); }, [load]);
    const flash = (message) => {
        setNote(message);
        window.setTimeout(() => setNote(null), 2500);
    };
    const restoreCard = async (card) => {
        setBusy(`c:${card.slug}`);
        setError(null);
        try {
            await api('/api/dsh-knowledge/card/restore', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, slug: card.slug }),
            });
            flash(t(undefined, 'trash.restored'));
            load();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    const purgeCard = async (card) => {
        if (!window.confirm(t(undefined, 'trash.purge.confirm', { title: card.title })))
            return;
        setBusy(`c:${card.slug}`);
        setError(null);
        try {
            await api('/api/dsh-knowledge/card/purge', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId, slug: card.slug }),
            });
            flash(t(undefined, 'trash.purged'));
            load();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    const restoreKb = async (kb) => {
        setBusy(`k:${kb.id}`);
        setError(null);
        try {
            await api('/api/dsh-knowledge/kbs/restore', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kb.id }),
            });
            flash(t(undefined, 'trash.restored'));
            load();
            onKbChanged();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    const purgeKb = async (kb) => {
        if (!window.confirm(t(undefined, 'trash.purge.confirm', { title: kb.name })))
            return;
        setBusy(`k:${kb.id}`);
        setError(null);
        try {
            await api('/api/dsh-knowledge/kbs/purge', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kb.id }),
            });
            flash(t(undefined, 'trash.purged'));
            load();
            onKbChanged();
        }
        catch (err) {
            setError(String(err.message ?? err));
        }
        finally {
            setBusy(null);
        }
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: css.controls, children: [_jsx("span", { className: css.hint, children: t(undefined, 'trash.hint') }), _jsx("button", { className: css.run, onClick: load, children: t(undefined, 'refresh') })] }), note !== null && _jsx("div", { className: css.lintResult, children: note }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), kbs.length === 0 && cards.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'trash.empty') }), kbs.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h3", { className: css.sectionTitle, children: ["\uD83D\uDCDA ", t(undefined, 'trash.kbs'), "\uFF08", kbs.length, "\uFF09"] }), kbs.map((kb) => (_jsxs("div", { className: css.trashItem, children: [_jsxs("div", { className: css.trashTop, children: [_jsx("span", { className: css.trashTitle, children: kb.name }), _jsxs("span", { className: css.trashMeta, children: [kb.id, " \u00B7 ", t(undefined, 'trash.deletedAt'), " ", formatDate(kb.deletedAt)] })] }), _jsxs("div", { className: css.trashMeta, children: ["\uD83D\uDCC1 ", kb.originalPath] }), _jsxs("div", { className: css.trashActions, children: [_jsxs("button", { className: css.runSmall, disabled: busy === `k:${kb.id}`, onClick: () => void restoreKb(kb), children: ["\u21A9 ", t(undefined, 'trash.restore')] }), _jsx("button", { className: css.dangerSmall, disabled: busy === `k:${kb.id}`, onClick: () => void purgeKb(kb), children: t(undefined, 'trash.purge') })] })] }, kb.id)))] })), cards.length > 0 && (_jsxs(_Fragment, { children: [_jsxs("h3", { className: css.sectionTitle, children: ["\uD83D\uDDC2 ", t(undefined, 'trash.cards'), "\uFF08", cards.length, "\uFF09"] }), cards.map((card) => (_jsxs("div", { className: css.trashItem, children: [_jsxs("div", { className: css.trashTop, children: [_jsxs("span", { className: css.trashTitle, children: [_jsx(TypeBadge, { type: card.type }), " ", card.title] }), _jsxs("span", { className: css.trashMeta, children: [t(undefined, 'trash.deletedAt'), " ", formatDate(card.deletedAt)] })] }), _jsxs("div", { className: css.trashMeta, children: ["wiki/", card.originalPath] }), _jsxs("div", { className: css.trashActions, children: [_jsxs("button", { className: css.runSmall, disabled: busy === `c:${card.slug}`, onClick: () => void restoreCard(card), children: ["\u21A9 ", t(undefined, 'trash.restore')] }), _jsx("button", { className: css.dangerSmall, disabled: busy === `c:${card.slug}`, onClick: () => void purgeCard(card), children: t(undefined, 'trash.purge') })] })] }, card.slug)))] }))] }));
}
// ---------------------------------------------------------------------------
// panel root
// ---------------------------------------------------------------------------
export function KnowledgePanel({ controller }) {
    const [kbs, setKbs] = useState([]);
    const [kbId, setKbId] = useState('');
    const [tab, setTab] = useState('cards');
    const [selected, setSelected] = useState(null);
    const [lintResult, setLintResult] = useState(null);
    const [error, setError] = useState(null);
    const loadKbs = useCallback(() => {
        api('/api/dsh-knowledge/kbs')
            .then((data) => {
            setKbs(data.kbs);
            if (data.kbs.length === 0)
                return;
            const stored = window.localStorage.getItem(KB_STORAGE_KEY);
            const preferred = data.kbs.some((kb) => kb.id === stored) ? stored ?? '' : '';
            const active = preferred !== '' ? preferred : data.kbs[0].id;
            setKbId((current) => current !== '' ? current : active);
            if (preferred !== '')
                setKbId(preferred);
        })
            .catch((err) => setError(String(err.message ?? err)));
    }, []);
    useEffect(() => { loadKbs(); }, [loadKbs]);
    const selectKb = (id) => {
        setKbId(id);
        window.localStorage.setItem(KB_STORAGE_KEY, id);
        setSelected(null);
    };
    /** After a KB is deleted: drop its local preference and fall back to the first remaining KB. */
    const handleKbDeleted = (deletedId) => {
        if (kbId === deletedId)
            window.localStorage.removeItem(KB_STORAGE_KEY);
        setKbId((current) => {
            if (current !== deletedId)
                return current;
            const remaining = kbs.filter((kb) => kb.id !== deletedId);
            return remaining.length > 0 ? remaining[0].id : '';
        });
        loadKbs();
    };
    const openCard = (card) => setSelected(card);
    const closeCard = () => setSelected(null);
    const runLint = async () => {
        if (kbId === '')
            return;
        try {
            const data = await api('/api/dsh-knowledge/lint', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kb: kbId }),
            });
            const errors = data.issues.filter((issue) => issue.severity === 'error').length;
            const warns = data.issues.filter((issue) => issue.severity === 'warn').length;
            setLintResult(t(undefined, 'lint.result', { errors, warns }));
            window.setTimeout(() => setLintResult(null), 4000);
        }
        catch (err) {
            setLintResult(String(err.message ?? err));
        }
    };
    const activeKb = kbs.find((kb) => kb.id === kbId);
    return (_jsxs("div", { className: css.panel, children: [_jsxs("div", { className: css.header, children: [_jsxs("h2", { className: css.title, children: ["\uD83D\uDCC7 ", t(undefined, 'panel.title')] }), _jsxs("div", { className: css.headerActions, children: [kbs.length > 0 && (_jsx("select", { className: css.select, value: kbId, onChange: (event) => selectKb(event.target.value), children: kbs.map((kb) => _jsx("option", { value: kb.id, children: kb.name }, kb.id)) })), _jsx("button", { className: css.close, title: t(undefined, 'close'), onClick: () => controller.close(), children: "\u2715" })] })] }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), lintResult !== null && _jsx("div", { className: css.lintResult, children: lintResult }), kbs.length === 0 ? (_jsx(KbsTab, { kbs: kbs, activeId: kbId, onSelect: selectKb, onCreated: loadKbs, onDeleted: handleKbDeleted })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.tabs, children: [_jsx("button", { className: tab === 'cards' ? css.tabActive : css.tab, onClick: () => setTab('cards'), children: t(undefined, 'tab.cards') }), _jsx("button", { className: tab === 'sources' ? css.tabActive : css.tab, onClick: () => setTab('sources'), children: t(undefined, 'tab.sources') }), _jsx("button", { className: tab === 'code' ? css.tabActive : css.tab, onClick: () => setTab('code'), children: t(undefined, 'tab.code') }), _jsx("button", { className: tab === 'board' ? css.tabActive : css.tab, onClick: () => setTab('board'), children: t(undefined, 'tab.board') }), _jsx("button", { className: tab === 'review' ? css.tabActive : css.tab, onClick: () => setTab('review'), children: t(undefined, 'tab.review') }), _jsx("button", { className: tab === 'kbs' ? css.tabActive : css.tab, onClick: () => setTab('kbs'), children: t(undefined, 'tab.kbs') }), _jsx("button", { className: tab === 'trash' ? css.tabActive : css.tab, onClick: () => setTab('trash'), children: t(undefined, 'tab.trash') }), _jsx("span", { className: css.tabSpacer }), _jsx("button", { className: css.runSmall, onClick: () => void runLint(), children: t(undefined, 'lint.run') })] }), tab === 'cards' && (selected === null
                        ? _jsx(CardsTab, { kbId: kbId, onOpenCard: openCard })
                        : _jsx(CardDetail, { kbId: kbId, slug: selected.slug, onBack: closeCard, onOpenCard: openCard, onDeleted: closeCard })), tab === 'sources' && _jsx(SourcesTab, { kbId: kbId, kbName: activeKb?.name ?? kbId }), tab === 'code' && _jsx(CodeTab, { kbId: kbId }), tab === 'board' && _jsx(LogBoard, { kbId: kbId }), tab === 'review' && _jsx(ReviewsTab, { kbId: kbId }), tab === 'kbs' && _jsx(KbsTab, { kbs: kbs, activeId: kbId, onSelect: selectKb, onCreated: loadKbs, onDeleted: handleKbDeleted }), tab === 'trash' && _jsx(TrashTab, { kbId: kbId, onKbChanged: loadKbs })] }))] }));
}
