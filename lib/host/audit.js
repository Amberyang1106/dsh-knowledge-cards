import { slugFromTitle } from "../core/frontmatter.js";
import { extractWikilinks } from "../core/search.js";
import { O as readCard, b as listReviews, h as listCards, j as resolveLinkTargets, t as addReview } from "../store-Cago3cTl.js";
//#region src/host/audit.ts
/**
* Knowledge-base audit (导入现成知识库后的主动审核):
*
* 1. Deterministic scan (zero LLM, instant): duplicates (normalized-title
*    collisions), missing pages ([[wikilinks]] pointing at cards that do not
*    exist) — each becomes a review item in the queue (deduped against
*    pending items, so re-running never spams).
* 2. A deep-audit prompt for the agent: semantic checks (contradictions,
*    suggestions, cross-card synthesis) that need LLM judgment — the agent
*    runs it and submits findings via wiki_review_submit.
*
* Both feed the SAME queue the ingest-time flags use, so the 审核 tab is the
* single human-in-the-loop surface.
* @module dsh-knowledge-cards/host/audit
*/
function buildDeepAuditPrompt(kb, cards) {
	const cardList = cards.map((card) => `- [${card.type}] [[${card.slug}]] — ${card.description ?? card.title}`).join("\n");
	return [
		`请对知识库「${kb.name}」做一次全面语义审核（只读，不修改任何卡片）：`,
		"",
		"现有卡片：",
		cardList,
		"",
		"请用 wiki_review_submit 提交你认为需要人工判断的审核项（kind 必须是 contradiction / duplicate / missing-page / suggestion），注意：",
		"- contradiction：卡片之间存在矛盾表述（如同一概念口径不一致）",
		"- duplicate：两个卡片疑似描述同一事物（标题不同但内容重叠）",
		"- missing-page：多个卡片反复提及但缺少专门页面的重要概念",
		"- suggestion：值得深挖或补充资料的方向",
		"每条审核项：title 简短主题 + summary 说明为什么需要人工判断 + source 相关卡片 + 预生成 searchQuery（供深度研究）。",
		"不要提交琐碎项；不确定的宁可提交也不要擅自改卡片内容。"
	].join("\n");
}
/** Build the deep-audit prompt for the current KB (no side effects). */
async function buildDeepAuditPromptForKb(kb) {
	return buildDeepAuditPrompt(kb, (await listCards(kb)).map((card) => ({
		slug: card.slug,
		type: card.type,
		title: card.title,
		description: card.description
	})));
}
/**
* Deterministic audit: scan cards for duplicates and broken wikilinks, and
* submit them as review items (deduped against existing pending items).
* Returns the audit result incl. the deep-audit prompt for the LLM part.
*/
async function auditKb(kb) {
	const cards = await listCards(kb);
	const targets = await resolveLinkTargets(kb);
	const pending = await listReviews(kb, "pending");
	const pendingKeys = new Set(pending.map((item) => `${item.kind}\u0000${item.title}`));
	const submitted = [];
	let skippedExisting = 0;
	const summary = {
		duplicate: 0,
		missingPage: 0
	};
	const submitOnce = async (item) => {
		const key = `${item.kind}\u0000${item.title}`;
		if (pendingKeys.has(key)) {
			skippedExisting += 1;
			return;
		}
		const created = await addReview(kb, item);
		pendingKeys.add(key);
		submitted.push({
			id: created.id,
			kind: created.kind,
			title: created.title
		});
	};
	const byNormalized = /* @__PURE__ */ new Map();
	for (const card of cards) {
		const normalized = slugFromTitle(card.title);
		const list = byNormalized.get(normalized) ?? [];
		list.push({
			slug: card.slug,
			title: card.title
		});
		byNormalized.set(normalized, list);
	}
	for (const [normalized, group] of byNormalized) {
		if (group.length < 2) continue;
		const names = group.map((card) => card.slug).join("、");
		await submitOnce({
			kind: "duplicate",
			title: group[0].title,
			summary: `疑似重复：${group.length} 张卡片规范化标题相同（${names}）——可能指向同一事物，需人工判断是否合并。`,
			source: names,
			searchQuery: `知识卡片 去重 ${normalized} 合并`
		});
		summary.duplicate += 1;
	}
	const referencedBy = /* @__PURE__ */ new Map();
	for (const card of cards) {
		const raw = await readCard(kb, card.slug);
		if (raw === null) continue;
		for (const link of extractWikilinks(raw.body)) {
			if (targets.has(link)) continue;
			const list = referencedBy.get(link) ?? [];
			list.push(card.slug);
			referencedBy.set(link, list);
		}
	}
	for (const [missing, referrers] of [...referencedBy.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		await submitOnce({
			kind: "missing-page",
			title: missing,
			summary: `缺失页面：[[${missing}]] 被 ${referrers.slice(0, 5).join("、")}${referrers.length > 5 ? ` 等 ${referrers.length} 张` : ""} 卡片引用，但知识库中没有对应页面——建议创建。`,
			source: referrers.join("、"),
			searchQuery: `${missing} 定义 说明`
		});
		summary.missingPage += 1;
	}
	const deepAuditPrompt = buildDeepAuditPrompt(kb, cards.map((card) => ({
		slug: card.slug,
		type: card.type,
		title: card.title,
		description: card.description
	})));
	return {
		submitted,
		skippedExisting,
		summary,
		deepAuditPrompt
	};
}
//#endregion
export { auditKb, buildDeepAuditPromptForKb };
