import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * KnowledgeCards panel: the center-column view toggled by the sidebar entry.
 * Three tabs — 卡片 (card wall + search + detail), 资料 (raw sources with
 * ingest status + copy-prompt for the agent), 知识库 (multi-KB management).
 * All data rides the host /api/dsh-knowledge/* routes.
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
const KB_STORAGE_KEY = 'dsh-knowledge-cards:kb';
const TYPE_FILTERS = ['all', 'entity', 'concept', 'source', 'query', 'comparison', 'synthesis'];
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
    return (_jsxs("div", { children: [_jsx("div", { className: css.controls, children: _jsx("input", { className: css.input, placeholder: t(undefined, 'search.placeholder'), value: search, onChange: (event) => setSearch(event.target.value) }) }), _jsxs("div", { className: css.chips, children: [TYPE_FILTERS.map((filter) => (_jsx("button", { className: filter === typeFilter ? css.chipActive : css.chip, onClick: () => setTypeFilter(filter), children: filter === 'all' ? t(undefined, 'filter.all') : filter }, filter))), _jsx("span", { className: css.hint, children: t(undefined, 'cards.total', { total }) })] }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), !loading && cards.length === 0 && error === null && _jsx("div", { className: css.empty, children: t(undefined, 'cards.empty') }), _jsx("div", { className: css.grid, children: cards.map((card) => (_jsxs("button", { className: css.card, onClick: () => onOpenCard(card), children: [_jsxs("div", { className: css.cardTop, children: [_jsx(TypeBadge, { type: card.type }), _jsx("span", { className: css.cardSources, children: card.sources.length > 0 ? `${card.sources.length} 📎` : '' })] }), _jsx("div", { className: css.cardTitle, children: card.title }), card.description !== undefined && _jsx("div", { className: css.cardDesc, children: card.description }), card.tags.length > 0 && (_jsx("div", { className: css.cardTags, children: card.tags.slice(0, 4).map((tag) => _jsxs("span", { className: css.tag, children: ["#", tag] }, tag)) }))] }, card.slug))) })] }));
}
// ---------------------------------------------------------------------------
// card detail
// ---------------------------------------------------------------------------
function CardDetail({ kbId, slug, onBack, onOpenCard }) {
    const [card, setCard] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editBody, setEditBody] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedNote, setSavedNote] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        setCard(null);
        setEditing(false);
        api(`/api/dsh-knowledge/card${query({ kb: kbId, slug })}`)
            .then((data) => { setCard(data.card); setError(null); })
            .catch((err) => setError(String(err.message ?? err)));
    }, [kbId, slug]);
    const startEdit = () => {
        if (card === null)
            return;
        setEditTitle(card.title);
        setEditDesc(card.description ?? '');
        setEditTags(card.tags.join(', '));
        setEditBody(card.body);
        setSavedNote(null);
        setEditing(true);
    };
    const saveEdit = async () => {
        if (card === null)
            return;
        setSaving(true);
        setError(null);
        try {
            const data = await api('/api/dsh-knowledge/card/edit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kb: kbId,
                    slug: card.slug,
                    title: editTitle,
                    description: editDesc,
                    tags: editTags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
                    body: editBody,
                }),
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
    if (editing) {
        return (_jsxs("div", { children: [_jsxs("div", { className: css.detailHeader, children: [_jsx("button", { className: css.back, onClick: () => setEditing(false), children: t(undefined, 'card.cancel') }), _jsx("button", { className: css.close, onClick: () => setEditing(false), children: "\u2715" })] }), _jsx("h2", { className: css.detailTitle, children: t(undefined, 'edit.title') }), savedNote !== null && _jsx("div", { className: css.lintResult, children: savedNote }), _jsxs("div", { className: css.editForm, children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.title'), _jsx("input", { className: css.input, value: editTitle, onChange: (event) => setEditTitle(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.desc'), _jsx("input", { className: css.input, value: editDesc, onChange: (event) => setEditDesc(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.tags'), _jsx("input", { className: css.input, value: editTags, placeholder: "\u9017\u53F7\u5206\u9694\uFF0C\u5982 \u8D22\u52A1, allocation", onChange: (event) => setEditTags(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 14, value: editBody, onChange: (event) => setEditBody(event.target.value) })] }), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: saving, onClick: () => void saveEdit(), children: saving ? '…' : t(undefined, 'edit.save') }), _jsx("button", { className: css.runSmall, onClick: () => setEditing(false), children: t(undefined, 'card.cancel') })] })] })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: css.detailHeader, children: [_jsx("button", { className: css.back, onClick: onBack, children: t(undefined, 'card.back') }), _jsxs("div", { className: css.headerActions, children: [_jsx("button", { className: css.runSmall, onClick: startEdit, children: t(undefined, 'edit.button') }), _jsx("button", { className: css.close, onClick: onBack, children: "\u2715" })] })] }), savedNote !== null && _jsx("div", { className: css.lintResult, children: savedNote }), _jsx("h2", { className: css.detailTitle, children: card.title }), _jsxs("div", { className: css.cardTop, children: [_jsx(TypeBadge, { type: card.type }), card.updated !== undefined && _jsxs("span", { className: css.meta, children: [t(undefined, 'card.updated'), ": ", card.updated] })] }), card.description !== undefined && _jsx("p", { className: css.detailDesc, children: card.description }), _jsxs("div", { className: css.kv, children: [card.tags.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.tags'), ":"] }), _jsx("span", { children: card.tags.map((tag) => _jsxs("span", { className: css.tag, children: ["#", tag] }, tag)) })] })), card.sources.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.sources'), ":"] }), _jsx("span", { children: card.sources.join(', ') })] })), card.related.length > 0 && (_jsxs("div", { className: css.kvItem, children: [_jsxs("span", { className: css.kvKey, children: [t(undefined, 'card.related'), ":"] }), _jsx("span", { children: card.related.map((related) => (_jsxs("button", { className: css.relatedLink, onClick: () => openFromSlug(related), children: ["[[", related, "]]"] }, related))) })] }))] }), _jsx(BodyText, { body: card.body, onOpen: openFromSlug })] }));
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
function KbsTab({ kbs, activeId, onSelect, onCreated }) {
    const [name, setName] = useState('');
    const [path, setPath] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
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
    return (_jsxs("div", { children: [error !== null && _jsx("div", { className: css.error, children: error }), kbs.length === 0 && _jsx("div", { className: css.empty, children: t(undefined, 'kbs.empty') }), kbs.map((kb) => (_jsxs("div", { className: kb.id === activeId ? css.kbRowActive : css.kbRow, onClick: () => onSelect(kb.id), children: [_jsxs("div", { className: css.kbName, children: [kb.name, kb.id === activeId && ' ✓'] }), _jsx("div", { className: css.kbMeta, children: t(undefined, 'kbs.stats', { total: kb.stats.total, sources: kb.stats.sourceCount }) }), _jsx("div", { className: css.kbPath, children: kb.path }), kb.description !== undefined && _jsx("div", { className: css.kbDesc, children: kb.description })] }, kb.id))), _jsxs("div", { className: css.kbForm, children: [_jsx("div", { className: css.kbFormTitle, children: t(undefined, 'kbs.add') }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.name'), value: name, onChange: (event) => setName(event.target.value) }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.path'), value: path, onChange: (event) => setPath(event.target.value) }), _jsx("input", { className: css.input, placeholder: t(undefined, 'kbs.description'), value: description, onChange: (event) => setDescription(event.target.value) }), _jsx("button", { className: css.run, disabled: busy || name.trim() === '', onClick: () => void create(), children: t(undefined, 'kbs.create') })] })] }));
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
        return (_jsxs("div", { children: [_jsx("div", { className: css.detailHeader, children: _jsx("button", { className: css.back, onClick: () => setCreating(null), children: t(undefined, 'card.cancel') }) }), _jsx("h2", { className: css.detailTitle, children: t(undefined, 'review.create.title') }), _jsxs("div", { className: css.editForm, children: [_jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.title'), _jsx("input", { className: css.input, value: draftTitle, onChange: (event) => setDraftTitle(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.desc'), _jsx("input", { className: css.input, value: draftDesc, onChange: (event) => setDraftDesc(event.target.value) })] }), _jsxs("label", { className: css.editLabel, children: ["type", _jsx("select", { className: css.select, value: draftType, onChange: (event) => setDraftType(event.target.value), children: ['concept', 'entity', 'source', 'query', 'comparison', 'synthesis'].map((type) => _jsx("option", { value: type, children: type }, type)) })] }), _jsxs("label", { className: css.editLabel, children: [t(undefined, 'card.body'), _jsx("textarea", { className: css.editorTextarea, rows: 12, value: draftBody, onChange: (event) => setDraftBody(event.target.value) })] }), _jsxs("div", { className: css.editActions, children: [_jsx("button", { className: css.run, disabled: savingDraft || draftTitle.trim() === '', onClick: () => void saveDraft(), children: savingDraft ? '…' : t(undefined, 'review.create.save') }), _jsx("button", { className: css.runSmall, onClick: () => setCreating(null), children: t(undefined, 'card.cancel') })] })] })] }));
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
    return (_jsxs("div", { className: css.panel, children: [_jsxs("div", { className: css.header, children: [_jsxs("h2", { className: css.title, children: ["\uD83D\uDCC7 ", t(undefined, 'panel.title')] }), _jsxs("div", { className: css.headerActions, children: [kbs.length > 0 && (_jsx("select", { className: css.select, value: kbId, onChange: (event) => selectKb(event.target.value), children: kbs.map((kb) => _jsx("option", { value: kb.id, children: kb.name }, kb.id)) })), _jsx("button", { className: css.close, title: t(undefined, 'close'), onClick: () => controller.close(), children: "\u2715" })] })] }), error !== null && _jsx("div", { className: css.error, children: t(undefined, 'error.load', { message: error }) }), lintResult !== null && _jsx("div", { className: css.lintResult, children: lintResult }), kbs.length === 0 ? (_jsx(KbsTab, { kbs: kbs, activeId: kbId, onSelect: selectKb, onCreated: loadKbs })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.tabs, children: [_jsx("button", { className: tab === 'cards' ? css.tabActive : css.tab, onClick: () => setTab('cards'), children: t(undefined, 'tab.cards') }), _jsx("button", { className: tab === 'sources' ? css.tabActive : css.tab, onClick: () => setTab('sources'), children: t(undefined, 'tab.sources') }), _jsx("button", { className: tab === 'code' ? css.tabActive : css.tab, onClick: () => setTab('code'), children: t(undefined, 'tab.code') }), _jsx("button", { className: tab === 'board' ? css.tabActive : css.tab, onClick: () => setTab('board'), children: t(undefined, 'tab.board') }), _jsx("button", { className: tab === 'review' ? css.tabActive : css.tab, onClick: () => setTab('review'), children: t(undefined, 'tab.review') }), _jsx("button", { className: tab === 'kbs' ? css.tabActive : css.tab, onClick: () => setTab('kbs'), children: t(undefined, 'tab.kbs') }), _jsx("span", { className: css.tabSpacer }), _jsx("button", { className: css.runSmall, onClick: () => void runLint(), children: t(undefined, 'lint.run') })] }), tab === 'cards' && (selected === null
                        ? _jsx(CardsTab, { kbId: kbId, onOpenCard: openCard })
                        : _jsx(CardDetail, { kbId: kbId, slug: selected.slug, onBack: closeCard, onOpenCard: openCard })), tab === 'sources' && _jsx(SourcesTab, { kbId: kbId, kbName: activeKb?.name ?? kbId }), tab === 'code' && _jsx(CodeTab, { kbId: kbId }), tab === 'board' && _jsx(LogBoard, { kbId: kbId }), tab === 'review' && _jsx(ReviewsTab, { kbId: kbId }), tab === 'kbs' && _jsx(KbsTab, { kbs: kbs, activeId: kbId, onSelect: selectKb, onCreated: loadKbs })] }))] }));
}
