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
import type { KbConfig, LineageConfig, LineageConfigField, LineageConfigIssue, LineageConfigState } from '../core/types.ts';
/** Shipped defaults — the only place a default value is defined. */
export declare const LINEAGE_CONFIG_DEFAULTS: LineageConfig;
/** Field descriptors for the panel form (ranges come from the specs above). */
export declare function lineageConfigFields(): LineageConfigField[];
/**
 * Validate a (possibly partial) config object. Invalid or unknown entries are
 * reported as issues AND fall back to their default, so the caller decides
 * whether to reject (save) or carry on (load).
 */
export declare function normalizeLineageConfig(input: unknown): {
    config: LineageConfig;
    issues: LineageConfigIssue[];
};
/** Path of one KB's parameter file. */
export declare function lineageConfigPath(kb: KbConfig): string;
/** Stable fingerprint of the EFFECTIVE parameters (order-independent). */
export declare function lineageConfigFingerprint(config: LineageConfig): string;
/** Keys whose value differs from the shipped default. */
export declare function overriddenKeys(config: LineageConfig): Array<keyof LineageConfig>;
export interface LoadedLineageConfig {
    config: LineageConfig;
    overridden: Array<keyof LineageConfig>;
    issues: LineageConfigIssue[];
    fingerprint: string;
    path: string;
}
/**
 * Read one KB's parameters. A missing file means "all defaults" (not an error);
 * an unreadable or invalid file reports issues and runs on defaults.
 */
export declare function loadLineageConfig(kb: KbConfig): Promise<LoadedLineageConfig>;
/**
 * Persist the parameters of one KB. Writes only the keys that differ from the
 * defaults, so an all-default config lands as `{}` and future default changes
 * keep flowing through.
 */
export declare function saveLineageConfig(kb: KbConfig, config: LineageConfig): Promise<LoadedLineageConfig>;
/** Full payload the panel needs to render and save the form. */
export declare function lineageConfigState(kb: KbConfig, loaded: LoadedLineageConfig): LineageConfigState;
//# sourceMappingURL=lineage-config.d.ts.map