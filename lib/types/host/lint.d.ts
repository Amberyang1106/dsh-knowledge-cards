/**
 * Lint pass over one knowledge base (llm_wiki's third operation): broken
 * wikilinks, orphan pages, missing descriptions/frontmatter, dangling source
 * references, empty bodies.
 * @module dsh-knowledge-cards/host/lint
 */
import type { KbConfig, LintIssue } from '../core/types.ts';
export declare function lintKb(kb: KbConfig): Promise<LintIssue[]>;
/** Compact summary for the agent-facing lint tool. */
export declare function renderLintReport(kbName: string, issues: LintIssue[]): string;
//# sourceMappingURL=lint.d.ts.map