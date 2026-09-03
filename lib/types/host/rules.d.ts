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
import type { KbConfig, RulesResult } from '../core/types.ts';
/**
 * Compile the rule set of one knowledge base.
 * @param opts.ruleSet  only rules of this rule_set (bare default = all sets)
 * @param opts.status   'active' (default) | 'all' | draft/review/deprecated
 */
export declare function compileRuleSet(kb: KbConfig, opts?: {
    ruleSet?: string;
    status?: string;
}): Promise<RulesResult>;
//# sourceMappingURL=rules.d.ts.map