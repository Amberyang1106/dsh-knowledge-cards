//#region src/core/frontmatter.ts
const OPEN = "---";
/** Frontmatter keys the plugin itself manages on every card write. */
const MANAGED_FRONTMATTER_KEYS = [
	"type",
	"title",
	"description",
	"tags",
	"related",
	"sources",
	"created",
	"updated"
];
function isManagedFrontmatterKey(key) {
	return MANAGED_FRONTMATTER_KEYS.includes(key);
}
function stripCodeFence(text) {
	return text.replace(/^```(?:yaml|yml)?\s*\r?\n/, "").replace(/\r?\n```\s*$/, "");
}
function stripFrontmatterKey(text) {
	return text.replace(/^frontmatter:\s*\r?\n/i, "");
}
/** Locate the frontmatter block (lenient: may lack the opening fence). */
function locate(text) {
	if (text.startsWith(OPEN)) {
		const end = text.indexOf("\n---", 3);
		if (end !== -1) {
			const fenceEnd = text.indexOf("\n", end + 1);
			const bodyStart = fenceEnd === -1 ? text.length : fenceEnd + 1;
			return {
				block: text.slice(0, bodyStart),
				bodyStart
			};
		}
		return null;
	}
	const cleaned = stripCodeFence(stripFrontmatterKey(text));
	if (cleaned !== text) {
		const inner = locate(cleaned);
		if (inner !== null) {
			const removed = text.length - cleaned.length;
			return {
				block: inner.block,
				bodyStart: inner.bodyStart + removed
			};
		}
	}
	const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
	if (/^[A-Za-z_][\w-]*\s*:/.test(firstLine.trim())) {
		const end = text.indexOf("\n---", 1);
		if (end !== -1) {
			const fenceEnd = text.indexOf("\n", end + 1);
			const bodyStart = fenceEnd === -1 ? text.length : fenceEnd + 1;
			return {
				block: text.slice(0, bodyStart),
				bodyStart
			};
		}
	}
	return null;
}
function parseScalar(raw) {
	const value = raw.trim();
	if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1).replace(/\\"/g, "\"");
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "~" || value === "") return "";
	if (/^-?\d+$/.test(value)) return Number(value);
	return value;
}
/** Split a comma list at top level, honoring quotes and nested {} / []. */
function splitTopLevel(text) {
	const parts = [];
	let current = "";
	let quote = null;
	let depth = 0;
	for (const char of text) if (quote !== null) {
		current += char;
		if (char === quote) quote = null;
	} else if (char === "\"" || char === "'") {
		quote = char;
		current += char;
	} else if (char === "{" || char === "[") {
		depth += 1;
		current += char;
	} else if (char === "}" || char === "]") {
		depth = Math.max(0, depth - 1);
		current += char;
	} else if (char === "," && depth === 0) {
		parts.push(current);
		current = "";
	} else current += char;
	parts.push(current);
	return parts;
}
function normalizeKey(key) {
	return key.trim().replace(/^["']|["']$/g, "");
}
/** Parse one flow value token: flow map `{...}`, flow array `[...]`, scalar. */
function parseFlowValue(raw) {
	const value = raw.trim();
	if (value.startsWith("{") && value.endsWith("}")) return parseFlowMap(value);
	if (value.startsWith("[") && value.endsWith("]")) return parseFlowArray(value);
	return parseScalar(value);
}
/** Parse `{k: v, nested: {…}, list: [a, b]}` into an object. */
function parseFlowMap(raw) {
	const body = raw.trim();
	const inner = body.startsWith("{") && body.endsWith("}") ? body.slice(1, -1).trim() : body;
	const result = {};
	if (inner === "") return result;
	for (const item of splitTopLevel(inner)) {
		const colon = findTopLevelColon(item);
		if (colon === -1) continue;
		const key = normalizeKey(item.slice(0, colon));
		if (key === "") continue;
		result[key] = parseFlowValue(item.slice(colon + 1));
	}
	return result;
}
/** Parse `[a, b, {k: v}, [x]]` into an array. */
function parseFlowArray(raw) {
	const inner = raw.trim();
	const body = inner.startsWith("[") && inner.endsWith("]") ? inner.slice(1, -1).trim() : inner;
	if (body === "") return [];
	return splitTopLevel(body).map((item) => {
		return parseFlowValue(item.trim().replace(/^\[\[|\]\]$/g, ""));
	});
}
/** Find the first top-level `:` (outside quotes and nested braces/brackets). */
function findTopLevelColon(text) {
	let quote = null;
	let depth = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (quote !== null) {
			if (char === quote) quote = null;
		} else if (char === "\"" || char === "'") quote = char;
		else if (char === "{" || char === "[") depth += 1;
		else if (char === "}" || char === "]") depth = Math.max(0, depth - 1);
		else if (char === ":" && depth === 0) return index;
	}
	return -1;
}
const KEY_RE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
function isKeyLine(line) {
	return KEY_RE.test(line.text);
}
function isDashLine(line) {
	return /^-(\s|$)/.test(line.text);
}
/** The remainder after `- ` (empty when the dash stands alone). */
function dashRest(line) {
	return line.text.replace(/^-\s*/, "").trim();
}
function lineIndent(raw) {
	return (raw.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
}
/**
* Block structure parser (recursive descent over indented lines). Supports
* maps (key lines at one indent), lists (dash lines at one indent), and
* dash-map items whose sibling keys continue at a deeper indent.
*/
/** Parse `key: value` entries whose lines sit at exactly `indent`. */
function parseEntries(lines, start, indent) {
	const map = {};
	let cursor = start;
	while (cursor < lines.length) {
		const line = lines[cursor];
		if (line.text.trim() === "") {
			cursor += 1;
			continue;
		}
		if (line.indent < indent) break;
		if (line.indent > indent) {
			cursor += 1;
			continue;
		}
		if (isDashLine(line) || !isKeyLine(line)) {
			cursor += 1;
			continue;
		}
		const match = KEY_RE.exec(line.text);
		if (match === null) {
			cursor += 1;
			continue;
		}
		const key = normalizeKey(match[1]);
		const rest = match[2].trim();
		const parsed = parseInlineOrBlock(lines, cursor, indent, rest);
		map[key] = parsed.value;
		cursor = parsed.next;
	}
	return {
		map,
		next: cursor
	};
}
/**
* Resolve one entry's value: inline scalar / flow map / flow array when `rest`
* is non-empty, otherwise a nested block (list or map) on deeper lines.
*/
function parseInlineOrBlock(lines, idx, keyIndent, rest) {
	if (rest.startsWith("{") && rest.endsWith("}")) return {
		value: parseFlowMap(rest),
		next: idx + 1
	};
	if (rest.startsWith("[")) return {
		value: parseFlowArray(rest),
		next: idx + 1
	};
	if (rest !== "") return {
		value: parseScalar(rest),
		next: idx + 1
	};
	let cursor = idx + 1;
	while (cursor < lines.length && lines[cursor].text.trim() === "") cursor += 1;
	if (cursor >= lines.length || lines[cursor].indent <= keyIndent) return {
		value: [],
		next: idx + 1
	};
	if (isDashLine(lines[cursor])) {
		const parsed = parseList(lines, cursor, lines[cursor].indent);
		return {
			value: parsed.list,
			next: parsed.next
		};
	}
	const parsed = parseEntries(lines, cursor, lines[cursor].indent);
	return {
		value: parsed.map,
		next: parsed.next
	};
}
/** Parse `- item` lines at exactly `indent`. */
function parseList(lines, start, indent) {
	const list = [];
	let cursor = start;
	while (cursor < lines.length) {
		const line = lines[cursor];
		if (line.text.trim() === "") {
			cursor += 1;
			continue;
		}
		if (line.indent !== indent || !isDashLine(line)) break;
		const rest = dashRest(line);
		if (rest === "") {
			let inner = cursor + 1;
			while (inner < lines.length && lines[inner].text.trim() === "") inner += 1;
			if (inner < lines.length && lines[inner].indent > indent) if (isDashLine(lines[inner])) {
				const nested = parseList(lines, inner, lines[inner].indent);
				list.push(nested.list);
				cursor = nested.next;
			} else {
				const nested = parseEntries(lines, inner, lines[inner].indent);
				list.push(nested.map);
				cursor = nested.next;
			}
			else {
				list.push("");
				cursor += 1;
			}
			continue;
		}
		if (rest.startsWith("{") && rest.endsWith("}")) {
			list.push(parseFlowMap(rest));
			cursor += 1;
			continue;
		}
		if (isKeyLine({
			indent: line.indent + 1,
			text: rest
		})) {
			const object = {};
			cursor = parseDashMap(lines, cursor, indent, object, rest);
			list.push(object);
			continue;
		}
		list.push(parseScalar(rest));
		cursor += 1;
	}
	return {
		list,
		next: cursor
	};
}
/** Parse a dash-map item: first key from the dash line's rest, then deeper
* sibling keys at their (first-continuation) indent until dedent to the dash. */
function parseDashMap(lines, start, dashIndent, object, firstRest) {
	const firstMatch = KEY_RE.exec(firstRest);
	let cursor = start + 1;
	let firstKey = null;
	if (firstMatch !== null) {
		firstKey = normalizeKey(firstMatch[1]);
		const parsed = parseInlineOrBlock(lines, start, dashIndent + 1, firstMatch[2].trim());
		object[firstKey] = parsed.value;
		cursor = parsed.next;
	}
	let probe = cursor;
	while (probe < lines.length && lines[probe].text.trim() === "") probe += 1;
	if (probe < lines.length && lines[probe].indent > dashIndent && isKeyLine(lines[probe])) {
		const parsed = parseEntries(lines, probe, lines[probe].indent);
		Object.assign(object, parsed.map);
		cursor = parsed.next;
	}
	return cursor;
}
/**
* Parse a wiki page's YAML frontmatter. Returns null frontmatter when no
* frontmatter block is found (the whole content is treated as body).
*/
function parseFrontmatter(content) {
	const located = locate(content);
	if (located === null) return {
		frontmatter: null,
		body: content
	};
	const block = located.block;
	const body = content.slice(located.bodyStart);
	const rawLines = block.replace(/\r\n/g, "\n").split("\n");
	const first = rawLines[0]?.trim();
	if (first !== OPEN) {
		if (!/^[A-Za-z_][\w-]*\s*:/.test(first ?? "")) return {
			frontmatter: null,
			body: content
		};
	}
	return {
		frontmatter: parseEntries(rawLines.filter((line) => line.trim() !== OPEN && line.trim() !== "").map((line) => ({
			indent: lineIndent(line),
			text: line.trim()
		})), 0, 0).map,
		body
	};
}
/** Quote a scalar for YAML output when needed. */
function quoteValue(value) {
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	const text = String(value);
	if (text === "") return "\"\"";
	if (/^[\w\u4e00-\u9fff-]+$/.test(text)) return text;
	return JSON.stringify(text);
}
/** Render an inline array when every item is a plain scalar. */
function renderInlineArray(values) {
	return "[" + values.map((value) => quoteValue(value)).join(", ") + "]";
}
const KEY_NAME_RE = /^[A-Za-z_][\w-]*$/;
function renderKey(key) {
	return KEY_NAME_RE.test(key) ? key : JSON.stringify(key);
}
const isEmptyObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
const isScalarish = (value) => typeof value !== "object" || value === null;
const pad = (level) => "  ".repeat(Math.max(0, level));
/** Inline rendering for scalars / scalar arrays / empty objects (single line). */
function inlineValue(value) {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return quoteValue(value);
	if (Array.isArray(value)) return value.every(isScalarish) ? renderInlineArray(value) : null;
	if (isEmptyObject(value)) return "{}";
	return null;
}
/** Emit an object item as `- key: value` with sibling keys one level deeper. */
function dashMapLines(obj, dashLevel) {
	const entries = Object.entries(obj);
	const lines = [];
	entries.forEach(([key, value], index) => {
		if (value === void 0 || value === null) return;
		const keyText = renderKey(key);
		if (index === 0) {
			const inline = inlineValue(value);
			if (inline !== null) lines.push(`${pad(dashLevel)}- ${keyText}: ${inline}`);
			else if (Array.isArray(value)) {
				lines.push(`${pad(dashLevel)}- ${keyText}:`);
				lines.push(...arrayBlockLines(value, dashLevel + 1));
			} else {
				lines.push(`${pad(dashLevel)}- ${keyText}:`);
				lines.push(...mapBlockLines(value, dashLevel + 1));
			}
		} else lines.push(...keyLines(keyText, value, dashLevel + 1));
	});
	return lines;
}
/** Emit the items of an array whose entries are objects / scalars. */
function arrayBlockLines(value, itemLevel) {
	const lines = [];
	for (const item of value) if (item === null || typeof item !== "object") lines.push(`${pad(itemLevel)}- ${quoteValue(item)}`);
	else if (Array.isArray(item)) {
		const inline = renderInlineArray(item);
		lines.push(`${pad(itemLevel)}- ${inline}`);
	} else if (isEmptyObject(item)) lines.push(`${pad(itemLevel)}- {}`);
	else lines.push(...dashMapLines(item, itemLevel));
	return lines;
}
/** Emit map entries at one level (each `key: value`, value recursing deeper). */
function mapBlockLines(map, level) {
	const lines = [];
	for (const [key, value] of Object.entries(map)) {
		if (value === void 0 || value === null) continue;
		lines.push(...keyLines(renderKey(key), value, level));
	}
	return lines;
}
/** Emit one `key: value` line at `level` (+ nested children when needed). */
function keyLines(keyText, value, level) {
	const inline = inlineValue(value);
	if (inline !== null) return [`${pad(level)}${keyText}: ${inline}`];
	if (Array.isArray(value)) return [`${pad(level)}${keyText}:`, ...arrayBlockLines(value, level + 1)];
	return [`${pad(level)}${keyText}:`, ...mapBlockLines(value, level + 1)];
}
/**
* Serialize frontmatter to the canonical block form (opening `---`, key: value
* lines, closing `---`), followed by a blank line and the body.
*/
function serializePage(frontmatter, body) {
	const lines = [OPEN];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (value === void 0 || value === null) continue;
		const keyText = renderKey(key);
		const inline = inlineValue(value);
		if (inline !== null) lines.push(`${keyText}: ${value === "" ? "\"\"" : inline}`);
		else if (Array.isArray(value)) {
			lines.push(`${keyText}:`);
			lines.push(...arrayBlockLines(value, 1));
		} else {
			lines.push(`${keyText}:`);
			lines.push(...mapBlockLines(value, 1));
		}
	}
	lines.push(OPEN);
	const block = lines.join("\n");
	const trimmedBody = body.replace(/^\s*\n/, "");
	return `${block}\n\n${trimmedBody}${trimmedBody.endsWith("\n") ? "" : "\n"}`;
}
/** Extract the title from a filename stem (kebab → Title Case for display). */
function slugFromTitle(title) {
	const slug = title.trim().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
	return slug === "" ? "untitled" : slug;
}
/**
* Parse a bare YAML payload (no `---` fences, e.g. pasted by the rule editor)
* into a frontmatter object. Returns null when no `key: value` is found.
*/
function parseYamlPayload(payload) {
	return parseFrontmatter(`${OPEN}\n${payload.replace(/\r\n/g, "\n")}\n${OPEN}\n`).frontmatter;
}
/**
* Canonical YAML text of a frontmatter object WITHOUT the enclosing `---`
* fences — used by the panel rule editor as editable text.
*/
function renderYamlPayload(frontmatter) {
	const lines = serializePage(frontmatter, "").split("\n");
	if (lines[0] === OPEN) lines.shift();
	while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
	if (lines.length > 0 && lines[lines.length - 1] === OPEN) lines.pop();
	return lines.join("\n").replace(/\n+$/, "");
}
/** Whether a parsed frontmatter object contains any nested structure. */
function hasNestedFrontmatter(frontmatter) {
	return Object.values(frontmatter).some((value) => typeof value === "object" && value !== null);
}
//#endregion
export { MANAGED_FRONTMATTER_KEYS, hasNestedFrontmatter, isManagedFrontmatterKey, parseFlowArray, parseFlowMap, parseFrontmatter, parseYamlPayload, renderYamlPayload, serializePage, slugFromTitle };
