import { parseFrontmatter } from "../core/frontmatter.js";
import { O as readCard, h as listCards } from "../store-DFbZQRmj.js";
import { LINEAGE_CONFIG_DEFAULTS, lineageConfigFingerprint, loadLineageConfig } from "./lineage-config.js";
//#region src/host/jev.ts
/**
* JEV (TypeSafe System One) lineage judging — the "② JEV 判断" branch.
*
* Jev is not a chat model: it evaluates a `state` against a map of typed
* questions (noul / choice / score) and returns structured answers with
* confidence. We therefore decompose lineage completion into atomic questions
* (one noul per ordered card pair + a few metadata questions), send a
* MINIMIZED state (no SQL bodies, no numbers, truncated excerpts), and turn
* the typed answers back into ordinary LineageProposals — the preview/apply
* path stays exactly the same.
*
* Every tuning knob (thresholds, question toggles, volume, batching, the
* confirmed-card skip) comes from LineageConfig so the panel can edit it.
*
* Two interchangeable lines carry the same NATIVE System One shape, so the
* request body is identical either way:
*  - OpenRouter (default): POST https://openrouter.ai/api/v1/systemone with
*    model typesafe/jev-1.13 (bare `jev-1.13` / `jev-latest` are mapped onto
*    the typesafe/ namespace). Verified 2026-09: the route answers 401 rather
*    than 404 without a key, and the model is missing from GET /api/v1/models
*    only because its output modality is `decisions`, not `text`. OpenRouter
*    does NOT expose Jev through the OpenAI-compatible chat endpoint.
*  - TypeSafe direct (fallback): POST https://api.typesafe.ai/v1/systemone.
* Request {model, state, questions} → response {model, answers, usage};
* OpenRouter additionally returns id / provider / usage.cost.
* Context is 32k tokens, $0.042/M input, output free, no parameters supported.
* @module dsh-knowledge-cards/host/jev
*/
const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TYPESAFE_MODEL = "jev-latest";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/systemone";
const OPENROUTER_MODEL = "jev-1.13";
function credentialLookup(ctx) {
	const service = ctx.reflect.get("credentials", false);
	if (service === void 0 || service === null || typeof service.resolve !== "function") return void 0;
	return async (ref) => {
		const hit = await service.resolve(ref);
		if (hit === void 0 || hit === null) return void 0;
		return {
			value: typeof hit.value === "string" ? hit.value : "",
			source: typeof hit.source === "string" ? hit.source : "credentials"
		};
	};
}
/**
* Resolve the line and its key. OpenRouter wins when its key is set (one key
* for the whole setup, plus per-call usage.cost); a TypeSafe-only setup keeps
* working untouched.
*
* The credential lookup is consulted BEFORE the raw environment, because DSH's
* provider layers the inherited environment over `$DSH_HOME/.credentials.yaml`
* and then the project/user `.env` files — so it is a superset of what
* `process.env` holds, and it is the only view that can say where a key came
* from. The environment remains the fallback for hosts without the service.
* JEV_ENDPOINT / JEV_MODEL are not secrets and stay environment-only.
*/
async function resolveJevConfig(env = process.env, lookup) {
	const candidates = [{
		ref: "OPENROUTER_API_KEY",
		line: "openrouter"
	}, {
		ref: "TYPESAFE_API_KEY",
		line: "typesafe"
	}];
	let chosen = null;
	for (const candidate of candidates) {
		if (lookup !== void 0) {
			const hit = await lookup(candidate.ref);
			const value = (hit?.value ?? "").trim();
			if (value !== "") {
				chosen = {
					line: candidate.line,
					apiKey: value,
					keySource: hit?.source ?? "credentials"
				};
				break;
			}
		}
		const fromEnv = (env[candidate.ref] ?? "").trim();
		if (fromEnv !== "") {
			chosen = {
				line: candidate.line,
				apiKey: fromEnv,
				keySource: "env"
			};
			break;
		}
	}
	if (chosen === null) return null;
	const endpointOverride = (env.JEV_ENDPOINT ?? "").trim();
	const modelOverride = (env.JEV_MODEL ?? "").trim();
	return {
		line: chosen.line,
		endpoint: endpointOverride !== "" ? endpointOverride : chosen.line === "openrouter" ? OPENROUTER_ENDPOINT : TYPESAFE_ENDPOINT,
		model: modelOverride !== "" ? modelOverride : chosen.line === "openrouter" ? OPENROUTER_MODEL : TYPESAFE_MODEL,
		apiKey: chosen.apiKey,
		keySource: chosen.keySource
	};
}
/**
* Minimized state: metadata + a short excerpt with code fences and long digit
* runs removed. Raw SQL, amounts and long identifiers never leave the machine.
*/
function minimizeExcerpt(body, excerptChars) {
	return body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/\d[\d,.\s]{4,}/g, " ").replace(/\s+/g, " ").trim().slice(0, excerptChars);
}
/** Load the field cards of one KB as minimized JEV state + review status. */
async function buildJevCardScopes(kb, excerptChars = LINEAGE_CONFIG_DEFAULTS.excerptChars) {
	const scopes = [];
	for (const meta of (await listCards(kb)).filter((card) => card.type === "field")) {
		const card = await readCard(kb, meta.slug);
		if (card === null) continue;
		const fm = parseFrontmatter(card.raw).frontmatter ?? {};
		const listOf = (value) => Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim() !== "") : void 0;
		const text = (value) => typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
		scopes.push({
			reviewStatus: text(fm.review_status) ?? "",
			state: {
				slug: meta.slug,
				title: meta.title,
				description: meta.description,
				aliases: listOf(fm.aliases),
				field_kind: text(fm.field_kind),
				data_type: text(fm.data_type),
				aggregation: text(fm.aggregation),
				unit: text(fm.unit),
				source_table: text(fm.source_table),
				source_field: text(fm.source_field),
				depends_on: listOf(fm.depends_on),
				used_by: listOf(fm.used_by),
				excerpt: minimizeExcerpt(card.body, excerptChars) || void 0
			}
		});
	}
	return scopes;
}
/** Just the states (the shape actually sent to the API). */
async function buildJevState(kb, excerptChars) {
	return (await buildJevCardScopes(kb, excerptChars)).map((scope) => scope.state);
}
const ALL_JUDGED = () => true;
/**
* Atomic questions. Card content lives in `state.cards` exactly once and every
* question refers to a card only by slug — that is what keeps the body inside
* the 32k context. (The first version inlined both cards of every ordered pair
* into the question, so the request grew as N² and already hit the wall at ten
* cards.) Keys are local to us; the API never sees them.
* `dep::A::B` asks whether A derives its values from B as a DIRECT dependency.
*/
function buildJevQuestions(states, options = {}) {
	const askFieldKind = options.askFieldKind ?? true;
	const askAdditive = options.askAdditive ?? true;
	const isJudged = options.isJudged ?? ALL_JUDGED;
	const questions = {};
	for (const source of states) {
		const sourceJudged = isJudged(source.slug);
		for (const target of states) {
			if (source.slug === target.slug) continue;
			if (!sourceJudged && !isJudged(target.slug)) continue;
			questions[`dep::${source.slug}::${target.slug}`] = {
				type: "noul",
				instructions: `In state.cards, does slug "${source.slug}" derive its values FROM slug "${target.slug}" as a DIRECT dependency (its own documented formula or 取数步骤 reads that card), rather than merely mentioning it, being a sibling attribute of the same object, or depending on it only indirectly through a third card?`,
				criteria: {
					true: `state.cards["${source.slug}"] directly reads or computes from state.cards["${target.slug}"].`,
					false: "No direct dependency: sibling attribute, mere mention, external table/tool, or only an indirect dependency."
				}
			};
		}
		if (!sourceJudged) continue;
		if (askFieldKind) questions[`kind::${source.slug}`] = {
			type: "choice",
			instructions: `Which field_kind best describes state.cards["${source.slug}"]?`,
			criteria: {
				measure: "A numeric amount/quantity that is aggregated (revenue, cost, count).",
				dimension: "A descriptive attribute used for grouping/filtering (id, name, number, office).",
				calculated_field: "Derived by a formula over other fields rather than stored.",
				flag: "A yes/no indicator.",
				key: "A join/business key.",
				mapping: "A lookup/translation mapping.",
				date: "A date/period.",
				attribute: "Other descriptive attribute that is not a grouping dimension.",
				parameter: "A run-time parameter."
			}
		};
		if (askAdditive) questions[`agg::${source.slug}`] = {
			type: "noul",
			instructions: `Is it correct to treat state.cards["${source.slug}"] as 'additive' — i.e. summing it across rows produces a meaningful total?`,
			criteria: {
				true: "Summing the values is meaningful.",
				false: "Summing is meaningless (dimension/ratio/percentage/flag)."
			}
		};
	}
	return questions;
}
/**
* Apply the confirmed-card skip at PAIR level and count what the round costs.
* A card counts as done when skipConfirmed is on, it is `review_status:
* confirmed`, and it was not forced back in for this run.
*/
function planJevScope(scopes, params, force = {}) {
	const forced = new Set(force.slugs ?? []);
	const isDone = (scope) => params.skipConfirmed && force.all !== true && !forced.has(scope.state.slug) && scope.reviewStatus === "confirmed";
	const done = scopes.filter(isDone);
	const judged = scopes.filter((scope) => !isDone(scope));
	const cardCount = scopes.length;
	const metaPerCard = (params.askFieldKind ? 1 : 0) + (params.askAdditive ? 1 : 0);
	const skippedPairCount = done.length * Math.max(0, done.length - 1);
	const questionCount = cardCount * Math.max(0, cardCount - 1) - skippedPairCount + judged.length * metaPerCard;
	return {
		sent: scopes.map((scope) => scope.state),
		judged: judged.map((scope) => scope.state.slug),
		skipped: done.map((scope) => scope.state.slug),
		judgedCardCount: judged.length,
		skippedPairCount,
		questionCount
	};
}
/** Call the System One endpoint. Throws on transport/API errors. */
async function callJev(state, questions, options) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 9e4);
	try {
		const response = await fetch(options.endpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				state,
				model: options.model,
				questions
			}),
			signal: controller.signal
		});
		const text = await response.text();
		if (!response.ok) throw new Error(`jev HTTP ${response.status}: ${text.slice(0, 300)}`);
		const parsed = JSON.parse(text);
		return {
			model: parsed.model ?? options.model,
			answers: parsed.answers ?? {},
			usage: parsed.usage
		};
	} finally {
		clearTimeout(timer);
	}
}
const PROPOSAL_DEFAULTS = {
	confidenceHigh: LINEAGE_CONFIG_DEFAULTS.confidenceHigh,
	confidenceMedium: LINEAGE_CONFIG_DEFAULTS.confidenceMedium,
	depThreshold: LINEAGE_CONFIG_DEFAULTS.depThreshold,
	additiveThreshold: LINEAGE_CONFIG_DEFAULTS.additiveThreshold,
	paramsFingerprint: lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS)
};
/**
* Map typed answers to ordinary lineage proposals:
*  - `dep::A::B` (noul ≥ depThreshold) → A depends_on B (+ the reverse used_by edge)
*  - `kind::X` (choice) → metadata correction when it disagrees with the card
*  - `agg::X` (noul) with a dimension-ish card → aggregation correction
* Every note carries the parameter fingerprint of the round.
*/
function jevProposals(kb, states, answers, options = PROPOSAL_DEFAULTS) {
	const band = (value) => value >= options.confidenceHigh ? "high" : value >= options.confidenceMedium ? "medium" : "low";
	const note = `JEV 判断（参数 ${options.paramsFingerprint} · 待人工确认）`;
	const proposals = [];
	const bySlug = new Map(states.map((state) => [state.slug, state]));
	for (const [key, answer] of Object.entries(answers)) {
		const [kind, from, to] = key.split("::");
		if (kind === "dep" && typeof answer.noul === "number" && answer.noul >= options.depThreshold) {
			const source = bySlug.get(from);
			const target = bySlug.get(to);
			if (source === void 0 || target === void 0) continue;
			const score = answer.noul;
			proposals.push({
				slug: from,
				title: source.title,
				source: "jev",
				confidence: band(score),
				score,
				evidence: `JEV noul=${score.toFixed(2)}（${band(score)}）：${source.title} 的取数逻辑直接依赖 ${target.title}`,
				relations: { depends_on: [to] },
				note
			});
			proposals.push({
				slug: to,
				title: target.title,
				source: "jev",
				confidence: band(score),
				score,
				evidence: `反向边：JEV 判定 ${source.title} 依赖本卡`,
				relations: { used_by: [from] },
				note
			});
		}
		if (kind === "kind" && typeof answer.choice === "string") {
			const state = bySlug.get(from);
			if (state === void 0 || state.field_kind === answer.choice) continue;
			proposals.push({
				slug: from,
				title: state.title,
				source: "jev",
				confidence: band(answer.confidence ?? options.confidenceMedium),
				score: answer.confidence,
				evidence: `JEV 判定 field_kind 应为 ${answer.choice}（当前 ${state.field_kind ?? "未填"}）`,
				relations: {},
				metadata: { field_kind: answer.choice },
				note
			});
		}
		if (kind === "agg" && typeof answer.noul === "number") {
			const state = bySlug.get(from);
			if (state === void 0) continue;
			const dimensionLike = state.field_kind === "dimension" || state.field_kind === "key" || state.data_type === "string";
			if (answer.noul <= options.additiveThreshold && dimensionLike && state.aggregation === "additive") proposals.push({
				slug: from,
				title: state.title,
				source: "jev",
				confidence: band(1 - answer.noul),
				score: 1 - answer.noul,
				evidence: `JEV noul=${answer.noul.toFixed(2)}：${state.title} 不应可加总（当前 aggregation=additive）`,
				relations: {},
				metadata: { aggregation: "non-additive" },
				note
			});
		}
	}
	return proposals;
}
/** Split a question map into consecutive batches of at most `size` entries. */
function chunkQuestions(questions, size) {
	const entries = Object.entries(questions);
	const batches = [];
	for (let index = 0; index < entries.length; index += size) batches.push(Object.fromEntries(entries.slice(index, index + size)));
	return batches.length > 0 ? batches : [{}];
}
/** Sum the numeric counters of successive usage reports (tokens, cost). */
function mergeUsage(target, extra) {
	if (extra === void 0) return;
	for (const [key, value] of Object.entries(extra)) if (typeof value === "number" && typeof target[key] === "number") target[key] = target[key] + value;
	else target[key] = value;
}
/**
* Full JEV round: scope plan → state → questions → batches → budget gate → API
* → proposals. Answers from every batch are merged into one map, so the
* downstream proposal/preview/apply path is unaffected by how the round was
* split and by which cards were skipped.
*/
async function runJevLineage(kb, transport, options = {}) {
	const resolved = transport ?? await resolveJevConfig();
	if (resolved === null) throw new Error("未配置 JEV key：请在 DSH 凭据库（~/.dsh/.credentials.yaml）或环境变量设置 OPENROUTER_API_KEY（默认线路）或 TYPESAFE_API_KEY");
	const params = options.params ?? (await loadLineageConfig(kb)).config;
	const scopes = await buildJevCardScopes(kb, params.excerptChars);
	if (scopes.length === 0) throw new Error("该知识库没有字段卡（type=field）");
	const plan = planJevScope(scopes, params, {
		slugs: options.forceSlugs,
		all: options.forceAll
	});
	if (plan.judgedCardCount === 0) throw new Error(`全部 ${scopes.length} 张字段卡都已确认（review_status=confirmed），本轮无卡可判；如需重判请在面板勾选「强制重判」或打开「全量重跑」`);
	if (plan.judgedCardCount > params.maxCards) throw new Error(`本轮参与判定的字段卡 ${plan.judgedCardCount} 张（共 ${scopes.length} 张，已跳过 ${plan.skipped.length} 张已确认卡），超过上限 ${params.maxCards} 张；请先确认更多卡片把它们跳过，或在面板里调高 maxCards`);
	if (plan.questionCount > params.maxQuestions) throw new Error(`本轮问题数 ${plan.questionCount} 超过上限 ${params.maxQuestions}；请先确认更多卡片（跳过已维护的）、减少参与判定的卡片，或在面板里调高 maxQuestions`);
	const judged = new Set(plan.judged);
	const questions = buildJevQuestions(plan.sent, {
		askFieldKind: params.askFieldKind,
		askAdditive: params.askAdditive,
		isJudged: (slug) => judged.has(slug)
	});
	const state = {
		kb: kb.id,
		cards: plan.sent
	};
	const stateJson = JSON.stringify(state);
	const batches = chunkQuestions(questions, params.questionsPerRequest);
	const answers = {};
	const usage = {};
	let sawUsage = false;
	let model = resolved.model;
	let payloadChars = 0;
	for (const batch of batches) {
		const batchChars = JSON.stringify({
			state,
			model: resolved.model,
			questions: batch
		}).length;
		if (batchChars > params.payloadBudgetChars) throw new Error(`JEV 单批请求体 ${batchChars} 字符，超过预算 ${params.payloadBudgetChars}（32k 上下文的保守估计；本轮 state 含 ${plan.sent.length} 张卡、每批 ${Object.keys(batch).length} 个问题）；请调小 excerptChars/questionsPerRequest，或减少参与判定的卡片后重试`);
		payloadChars = Math.max(payloadChars, batchChars);
		const response = await callJev(state, batch, {
			apiKey: resolved.apiKey,
			endpoint: resolved.endpoint,
			model: resolved.model
		});
		Object.assign(answers, response.answers);
		if (response.usage !== void 0) sawUsage = true;
		mergeUsage(usage, response.usage);
		model = response.model ?? model;
	}
	const paramsFingerprint = lineageConfigFingerprint(params);
	return {
		kb: kb.id,
		line: resolved.line,
		keySource: resolved.keySource,
		paramsFingerprint,
		model,
		proposals: jevProposals(kb, plan.sent, answers, {
			confidenceHigh: params.confidenceHigh,
			confidenceMedium: params.confidenceMedium,
			depThreshold: params.depThreshold,
			additiveThreshold: params.additiveThreshold,
			paramsFingerprint
		}),
		usage: sawUsage ? usage : void 0,
		sentCards: plan.sent.length,
		judgedCards: plan.judgedCardCount,
		skippedCards: plan.skipped,
		skippedPairCount: plan.skippedPairCount,
		stateChars: stateJson.length,
		questionCount: Object.keys(questions).length,
		requests: batches.length,
		payloadChars,
		budgetChars: params.payloadBudgetChars
	};
}
//#endregion
export { buildJevCardScopes, buildJevQuestions, buildJevState, callJev, credentialLookup, jevProposals, planJevScope, resolveJevConfig, runJevLineage };
