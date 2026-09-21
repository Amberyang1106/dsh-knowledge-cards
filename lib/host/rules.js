import { parseFrontmatter } from "../core/frontmatter.js";
import { I as today, O as readCard, R as RULE_OPERATORS, h as listCards, z as RULE_STATUSES } from "../store-Qx9J4iwF.js";
import { createHash } from "node:crypto";
//#region src/host/rules.ts
/**
* Rule-set compilation for rule cards (type=rules) — the stable interface
* between a knowledge base and external check pipelines (e.g. ROW PSD Recon).
*
* Reads rule cards from the KB, parses their structured frontmatter (nested
* YAML), validates shape (required fields / status lifecycle / operator
* whitelist), filters by rule set + status + effective window, and returns a
* versioned batch JSON via GET /api/dsh-knowledge/rules. Deterministic — no
* LLM. The caller pins the returned version/hash per run for traceability.
* @module dsh-knowledge-cards/host/rules
*/
function asString(value) {
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") return String(value);
}
function inEffectWindow(effectiveFrom, effectiveTo) {
	const now = today();
	if (effectiveFrom !== void 0 && effectiveFrom > now) return false;
	if (effectiveTo !== void 0 && effectiveTo < now) return false;
	return true;
}
/** Structural validation of one rule spec (fact registry stays with the
* evaluator side; unknown facts surface there at run time). */
function validateSpec(fm) {
	const issues = [];
	if (asString(fm.rule_id) === void 0) issues.push("缺 rule_id");
	if (asString(fm.rule_set) === void 0) issues.push("缺 rule_set");
	const status = asString(fm.status) ?? "draft";
	if (!RULE_STATUSES.includes(status)) issues.push(`status 非法: ${status}（应为 ${RULE_STATUSES.join("|")}）`);
	const conditions = Array.isArray(fm.conditions) ? fm.conditions : [];
	if (conditions.length === 0) issues.push("conditions 为空：至少一条 {fact, operator, value} 条件");
	conditions.forEach((entry, index) => {
		const prefix = `conditions[${index}]`;
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			issues.push(`${prefix} 非对象`);
			return;
		}
		const condition = entry;
		if (asString(condition.fact) === void 0) issues.push(`${prefix} 缺 fact`);
		const operator = asString(condition.operator);
		if (operator === void 0) issues.push(`${prefix} 缺 operator`);
		else if (!RULE_OPERATORS.includes(operator)) issues.push(`${prefix} operator 不支持: ${operator}（应为 ${RULE_OPERATORS.join("|")}）`);
	});
	const outcome = fm.outcome;
	if (typeof outcome !== "object" || outcome === null || Array.isArray(outcome)) issues.push("outcome 缺失或非对象");
	else if (asString(outcome.category) === void 0) issues.push("outcome.category 缺失（必填）");
	return issues;
}
/**
* Compile the rule set of one knowledge base.
* @param opts.ruleSet  only rules of this rule_set (bare default = all sets)
* @param opts.status   'active' (default) | 'all' | draft/review/deprecated
*/
async function compileRuleSet(kb, opts = {}) {
	const ruleSet = opts.ruleSet !== void 0 && opts.ruleSet.trim() !== "" ? opts.ruleSet.trim() : void 0;
	const statusFilter = opts.status !== void 0 && opts.status.trim() !== "" ? opts.status.trim() : "active";
	const wantedSet = (candidate) => ruleSet === void 0 || candidate === ruleSet;
	const compiled = [];
	const invalid = [];
	const cards = (await listCards(kb)).filter((card) => card.type === "rules");
	for (const meta of cards) {
		const card = await readCard(kb, meta.slug);
		if (card === null) continue;
		const fm = parseFrontmatter(card.raw).frontmatter ?? {};
		const title = String(fm.title ?? meta.title);
		if (!wantedSet(asString(fm.rule_set))) continue;
		const issues = validateSpec(fm);
		const status = asString(fm.status) ?? "draft";
		const effectiveFrom = asString(fm.effective_from);
		const effectiveTo = asString(fm.effective_to);
		if (issues.length > 0) {
			invalid.push({
				slug: meta.slug,
				title,
				issues
			});
			continue;
		}
		if (statusFilter !== "all" && status !== statusFilter) continue;
		if (status === "active" && !inEffectWindow(effectiveFrom, effectiveTo)) {
			invalid.push({
				slug: meta.slug,
				title,
				issues: ["status 为 active 但当前日期不在生效期（effective_from/to）内"]
			});
			continue;
		}
		compiled.push({
			slug: meta.slug,
			title,
			description: meta.description,
			updated: meta.updated,
			spec: fm,
			body: card.body
		});
	}
	compiled.sort((a, b) => (a.spec.rule_id ?? "").localeCompare(b.spec.rule_id ?? ""));
	const canonical = JSON.stringify(compiled.map((rule) => rule.spec));
	const hash = createHash("sha256").update(canonical).digest("hex");
	const version = `sha256:${hash.slice(0, 8)}`;
	return {
		kb: kb.id,
		ruleSet: ruleSet ?? "",
		version,
		hash,
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		statusFilter,
		rules: compiled,
		invalidRules: invalid
	};
}
//#endregion
export { compileRuleSet };
