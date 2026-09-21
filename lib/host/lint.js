import { parseFrontmatter } from "../core/frontmatter.js";
import { extractWikilinks } from "../core/search.js";
import { O as readCard, h as listCards, j as resolveLinkTargets, x as listSources } from "../store-Cago3cTl.js";
//#region src/host/lint.ts
async function lintKb(kb) {
	const issues = [];
	const cards = await listCards(kb);
	const targets = await resolveLinkTargets(kb);
	const sourcePaths = new Set((await listSources(kb)).map((source) => source.relPath));
	const inbound = /* @__PURE__ */ new Map();
	for (const card of cards) inbound.set(card.slug, 0);
	for (const card of cards) {
		const parsed = parseFrontmatter((await readCard(kb, card.slug))?.raw ?? "");
		const path = card.path;
		if (parsed.frontmatter === null) issues.push({
			severity: "error",
			kind: "missing-frontmatter",
			path,
			message: `页面缺少 YAML frontmatter（type/title 必填）`
		});
		if (card.description === void 0 || card.description.trim() === "") issues.push({
			severity: "warn",
			kind: "missing-description",
			path,
			message: `页面没有一句话摘要（frontmatter description），卡片墙无法展示`
		});
		if (parsed.body.trim() === "") issues.push({
			severity: "warn",
			kind: "empty-body",
			path,
			message: "页面正文为空"
		});
		for (const link of extractWikilinks(parsed.body)) if (!targets.has(link)) issues.push({
			severity: "error",
			kind: "broken-wikilink",
			path,
			message: `正文引用了不存在的页面 [[${link}]]`
		});
		for (const source of card.sources) if (!sourcePaths.has(source)) issues.push({
			severity: "warn",
			kind: "missing-source",
			path,
			message: `引用的原始资料不存在于 raw/sources: ${source}`
		});
		for (const other of cards) {
			if (other.slug === card.slug) continue;
			if (extractWikilinks(parseFrontmatter((await readCard(kb, other.slug))?.raw ?? "").body).includes(card.slug)) inbound.set(card.slug, (inbound.get(card.slug) ?? 0) + 1);
		}
	}
	for (const card of cards) if ((inbound.get(card.slug) ?? 0) === 0 && card.type !== "overview") {
		if (card.type === "source") {
			if (cards.some((other) => other.slug !== card.slug && other.sources.some((source) => card.sources.includes(source)))) continue;
		}
		issues.push({
			severity: "warn",
			kind: "orphan",
			path: card.path,
			message: `孤立页面：没有其他页面链接到 [[${card.slug}]]`
		});
	}
	return issues.sort((a, b) => {
		if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
		return (a.path ?? "").localeCompare(b.path ?? "");
	});
}
/** Compact summary for the agent-facing lint tool. */
function renderLintReport(kbName, issues) {
	const errors = issues.filter((issue) => issue.severity === "error");
	const warns = issues.filter((issue) => issue.severity === "warn");
	const lines = [`知识库「${kbName}」lint 结果：${errors.length} error / ${warns.length} warn`];
	if (issues.length === 0) {
		lines.push("一切健康 ✅");
		return lines.join("\n");
	}
	for (const issue of issues) lines.push(`- [${issue.severity}] ${issue.path ?? "-"} ${issue.message}`);
	return lines.join("\n");
}
//#endregion
export { lintKb, renderLintReport };
