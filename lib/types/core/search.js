/**
 * Dependency-free token search over wiki cards (llm_wiki stage-1 style):
 * latin word tokens + CJK bigram tokens, title/description/tag/body weighted,
 * title-match bonus. Vector search is deliberately out of scope — Karpathy's
 * note: at ~100-source scale the index + token search is enough.
 * @module dsh-knowledge-cards/core/search
 */
/** Tokenize one string: latin words (lowercased) + CJK bigrams. */
export function tokenize(text) {
    const tokens = [];
    const lower = text.toLowerCase();
    const latin = lower.match(/[a-z0-9][a-z0-9_-]*/g);
    if (latin !== null)
        tokens.push(...latin);
    const cjk = lower.match(/[\u4e00-\u9fff]+/g);
    if (cjk !== null) {
        for (const run of cjk) {
            if (run.length === 1)
                tokens.push(run);
            for (let i = 0; i < run.length - 1; i += 1)
                tokens.push(run.slice(i, i + 2));
        }
    }
    return tokens;
}
export function makeQuery(query) {
    return { raw: query.trim().toLowerCase(), tokens: new Set(tokenize(query)) };
}
function overlapScore(haystack, query) {
    if (query.raw === '')
        return 0;
    const hay = haystack.toLowerCase();
    if (hay.includes(query.raw))
        return 10;
    let score = 0;
    const hayTokens = new Set(tokenize(hay));
    for (const token of query.tokens) {
        if (hayTokens.has(token))
            score += 1;
        else if (hay.includes(token))
            score += 0.5;
    }
    return score;
}
/**
 * Rank cards against the query. Weighting mirrors llm_wiki's stage 1:
 * title ×10, description ×5, tags ×3, body ×1 (body preview only).
 */
export function searchCards(cards, query, limit = 10, bodyPreview) {
    const q = makeQuery(query);
    if (q.raw === '') {
        return cards.slice(0, limit).map((card) => ({ card, score: 0 }));
    }
    const hits = [];
    for (const card of cards) {
        let score = 0;
        score += overlapScore(card.title, q) * 10;
        if (card.description !== undefined)
            score += overlapScore(card.description, q) * 5;
        score += overlapScore(card.tags.join(' '), q) * 3;
        if (card.sources.length > 0)
            score += overlapScore(card.sources.join(' '), q);
        const preview = bodyPreview !== undefined ? bodyPreview(card) : '';
        if (preview !== '')
            score += overlapScore(preview.slice(0, 600), q);
        if (score > 0)
            hits.push({ card, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
}
/** Extract [[wikilink]] targets from a markdown body (aliases stripped). */
export function extractWikilinks(body) {
    const links = [];
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = pattern.exec(body)) !== null) {
        const target = match[1].split('|')[0].trim();
        // Strip any wiki/ prefix and .md suffix.
        const normalized = target.replace(/^wiki\//, '').replace(/\.md$/, '');
        if (normalized !== '')
            links.push(normalized);
    }
    return links;
}
