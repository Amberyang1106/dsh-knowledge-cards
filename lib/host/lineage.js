import { parseFrontmatter } from "../core/frontmatter.js";
import { O as readCard, h as listCards, r as configRoot, u as editCard } from "../store-DFbZQRmj.js";
import { promises } from "node:fs";
import { join } from "node:path";
//#region src/host/lineage.ts
/**
* Lineage assistance for field cards — the engine behind the panel's
* 「血缘补齐」button.
*
* Three deterministic pieces plus one agent hand-off:
*   1. scanLineage()      — candidate edges mined from card bodies/metadata
*                           (mention + derivation-keyword matching, metadata
*                           gap rules). No LLM, no writes.
*   2. buildLineagePrompt()/proposal file — an agent run analyses the KB and
*                           parks structured proposals for review.
*   3. applyLineage()     — writes the accepted proposals through editCard's
*                           structured channel (union semantics, provenance
*                           marked inferred, confirmed cards never downgraded).
* @module dsh-knowledge-cards/host/lineage
*/
const RELATION_KEYS = [
	"depends_on",
	"used_by",
	"implemented_in",
	"governed_by"
];
/** Text that suggests "this field is derived from that one". */
const DERIVATION_HINT = /(by\s+[\w\s.%-]{0,40}?(get|obtain|derive|lookup|join)|get\s+[\w\s.%-]{0,40}?from|derived?\s+from|based\s+on|source[d]?\s+from|由|通过|基于|关联字段|取数|来源|推导)/i;
/** Values that describe a consumer/report rather than a physical table. */
const NON_TABLE_SOURCES = /^(pbi|power\s*bi|genie|excel|tableau|report|dashboard|qbr|ai\s*navigator)$/i;
async function loadFieldCards(kb) {
	const views = [];
	for (const meta of (await listCards(kb)).filter((card) => card.type === "field")) {
		const card = await readCard(kb, meta.slug);
		if (card === null) continue;
		views.push({
			meta,
			fm: parseFrontmatter(card.raw).frontmatter ?? {},
			body: card.body
		});
	}
	return views;
}
function identifiersOf(view) {
	const raw = [
		view.meta.slug,
		view.meta.title,
		view.fm.canonical_name,
		view.fm.field_id
	];
	if (Array.isArray(view.fm.aliases)) raw.push(...view.fm.aliases);
	return raw.filter((value) => typeof value === "string" && value.trim() !== "");
}
function normalize(value) {
	return value.trim().toLowerCase();
}
/** Whether the body mentions one identifier as a standalone token. */
function mentions(body, identifier) {
	const needle = identifier.trim();
	if (needle.length < 3) return false;
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, "i").test(body);
}
/** A short quote around the first mention, used as the proposal's evidence. */
function evidenceAround(body, identifier) {
	const index = normalize(body).indexOf(normalize(identifier));
	if (index === -1) return "";
	const start = Math.max(0, index - 60);
	const end = Math.min(body.length, index + identifier.length + 60);
	return body.slice(start, end).replace(/\s+/g, " ").trim();
}
function asStringList(value) {
	return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function pushProposal(list, proposal) {
	const existing = list.find((item) => item.slug === proposal.slug && item.source === proposal.source && item.evidence === proposal.evidence);
	if (existing === void 0) {
		list.push(proposal);
		return;
	}
	for (const key of RELATION_KEYS) {
		const incoming = proposal.relations[key];
		if (incoming === void 0) continue;
		existing.relations[key] = [.../* @__PURE__ */ new Set([...existing.relations[key] ?? [], ...incoming])];
	}
}
/**
* Deterministic lineage scan: candidate edges + metadata gaps for every field
* card of one KB. Read-only.
*/
async function scanLineage(kb) {
	const cards = await loadFieldCards(kb);
	const proposals = [];
	const notes = [];
	const byIdentifier = /* @__PURE__ */ new Map();
	for (const card of cards) for (const identifier of identifiersOf(card)) {
		const key = normalize(identifier);
		if (!byIdentifier.has(key)) byIdentifier.set(key, card.meta.slug);
	}
	const resolve = (value) => byIdentifier.get(normalize(value)) ?? null;
	for (const card of cards) {
		const selfIdentifiers = new Set(identifiersOf(card).map(normalize));
		for (const other of cards) {
			if (other.meta.slug === card.meta.slug) continue;
			const hit = identifiersOf(other).find((identifier) => !selfIdentifiers.has(normalize(identifier)) && mentions(card.body, identifier));
			if (hit === void 0) continue;
			const evidence = evidenceAround(card.body, hit);
			const derived = DERIVATION_HINT.test(evidence) || DERIVATION_HINT.test(card.body);
			pushProposal(proposals, {
				slug: card.meta.slug,
				title: card.meta.title,
				source: "scan",
				confidence: derived ? "high" : "medium",
				evidence: evidence === "" ? `正文提到「${hit}」` : `正文提到「${hit}」：${evidence}`,
				relations: { depends_on: [other.meta.slug] }
			});
			pushProposal(proposals, {
				slug: other.meta.slug,
				title: other.meta.title,
				source: "scan",
				confidence: derived ? "high" : "medium",
				evidence: `反向边：${card.meta.title} 的正文提到本卡`,
				relations: { used_by: [card.meta.slug] }
			});
		}
		for (const target of asStringList(card.fm.depends_on)) if (resolve(target) === null) notes.push(`${card.meta.title}: depends_on「${target}」尚无对应字段卡（lint 会报 relation-dangling），建议建卡后再登记`);
		const sourceTable = typeof card.fm.source_table === "string" ? card.fm.source_table.trim() : "";
		if (sourceTable !== "" && NON_TABLE_SOURCES.test(sourceTable)) {
			const implemented = [.../* @__PURE__ */ new Set([...asStringList(card.fm.implemented_in), sourceTable])];
			pushProposal(proposals, {
				slug: card.meta.slug,
				title: card.meta.title,
				source: "scan",
				confidence: "medium",
				evidence: `source_table「${sourceTable}」看起来是消费端/报表而非物理表`,
				relations: { implemented_in: implemented },
				metadata: { source_table: "" }
			});
		}
		if (card.meta.description === void 0 || card.meta.description.trim() === "") notes.push(`${card.meta.title}: 缺一句话摘要（面版卡片墙无法展示），建议补充 description`);
		if (card.fm.field_kind === "dimension" && card.fm.aggregation === "additive") pushProposal(proposals, {
			slug: card.meta.slug,
			title: card.meta.title,
			source: "scan",
			confidence: "low",
			evidence: "field_kind=dimension 却标 aggregation=additive（维度通常非可加）",
			relations: {},
			metadata: { aggregation: "non-additive" }
		});
		if (typeof card.fm.field_id === "string" && card.fm.field_id.trim().endsWith(".")) {
			const prefix = card.fm.field_id.trim();
			const canonical = typeof card.fm.canonical_name === "string" ? card.fm.canonical_name.trim() : "";
			if (canonical !== "") pushProposal(proposals, {
				slug: card.meta.slug,
				title: card.meta.title,
				source: "scan",
				confidence: "medium",
				evidence: `field_id「${prefix}」残缺（缺字段名段）`,
				relations: {},
				metadata: { field_id: `${prefix}${canonical}` }
			});
		}
		if (card.fm.evidence_level === void 0) pushProposal(proposals, {
			slug: card.meta.slug,
			title: card.meta.title,
			source: "scan",
			confidence: "low",
			evidence: "缺 evidence_level（本卡逻辑的依据来源未声明）",
			relations: {},
			metadata: { evidence_level: "inferred" }
		});
	}
	const confidenceRank = {
		high: 0,
		medium: 1,
		low: 2
	};
	proposals.sort((a, b) => confidenceRank[a.confidence] - confidenceRank[b.confidence] || a.slug.localeCompare(b.slug));
	return {
		kb: kb.id,
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		fieldCards: cards.length,
		proposals,
		notes
	};
}
/** Path of the parked agent-proposal file for one KB. */
function lineageProposalFile(kb) {
	return join(configRoot(), "lineage", `${kb.id}.json`);
}
async function readLineageProposals(kb) {
	try {
		const text = await promises.readFile(lineageProposalFile(kb), "utf8");
		const parsed = JSON.parse(text);
		return Array.isArray(parsed.proposals) ? parsed : null;
	} catch {
		return null;
	}
}
/** Park one agent-produced proposal batch (called by the wiki_lineage_propose tool). */
async function writeLineageProposals(kb, proposals, extra = {}) {
	const file = {
		kb: kb.id,
		requestedAt: extra.requestedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
		childId: extra.childId,
		proposals,
		notes: extra.notes ?? []
	};
	const path = lineageProposalFile(kb);
	await promises.mkdir(join(configRoot(), "lineage"), { recursive: true });
	await promises.writeFile(path, JSON.stringify(file, null, 2), "utf8");
	return file;
}
/**
* Prompt handed to an agent run: analyse the KB's field cards and park the
* candidate edges — explicitly WITHOUT editing the cards (the human reviews
* and a deterministic apply writes them).
*/
function buildLineagePrompt(kb, cards) {
	const list = cards.map((card) => `- ${card.slug}（${card.title}）`).join("\n");
	return [
		`请为知识库「${kb.id}」的字段卡做一轮血缘补齐分析，**只产出提案、不要修改任何卡片**。`,
		"",
		"字段卡清单（先用 wiki_read 逐张读全文，正文里常含取数路径与 SQL）：",
		list,
		"",
		"分析要求：",
		"1. 对每张卡，从正文/公式/SQL 里找出「它依赖哪些字段」以及「它被哪些下游使用」；方向要正确（被引用的字段是被依赖方）。",
		"2. 区分直达依赖与传递依赖：depends_on 只登记直达依赖；隔一层的由链路推导，可在 evidence 里说明。",
		"3. 目标必须能对应到卡（用 slug 或标题）。无法对应到卡的（报表/系统/外部表）放到 implemented_in，不要放进 depends_on。",
		"4. 只给有证据的边；没有证据就不要编（宁缺勿滥）。同时给出 evidence（引用卡内原文片段）与 confidence（high/medium/low）。",
		"5. 可附带元数据修正建议（如 source_table 填的是 PBI 这类消费端、field_id 残缺、dimension 却标 additive）——放在 metadata 里。",
		"",
		"完成后调用工具 wiki_lineage_propose 提交，参数：",
		"{ kb: \"" + kb.id + "\", proposals: [{ slug, title, source: \"llm\", confidence, evidence, relations: { depends_on: [...], used_by: [...] }, metadata: {...} }], notes: [\"...\"] }",
		"提交后用一句话总结你给出的边数与主要发现即可，不要写卡片。"
	].join("\n");
}
/** Slugs+titles of the field cards (for prompts). */
async function listFieldCardMeta(kb) {
	return (await loadFieldCards(kb)).map((view) => ({
		slug: view.meta.slug,
		title: view.meta.title
	}));
}
/**
* One row per field card for the scope picker: review status (drives the
* confirmed-card skip), whether it is confirmed, and how much lineage it
* already carries. Read-only.
*/
async function listFieldCardScopes(kb) {
	return (await loadFieldCards(kb)).map((view) => {
		const reviewStatus = typeof view.fm.review_status === "string" ? view.fm.review_status.trim() : "";
		return {
			slug: view.meta.slug,
			title: view.meta.title,
			reviewStatus,
			confirmed: reviewStatus === "confirmed",
			dependsOn: asStringList(view.fm.depends_on).length,
			usedBy: asStringList(view.fm.used_by).length
		};
	});
}
/**
* Mark field cards as owner-confirmed (review_status=confirmed), which is what
* takes them out of the default JEV scope. Only review_status is touched —
* evidence_level keeps describing where the evidence came from. Non-field cards
* and unknown slugs are reported, never silently dropped.
*/
async function confirmFieldCards(kb, slugs) {
	const confirmed = [];
	const skipped = [];
	for (const slug of [...new Set(slugs)]) {
		const card = await readCard(kb, slug);
		if (card === null) {
			skipped.push({
				slug,
				reason: "卡片不存在"
			});
			continue;
		}
		if (card.type !== "field") {
			skipped.push({
				slug,
				reason: `仅支持 field 卡（当前 type=${card.type}）`
			});
			continue;
		}
		const current = parseFrontmatter(card.raw).frontmatter ?? {};
		const next = {};
		for (const [key, value] of Object.entries(current)) {
			if ([
				"type",
				"title",
				"description",
				"tags",
				"related",
				"sources",
				"created",
				"updated"
			].includes(key)) continue;
			next[key] = value;
		}
		if (current.review_status === "confirmed") {
			skipped.push({
				slug,
				reason: "已经是 confirmed"
			});
			continue;
		}
		next.review_status = "confirmed";
		await editCard(kb, slug, {
			frontmatter: next,
			extraNotes: ["血缘范围: 标记为已确认（后续 JEV 默认跳过本卡）"]
		});
		confirmed.push(slug);
	}
	return {
		kb: kb.id,
		confirmed,
		skipped,
		generatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/**
* Deterministic apply: write the accepted proposals (union semantics for
* relations, metadata set/remove), marking provenance inferred unless the
* card is already confirmed. Never touches cards that are not field cards.
*/
async function applyLineage(kb, accepted) {
	const applied = [];
	const skipped = [];
	const bySlug = /* @__PURE__ */ new Map();
	for (const proposal of accepted) {
		const list = bySlug.get(proposal.slug) ?? [];
		list.push(proposal);
		bySlug.set(proposal.slug, list);
	}
	for (const [slug, proposals] of bySlug) {
		const card = await readCard(kb, slug);
		if (card === null) {
			skipped.push({
				slug,
				reason: "卡片不存在"
			});
			continue;
		}
		if (card.type !== "field") {
			skipped.push({
				slug,
				reason: `仅支持 field 卡（当前 type=${card.type}）`
			});
			continue;
		}
		const current = parseFrontmatter(card.raw).frontmatter ?? {};
		const next = {};
		for (const [key, value] of Object.entries(current)) {
			if ([
				"type",
				"title",
				"description",
				"tags",
				"related",
				"sources",
				"created",
				"updated"
			].includes(key)) continue;
			next[key] = value;
		}
		for (const proposal of proposals) {
			for (const key of RELATION_KEYS) {
				const incoming = proposal.relations[key];
				if (incoming === void 0) continue;
				next[key] = [.../* @__PURE__ */ new Set([...asStringList(next[key]), ...incoming])];
			}
			for (const [key, value] of Object.entries(proposal.metadata ?? {})) {
				if (value === "" || Array.isArray(value) && value.length === 0) {
					delete next[key];
					continue;
				}
				next[key] = value;
			}
		}
		if ((typeof current.review_status === "string" ? current.review_status : "") !== "confirmed") {
			next.review_status = typeof next.review_status === "string" && next.review_status !== "" ? next.review_status : "inferred";
			next.evidence_level = typeof next.evidence_level === "string" && next.evidence_level !== "" ? next.evidence_level : "inferred";
		}
		const provenance = [...new Set(proposals.map((proposal) => proposal.note).filter((note) => typeof note === "string" && note !== ""))];
		const result = await editCard(kb, slug, {
			frontmatter: next,
			extraNotes: provenance.length > 0 ? [`血缘来源: ${provenance.join(" / ")}`] : void 0
		});
		const fm = parseFrontmatter(result.card.raw).frontmatter ?? {};
		const relations = {};
		for (const key of RELATION_KEYS) relations[key] = asStringList(fm[key]);
		applied.push({
			slug,
			title: result.card.title,
			changed: result.changed,
			relations
		});
	}
	return {
		kb: kb.id,
		applied,
		skipped,
		generatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
//#endregion
export { applyLineage, buildLineagePrompt, confirmFieldCards, lineageProposalFile, listFieldCardMeta, listFieldCardScopes, readLineageProposals, scanLineage, writeLineageProposals };
