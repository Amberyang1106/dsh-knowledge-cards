import { isManagedFrontmatterKey, parseFrontmatter, parseYamlPayload } from "./core/frontmatter.js";
import { searchCards } from "./core/search.js";
import { A as rebuildAggregates, D as purgeKb, E as purgeCard, L as writeCodeFile, M as resolveReview, N as restoreCard, O as readCard, P as restoreKb, S as listTrash, T as pendingSources, _ as listKbSummaries, a as createKb, b as listReviews, c as deleteCodeFile, f as getKb, g as listCodeFiles, h as listCards, i as createCard, k as readCodeFile, l as deleteKb, m as kbSummary, n as commitPages, p as importCards, s as deleteCard, t as addReview, u as editCard, x as listSources, y as listLogEntries } from "./store-Cago3cTl.js";
import { auditKb, buildDeepAuditPromptForKb } from "./host/audit.js";
import { lintKb } from "./host/lint.js";
import { applyLineage, buildLineagePrompt, listFieldCardMeta, readLineageProposals, scanLineage } from "./host/lineage.js";
import { runJevLineage } from "./host/jev.js";
import { compileRuleSet } from "./host/rules.js";
import { wikiAuditTool, wikiCardDeleteTool, wikiCardPurgeTool, wikiCardRestoreTool, wikiCodeListTool, wikiCodeReadTool, wikiCommitTool, wikiCreateKbTool, wikiEditCardTool, wikiImportCardsTool, wikiIngestTool, wikiKbDeleteTool, wikiKbPurgeTool, wikiKbRestoreTool, wikiKbsTool, wikiLineageProposeTool, wikiLintTool, wikiReadTool, wikiReviewSubmitTool, wikiReviewsTool, wikiSearchTool, wikiTrashListTool } from "./host/tools.js";
//#region src/host/routes.ts
/** Body cap: raised to fit code-file uploads (JSON base64/utf8 text). */
const MAX_BODY_BYTES = 10 << 20;
/** Per-file cap for code uploads. */
const MAX_CODE_FILE_BYTES = 5 << 20;
/** Preview cap for the panel content route. */
const MAX_CODE_PREVIEW_BYTES = 512e3;
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
function json(res, value, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(value));
}
function ok(res, value) {
	json(res, {
		ok: true,
		...value
	});
}
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		chunks.push(buffer);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) return null;
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
function queryParam(url, name) {
	return url.searchParams.get(name) ?? "";
}
function asString(value, fallback = "") {
	return typeof value === "string" ? value : fallback;
}
function asStringArray(value) {
	return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
/** Normalize one incoming page (agent-generated) into a PageInput. */
function normalizePage(value) {
	if (typeof value !== "object" || value === null) return null;
	const record = value;
	const type = asString(record.type).trim();
	const title = asString(record.title).trim();
	const body = asString(record.body);
	if (type === "" || title === "" || body === "") return null;
	return {
		type,
		title,
		description: record.description !== void 0 ? asString(record.description).trim() || void 0 : void 0,
		tags: asStringArray(record.tags),
		related: asStringArray(record.related),
		sources: asStringArray(record.sources),
		body,
		path: record.path !== void 0 ? asString(record.path).trim() || void 0 : void 0
	};
}
function registerKnowledgeRoutes(ctx) {
	const disposers = [
		{
			kind: "exact",
			path: "/api/dsh-knowledge/kbs",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method === "GET") {
					try {
						ok(res, { kbs: await listKbSummaries() });
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 500);
					}
					return;
				}
				if (req.method === "POST") {
					try {
						const body = await readJsonBody(req);
						ok(res, { kb: await kbSummary(await createKb({
							name: asString(body?.name),
							path: body?.path !== void 0 ? asString(body.path) : void 0,
							description: body?.description !== void 0 ? asString(body.description) : void 0
						})) });
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 400);
					}
					return;
				}
				json(res, { error: `method not allowed: ${req.method}` }, 405);
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/cards",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const kbId = queryParam(url, "kb");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const query = queryParam(url, "q");
					const type = queryParam(url, "type");
					const offset = Math.max(0, Number.parseInt(queryParam(url, "offset") || "0", 10) || 0);
					const limitRaw = Number.parseInt(queryParam(url, "limit") || "0", 10);
					const limit = limitRaw > 0 ? limitRaw : 100;
					let cards = await listCards(kb);
					if (type !== "" && type !== "all") cards = cards.filter((card) => card.type === type);
					let hits;
					if (query !== "") hits = searchCards(cards, query, limit, (card) => card.description ?? "");
					else hits = cards.map((card) => ({
						card,
						score: 0
					}));
					const page = hits.slice(offset, offset + limit);
					ok(res, {
						cards: page.map((hit) => hit.card),
						total: hits.length,
						offset,
						limit: page.length
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const kbId = queryParam(url, "kb");
					const slug = queryParam(url, "slug");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (slug === "") return json(res, {
						ok: false,
						error: "slug is required"
					}, 400);
					const card = await readCard(kb, slug);
					if (card === null) return json(res, {
						ok: false,
						error: `card not found: ${slug}`
					}, 404);
					ok(res, {
						card,
						frontmatter: parseFrontmatter(card.raw).frontmatter ?? {}
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/commit",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const pages = (Array.isArray(body?.pages) ? body.pages : []).map(normalizePage).filter((page) => page !== null);
					if (pages.length === 0) return json(res, {
						ok: false,
						error: "pages must be a non-empty array of {type,title,body,...}"
					}, 400);
					ok(res, { result: await commitPages(kb, pages, asStringArray(body?.sourceFiles)) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card/edit",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const slug = asString(body?.slug);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (slug === "") return json(res, {
						ok: false,
						error: "slug is required"
					}, 400);
					const fields = body ?? {};
					ok(res, { result: await editCard(kb, slug, {
						title: fields.title !== void 0 ? asString(fields.title) : void 0,
						description: fields.description !== void 0 ? asString(fields.description) : void 0,
						tags: fields.tags !== void 0 ? asStringArray(fields.tags) : void 0,
						related: fields.related !== void 0 ? asStringArray(fields.related) : void 0,
						sources: fields.sources !== void 0 ? asStringArray(fields.sources) : void 0,
						body: fields.body !== void 0 ? asString(fields.body) : void 0,
						frontmatterYaml: fields.frontmatterYaml !== void 0 ? asString(fields.frontmatterYaml) : void 0,
						frontmatter: fields.frontmatter !== void 0 && typeof fields.frontmatter === "object" && fields.frontmatter !== null ? fields.frontmatter : void 0
					}) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/log",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const kbId = queryParam(url, "kb");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const entries = await listLogEntries(kb);
					const action = queryParam(url, "action");
					ok(res, {
						entries: action !== "" && action !== "all" ? entries.filter((entry) => entry.action === action) : entries,
						total: entries.length
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/sources",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = queryParam(new URL(req.url ?? "/", "http://localhost"), "kb");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, {
						sources: await listSources(kb),
						pending: (await pendingSources(kb)).length
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lint",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { issues: await lintKb(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/import-cards",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const dir = asString(body?.dir);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (dir === "") return json(res, {
						ok: false,
						error: "dir is required"
					}, 400);
					ok(res, { result: await importCards(kb, dir) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/rebuild",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { rebuilt: await rebuildAggregates(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/code",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method === "GET") {
					try {
						const kbId = queryParam(new URL(req.url ?? "/", "http://localhost"), "kb");
						const kb = await getKb(kbId);
						if (kb === null) return json(res, {
							ok: false,
							error: `unknown knowledge base: ${kbId}`
						}, 404);
						ok(res, { files: await listCodeFiles(kb) });
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 500);
					}
					return;
				}
				if (req.method === "POST") {
					try {
						const body = await readJsonBody(req);
						const kbId = asString(body?.kb);
						const relPath = asString(body?.path);
						const content = asString(body?.content);
						const kb = await getKb(kbId);
						if (kb === null) return json(res, {
							ok: false,
							error: `unknown knowledge base: ${kbId}`
						}, 404);
						if (relPath === "" || content === "") return json(res, {
							ok: false,
							error: "path and content are required"
						}, 400);
						if (Buffer.byteLength(content, "utf8") > MAX_CODE_FILE_BYTES) return json(res, {
							ok: false,
							error: `code file too large (max 5 MB)`
						}, 413);
						ok(res, { file: await writeCodeFile(kb, relPath, content) });
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 400);
					}
					return;
				}
				json(res, { error: `method not allowed: ${req.method}` }, 405);
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/code/content",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const kbId = queryParam(url, "kb");
					const relPath = queryParam(url, "path");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const content = await readCodeFile(kb, relPath);
					if (Buffer.byteLength(content, "utf8") > MAX_CODE_PREVIEW_BYTES) return json(res, {
						ok: false,
						error: "file too large to preview (use wiki_code_read with a cap or open it locally)"
					}, 413);
					ok(res, {
						path: relPath,
						content
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/code/delete",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const relPath = asString(body?.path);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { deleted: await deleteCodeFile(kb, relPath) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/reviews",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method === "GET") {
					try {
						const url = new URL(req.url ?? "/", "http://localhost");
						const kbId = queryParam(url, "kb");
						const status = queryParam(url, "status");
						const kb = await getKb(kbId);
						if (kb === null) return json(res, {
							ok: false,
							error: `unknown knowledge base: ${kbId}`
						}, 404);
						const items = await listReviews(kb, status);
						ok(res, {
							items,
							pending: items.filter((item) => item.status === "pending").length
						});
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 500);
					}
					return;
				}
				if (req.method === "POST") {
					try {
						const body = await readJsonBody(req);
						const kbId = asString(body?.kb);
						const kind = asString(body?.kind);
						const kb = await getKb(kbId);
						if (kb === null) return json(res, {
							ok: false,
							error: `unknown knowledge base: ${kbId}`
						}, 404);
						if (![
							"contradiction",
							"duplicate",
							"missing-page",
							"suggestion"
						].includes(kind)) return json(res, {
							ok: false,
							error: "kind 必须是 contradiction|duplicate|missing-page|suggestion"
						}, 400);
						ok(res, { item: await addReview(kb, {
							kind,
							title: asString(body?.title),
							summary: asString(body?.summary),
							source: body?.source !== void 0 ? asString(body.source) : void 0,
							options: body?.options !== void 0 ? asStringArray(body.options) : void 0,
							searchQuery: body?.searchQuery !== void 0 ? asString(body.searchQuery) : void 0
						}) });
					} catch (error) {
						json(res, {
							ok: false,
							error: String(error.message ?? error)
						}, 400);
					}
					return;
				}
				json(res, { error: `method not allowed: ${req.method}` }, 405);
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/reviews/resolve",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const id = asString(body?.id);
					const status = asString(body?.status);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (status !== "resolved" && status !== "skipped") return json(res, {
						ok: false,
						error: "status 必须是 resolved|skipped"
					}, 400);
					const item = await resolveReview(kb, id, status, body?.resolution !== void 0 ? asString(body.resolution) : void 0);
					if (item === null) return json(res, {
						ok: false,
						error: `review item not found: ${id}`
					}, 404);
					ok(res, { item });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/audit",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { result: await auditKb(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/audit-prompt",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = queryParam(new URL(req.url ?? "/", "http://localhost"), "kb");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { prompt: await buildDeepAuditPromptForKb(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card/create",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const yaml = asString(body?.frontmatterYaml).trim();
					let parsedYaml = null;
					if (yaml !== "") {
						parsedYaml = parseYamlPayload(yaml);
						if (parsedYaml === null) return json(res, {
							ok: false,
							error: "frontmatterYaml 不是有效 YAML（需 key: value 结构）"
						}, 400);
					}
					const type = (parsedYaml !== null ? asString(parsedYaml.type) : asString(body?.type)).trim();
					const title = (parsedYaml !== null ? asString(parsedYaml.title) : asString(body?.title)).trim();
					if (type === "" || title === "") return json(res, {
						ok: false,
						error: "type and title are required（YAML 模式下写在 YAML 中）"
					}, 400);
					const description = parsedYaml !== null ? parsedYaml.description !== void 0 ? asString(parsedYaml.description)?.trim() || void 0 : void 0 : body?.description !== void 0 ? asString(body.description).trim() || void 0 : void 0;
					const yamlList = (value) => {
						if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter((item) => item !== "");
						if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter((item) => item !== "");
						return [];
					};
					const tags = parsedYaml !== null ? yamlList(parsedYaml.tags) : asStringArray(body?.tags);
					const related = parsedYaml !== null ? yamlList(parsedYaml.related) : asStringArray(body?.related);
					const sources = parsedYaml !== null ? yamlList(parsedYaml.sources) : asStringArray(body?.sources);
					const frontmatter = parsedYaml === null ? (() => {
						const raw = body?.frontmatter;
						if (raw === void 0 || raw === null || typeof raw !== "object" || Array.isArray(raw)) return void 0;
						const extra = {};
						for (const [key, value] of Object.entries(raw)) {
							if (isManagedFrontmatterKey(key) || value === null || value === void 0) continue;
							extra[key] = value;
						}
						return extra;
					})() : (() => {
						const extra = {};
						for (const [key, value] of Object.entries(parsedYaml)) if (!isManagedFrontmatterKey(key) && value !== null && value !== void 0) extra[key] = value;
						return extra;
					})();
					ok(res, { result: await createCard(kb, {
						type,
						title,
						description,
						tags,
						related,
						sources,
						body: asString(body?.body),
						frontmatter
					}) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card/delete",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const slug = asString(body?.slug);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (slug === "") return json(res, {
						ok: false,
						error: "slug is required"
					}, 400);
					ok(res, { deleted: await deleteCard(kb, slug) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card/restore",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const slug = asString(body?.slug);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (slug === "") return json(res, {
						ok: false,
						error: "slug is required"
					}, 400);
					ok(res, { restored: await restoreCard(kb, slug) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/card/purge",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const slug = asString(body?.slug);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					if (slug === "") return json(res, {
						ok: false,
						error: "slug is required"
					}, 400);
					ok(res, { purged: await purgeCard(kb, slug) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/kbs/delete",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					if (kbId === "") return json(res, {
						ok: false,
						error: "kb is required"
					}, 400);
					ok(res, { deleted: await deleteKb(kbId) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/kbs/restore",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					if (kbId === "") return json(res, {
						ok: false,
						error: "kb is required"
					}, 400);
					ok(res, { kb: await kbSummary((await restoreKb(kbId)).kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/kbs/purge",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					if (kbId === "") return json(res, {
						ok: false,
						error: "kb is required"
					}, 400);
					ok(res, { purged: await purgeKb(kbId) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 400);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/trash",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = queryParam(new URL(req.url ?? "/", "http://localhost"), "kb");
					ok(res, await listTrash(kbId !== "" ? kbId : void 0));
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/rules",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const url = new URL(req.url ?? "/", "http://localhost");
					const kbId = queryParam(url, "kb");
					const ruleSet = queryParam(url, "ruleSet");
					const status = queryParam(url, "status");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, await compileRuleSet(kb, {
						ruleSet: ruleSet !== "" ? ruleSet : void 0,
						status: status !== "" ? status : void 0
					}));
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/jev",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const apiKey = (process.env.TYPESAFE_API_KEY ?? "").trim();
					if (apiKey === "") return json(res, {
						ok: false,
						error: "jev-key-missing",
						detail: "未配置 TYPESAFE_API_KEY：到 https://console.typesafe.ai/keys 取 key，设置环境变量后重启 dsh web（插件只从环境变量读取，不落盘）"
					}, 503);
					ok(res, { result: await runJevLineage(kb, apiKey) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 502);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/scan",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { result: await scanLineage(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/llm-status",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const subagents = ctx.reflect.get("subagents", false);
					const methods = subagents === void 0 ? [] : Object.keys(subagents).filter((key) => typeof subagents[key] === "function");
					ok(res, {
						promptMode: true,
						spawnAvailable: typeof subagents?.startContinuable === "function",
						methods
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/run",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = asString((await readJsonBody(req))?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const cards = await listFieldCardMeta(kb);
					if (cards.length === 0) return json(res, {
						ok: false,
						error: "该知识库没有字段卡（type=field），无需血缘补齐"
					}, 400);
					ok(res, {
						mode: "prompt",
						prompt: buildLineagePrompt(kb, cards),
						requestedAt: (/* @__PURE__ */ new Date()).toISOString(),
						fieldCards: cards.length
					});
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/proposals",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "GET") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const kbId = queryParam(new URL(req.url ?? "/", "http://localhost"), "kb");
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					ok(res, { proposals: await readLineageProposals(kb) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		},
		{
			kind: "exact",
			path: "/api/dsh-knowledge/lineage/apply",
			handler: async (req, res) => {
				if (!isLoopbackRequest(req)) return json(res, { error: "forbidden: loopback-only" }, 403);
				if (req.method !== "POST") return json(res, { error: `method not allowed: ${req.method}` }, 405);
				try {
					const body = await readJsonBody(req);
					const kbId = asString(body?.kb);
					const kb = await getKb(kbId);
					if (kb === null) return json(res, {
						ok: false,
						error: `unknown knowledge base: ${kbId}`
					}, 404);
					const accepted = (Array.isArray(body?.accepted) ? body.accepted : []).filter((entry) => typeof entry === "object" && entry !== null);
					if (accepted.length === 0) return json(res, {
						ok: false,
						error: "accepted 不能为空"
					}, 400);
					ok(res, { result: await applyLineage(kb, accepted.map((entry) => ({
						slug: asString(entry.slug),
						title: asString(entry.title),
						source: "manual",
						confidence: "high",
						evidence: asString(entry.evidence),
						relations: typeof entry.relations === "object" && entry.relations !== null ? entry.relations : {},
						metadata: typeof entry.metadata === "object" && entry.metadata !== null ? entry.metadata : void 0
					})).filter((entry) => entry.slug !== "")) });
				} catch (error) {
					json(res, {
						ok: false,
						error: String(error.message ?? error)
					}, 500);
				}
			}
		}
	].map((route) => ctx.webServer.register(route));
	return () => {
		for (const dispose of disposers) dispose();
	};
}
//#endregion
//#region src/index.ts
/** Required services: the route registry, the tool registry, and the prompt band. */
const inject = [
	"webServer",
	"tools",
	"systemPrompt"
];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 240;
/** Model-facing announcement: plugin presence, tools, and cooperation rules. */
const KNOWLEDGE_CARDS_GUIDANCE = "本机已安装 dsh-knowledge-cards 插件（知识卡片，基于 Karpathy / llm_wiki 三层架构）：侧边栏「知识卡片」入口，中央列展示知识库面板（卡片墙 / 资料 / 代码 / 看板 / 审核 / 知识库管理）；宿主经 /api/dsh-knowledge/* 路由读写本地知识库（配置与缓存默认在 ~/.dsh/knowledge-cards）。能力：wiki_kbs 列出知识库；wiki_create_kb 新建知识库；wiki_search 检索相关卡片摘要；wiki_read 读取卡片全文（frontmatter + Markdown 正文 + [[wikilink]]）；wiki_edit_card 手动编辑卡片（替换语义、记 edit 日志、面板「看板」可见）；wiki_ingest 摄入资料（两步法第一步：返回资料全文与 schema/purpose/索引上下文，供分析；分析发现矛盾/疑似重复/缺失页面/值得深挖的点时，用 wiki_review_submit 提交审核项）；wiki_commit 写入 agent 生成的卡片（自动校验 frontmatter、维护 index.md / log.md / overview.md、SHA256 增量缓存）；wiki_import_cards 批量导入已切好的卡片（纯确定性，不耗 LLM）；wiki_lint 健康检查（断链/孤立页/缺摘要）；wiki_audit 主动审核现有知识库（确定性扫描：重复卡片/断链缺失页自动入审核队列 + 返回深度审核指令供 agent 做语义级审核）；wiki_review_submit / wiki_reviews 提交与查看审核队列（llm_wiki 异步人机协作：预定义操作 + 预生成搜索查询，用户稍后在面板「审核」tab 处理，不阻塞摄入）；wiki_code_list / wiki_code_read 列出与读取知识库 code/ 目录下的代码文件（用户上传，原样保存、不经 LLM 处理，项目需要参考脚本/SQL/配置时用）。删除与回收站：用户可在面板「卡片」标签直接手写创建卡片（新建卡片按钮）；wiki_card_delete / wiki_kb_delete 是软删除——卡片移入 <kb>/.trash/cards/、知识库（含其审核队列）移入 ~/.dsh/knowledge-cards/.trash/kbs/，删除即刻从搜索/lint/索引消失，但可用 wiki_card_restore / wiki_kb_restore 或面板「回收站」标签恢复；wiki_trash_list 查看回收站；wiki_card_purge / wiki_kb_purge 才是物理删除（不可恢复），仅在用户明确要求永久删除时使用。字段卡与血缘：type=field 的卡片表示「业务语义字段」（一张卡 = 一个字段，其各系统物理实现写在卡内），结构化元数据在 frontmatter（field_kind / data_type / aggregation / unit / source_table / source_field / aliases / status / review_status / evidence_level / domain / workstream …），血缘在 depends_on / used_by / implemented_in / governed_by（面板对 field 卡提供 5 分区结构化表单）。用户要求「补全/维护字段血缘」时：先 wiki_search + wiki_read 读相关字段卡（含正文 SQL 与口径）→ 给出候选边（from / to / 关系 / 证据 / 置信度）→ 用 wiki_edit_card 的 relations 参数（按 key 替换）写入、metadata 参数补元数据；AI 推断出的内容必须显式标注 metadata.review_status=inferred 与 evidence_level=inferred（严禁伪造 confirmed），需人工判断的点用 wiki_review_submit 入审核队列；写完用 wiki_lint 校验血缘（悬空 depends_on / 不对称 used_by / 自环与环）。协作方式：做任何项目（包括分摊监测、GAAP 对账等财务任务）需要领域知识时，先 wiki_search 查相关卡片，再 wiki_read 把命中卡片全文作为上下文；需要参考沉淀的代码时用 wiki_code_list / wiki_code_read；有新资料要沉淀时，把资料放进知识库 raw/sources/ 后用 wiki_ingest → wiki_commit 两步摄入（发现需要人工判断的点先 wiki_review_submit 提交审核，不擅自下结论）；定期 wiki_lint 保持知识库健康。卡片库是人类策展、agent 维护——原始资料与代码永远只读。用户提到「知识卡片 / 知识库 / wiki / KM / 参考知识」时即指本插件，请据此协作。";
/**
* Mount the knowledge-card routes, agent tools, and prompt section.
* @param ctx - context carrying webServer, tools, systemPrompt.
*/
function apply(ctx) {
	ctx.effect(() => registerKnowledgeRoutes(ctx), "dsh-knowledge-cards: /api/dsh-knowledge routes");
	ctx.effect(() => {
		const disposers = [
			wikiKbsTool(),
			wikiSearchTool(),
			wikiReadTool(),
			wikiIngestTool(),
			wikiCommitTool(),
			wikiLintTool(),
			wikiCreateKbTool(),
			wikiImportCardsTool(),
			wikiCodeListTool(),
			wikiCodeReadTool(),
			wikiEditCardTool(),
			wikiReviewSubmitTool(),
			wikiReviewsTool(),
			wikiAuditTool(),
			wikiCardDeleteTool(),
			wikiCardRestoreTool(),
			wikiCardPurgeTool(),
			wikiKbDeleteTool(),
			wikiKbRestoreTool(),
			wikiKbPurgeTool(),
			wikiTrashListTool(),
			wikiLineageProposeTool()
		].map((tool) => ctx.tools.register(tool));
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, "dsh-knowledge-cards: wiki_* tools");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "plugin:knowledge-cards",
		order: SECTION_ORDER,
		text: KNOWLEDGE_CARDS_GUIDANCE
	}), "dsh-knowledge-cards: prompt section");
}
//#endregion
export { KNOWLEDGE_CARDS_GUIDANCE, apply, inject };
