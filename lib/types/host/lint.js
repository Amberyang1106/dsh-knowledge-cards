/**
 * Lint pass over one knowledge base (llm_wiki's third operation): broken
 * wikilinks, orphan pages, missing descriptions/frontmatter, dangling source
 * references, empty bodies.
 * @module dsh-knowledge-cards/host/lint
 */
import { parseFrontmatter } from "../core/frontmatter.js";
import { extractWikilinks } from "../core/search.js";
import { listCards, readCard, resolveLinkTargets, listSources } from "./store.js";
export async function lintKb(kb) {
    const issues = [];
    const cards = await listCards(kb);
    const targets = await resolveLinkTargets(kb);
    const sourcePaths = new Set((await listSources(kb)).map((source) => source.relPath));
    const inbound = new Map();
    for (const card of cards)
        inbound.set(card.slug, 0);
    for (const card of cards) {
        const raw = (await readCard(kb, card.slug))?.raw ?? '';
        const parsed = parseFrontmatter(raw);
        const path = card.path;
        if (parsed.frontmatter === null) {
            issues.push({ severity: 'error', kind: 'missing-frontmatter', path, message: `页面缺少 YAML frontmatter（type/title 必填）` });
        }
        if (card.description === undefined || card.description.trim() === '') {
            issues.push({ severity: 'warn', kind: 'missing-description', path, message: `页面没有一句话摘要（frontmatter description），卡片墙无法展示` });
        }
        if (parsed.body.trim() === '') {
            issues.push({ severity: 'warn', kind: 'empty-body', path, message: '页面正文为空' });
        }
        for (const link of extractWikilinks(parsed.body)) {
            if (!targets.has(link)) {
                issues.push({ severity: 'error', kind: 'broken-wikilink', path, message: `正文引用了不存在的页面 [[${link}]]` });
            }
        }
        for (const source of card.sources) {
            if (!sourcePaths.has(source)) {
                issues.push({ severity: 'warn', kind: 'missing-source', path, message: `引用的原始资料不存在于 raw/sources: ${source}` });
            }
        }
        // Count inbound links (from other content pages; index.md is not counted).
        for (const other of cards) {
            if (other.slug === card.slug)
                continue;
            const otherRaw = (await readCard(kb, other.slug))?.raw ?? '';
            const links = extractWikilinks(parseFrontmatter(otherRaw).body);
            if (links.includes(card.slug))
                inbound.set(card.slug, (inbound.get(card.slug) ?? 0) + 1);
        }
    }
    for (const card of cards) {
        const count = inbound.get(card.slug) ?? 0;
        if (count === 0 && card.type !== 'overview') {
            // Source pages are reachable through frontmatter sources[] sharing
            // (llm_wiki's "source overlap" signal) — not orphans.
            if (card.type === 'source') {
                const referenced = cards.some((other) => other.slug !== card.slug && other.sources.some((source) => card.sources.includes(source)));
                if (referenced)
                    continue;
            }
            issues.push({ severity: 'warn', kind: 'orphan', path: card.path, message: `孤立页面：没有其他页面链接到 [[${card.slug}]]` });
        }
    }
    return issues.sort((a, b) => {
        if (a.severity !== b.severity)
            return a.severity === 'error' ? -1 : 1;
        return (a.path ?? '').localeCompare(b.path ?? '');
    });
}
/** Compact summary for the agent-facing lint tool. */
export function renderLintReport(kbName, issues) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warns = issues.filter((issue) => issue.severity === 'warn');
    const lines = [`知识库「${kbName}」lint 结果：${errors.length} error / ${warns.length} warn`];
    if (issues.length === 0) {
        lines.push('一切健康 ✅');
        return lines.join('\n');
    }
    for (const issue of issues) {
        lines.push(`- [${issue.severity}] ${issue.path ?? '-'} ${issue.message}`);
    }
    return lines.join('\n');
}
