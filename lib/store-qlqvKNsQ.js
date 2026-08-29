import { parseFrontmatter, serializePage, slugFromTitle } from "./core/frontmatter.js";
import { createHash, randomUUID } from "node:crypto";
import { promises } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
//#region src/core/types.ts
/** Directory (wiki-relative) a page type maps to by default. */
const TYPE_DIRS = {
	entity: "entities",
	concept: "concepts",
	source: "sources",
	query: "queries",
	comparison: "comparisons",
	synthesis: "synthesis"
};
/** Default predefined options per kind (llm_wiki constrains actions). */
const REVIEW_OPTIONS = {
	contradiction: [
		"创建页面",
		"深度研究",
		"跳过"
	],
	duplicate: ["合并页面", "跳过"],
	"missing-page": [
		"创建页面",
		"深度研究",
		"跳过"
	],
	suggestion: [
		"创建页面",
		"深度研究",
		"跳过"
	]
};
//#endregion
//#region src/host/store.ts
/**
* Knowledge-base store (host side): multi-KB config, llm_wiki directory
* structure seeding, card listing/reading, deterministic commit maintenance
* (index.md / log.md / overview.md are app-maintained, never LLM-rewritten —
* llm_wiki's rule), and the SHA256 incremental ingest cache.
*
* Layout of one KB (Karpathy / llm_wiki three layers):
*   <path>/purpose.md            why this wiki exists
*   <path>/schema.md             page types + conventions
*   <path>/raw/sources/          immutable source documents
*   <path>/wiki/index.md         content catalog (auto)
*   <path>/wiki/log.md           chronological activity log (auto)
*   <path>/wiki/overview.md      global summary (auto)
*   <path>/wiki/<type-dirs>/     entity/concept/source/query/... cards
*
* Config + cache live in $DSH_KNOWLEDGE_CARDS_ROOT (default ~/.dsh/knowledge-cards).
* @module dsh-knowledge-cards/host/store
*/
/** Config/cache root for the plugin. Override via env for tests. */
function configRoot() {
	return process.env.DSH_KNOWLEDGE_CARDS_ROOT ?? join(homedir(), ".dsh", "knowledge-cards");
}
const KBS_FILE = "kbs.json";
const CACHE_FILE = "cache.json";
const WIKI_AGGREGATES = /* @__PURE__ */ new Set([
	"index.md",
	"log.md",
	"overview.md"
]);
async function pathExists(path) {
	try {
		await promises.access(path);
		return true;
	} catch {
		return false;
	}
}
async function readText(path) {
	try {
		return await promises.readFile(path, "utf8");
	} catch {
		return null;
	}
}
async function writeTextAtomic(path, text) {
	await promises.mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await promises.writeFile(tmp, text, "utf8");
	await promises.rename(tmp, path);
}
/** Recursively list files under dir as forward-slash relative paths. */
async function walkFiles(dir) {
	const results = [];
	async function walk(current) {
		let entries;
		try {
			entries = await promises.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) await walk(full);
			else if (entry.isFile()) results.push(relative(dir, full).split(sep).join("/"));
		}
	}
	await walk(dir);
	return results.sort();
}
function sha256Of(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}
function today() {
	const now = /* @__PURE__ */ new Date();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}
async function loadConfig() {
	const text = await readText(join(configRoot(), KBS_FILE));
	if (text === null) return { kbs: [] };
	try {
		const parsed = JSON.parse(text);
		return { kbs: Array.isArray(parsed.kbs) ? parsed.kbs : [] };
	} catch {
		return { kbs: [] };
	}
}
async function saveConfig(config) {
	await writeTextAtomic(join(configRoot(), KBS_FILE), JSON.stringify(config, null, 2));
}
async function listKbs() {
	return (await loadConfig()).kbs;
}
async function getKb(id) {
	return (await loadConfig()).kbs.find((kb) => kb.id === id) ?? null;
}
function defaultKbId() {
	return process.env.DSH_KNOWLEDGE_CARDS_KB ?? "";
}
function slugifyId(name) {
	const slug = name.toLowerCase().trim().replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
	return slug === "" ? `kb-${Date.now()}` : slug;
}
/** Seed the three-layer structure for a KB directory (idempotent). */
async function ensureKbStructure(kbPath) {
	const raw = join(kbPath, "raw", "sources");
	const code = join(kbPath, "code");
	const wiki = join(kbPath, "wiki");
	for (const dir of [
		raw,
		code,
		wiki,
		...Object.values(TYPE_DIRS).map((sub) => join(wiki, sub))
	]) await promises.mkdir(dir, { recursive: true });
	const seeds = [
		[join(kbPath, "schema.md"), `# Wiki Schema

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| entity | wiki/entities/ | Named things (people, tools, organizations, datasets) |
| concept | wiki/concepts/ | Ideas, techniques, phenomena, frameworks |
| source | wiki/sources/ | Papers, articles, talks, books, blog posts |
| query | wiki/queries/ | Open questions under active investigation |
| comparison | wiki/comparisons/ | Side-by-side analysis of related entities |
| synthesis | wiki/synthesis/ | Cross-cutting summaries and conclusions |
| overview | wiki/ | High-level project summary (one per project) |

## Naming Conventions

- Files: kebab-case.md; CJK titles keep the CJK characters.
- Entities: match the official name where possible.
- Concepts: descriptive noun phrases.
- Sources: author-year-slug.md.

## Frontmatter

All pages must include YAML frontmatter: type, title, tags, related (bare
slugs), sources (source filenames), created, updated. Use [[wikilink]] syntax
in the body for cross-references. Every entity and concept should appear in
wiki/index.md.

## Contradiction Handling

When sources contradict each other, note the contradiction in the relevant
concept/entity page and open a query page tracking the open question.
`],
		[join(kbPath, "purpose.md"), `# Project Purpose

## Goal

<!-- What are you trying to understand or build? -->

## Key Questions

1.

## Scope

**In scope:** -
**Out of scope:** -
`],
		[join(wiki, "index.md"), `# 索引

<!-- 由 dsh-knowledge-cards 自动维护，请勿手改。 -->
`],
		[join(wiki, "log.md"), `# 日志

`],
		[join(wiki, "overview.md"), `# 概览

<!-- 由 dsh-knowledge-cards 自动生成。 -->
`]
	];
	for (const [file, content] of seeds) if (!await pathExists(file)) await writeTextAtomic(file, content);
}
async function createKb(input) {
	const name = input.name.trim();
	if (name === "") throw new Error("knowledge base name is required");
	const id = slugifyId(name);
	const config = await loadConfig();
	if (config.kbs.some((kb) => kb.id === id)) throw new Error(`knowledge base "${id}" already exists`);
	const kbPath = input.path !== void 0 && input.path.trim() !== "" ? resolve(input.path.trim()) : join(configRoot(), "kbs", id);
	await promises.mkdir(kbPath, { recursive: true });
	await ensureKbStructure(kbPath);
	const kb = {
		id,
		name,
		path: kbPath,
		description: input.description?.trim() || void 0,
		createdAt: Date.now()
	};
	config.kbs.push(kb);
	await saveConfig(config);
	return kb;
}
function wikiDir(kb) {
	return join(kb.path, "wiki");
}
/** Parse one wiki file into CardMeta (null when it is an aggregate file). */
async function readCardFile(kb, relPath) {
	if (WIKI_AGGREGATES.has(basename(relPath))) return null;
	if (extname(relPath) !== ".md") return null;
	const raw = await readText(join(wikiDir(kb), relPath));
	if (raw === null) return null;
	const fm = parseFrontmatter(raw).frontmatter ?? {};
	const type = String(fm.type ?? "unknown");
	const title = String(fm.title ?? basename(relPath, ".md"));
	const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
	const related = Array.isArray(fm.related) ? fm.related.map(String) : [];
	const sources = Array.isArray(fm.sources) ? fm.sources.map(String) : [];
	return {
		slug: basename(relPath, ".md"),
		path: relPath,
		type,
		title,
		description: fm.description !== void 0 ? String(fm.description) : void 0,
		tags,
		related,
		sources,
		created: fm.created !== void 0 ? String(fm.created) : void 0,
		updated: fm.updated !== void 0 ? String(fm.updated) : void 0
	};
}
async function listCards(kb) {
	const files = await walkFiles(wikiDir(kb));
	const cards = [];
	for (const file of files) {
		const card = await readCardFile(kb, file);
		if (card !== null) cards.push(card);
	}
	return cards.sort((a, b) => a.slug.localeCompare(b.slug));
}
async function readCard(kb, slug) {
	const files = await walkFiles(wikiDir(kb));
	const target = slug.replace(/^wiki\//, "").replace(/\.md$/, "");
	for (const file of files) {
		const stem = basename(file, ".md");
		if (stem !== target && file !== `${target}.md`) continue;
		if (WIKI_AGGREGATES.has(basename(file))) continue;
		const raw = await readText(join(wikiDir(kb), file));
		if (raw === null) continue;
		const parsed = parseFrontmatter(raw);
		const fm = parsed.frontmatter ?? {};
		const meta = await readCardFile(kb, file);
		if (meta === null) continue;
		const titleSlug = slugFromTitle(String(fm.title ?? ""));
		if (file !== `${target}.md` && stem !== target && titleSlug !== target) continue;
		return {
			...meta,
			body: parsed.body,
			raw
		};
	}
	const byTitle = (await listCards(kb)).find((card) => slugFromTitle(card.title) === target);
	if (byTitle !== void 0) {
		const raw = await readText(join(wikiDir(kb), byTitle.path));
		if (raw !== null) {
			const parsed = parseFrontmatter(raw);
			return {
				...byTitle,
				body: parsed.body,
				raw
			};
		}
	}
	return null;
}
/** Resolve every wikilink target to an existing card slug. */
async function resolveLinkTargets(kb) {
	const cards = await listCards(kb);
	const bySlug = new Set(cards.map((card) => card.slug));
	const byTitle = new Map(cards.map((card) => [slugFromTitle(card.title), card.slug]));
	return /* @__PURE__ */ new Set([...bySlug, ...byTitle.keys()]);
}
async function rebuildIndex(kb) {
	const cards = await listCards(kb);
	const byType = /* @__PURE__ */ new Map();
	for (const card of cards) {
		const list = byType.get(card.type) ?? [];
		list.push(card);
		byType.set(card.type, list);
	}
	const lines = [
		"# 索引",
		"",
		"<!-- 由 dsh-knowledge-cards 自动维护，请勿手改。 -->",
		""
	];
	for (const [type, list] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`## ${type}`, "");
		for (const card of list) lines.push(`- [[${card.slug}]] — ${card.description ?? card.title}`);
		lines.push("");
	}
	await writeTextAtomic(join(wikiDir(kb), "index.md"), lines.join("\n"));
}
async function appendLog(kb, entry, notes) {
	const logPath = join(wikiDir(kb), "log.md");
	const existing = await readText(logPath) ?? "# 日志\n\n";
	const firstLineEnd = existing.indexOf("\n");
	const head = firstLineEnd === -1 ? existing : existing.slice(0, firstLineEnd + 1);
	const tail = firstLineEnd === -1 ? "" : existing.slice(firstLineEnd + 1);
	const noteLines = (notes ?? []).map((note) => `  - ${note}\n`).join("");
	await writeTextAtomic(logPath, `${head}${`## [${today()}] ${entry}\n${noteLines}`}${tail}`);
}
/** Parse wiki/log.md into entries (`## [YYYY-MM-DD] action | subject` + note lines). */
async function listLogEntries(kb) {
	const text = await readText(join(wikiDir(kb), "log.md")) ?? "";
	const entries = [];
	const pattern = /^## \[(\d{4}-\d{2}-\d{2})\] (.+)$/gm;
	let match;
	while ((match = pattern.exec(text)) !== null) {
		const date = match[1];
		const rest = match[2];
		const pipe = rest.indexOf("|");
		const action = (pipe === -1 ? rest : rest.slice(0, pipe)).trim();
		const subject = pipe === -1 ? "" : rest.slice(pipe + 1).trim();
		const notes = [];
		const after = text.slice(match.index + match[0].length);
		for (const line of after.split("\n")) {
			if (line.trim() === "") continue;
			if (/^\s*-\s+/.test(line)) notes.push(line.replace(/^\s*-\s+/, "").trim());
			else break;
		}
		entries.push({
			date,
			action,
			subject,
			notes
		});
	}
	return entries;
}
/** Human-readable `"old" → "new"` for a scalar field change. */
function scalarChange(label, oldValue, newValue) {
	return `${label}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`;
}
/** `+added -removed` diff for an array field. */
function arrayChange(label, oldValues, newValues) {
	const added = newValues.filter((value) => !oldValues.includes(value));
	const removed = oldValues.filter((value) => !newValues.includes(value));
	if (added.length === 0 && removed.length === 0) return null;
	const parts = [];
	if (added.length > 0) parts.push(`+${added.join(", ")}`);
	if (removed.length > 0) parts.push(`-${removed.join(", ")}`);
	return `${label}: ${parts.join(" ")}`;
}
/** Summarize a body change: added/removed line counts + first added snippet. */
function bodyChange(oldBody, newBody) {
	const toLines = (text) => text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
	const oldLines = toLines(oldBody);
	const newLines = toLines(newBody);
	const oldSet = new Set(oldLines);
	const newSet = new Set(newLines);
	const added = newLines.filter((line) => !oldSet.has(line));
	const removed = oldLines.filter((line) => !newSet.has(line));
	const parts = [];
	if (added.length > 0) parts.push(`新增 ${added.length} 行`);
	if (removed.length > 0) parts.push(`删除 ${removed.length} 行`);
	const snippet = added[0];
	if (snippet !== void 0) {
		const clipped = snippet.length > 40 ? `${snippet.slice(0, 40)}…` : snippet;
		parts.push(`新增片段「${clipped}」`);
	}
	return `正文: ${parts.join(" · ") || "内容变更"}`;
}
async function rebuildOverview(kb) {
	const cards = await listCards(kb);
	const byType = /* @__PURE__ */ new Map();
	let maxUpdated;
	for (const card of cards) {
		byType.set(card.type, (byType.get(card.type) ?? 0) + 1);
		if (card.updated !== void 0 && (maxUpdated === void 0 || card.updated > maxUpdated)) maxUpdated = card.updated;
	}
	const sources = await listSources(kb);
	const codeFiles = (await listCodeFiles(kb)).length;
	const lines = [
		"# 概览",
		"",
		"<!-- 由 dsh-knowledge-cards 自动生成。 -->",
		"",
		`- 卡片总数: ${cards.length}`,
		`- 资料源文件: ${sources.length}（新增 ${sources.filter((s) => s.status === "new").length} · 变更 ${sources.filter((s) => s.status === "changed").length}）`,
		`- 代码文件: ${codeFiles}`
	];
	for (const [type, count] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) lines.push(`- ${type}: ${count}`);
	if (maxUpdated !== void 0) lines.push(`- 最近更新: ${maxUpdated}`);
	await writeTextAtomic(join(wikiDir(kb), "overview.md"), lines.join("\n") + "\n");
}
function unionStrings(...lists) {
	return [...new Set(lists.flat().map((item) => item.trim()).filter((item) => item !== ""))];
}
function safeWikiRelPath(raw) {
	const normalized = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
	if (normalized.includes("..")) return null;
	if (!normalized.endsWith(".md")) return null;
	if (!/^[A-Za-z0-9_\u4e00-\u9fff\-\/ ]+\.md$/.test(normalized)) return null;
	return normalized;
}
/** Write agent-generated pages into the wiki + maintain aggregates + cache. */
async function commitPages(kb, pages, sourceFiles, options) {
	if (pages.length === 0) throw new Error("no pages to commit");
	const created = [];
	const updated = [];
	const now = today();
	const existingByPath = /* @__PURE__ */ new Map();
	for (const card of await listCards(kb)) existingByPath.set(card.path, card);
	for (const page of pages) {
		const title = page.title.trim();
		if (title === "") throw new Error("every page needs a title");
		const type = page.type.trim();
		if (type === "") throw new Error(`page "${title}" needs a type`);
		const dir = TYPE_DIRS[type] ?? "entities";
		const path = (page.path !== void 0 ? safeWikiRelPath(page.path) : null) ?? `${dir}/${slugFromTitle(title)}.md`;
		const existing = existingByPath.get(path);
		const fm = {
			type,
			title,
			created: existing?.created ?? page.created ?? now,
			updated: page.updated ?? now
		};
		if (page.description !== void 0 && page.description.trim() !== "") fm.description = page.description.trim();
		else if (existing?.description !== void 0) fm.description = existing.description;
		fm.tags = unionStrings(existing?.tags ?? [], page.tags ?? []);
		fm.related = unionStrings(existing?.related ?? [], page.related ?? []);
		fm.sources = unionStrings(existing?.sources ?? [], page.sources ?? []);
		const content = serializePage(fm, page.body);
		await writeTextAtomic(join(wikiDir(kb), path), content);
		if (existing !== void 0) updated.push(path);
		else created.push(path);
	}
	await rebuildIndex(kb);
	const subject = pages.length === 1 ? pages[0].title : `${pages.length} pages`;
	const logEntry = `${options?.logAction ?? "ingest"} | ${subject}`;
	const pageNames = (paths) => paths.map((path) => basename(path, ".md")).join("、");
	const notes = [];
	if (created.length > 0) {
		const names = pageNames(created);
		notes.push(created.length <= 10 ? `新增页面: ${names}` : `新增页面: ${pageNames(created.slice(0, 10))} 等 ${created.length} 页`);
	}
	if (updated.length > 0) {
		const names = pageNames(updated);
		notes.push(updated.length <= 10 ? `更新页面: ${names}` : `更新页面: ${pageNames(updated.slice(0, 10))} 等 ${updated.length} 页`);
	}
	if (sourceFiles.length > 0) notes.push(`资料源: ${sourceFiles.join("、")}`);
	if (options?.extraNotes !== void 0) notes.push(...options.extraNotes);
	await appendLog(kb, logEntry, notes);
	const cached = [];
	const cache = await loadCache();
	const kbCache = cache[kb.id] ?? (cache[kb.id] = {});
	for (const relPath of unionStrings(sourceFiles)) {
		const sourcePath = join(kb.path, "raw", "sources", relPath);
		if (!await pathExists(sourcePath)) continue;
		const buffer = await promises.readFile(sourcePath);
		const entry = kbCache[relPath] ?? {
			sha256: "",
			ingestedAt: 0,
			pages: []
		};
		entry.sha256 = sha256Of(buffer);
		entry.ingestedAt = Date.now();
		entry.pages = unionStrings(entry.pages, pages.map((page) => slugFromTitle(page.title)));
		kbCache[relPath] = entry;
		cached.push(relPath);
	}
	await saveCache(cache);
	await rebuildOverview(kb);
	return {
		created,
		updated,
		indexUpdated: true,
		logEntry,
		overviewUpdated: true,
		cachedSources: cached
	};
}
async function loadCache() {
	const text = await readText(join(configRoot(), CACHE_FILE));
	if (text === null) return {};
	try {
		const parsed = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}
async function saveCache(cache) {
	await writeTextAtomic(join(configRoot(), CACHE_FILE), JSON.stringify(cache, null, 2));
}
async function listSources(kb) {
	const rawDir = join(kb.path, "raw", "sources");
	const files = await walkFiles(rawDir);
	const kbCache = (await loadCache())[kb.id] ?? {};
	const statuses = [];
	for (const relPath of files) {
		const full = join(rawDir, relPath);
		const sha = sha256Of(await promises.readFile(full));
		const entry = kbCache[relPath];
		const status = entry === void 0 ? "new" : entry.sha256 === sha ? "up-to-date" : "changed";
		statuses.push({
			relPath,
			sha256: sha,
			status,
			lastIngestedAt: entry?.ingestedAt,
			pages: entry?.pages ?? []
		});
	}
	return statuses.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
/** Sources that still need ingest (new or changed). */
async function pendingSources(kb) {
	return (await listSources(kb)).filter((source) => source.status !== "up-to-date");
}
async function kbSummary(kb) {
	const cards = await listCards(kb);
	const sources = await listSources(kb);
	const byType = {};
	let maxUpdated;
	for (const card of cards) {
		byType[card.type] = (byType[card.type] ?? 0) + 1;
		if (card.updated !== void 0 && (maxUpdated === void 0 || card.updated > maxUpdated)) maxUpdated = card.updated;
	}
	return {
		id: kb.id,
		name: kb.name,
		path: kb.path,
		description: kb.description,
		createdAt: kb.createdAt,
		stats: {
			total: cards.length,
			byType,
			sourceCount: sources.length,
			codeCount: (await listCodeFiles(kb)).length,
			updatedAt: maxUpdated
		}
	};
}
async function listKbSummaries() {
	const kbs = await listKbs();
	const summaries = [];
	for (const kb of kbs) try {
		summaries.push(await kbSummary(kb));
	} catch (error) {
		summaries.push({
			id: kb.id,
			name: kb.name,
			path: kb.path,
			description: kb.description,
			createdAt: kb.createdAt,
			stats: {
				total: 0,
				byType: {},
				sourceCount: 0,
				codeCount: 0
			}
		});
	}
	return summaries;
}
/** Rebuild index.md + overview.md from the current wiki content (used when
* cards are dropped into wiki/ directly, or after a bulk import). */
async function rebuildAggregates(kb) {
	await rebuildIndex(kb);
	await rebuildOverview(kb);
	return {
		index: true,
		overview: true
	};
}
/**
* Bulk-import already-split knowledge cards (markdown files with YAML
* frontmatter) from a local directory into the KB — the "I already have
* cards, just import them" path. Deterministic, no LLM: files are parsed,
* validated and written via commitPages (which maintains index/log/overview
* and the SHA cache for any referenced raw sources).
*/
async function importCards(kb, dir) {
	const mdFiles = (await walkFiles(dir)).filter((file) => file.endsWith(".md"));
	const pages = [];
	const skipped = [];
	for (const file of mdFiles) {
		const raw = await readText(join(dir, file));
		if (raw === null) {
			skipped.push({
				file,
				reason: "unreadable"
			});
			continue;
		}
		const parsed = parseFrontmatter(raw);
		const fm = parsed.frontmatter;
		if (fm === null) {
			skipped.push({
				file,
				reason: "no frontmatter (need type/title)"
			});
			continue;
		}
		const type = String(fm.type ?? "").trim();
		const title = String(fm.title ?? "").trim();
		if (type === "" || title === "" || parsed.body.trim() === "") {
			skipped.push({
				file,
				reason: "missing type/title/body"
			});
			continue;
		}
		const stem = basename(file, ".md").trim();
		const targetDir = TYPE_DIRS[type] ?? "entities";
		const path = stem === "" || stem === "." ? void 0 : `${targetDir}/${stem}.md`;
		pages.push({
			type,
			title,
			description: fm.description !== void 0 ? String(fm.description) : void 0,
			tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
			related: Array.isArray(fm.related) ? fm.related.map(String) : [],
			sources: Array.isArray(fm.sources) ? fm.sources.map(String) : [],
			body: parsed.body,
			path,
			created: fm.created !== void 0 ? String(fm.created) : void 0,
			updated: fm.updated !== void 0 ? String(fm.updated) : void 0
		});
	}
	const sourceFiles = [...new Set(pages.flatMap((page) => page.sources ?? []))];
	if (pages.length === 0) return {
		imported: [],
		skipped,
		sourceFiles
	};
	const extraNotes = [];
	if (skipped.length > 0) extraNotes.push(`跳过无效文件 ${skipped.length} 个: ${skipped.map((item) => item.file).join("、")}`);
	const result = await commitPages(kb, pages, sourceFiles, {
		logAction: "import",
		extraNotes
	});
	return {
		imported: [...result.created, ...result.updated],
		skipped,
		sourceFiles
	};
}
/**
* Manually edit one card in place (same slug/path — inbound [[wikilinks]]
* keep resolving), stamp updated=today, append an `edit` log entry listing
* the changed fields, and rebuild the index. Replace semantics: fields the
* caller provides replace the card's values; absent fields are untouched.
*/
async function editCard(kb, slug, input) {
	const existing = await readCard(kb, slug);
	if (existing === null) throw new Error(`卡片不存在: ${slug}`);
	const fm = parseFrontmatter(existing.raw).frontmatter ?? {};
	const now = today();
	const changed = [];
	const title = input.title?.trim();
	if (title !== void 0 && title !== "" && title !== existing.title) {
		fm.title = title;
		changed.push("标题");
	}
	if (input.description !== void 0) {
		const description = input.description.trim();
		if (description !== (existing.description ?? "")) {
			fm.description = description === "" ? "" : description;
			changed.push("摘要");
		}
	}
	if (input.tags !== void 0) {
		const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))];
		if (tags.join("\0") !== existing.tags.join("\0")) {
			fm.tags = tags;
			changed.push("标签");
		}
	}
	if (input.related !== void 0) {
		const related = [...new Set(input.related.map((item) => item.trim()).filter((item) => item !== ""))];
		if (related.join("\0") !== existing.related.join("\0")) {
			fm.related = related;
			changed.push("关联");
		}
	}
	if (input.sources !== void 0) {
		const sources = [...new Set(input.sources.map((item) => item.trim()).filter((item) => item !== ""))];
		if (sources.join("\0") !== existing.sources.join("\0")) {
			fm.sources = sources;
			changed.push("来源");
		}
	}
	const body = input.body ?? existing.body;
	const normalizeBody = (text) => text.replace(/^\s+/, "").replace(/\s+$/, "");
	if (normalizeBody(body) !== normalizeBody(existing.body)) changed.push("正文");
	if (changed.length > 0) {
		fm.updated = now;
		const content = serializePage(fm, body);
		await writeTextAtomic(join(wikiDir(kb), existing.path), content);
		await rebuildIndex(kb);
		const titleForLog = String(fm.title ?? existing.title);
		const notes = [];
		if (title !== void 0 && title !== "" && title !== existing.title) notes.push(scalarChange("标题", existing.title, title));
		if (input.description !== void 0) {
			const description = input.description.trim();
			if (description !== (existing.description ?? "")) notes.push(scalarChange("摘要", existing.description ?? "", description === "" ? "（已清空）" : description));
		}
		if (input.tags !== void 0) {
			const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))];
			if (tags.join("\0") !== existing.tags.join("\0")) {
				const diff = arrayChange("标签", existing.tags, tags);
				if (diff !== null) notes.push(diff);
			}
		}
		if (input.related !== void 0) {
			const related = [...new Set(input.related.map((item) => item.trim()).filter((item) => item !== ""))];
			if (related.join("\0") !== existing.related.join("\0")) {
				const diff = arrayChange("关联", existing.related, related);
				if (diff !== null) notes.push(diff);
			}
		}
		if (input.sources !== void 0) {
			const sources = [...new Set(input.sources.map((item) => item.trim()).filter((item) => item !== ""))];
			if (sources.join("\0") !== existing.sources.join("\0")) {
				const diff = arrayChange("来源", existing.sources, sources);
				if (diff !== null) notes.push(diff);
			}
		}
		if (normalizeBody(body) !== normalizeBody(existing.body)) notes.push(bodyChange(existing.body, body));
		if (notes.length === 0) notes.push(`修改字段: ${changed.join("、")}`);
		await appendLog(kb, `edit | ${titleForLog}`, notes);
	}
	const updatedCard = await readCard(kb, slug);
	if (updatedCard === null) throw new Error(`edit failed for: ${slug}`);
	return {
		card: updatedCard,
		changed
	};
}
function codeDir(kb) {
	return join(kb.path, "code");
}
/** Validate a code-relative path stays inside code/ (no traversal). */
function safeCodeRelPath(raw) {
	const normalized = raw.replace(/\\/g, "/").replace(/^\.?\//, "");
	if (normalized === "" || normalized.includes("..")) return null;
	if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
	return normalized;
}
/** List code files (recursive) under the KB's code/ directory. */
async function listCodeFiles(kb) {
	const dir = codeDir(kb);
	const files = await walkFiles(dir);
	const infos = [];
	for (const relPath of files) {
		const stat = await promises.stat(join(dir, relPath));
		infos.push({
			relPath,
			size: stat.size,
			mtime: stat.mtimeMs
		});
	}
	return infos.sort((a, b) => a.relPath.localeCompare(b.relPath));
}
/** Read one code file (full content, UTF-8). Throws when the path escapes code/. */
async function readCodeFile(kb, relPath) {
	const safe = safeCodeRelPath(relPath);
	if (safe === null) throw new Error(`invalid code path: ${relPath}`);
	return promises.readFile(join(codeDir(kb), safe), "utf8");
}
/** Write one code file (UTF-8, raw content — no frontmatter, no LLM). */
async function writeCodeFile(kb, relPath, content) {
	const safe = safeCodeRelPath(relPath);
	if (safe === null) throw new Error(`invalid code path: ${relPath}`);
	const full = join(codeDir(kb), safe);
	await promises.mkdir(join(codeDir(kb), safe.includes("/") ? safe.slice(0, safe.lastIndexOf("/")) : "."), { recursive: true });
	await writeTextAtomic(full, content);
	const stat = await promises.stat(full);
	return {
		relPath: safe,
		size: stat.size,
		mtime: stat.mtimeMs
	};
}
/** Delete one code file. */
async function deleteCodeFile(kb, relPath) {
	const safe = safeCodeRelPath(relPath);
	if (safe === null) throw new Error(`invalid code path: ${relPath}`);
	const full = join(codeDir(kb), safe);
	try {
		await promises.unlink(full);
		return true;
	} catch {
		return false;
	}
}
function reviewsFile(kb) {
	return join(configRoot(), "reviews", `${kb.id}.json`);
}
async function loadReviews(kb) {
	const text = await readText(reviewsFile(kb));
	if (text === null) return [];
	try {
		const parsed = JSON.parse(text);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
async function saveReviews(kb, items) {
	await writeTextAtomic(reviewsFile(kb), JSON.stringify(items, null, 2));
}
/** Add one review item (agent-flagged during ingest, or manual). */
async function addReview(kb, input) {
	const items = await loadReviews(kb);
	const item = {
		id: randomUUID().slice(0, 8),
		kbId: kb.id,
		kind: input.kind,
		title: input.title.trim(),
		summary: input.summary.trim(),
		source: input.source,
		options: input.options !== void 0 && input.options.length > 0 ? [...new Set(input.options)] : REVIEW_OPTIONS[input.kind] ?? ["跳过"],
		searchQuery: input.searchQuery,
		status: "pending",
		createdAt: Date.now()
	};
	items.push(item);
	await saveReviews(kb, items);
	return item;
}
/** List review items, optionally filtered by status. */
async function listReviews(kb, status) {
	const items = await loadReviews(kb);
	return (status !== void 0 && status !== "" && status !== "all" ? items.filter((item) => item.status === status) : items).sort((a, b) => b.createdAt - a.createdAt);
}
/** Resolve a review item (resolved / skipped) with an optional note. */
async function resolveReview(kb, id, status, resolution) {
	const items = await loadReviews(kb);
	const item = items.find((candidate) => candidate.id === id);
	if (item === void 0) return null;
	item.status = status;
	item.resolvedAt = Date.now();
	item.resolution = resolution?.trim() || void 0;
	await saveReviews(kb, items);
	return item;
}
//#endregion
export { resolveLinkTargets as C, writeCodeFile as D, today as E, rebuildAggregates as S, sha256Of as T, listReviews as _, defaultKbId as a, readCard as b, ensureKbStructure as c, kbSummary as d, listCards as f, listLogEntries as g, listKbs as h, createKb as i, getKb as l, listKbSummaries as m, commitPages as n, deleteCodeFile as o, listCodeFiles as p, configRoot as r, editCard as s, addReview as t, importCards as u, listSources as v, resolveReview as w, readCodeFile as x, pendingSources as y };
