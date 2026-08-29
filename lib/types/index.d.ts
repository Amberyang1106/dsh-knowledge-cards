/**
 * @amberyang1106/dsh-knowledge-cards — host half: the /api/dsh-knowledge/*
 * routes (KB config, card list/search/detail, source status, commit, lint),
 * the agent tools (wiki_kbs / wiki_search / wiki_read / wiki_ingest /
 * wiki_commit / wiki_lint) that let ANY project session pull domain
 * knowledge in as context, and a system-prompt announcement. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's dsh.client declaration.
 *
 * Architecture follows the Karpathy / llm_wiki three-layer pattern:
 * raw sources (immutable) → LLM-maintained wiki cards → schema/purpose.
 * The LLM work is done by the agent (two-step ingest: wiki_ingest to
 * analyze, wiki_commit to write); the plugin does deterministic
 * bookkeeping (frontmatter validation, index/log/overview rebuilds,
 * SHA256 incremental cache, lint).
 * @module @amberyang1106/dsh-knowledge-cards
 */
import type { Context } from '@deepseek-ai/cordis';
/** Required services: the route registry, the tool registry, and the prompt band. */
export declare const inject: string[];
/** Model-facing announcement: plugin presence, tools, and cooperation rules. */
export declare const KNOWLEDGE_CARDS_GUIDANCE: string;
/**
 * Mount the knowledge-card routes, agent tools, and prompt section.
 * @param ctx - context carrying webServer, tools, systemPrompt.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map