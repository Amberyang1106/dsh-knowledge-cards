/**
 * Agent tools — the cross-project context bridge. Registered globally via
 * ctx.tools.register, so ANY dsh session (a finance project, a coding task,
 * a different workspace) can pull domain knowledge in as context:
 *
 *   wiki_kbs()               → what knowledge bases exist
 *   wiki_search(query, kb?)  → top matching card summaries (cheap)
 *   wiki_read(slug, kb?)     → full card content (frontmatter + body)
 *   wiki_ingest(kb?, source?)→ source status, or source content + KB context
 *                              for the two-step ingest (analyze → generate)
 *   wiki_commit(kb, pages, sourceFiles?) → write agent-generated cards with
 *                              deterministic index/log/overview maintenance
 *   wiki_lint(kb?)           → health report (broken links, orphans, ...)
 *
 * The LLM work stays with the agent (Karpathy: "the LLM writes, the human
 * curates"); the plugin only does deterministic bookkeeping — frontmatter
 * validation, index/log/overview rebuilds, SHA256 incremental cache.
 * @module dsh-knowledge-cards/host/tools
 */
export declare function wikiKbsTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiSearchTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiReadTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiIngestTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCommitTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiLintTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCreateKbTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiImportCardsTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCodeListTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCodeReadTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiEditCardTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiReviewSubmitTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiReviewsTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiAuditTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCardDeleteTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCardRestoreTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiCardPurgeTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiKbDeleteTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiKbRestoreTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiKbPurgeTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function wikiTrashListTool(): import("@deepseek-ai/dsh-tools").ToolDefinition;
//# sourceMappingURL=tools.d.ts.map