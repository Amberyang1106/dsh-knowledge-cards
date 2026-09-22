/**
 * /api/dsh-knowledge/* route family: KB CRUD, card listing/search/detail,
 * source status, commit, lint. Loopback-fenced like dsh-ssh /
 * dsh-allocation-monitor (the routes read local files the web GUI owns, so a
 * LAN-exposed dsh web must not serve them to unpaired devices).
 * @module dsh-knowledge-cards/host/routes
 */
import { isManagedFrontmatterKey, parseFrontmatter, parseYamlPayload } from "../core/frontmatter.js";
import { searchCards } from "../core/search.js";
import { auditKb, buildDeepAuditPromptForKb } from "./audit.js";
import { lintKb } from "./lint.js";
import { applyLineage, buildLineagePrompt, listFieldCardMeta, readLineageProposals, scanLineage } from "./lineage.js";
import { compileRuleSet } from "./rules.js";
import { addReview, commitPages, createCard, createKb, deleteCard, deleteCodeFile, deleteKb, editCard, getKb, importCards, kbSummary, listCards, listCodeFiles, listKbSummaries, listLogEntries, listReviews, listSources, listTrash, pendingSources, purgeCard, purgeKb, readCard, readCodeFile, rebuildAggregates, resolveReview, restoreCard, restoreKb, writeCodeFile, } from "./store.js";
/** Body cap: raised to fit code-file uploads (JSON base64/utf8 text). */
const MAX_BODY_BYTES = 10 << 20;
/** Per-file cap for code uploads. */
const MAX_CODE_FILE_BYTES = 5 << 20;
/** Preview cap for the panel content route. */
const MAX_CODE_PREVIEW_BYTES = 500 << 10;
function isLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL(`http://${host}`);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
function json(res, value, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
}
function ok(res, value) {
    json(res, { ok: true, ...value });
}
async function readJsonBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        chunks.push(buffer);
        total += buffer.length;
        if (total > MAX_BODY_BYTES)
            return null;
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text === '')
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function queryParam(url, name) {
    return url.searchParams.get(name) ?? '';
}
function asString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
/** Normalize one incoming page (agent-generated) into a PageInput. */
function normalizePage(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const record = value;
    const type = asString(record.type).trim();
    const title = asString(record.title).trim();
    const body = asString(record.body);
    if (type === '' || title === '' || body === '')
        return null;
    return {
        type,
        title,
        description: record.description !== undefined ? asString(record.description).trim() || undefined : undefined,
        tags: asStringArray(record.tags),
        related: asStringArray(record.related),
        sources: asStringArray(record.sources),
        body,
        path: record.path !== undefined ? asString(record.path).trim() || undefined : undefined,
    };
}
export function registerKnowledgeRoutes(ctx) {
    const routes = [
        // ------------------------------------------------------------ KB list + create
        // One handler per path — the webserver keyed route registry rejects
        // duplicate (kind, path), so GET and POST dispatch by method here.
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/kbs',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method === 'GET') {
                    try {
                        ok(res, { kbs: await listKbSummaries() });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 500);
                    }
                    return;
                }
                if (req.method === 'POST') {
                    try {
                        const body = (await readJsonBody(req));
                        const kb = await createKb({
                            name: asString(body?.name),
                            path: body?.path !== undefined ? asString(body.path) : undefined,
                            description: body?.description !== undefined ? asString(body.description) : undefined,
                        });
                        ok(res, { kb: await kbSummary(kb) });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 400);
                    }
                    return;
                }
                json(res, { error: `method not allowed: ${req.method}` }, 405);
            },
        },
        // ------------------------------------------------------------ card list / search
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/cards',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const query = queryParam(url, 'q');
                    const type = queryParam(url, 'type');
                    const offset = Math.max(0, Number.parseInt(queryParam(url, 'offset') || '0', 10) || 0);
                    const limitRaw = Number.parseInt(queryParam(url, 'limit') || '0', 10);
                    const limit = limitRaw > 0 ? limitRaw : 100;
                    let cards = await listCards(kb);
                    if (type !== '' && type !== 'all') {
                        cards = cards.filter((card) => card.type === type);
                    }
                    let hits;
                    if (query !== '') {
                        hits = searchCards(cards, query, limit, (card) => card.description ?? '');
                    }
                    else {
                        hits = cards.map((card) => ({ card, score: 0 }));
                    }
                    const page = hits.slice(offset, offset + limit);
                    ok(res, { cards: page.map((hit) => hit.card), total: hits.length, offset, limit: page.length });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ card detail
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const slug = queryParam(url, 'slug');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (slug === '')
                        return json(res, { ok: false, error: 'slug is required' }, 400);
                    const card = await readCard(kb, slug);
                    if (card === null)
                        return json(res, { ok: false, error: `card not found: ${slug}` }, 404);
                    // Also hand back the parsed frontmatter object so structured editors
                    // (field cards) can prefill without a client-side YAML parser.
                    ok(res, { card, frontmatter: parseFrontmatter(card.raw).frontmatter ?? {} });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ commit pages
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/commit',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const pages = (Array.isArray(body?.pages) ? body.pages : []).map(normalizePage).filter((page) => page !== null);
                    if (pages.length === 0)
                        return json(res, { ok: false, error: 'pages must be a non-empty array of {type,title,body,...}' }, 400);
                    const sourceFiles = asStringArray(body?.sourceFiles);
                    const result = await commitPages(kb, pages, sourceFiles);
                    ok(res, { result });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ card edit (manual)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card/edit',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const slug = asString(body?.slug);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (slug === '')
                        return json(res, { ok: false, error: 'slug is required' }, 400);
                    const fields = (body ?? {});
                    const result = await editCard(kb, slug, {
                        title: fields.title !== undefined ? asString(fields.title) : undefined,
                        description: fields.description !== undefined ? asString(fields.description) : undefined,
                        tags: fields.tags !== undefined ? asStringArray(fields.tags) : undefined,
                        related: fields.related !== undefined ? asStringArray(fields.related) : undefined,
                        sources: fields.sources !== undefined ? asStringArray(fields.sources) : undefined,
                        body: fields.body !== undefined ? asString(fields.body) : undefined,
                        frontmatterYaml: fields.frontmatterYaml !== undefined ? asString(fields.frontmatterYaml) : undefined,
                        frontmatter: fields.frontmatter !== undefined && typeof fields.frontmatter === 'object' && fields.frontmatter !== null
                            ? fields.frontmatter
                            : undefined,
                    });
                    ok(res, { result });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ modification log (看板)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/log',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const entries = await listLogEntries(kb);
                    const action = queryParam(url, 'action');
                    const filtered = action !== '' && action !== 'all' ? entries.filter((entry) => entry.action === action) : entries;
                    ok(res, { entries: filtered, total: entries.length });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ source status
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/sources',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { sources: await listSources(kb), pending: (await pendingSources(kb)).length });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ lint
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lint',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { issues: await lintKb(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ bulk import cards
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/import-cards',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const dir = asString(body?.dir);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (dir === '')
                        return json(res, { ok: false, error: 'dir is required' }, 400);
                    ok(res, { result: await importCards(kb, dir) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ rebuild aggregates
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/rebuild',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { rebuilt: await rebuildAggregates(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ code list + write (upload)
        // One handler per path (the webserver rejects duplicate (kind, path));
        // GET lists, POST writes — dispatched by method.
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/code',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method === 'GET') {
                    try {
                        const url = new URL(req.url ?? '/', 'http://localhost');
                        const kbId = queryParam(url, 'kb');
                        const kb = await getKb(kbId);
                        if (kb === null)
                            return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                        ok(res, { files: await listCodeFiles(kb) });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 500);
                    }
                    return;
                }
                if (req.method === 'POST') {
                    try {
                        const body = (await readJsonBody(req));
                        const kbId = asString(body?.kb);
                        const relPath = asString(body?.path);
                        const content = asString(body?.content);
                        const kb = await getKb(kbId);
                        if (kb === null)
                            return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                        if (relPath === '' || content === '')
                            return json(res, { ok: false, error: 'path and content are required' }, 400);
                        if (Buffer.byteLength(content, 'utf8') > MAX_CODE_FILE_BYTES) {
                            return json(res, { ok: false, error: `code file too large (max ${MAX_CODE_FILE_BYTES >> 20} MB)` }, 413);
                        }
                        ok(res, { file: await writeCodeFile(kb, relPath, content) });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 400);
                    }
                    return;
                }
                json(res, { error: `method not allowed: ${req.method}` }, 405);
            },
        },
        // ------------------------------------------------------------ code content (preview)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/code/content',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const relPath = queryParam(url, 'path');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const content = await readCodeFile(kb, relPath);
                    if (Buffer.byteLength(content, 'utf8') > MAX_CODE_PREVIEW_BYTES) {
                        return json(res, { ok: false, error: 'file too large to preview (use wiki_code_read with a cap or open it locally)' }, 413);
                    }
                    ok(res, { path: relPath, content });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ code delete
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/code/delete',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const relPath = asString(body?.path);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { deleted: await deleteCodeFile(kb, relPath) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ review queue
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/reviews',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method === 'GET') {
                    try {
                        const url = new URL(req.url ?? '/', 'http://localhost');
                        const kbId = queryParam(url, 'kb');
                        const status = queryParam(url, 'status');
                        const kb = await getKb(kbId);
                        if (kb === null)
                            return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                        const items = await listReviews(kb, status);
                        ok(res, { items, pending: items.filter((item) => item.status === 'pending').length });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 500);
                    }
                    return;
                }
                if (req.method === 'POST') {
                    try {
                        const body = (await readJsonBody(req));
                        const kbId = asString(body?.kb);
                        const kind = asString(body?.kind);
                        const kb = await getKb(kbId);
                        if (kb === null)
                            return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                        if (!['contradiction', 'duplicate', 'missing-page', 'suggestion'].includes(kind)) {
                            return json(res, { ok: false, error: 'kind 必须是 contradiction|duplicate|missing-page|suggestion' }, 400);
                        }
                        const item = await addReview(kb, {
                            kind,
                            title: asString(body?.title),
                            summary: asString(body?.summary),
                            source: body?.source !== undefined ? asString(body.source) : undefined,
                            options: body?.options !== undefined ? asStringArray(body.options) : undefined,
                            searchQuery: body?.searchQuery !== undefined ? asString(body.searchQuery) : undefined,
                        });
                        ok(res, { item });
                    }
                    catch (error) {
                        json(res, { ok: false, error: String(error.message ?? error) }, 400);
                    }
                    return;
                }
                json(res, { error: `method not allowed: ${req.method}` }, 405);
            },
        },
        // ------------------------------------------------------------ review resolve
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/reviews/resolve',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const id = asString(body?.id);
                    const status = asString(body?.status);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (status !== 'resolved' && status !== 'skipped') {
                        return json(res, { ok: false, error: 'status 必须是 resolved|skipped' }, 400);
                    }
                    const item = await resolveReview(kb, id, status, body?.resolution !== undefined ? asString(body.resolution) : undefined);
                    if (item === null)
                        return json(res, { ok: false, error: `review item not found: ${id}` }, 404);
                    ok(res, { item });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ audit existing KB
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/audit',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { result: await auditKb(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ deep-audit prompt (no side effects)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/audit-prompt',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { prompt: await buildDeepAuditPromptForKb(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ card create (manual, panel form)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card/create',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    // Rule cards (and any structured card) may carry their whole
                    // frontmatter as one canonical YAML payload — single source of truth
                    // for managed + extra keys; no client-side YAML parsing needed.
                    const yaml = asString(body?.frontmatterYaml).trim();
                    let parsedYaml = null;
                    if (yaml !== '') {
                        parsedYaml = parseYamlPayload(yaml);
                        if (parsedYaml === null)
                            return json(res, { ok: false, error: 'frontmatterYaml 不是有效 YAML（需 key: value 结构）' }, 400);
                    }
                    const type = (parsedYaml !== null ? asString(parsedYaml.type) : asString(body?.type)).trim();
                    const title = (parsedYaml !== null ? asString(parsedYaml.title) : asString(body?.title)).trim();
                    if (type === '' || title === '')
                        return json(res, { ok: false, error: 'type and title are required（YAML 模式下写在 YAML 中）' }, 400);
                    const description = parsedYaml !== null
                        ? (parsedYaml.description !== undefined ? asString(parsedYaml.description)?.trim() || undefined : undefined)
                        : (body?.description !== undefined ? asString(body.description).trim() || undefined : undefined);
                    const yamlList = (value) => {
                        if (Array.isArray(value))
                            return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter((item) => item !== '');
                        if (typeof value === 'string')
                            return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
                        return [];
                    };
                    const tags = parsedYaml !== null ? yamlList(parsedYaml.tags) : asStringArray(body?.tags);
                    const related = parsedYaml !== null ? yamlList(parsedYaml.related) : asStringArray(body?.related);
                    const sources = parsedYaml !== null ? yamlList(parsedYaml.sources) : asStringArray(body?.sources);
                    const frontmatter = parsedYaml === null
                        ? (() => {
                            // Structured (non-YAML) authoring — the field form posts a
                            // parsed object of extra keys; managed keys stay in their fields.
                            const raw = body?.frontmatter;
                            if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw))
                                return undefined;
                            const extra = {};
                            for (const [key, value] of Object.entries(raw)) {
                                if (isManagedFrontmatterKey(key) || value === null || value === undefined)
                                    continue;
                                extra[key] = value;
                            }
                            return extra;
                        })()
                        : (() => {
                            const extra = {};
                            for (const [key, value] of Object.entries(parsedYaml)) {
                                if (!isManagedFrontmatterKey(key) && value !== null && value !== undefined)
                                    extra[key] = value;
                            }
                            return extra;
                        })();
                    const result = await createCard(kb, {
                        type,
                        title,
                        description,
                        tags,
                        related,
                        sources,
                        body: asString(body?.body),
                        frontmatter,
                    });
                    ok(res, { result });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ card delete / restore / purge
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card/delete',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const slug = asString(body?.slug);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (slug === '')
                        return json(res, { ok: false, error: 'slug is required' }, 400);
                    ok(res, { deleted: await deleteCard(kb, slug) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card/restore',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const slug = asString(body?.slug);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (slug === '')
                        return json(res, { ok: false, error: 'slug is required' }, 400);
                    ok(res, { restored: await restoreCard(kb, slug) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/card/purge',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const slug = asString(body?.slug);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    if (slug === '')
                        return json(res, { ok: false, error: 'slug is required' }, 400);
                    ok(res, { purged: await purgeCard(kb, slug) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ knowledge-base delete / restore / purge
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/kbs/delete',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    if (kbId === '')
                        return json(res, { ok: false, error: 'kb is required' }, 400);
                    ok(res, { deleted: await deleteKb(kbId) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/kbs/restore',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    if (kbId === '')
                        return json(res, { ok: false, error: 'kb is required' }, 400);
                    const result = await restoreKb(kbId);
                    ok(res, { kb: await kbSummary(result.kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/kbs/purge',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    if (kbId === '')
                        return json(res, { ok: false, error: 'kb is required' }, 400);
                    ok(res, { purged: await purgeKb(kbId) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 400);
                }
            },
        },
        // ------------------------------------------------------------ recycle bin listing
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/trash',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    ok(res, await listTrash(kbId !== '' ? kbId : undefined));
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ rule set compile (structured rule cards)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/rules',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const ruleSet = queryParam(url, 'ruleSet');
                    const status = queryParam(url, 'status');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, await compileRuleSet(kb, {
                        ruleSet: ruleSet !== '' ? ruleSet : undefined,
                        status: status !== '' ? status : undefined,
                    }));
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        // ------------------------------------------------------------ lineage assist (panel button)
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lineage/scan',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { result: await scanLineage(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lineage/llm-status',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    // Informational only: spawning a subagent needs a parent Agent (an
                    // agent turn) which an HTTP route cannot supply, so the AI branch
                    // works by handing a prompt to the user's session. The service is
                    // read through the reflection API because cordis forbids plain
                    // ctx.<name> access for undeclared services.
                    const subagents = ctx.reflect.get('subagents', false);
                    const methods = subagents === undefined ? [] : Object.keys(subagents).filter((key) => typeof subagents[key] === 'function');
                    ok(res, {
                        promptMode: true,
                        spawnAvailable: typeof subagents?.startContinuable === 'function',
                        methods,
                    });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lineage/run',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const cards = await listFieldCardMeta(kb);
                    if (cards.length === 0)
                        return json(res, { ok: false, error: '该知识库没有字段卡（type=field），无需血缘补齐' }, 400);
                    // In-session execution: hand back the prepared prompt for the panel to
                    // pass to the user's session. The agent reads the field cards and
                    // parks proposals via wiki_lineage_propose; the panel polls
                    // /lineage/proposals and merges them into the same preview.
                    ok(res, {
                        mode: 'prompt',
                        prompt: buildLineagePrompt(kb, cards),
                        requestedAt: new Date().toISOString(),
                        fieldCards: cards.length,
                    });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lineage/proposals',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'GET')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const url = new URL(req.url ?? '/', 'http://localhost');
                    const kbId = queryParam(url, 'kb');
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    ok(res, { proposals: await readLineageProposals(kb) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-knowledge/lineage/apply',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req))
                    return json(res, { error: 'forbidden: loopback-only' }, 403);
                if (req.method !== 'POST')
                    return json(res, { error: `method not allowed: ${req.method}` }, 405);
                try {
                    const body = (await readJsonBody(req));
                    const kbId = asString(body?.kb);
                    const kb = await getKb(kbId);
                    if (kb === null)
                        return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404);
                    const rawAccepted = Array.isArray(body?.accepted) ? body.accepted : [];
                    const accepted = rawAccepted.filter((entry) => typeof entry === 'object' && entry !== null);
                    if (accepted.length === 0)
                        return json(res, { ok: false, error: 'accepted 不能为空' }, 400);
                    const proposals = accepted.map((entry) => ({
                        slug: asString(entry.slug),
                        title: asString(entry.title),
                        source: 'manual',
                        confidence: 'high',
                        evidence: asString(entry.evidence),
                        relations: (typeof entry.relations === 'object' && entry.relations !== null ? entry.relations : {}),
                        metadata: (typeof entry.metadata === 'object' && entry.metadata !== null ? entry.metadata : undefined),
                    })).filter((entry) => entry.slug !== '');
                    ok(res, { result: await applyLineage(kb, proposals) });
                }
                catch (error) {
                    json(res, { ok: false, error: String(error.message ?? error) }, 500);
                }
            },
        },
    ];
    const disposers = routes.map((route) => ctx.webServer.register(route));
    return () => { for (const dispose of disposers)
        dispose(); };
}
