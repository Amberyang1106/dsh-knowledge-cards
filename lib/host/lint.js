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
	const fieldCards = cards.filter((card) => card.type === "field");
	if (fieldCards.length > 0) {
		const normalize = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
		const RELATION_KEYS = [
			"depends_on",
			"used_by",
			"implemented_in",
			"governed_by"
		];
		const relationsOf = /* @__PURE__ */ new Map();
		const identifiersOf = /* @__PURE__ */ new Map();
		const byIdentifier = /* @__PURE__ */ new Map();
		for (const card of fieldCards) {
			const fm = parseFrontmatter((await readCard(kb, card.slug))?.raw ?? "").frontmatter ?? {};
			const relations = {};
			for (const key of RELATION_KEYS) {
				const value = fm[key];
				relations[key] = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
			}
			relationsOf.set(card.slug, relations);
			const identifiers = [
				card.slug,
				card.title,
				fm.canonical_name,
				fm.field_id
			].concat(Array.isArray(fm.aliases) ? fm.aliases : []).filter((value) => typeof value === "string" && value.trim() !== "");
			identifiersOf.set(card.slug, identifiers);
			for (const identifier of identifiers) {
				const key = normalize(identifier);
				if (!byIdentifier.has(key)) byIdentifier.set(key, card.slug);
			}
		}
		const resolveTarget = (target) => byIdentifier.get(normalize(target)) ?? null;
		for (const card of fieldCards) {
			const relations = relationsOf.get(card.slug) ?? {};
			for (const key of RELATION_KEYS) for (const target of relations[key] ?? []) {
				const targetSlug = resolveTarget(target);
				if (targetSlug !== null && targetSlug !== card.slug) inbound.set(targetSlug, (inbound.get(targetSlug) ?? 0) + 1);
			}
		}
		for (const card of fieldCards) {
			const dependsOn = (relationsOf.get(card.slug) ?? {}).depends_on ?? [];
			for (const target of dependsOn) {
				const targetSlug = resolveTarget(target);
				if (targetSlug === null) issues.push({
					severity: "warn",
					kind: "relation-dangling",
					path: card.path,
					message: `depends_on 指向的字段卡不存在：${target}（依赖应指向字段卡；若为外部系统字段请改用 implemented_in，或先建卡）`
				});
				else if (targetSlug === card.slug) issues.push({
					severity: "warn",
					kind: "relation-self",
					path: card.path,
					message: `depends_on 指向自身：${target}`
				});
				else {
					const back = (relationsOf.get(targetSlug)?.used_by ?? []).map(normalize);
					const selfIds = identifiersOf.get(card.slug) ?? [];
					if (!back.some((entry) => selfIds.some((identifier) => normalize(identifier) === entry))) issues.push({
						severity: "warn",
						kind: "relation-asymmetric",
						path: card.path,
						message: `血缘不对称：本卡 depends_on「${target}」，但对方 used_by 未包含本卡（建议补齐反向边，或确认方向）`
					});
				}
			}
		}
		const edges = /* @__PURE__ */ new Map();
		for (const card of fieldCards) {
			const targets = (relationsOf.get(card.slug)?.depends_on ?? []).map(resolveTarget).filter((slug) => slug !== null && slug !== card.slug);
			edges.set(card.slug, targets);
		}
		const state = /* @__PURE__ */ new Map();
		const stack = [];
		const reported = /* @__PURE__ */ new Set();
		const visit = (node) => {
			state.set(node, 1);
			stack.push(node);
			for (const next of edges.get(node) ?? []) if (state.get(next) === 1) {
				const cycle = [...stack.slice(stack.indexOf(next)), next].join(" → ");
				if (!reported.has(cycle)) {
					reported.add(cycle);
					issues.push({
						severity: "warn",
						kind: "relation-cycle",
						path: fieldCards.find((card) => card.slug === node)?.path,
						message: `血缘存在环：${cycle}`
					});
				}
			} else if (state.get(next) === void 0) visit(next);
			stack.pop();
			state.set(node, 2);
		};
		for (const card of fieldCards) if (state.get(card.slug) === void 0) visit(card.slug);
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
