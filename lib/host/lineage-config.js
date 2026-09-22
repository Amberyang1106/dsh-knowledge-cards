import { r as configRoot } from "../store-DFbZQRmj.js";
import { createHash } from "node:crypto";
import { promises } from "node:fs";
import { join } from "node:path";
//#region src/host/lineage-config.ts
/**
* Lineage/JEV run parameters: defaults, validation, the per-KB config file and
* the fingerprint that ties a round back to the settings that produced it.
*
* The file is `<configRoot>/lineage/<kbId>.config.json` and is read per request,
* so saving a change takes effect on the next run — no restart of dsh web.
*
* Only keys that differ from the defaults are written (a sparse file): a later
* version can then change a default and have it apply to every KB that never
* overrode it. `overridden` is derived from what the file actually holds.
*
* Invalid values are never silently coerced: on save they are rejected with a
* per-field reason, and on load a broken file falls back to defaults while
* reporting the issues so the panel can say so out loud.
* @module dsh-knowledge-cards/host/lineage-config
*/
/** Shipped defaults — the only place a default value is defined. */
const LINEAGE_CONFIG_DEFAULTS = {
	confidenceHigh: .8,
	confidenceMedium: .5,
	depThreshold: .5,
	additiveThreshold: .2,
	askFieldKind: true,
	askAdditive: true,
	excerptChars: 400,
	maxCards: 20,
	maxQuestions: 1200,
	questionsPerRequest: 60,
	payloadBudgetChars: 96e3,
	skipConfirmed: true
};
/**
* Ranges double as the panel's input constraints (the field list below is what
* the client renders), so bounds are stated once, here.
*/
const FIELD_SPECS = {
	confidenceHigh: {
		kind: "number",
		min: .01,
		max: 1,
		integer: false
	},
	confidenceMedium: {
		kind: "number",
		min: .01,
		max: 1,
		integer: false
	},
	depThreshold: {
		kind: "number",
		min: 0,
		max: 1,
		integer: false
	},
	additiveThreshold: {
		kind: "number",
		min: 0,
		max: 1,
		integer: false
	},
	askFieldKind: { kind: "boolean" },
	askAdditive: { kind: "boolean" },
	excerptChars: {
		kind: "number",
		min: 50,
		max: 2e3,
		integer: true
	},
	maxCards: {
		kind: "number",
		min: 1,
		max: 500,
		integer: true
	},
	maxQuestions: {
		kind: "number",
		min: 20,
		max: 2e4,
		integer: true
	},
	questionsPerRequest: {
		kind: "number",
		min: 10,
		max: 200,
		integer: true
	},
	payloadBudgetChars: {
		kind: "number",
		min: 1e4,
		max: 2e5,
		integer: true
	},
	skipConfirmed: { kind: "boolean" }
};
const CONFIG_KEYS = Object.keys(FIELD_SPECS);
/** Field descriptors for the panel form (ranges come from the specs above). */
function lineageConfigFields() {
	return CONFIG_KEYS.map((key) => {
		const spec = FIELD_SPECS[key];
		return spec.kind === "number" ? {
			key,
			kind: "number",
			min: spec.min,
			max: spec.max,
			integer: spec.integer,
			default: LINEAGE_CONFIG_DEFAULTS[key]
		} : {
			key,
			kind: "boolean",
			default: LINEAGE_CONFIG_DEFAULTS[key]
		};
	});
}
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Validate a (possibly partial) config object. Invalid or unknown entries are
* reported as issues AND fall back to their default, so the caller decides
* whether to reject (save) or carry on (load).
*/
function normalizeLineageConfig(input) {
	const config = { ...LINEAGE_CONFIG_DEFAULTS };
	const issues = [];
	if (input === void 0 || input === null) return {
		config,
		issues
	};
	if (!isPlainObject(input)) return {
		config,
		issues: [{
			field: "(root)",
			message: "配置必须是 JSON 对象"
		}]
	};
	for (const [key, raw] of Object.entries(input)) {
		if (!CONFIG_KEYS.includes(key)) {
			issues.push({
				field: key,
				message: "未知参数（不会被写入；请检查拼写）"
			});
			continue;
		}
		const typed = key;
		const spec = FIELD_SPECS[typed];
		if (spec.kind === "boolean") {
			if (typeof raw !== "boolean") {
				issues.push({
					field: key,
					message: `必须是 true 或 false（当前 ${JSON.stringify(raw)}）`
				});
				continue;
			}
			config[typed] = raw;
			continue;
		}
		if (typeof raw !== "number" || !Number.isFinite(raw)) {
			issues.push({
				field: key,
				message: `必须是数字（当前 ${JSON.stringify(raw)}）`
			});
			continue;
		}
		if (spec.integer && !Number.isInteger(raw)) {
			issues.push({
				field: key,
				message: `必须是整数（当前 ${raw}）`
			});
			continue;
		}
		if (raw < spec.min || raw > spec.max) {
			issues.push({
				field: key,
				message: `需在 ${spec.min}–${spec.max} 之间（当前 ${raw}）`
			});
			continue;
		}
		config[typed] = raw;
	}
	if (config.confidenceHigh <= config.confidenceMedium) {
		issues.push({
			field: "confidenceHigh",
			message: `必须大于 confidenceMedium（当前 ${config.confidenceHigh} ≤ ${config.confidenceMedium}）`
		});
		config.confidenceHigh = LINEAGE_CONFIG_DEFAULTS.confidenceHigh;
	}
	return {
		config,
		issues
	};
}
/** Path of one KB's parameter file. */
function lineageConfigPath(kb) {
	return join(configRoot(), "lineage", `${kb.id}.config.json`);
}
/** Stable fingerprint of the EFFECTIVE parameters (order-independent). */
function lineageConfigFingerprint(config) {
	const canonical = CONFIG_KEYS.slice().sort().map((key) => [key, config[key]]);
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 12);
}
/** Keys whose value differs from the shipped default. */
function overriddenKeys(config) {
	return CONFIG_KEYS.filter((key) => config[key] !== LINEAGE_CONFIG_DEFAULTS[key]);
}
/**
* Read one KB's parameters. A missing file means "all defaults" (not an error);
* an unreadable or invalid file reports issues and runs on defaults.
*/
async function loadLineageConfig(kb) {
	const path = lineageConfigPath(kb);
	let raw;
	try {
		raw = await promises.readFile(path, "utf8");
	} catch {
		return {
			config: { ...LINEAGE_CONFIG_DEFAULTS },
			overridden: [],
			issues: [],
			fingerprint: lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS),
			path
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return {
			config: { ...LINEAGE_CONFIG_DEFAULTS },
			overridden: [],
			issues: [{
				field: "(file)",
				message: `配置无法解析为 JSON，已回退默认值：${String(error.message ?? error)}`
			}],
			fingerprint: lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS),
			path
		};
	}
	const { config, issues } = normalizeLineageConfig(parsed);
	return {
		config,
		overridden: overriddenKeys(config),
		issues,
		fingerprint: lineageConfigFingerprint(config),
		path
	};
}
/**
* Persist the parameters of one KB. Writes only the keys that differ from the
* defaults, so an all-default config lands as `{}` and future default changes
* keep flowing through.
*/
async function saveLineageConfig(kb, config) {
	const path = lineageConfigPath(kb);
	await promises.mkdir(join(configRoot(), "lineage"), { recursive: true });
	const sparse = {};
	for (const key of overriddenKeys(config)) sparse[key] = config[key];
	await promises.writeFile(path, `${JSON.stringify(sparse, null, 2)}\n`, "utf8");
	return {
		config,
		overridden: overriddenKeys(config),
		issues: [],
		fingerprint: lineageConfigFingerprint(config),
		path
	};
}
/** Full payload the panel needs to render and save the form. */
function lineageConfigState(kb, loaded) {
	return {
		kb: kb.id,
		path: loaded.path,
		config: loaded.config,
		defaults: { ...LINEAGE_CONFIG_DEFAULTS },
		overridden: loaded.overridden,
		issues: loaded.issues,
		fingerprint: loaded.fingerprint,
		fields: lineageConfigFields()
	};
}
//#endregion
export { LINEAGE_CONFIG_DEFAULTS, lineageConfigFields, lineageConfigFingerprint, lineageConfigPath, lineageConfigState, loadLineageConfig, normalizeLineageConfig, overriddenKeys, saveLineageConfig };
