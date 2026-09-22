import { parseFrontmatter } from "../core/frontmatter.js";
import { O as readCard, h as listCards } from "../store-Cago3cTl.js";
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
* Endpoint/limits (docs.typesafe.ai): POST https://api.typesafe.ai/v1/systemone,
* Bearer key, model jev-latest, 64k context, $42/Btok input (output free).
* @module dsh-knowledge-cards/host/jev
*/
/** Endpoint and model (the docs' single evaluation endpoint). */
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
/** Guard: pairwise questions grow as N² — refuse to send a giant batch. */
const MAX_CARDS = 20;
/** Excerpt budget per card in the minimized state. */
const EXCERPT_CHARS = 400;
/**
* Minimized state: metadata + a short excerpt with code fences and long digit
* runs removed. Raw SQL, amounts and long identifiers never leave the machine.
*/
function minimizeExcerpt(body) {
	return body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ").replace(/\d[\d,.\s]{4,}/g, " ").replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS);
}
/** Load the field cards of one KB as minimized JEV state entries. */
async function buildJevState(kb) {
	const states = [];
	for (const meta of (await listCards(kb)).filter((card) => card.type === "field")) {
		const card = await readCard(kb, meta.slug);
		if (card === null) continue;
		const fm = parseFrontmatter(card.raw).frontmatter ?? {};
		const listOf = (value) => Array.isArray(value) ? value.map((item) => String(item)).filter((item) => item.trim() !== "") : void 0;
		const text = (value) => typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
		states.push({
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
			excerpt: minimizeExcerpt(card.body) || void 0
		});
	}
	return states;
}
/**
* Atomic questions: one noul per ordered pair asking whether the first card's
* documented logic derives from the second (direct dependency only). Keys are
* local to us (the API never sends them to the model).
*/
function buildJevQuestions(states) {
	const questions = {};
	for (const source of states) {
		for (const target of states) {
			if (source.slug === target.slug) continue;
			questions[`dep::${source.slug}::${target.slug}`] = {
				type: "noul",
				instructions: {
					source_card: {
						slug: source.slug,
						title: source.title,
						description: source.description,
						source_table: source.source_table,
						excerpt: source.excerpt
					},
					target_card: {
						slug: target.slug,
						title: target.title,
						description: target.description,
						source_table: target.source_table,
						excerpt: target.excerpt
					},
					question: `Does \`source_card\`'s documented logic derive its values FROM \`target_card\` as a DIRECT dependency (its own formula/取数步骤 reads the target), rather than merely mentioning it, being a sibling attribute of the same object, or depending on it only indirectly through a third card?`
				},
				criteria: {
					true: "source_card directly reads/computes from target_card (direct dependency).",
					false: "No such direct dependency: sibling attribute, mere mention, external table/tool, or transitive dependency."
				}
			};
		}
		questions[`kind::${source.slug}`] = {
			type: "choice",
			instructions: `Which field_kind best describes \`card\` (slug ${source.slug}, title ${source.title}, data_type ${source.data_type ?? "unknown"})?`,
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
		questions[`agg::${source.slug}`] = {
			type: "noul",
			instructions: `Is it correct to treat \`card\` (slug ${source.slug}, field_kind ${source.field_kind ?? "unknown"}, data_type ${source.data_type ?? "unknown"}) as 'additive' — i.e. summing it across rows produces a meaningful total?`,
			criteria: {
				true: "Summing the values is meaningful.",
				false: "Summing is meaningless (dimension/ratio/percentage/flag)."
			}
		};
	}
	return questions;
}
/** Call the TypeSafe evaluation endpoint. Throws on transport/API errors. */
async function callJev(state, questions, options) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 9e4);
	try {
		const response = await fetch(JEV_ENDPOINT, {
			method: "POST",
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				state,
				model: JEV_MODEL,
				questions
			}),
			signal: controller.signal
		});
		const text = await response.text();
		if (!response.ok) throw new Error(`jev HTTP ${response.status}: ${text.slice(0, 300)}`);
		const parsed = JSON.parse(text);
		return {
			model: parsed.model ?? JEV_MODEL,
			answers: parsed.answers ?? {},
			usage: parsed.usage
		};
	} finally {
		clearTimeout(timer);
	}
}
const bandToLabel = (value) => value >= .8 ? "high" : value >= .5 ? "medium" : "low";
/**
* Map typed answers to ordinary lineage proposals:
*  - `dep::A::B` (noul ≥ 0.5) → A depends_on B (+ the reverse used_by edge)
*  - `kind::X` (choice) → metadata correction when it disagrees with the card
*  - `agg::X` (noul) with a dimension-ish card → aggregation correction
*/
function jevProposals(kb, states, answers) {
	const proposals = [];
	const bySlug = new Map(states.map((state) => [state.slug, state]));
	for (const [key, answer] of Object.entries(answers)) {
		const [kind, from, to] = key.split("::");
		if (kind === "dep" && typeof answer.noul === "number" && answer.noul >= .5) {
			const source = bySlug.get(from);
			const target = bySlug.get(to);
			if (source === void 0 || target === void 0) continue;
			const score = answer.noul;
			const evidence = `JEV noul=${score.toFixed(2)}（${bandToLabel(score)}）：${source.title} 的取数逻辑直接依赖 ${target.title}`;
			proposals.push({
				slug: from,
				title: source.title,
				source: "jev",
				confidence: bandToLabel(score),
				score,
				evidence,
				relations: { depends_on: [to] },
				note: "JEV 判断（待人工确认）"
			});
			proposals.push({
				slug: to,
				title: target.title,
				source: "jev",
				confidence: bandToLabel(score),
				score,
				evidence: `反向边：JEV 判定 ${source.title} 依赖本卡`,
				relations: { used_by: [from] },
				note: "JEV 判断（待人工确认）"
			});
		}
		if (kind === "kind" && typeof answer.choice === "string") {
			const state = bySlug.get(from);
			if (state === void 0 || state.field_kind === answer.choice) continue;
			proposals.push({
				slug: from,
				title: state.title,
				source: "jev",
				confidence: bandToLabel(answer.confidence ?? .5),
				score: answer.confidence,
				evidence: `JEV 判定 field_kind 应为 ${answer.choice}（当前 ${state.field_kind ?? "未填"}）`,
				relations: {},
				metadata: { field_kind: answer.choice },
				note: "JEV 判断（待人工确认）"
			});
		}
		if (kind === "agg" && typeof answer.noul === "number") {
			const state = bySlug.get(from);
			if (state === void 0) continue;
			const dimensionLike = state.field_kind === "dimension" || state.field_kind === "key" || state.data_type === "string";
			if (answer.noul <= .2 && dimensionLike && state.aggregation === "additive") proposals.push({
				slug: from,
				title: state.title,
				source: "jev",
				confidence: bandToLabel(1 - answer.noul),
				score: 1 - answer.noul,
				evidence: `JEV noul=${answer.noul.toFixed(2)}：${state.title} 不应可加总（当前 aggregation=additive）`,
				relations: {},
				metadata: { aggregation: "non-additive" },
				note: "JEV 判断（待人工确认）"
			});
		}
	}
	return proposals;
}
/** Full JEV round: state → questions → API → proposals. */
async function runJevLineage(kb, apiKey) {
	const states = await buildJevState(kb);
	if (states.length === 0) throw new Error("该知识库没有字段卡（type=field）");
	if (states.length > MAX_CARDS) throw new Error(`字段卡 ${states.length} 张，超过 JEV 单轮上限 ${MAX_CARDS} 张；请按 subject_area 分批，或先用确定性预扫`);
	const questions = buildJevQuestions(states);
	const state = {
		kb: kb.id,
		cards: states
	};
	const stateJson = JSON.stringify(state);
	const response = await callJev(state, questions, { apiKey });
	return {
		kb: kb.id,
		model: response.model,
		proposals: jevProposals(kb, states, response.answers),
		usage: response.usage,
		sentCards: states.length,
		stateChars: stateJson.length,
		questionCount: Object.keys(questions).length
	};
}
//#endregion
export { buildJevQuestions, buildJevState, callJev, jevProposals, runJevLineage };
