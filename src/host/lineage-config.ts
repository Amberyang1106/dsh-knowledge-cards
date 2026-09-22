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

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { KbConfig, LineageConfig, LineageConfigField, LineageConfigIssue, LineageConfigState } from '../core/types.ts'
import { configRoot } from './store.ts'

/** Shipped defaults — the only place a default value is defined. */
export const LINEAGE_CONFIG_DEFAULTS: LineageConfig = {
  confidenceHigh: 0.8,
  confidenceMedium: 0.5,
  depThreshold: 0.5,
  additiveThreshold: 0.2,
  askFieldKind: true,
  askAdditive: true,
  excerptChars: 400,
  maxCards: 20,
  maxQuestions: 1200,
  questionsPerRequest: 60,
  payloadBudgetChars: 96_000,
  skipConfirmed: true,
}

interface NumberSpec {
  kind: 'number'
  min: number
  max: number
  integer: boolean
}

type FieldSpec = NumberSpec | { kind: 'boolean' }

/**
 * Ranges double as the panel's input constraints (the field list below is what
 * the client renders), so bounds are stated once, here.
 */
const FIELD_SPECS: Record<keyof LineageConfig, FieldSpec> = {
  confidenceHigh: { kind: 'number', min: 0.01, max: 1, integer: false },
  confidenceMedium: { kind: 'number', min: 0.01, max: 1, integer: false },
  depThreshold: { kind: 'number', min: 0, max: 1, integer: false },
  additiveThreshold: { kind: 'number', min: 0, max: 1, integer: false },
  askFieldKind: { kind: 'boolean' },
  askAdditive: { kind: 'boolean' },
  excerptChars: { kind: 'number', min: 50, max: 2000, integer: true },
  // Cards under judgement this round (cards already confirmed are skipped
  // unless forced), NOT the number of cards loaded for context.
  maxCards: { kind: 'number', min: 1, max: 500, integer: true },
  maxQuestions: { kind: 'number', min: 20, max: 20000, integer: true },
  questionsPerRequest: { kind: 'number', min: 10, max: 200, integer: true },
  payloadBudgetChars: { kind: 'number', min: 10_000, max: 200_000, integer: true },
  skipConfirmed: { kind: 'boolean' },
}

const CONFIG_KEYS = Object.keys(FIELD_SPECS) as Array<keyof LineageConfig>

/** Field descriptors for the panel form (ranges come from the specs above). */
export function lineageConfigFields(): LineageConfigField[] {
  return CONFIG_KEYS.map((key) => {
    const spec = FIELD_SPECS[key]
    return spec.kind === 'number'
      ? { key, kind: 'number' as const, min: spec.min, max: spec.max, integer: spec.integer, default: LINEAGE_CONFIG_DEFAULTS[key] as number }
      : { key, kind: 'boolean' as const, default: LINEAGE_CONFIG_DEFAULTS[key] as boolean }
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate a (possibly partial) config object. Invalid or unknown entries are
 * reported as issues AND fall back to their default, so the caller decides
 * whether to reject (save) or carry on (load).
 */
export function normalizeLineageConfig(input: unknown): { config: LineageConfig; issues: LineageConfigIssue[] } {
  const config: LineageConfig = { ...LINEAGE_CONFIG_DEFAULTS }
  const issues: LineageConfigIssue[] = []
  if (input === undefined || input === null) return { config, issues }
  if (!isPlainObject(input)) {
    return { config, issues: [{ field: '(root)', message: '配置必须是 JSON 对象' }] }
  }
  for (const [key, raw] of Object.entries(input)) {
    if (!CONFIG_KEYS.includes(key as keyof LineageConfig)) {
      issues.push({ field: key, message: '未知参数（不会被写入；请检查拼写）' })
      continue
    }
    const typed = key as keyof LineageConfig
    const spec = FIELD_SPECS[typed]
    if (spec.kind === 'boolean') {
      if (typeof raw !== 'boolean') {
        issues.push({ field: key, message: `必须是 true 或 false（当前 ${JSON.stringify(raw)}）` })
        continue
      }
      config[typed] = raw as never
      continue
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      issues.push({ field: key, message: `必须是数字（当前 ${JSON.stringify(raw)}）` })
      continue
    }
    if (spec.integer && !Number.isInteger(raw)) {
      issues.push({ field: key, message: `必须是整数（当前 ${raw}）` })
      continue
    }
    if (raw < spec.min || raw > spec.max) {
      issues.push({ field: key, message: `需在 ${spec.min}–${spec.max} 之间（当前 ${raw}）` })
      continue
    }
    config[typed] = raw as never
  }
  // Cross-field rule: the bands must stay ordered, otherwise every answer would
  // land in one bucket.
  if (config.confidenceHigh <= config.confidenceMedium) {
    issues.push({
      field: 'confidenceHigh',
      message: `必须大于 confidenceMedium（当前 ${config.confidenceHigh} ≤ ${config.confidenceMedium}）`,
    })
    config.confidenceHigh = LINEAGE_CONFIG_DEFAULTS.confidenceHigh
  }
  return { config, issues }
}

/** Path of one KB's parameter file. */
export function lineageConfigPath(kb: KbConfig): string {
  return join(configRoot(), 'lineage', `${kb.id}.config.json`)
}

/** Stable fingerprint of the EFFECTIVE parameters (order-independent). */
export function lineageConfigFingerprint(config: LineageConfig): string {
  const canonical = CONFIG_KEYS.slice().sort().map((key) => [key, config[key]])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 12)
}

/** Keys whose value differs from the shipped default. */
export function overriddenKeys(config: LineageConfig): Array<keyof LineageConfig> {
  return CONFIG_KEYS.filter((key) => config[key] !== LINEAGE_CONFIG_DEFAULTS[key])
}

export interface LoadedLineageConfig {
  config: LineageConfig
  overridden: Array<keyof LineageConfig>
  issues: LineageConfigIssue[]
  fingerprint: string
  path: string
}

/**
 * Read one KB's parameters. A missing file means "all defaults" (not an error);
 * an unreadable or invalid file reports issues and runs on defaults.
 */
export async function loadLineageConfig(kb: KbConfig): Promise<LoadedLineageConfig> {
  const path = lineageConfigPath(kb)
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    return {
      config: { ...LINEAGE_CONFIG_DEFAULTS },
      overridden: [],
      issues: [],
      fingerprint: lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS),
      path,
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    return {
      config: { ...LINEAGE_CONFIG_DEFAULTS },
      overridden: [],
      issues: [{ field: '(file)', message: `配置无法解析为 JSON，已回退默认值：${String((error as Error).message ?? error)}` }],
      fingerprint: lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS),
      path,
    }
  }
  const { config, issues } = normalizeLineageConfig(parsed)
  return { config, overridden: overriddenKeys(config), issues, fingerprint: lineageConfigFingerprint(config), path }
}

/**
 * Persist the parameters of one KB. Writes only the keys that differ from the
 * defaults, so an all-default config lands as `{}` and future default changes
 * keep flowing through.
 */
export async function saveLineageConfig(kb: KbConfig, config: LineageConfig): Promise<LoadedLineageConfig> {
  const path = lineageConfigPath(kb)
  await fs.mkdir(join(configRoot(), 'lineage'), { recursive: true })
  const sparse: Record<string, unknown> = {}
  for (const key of overriddenKeys(config)) sparse[key] = config[key]
  await fs.writeFile(path, `${JSON.stringify(sparse, null, 2)}\n`, 'utf8')
  return {
    config,
    overridden: overriddenKeys(config),
    issues: [],
    fingerprint: lineageConfigFingerprint(config),
    path,
  }
}

/** Full payload the panel needs to render and save the form. */
export function lineageConfigState(kb: KbConfig, loaded: LoadedLineageConfig): LineageConfigState {
  return {
    kb: kb.id,
    path: loaded.path,
    config: loaded.config,
    defaults: { ...LINEAGE_CONFIG_DEFAULTS },
    overridden: loaded.overridden,
    issues: loaded.issues,
    fingerprint: loaded.fingerprint,
    fields: lineageConfigFields(),
  }
}
