/**
 * Lineage parameter config: defaults, validation (never silently coerced),
 * sparse persistence, fingerprint stability and the broken-file fallback.
 * @module dsh-knowledge-cards/tests/lineage-config
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KbConfig } from '../src/core/types.ts'
import {
  LINEAGE_CONFIG_DEFAULTS, lineageConfigFingerprint, lineageConfigPath, lineageConfigState, loadLineageConfig,
  normalizeLineageConfig, overriddenKeys, saveLineageConfig,
} from '../src/host/lineage-config.ts'

let root: string
const kb = { id: 'config-kb' } as KbConfig

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-lineage-config-'))
  process.env.DSH_KNOWLEDGE_CARDS_ROOT = root
})

afterAll(async () => {
  delete process.env.DSH_KNOWLEDGE_CARDS_ROOT
  await rm(root, { recursive: true, force: true })
})

describe('lineage config normalization', () => {
  it('returns the shipped defaults for missing or empty input', () => {
    expect(normalizeLineageConfig(undefined).config).toEqual(LINEAGE_CONFIG_DEFAULTS)
    expect(normalizeLineageConfig(null).issues).toHaveLength(0)
    expect(normalizeLineageConfig({}).config).toEqual(LINEAGE_CONFIG_DEFAULTS)
  })

  it('reports unknown keys and wrong types instead of dropping them quietly', () => {
    const unknown = normalizeLineageConfig({ depThreshold: 0.4, nope: 1 })
    expect(unknown.issues.map((issue) => issue.field)).toEqual(['nope'])
    expect(unknown.config.depThreshold).toBe(0.4)

    const wrongType = normalizeLineageConfig({ askFieldKind: 'yes' })
    expect(wrongType.issues[0].field).toBe('askFieldKind')
    expect(wrongType.config.askFieldKind).toBe(LINEAGE_CONFIG_DEFAULTS.askFieldKind)

    const notNumber = normalizeLineageConfig({ maxCards: '20' })
    expect(notNumber.issues[0].message).toContain('必须是数字')

    const fractional = normalizeLineageConfig({ maxCards: 12.5 })
    expect(fractional.issues[0].message).toContain('必须是整数')

    const outOfRange = normalizeLineageConfig({ depThreshold: 1.5 })
    expect(outOfRange.issues[0].message).toContain('需在 0–1 之间')
    expect(outOfRange.config.depThreshold).toBe(LINEAGE_CONFIG_DEFAULTS.depThreshold)
  })

  it('keeps the confidence bands ordered', () => {
    const equal = normalizeLineageConfig({ confidenceHigh: 0.5, confidenceMedium: 0.5 })
    expect(equal.issues.map((issue) => issue.field)).toEqual(['confidenceHigh'])
    expect(equal.config.confidenceHigh).toBe(LINEAGE_CONFIG_DEFAULTS.confidenceHigh)
    expect(normalizeLineageConfig({ confidenceHigh: 0.9, confidenceMedium: 0.3 }).issues).toHaveLength(0)
  })

  it('rejects a non-object root', () => {
    expect(normalizeLineageConfig([1, 2]).issues[0].field).toBe('(root)')
  })
})

describe('lineage config persistence', () => {
  it('starts from defaults when no file exists', async () => {
    const loaded = await loadLineageConfig(kb)
    expect(loaded.config).toEqual(LINEAGE_CONFIG_DEFAULTS)
    expect(loaded.overridden).toEqual([])
    expect(loaded.issues).toEqual([])
    expect(loaded.path).toBe(lineageConfigPath(kb))
  })

  it('writes only the keys that differ from the defaults and reads them back', async () => {
    const saved = await saveLineageConfig(kb, {
      ...LINEAGE_CONFIG_DEFAULTS,
      depThreshold: 0.7,
      skipConfirmed: false,
    })
    expect(saved.overridden.sort()).toEqual(['depThreshold', 'skipConfirmed'])
    const onDisk = JSON.parse(await readFile(saved.path, 'utf8')) as Record<string, unknown>
    expect(Object.keys(onDisk).sort()).toEqual(['depThreshold', 'skipConfirmed'])

    const reloaded = await loadLineageConfig(kb)
    expect(reloaded.config.depThreshold).toBe(0.7)
    expect(reloaded.config.skipConfirmed).toBe(false)
    // an untouched key still tracks the shipped default
    expect(reloaded.config.maxCards).toBe(LINEAGE_CONFIG_DEFAULTS.maxCards)
    expect(reloaded.overridden.sort()).toEqual(['depThreshold', 'skipConfirmed'])
  })

  it('can go back to all-defaults (empty file)', async () => {
    const saved = await saveLineageConfig(kb, { ...LINEAGE_CONFIG_DEFAULTS })
    expect(saved.overridden).toEqual([])
    const onDisk = JSON.parse(await readFile(saved.path, 'utf8')) as Record<string, unknown>
    expect(Object.keys(onDisk)).toHaveLength(0)
  })

  it('falls back to defaults and reports the problem when the file is broken', async () => {
    const path = lineageConfigPath(kb)
    await mkdir(join(root, 'lineage'), { recursive: true })
    await writeFile(path, '{ not json', 'utf8')
    const broken = await loadLineageConfig(kb)
    expect(broken.config).toEqual(LINEAGE_CONFIG_DEFAULTS)
    expect(broken.issues[0].field).toBe('(file)')

    await writeFile(path, JSON.stringify({ maxCards: 9999 }), 'utf8')
    const invalid = await loadLineageConfig(kb)
    expect(invalid.issues[0].field).toBe('maxCards')
    expect(invalid.config.maxCards).toBe(LINEAGE_CONFIG_DEFAULTS.maxCards)
  })
})

describe('lineage config fingerprint', () => {
  it('is stable, order-independent and changes with any value', () => {
    const base = lineageConfigFingerprint(LINEAGE_CONFIG_DEFAULTS)
    expect(base).toHaveLength(12)
    expect(lineageConfigFingerprint({ ...LINEAGE_CONFIG_DEFAULTS })).toBe(base)
    // same values, different insertion order → same fingerprint
    const shuffled = Object.fromEntries(Object.entries(LINEAGE_CONFIG_DEFAULTS).reverse()) as typeof LINEAGE_CONFIG_DEFAULTS
    expect(lineageConfigFingerprint(shuffled)).toBe(base)
    expect(lineageConfigFingerprint({ ...LINEAGE_CONFIG_DEFAULTS, depThreshold: 0.6 })).not.toBe(base)
  })

  it('reports overridden keys and the full panel state', () => {
    const config = { ...LINEAGE_CONFIG_DEFAULTS, confidenceHigh: 0.9 }
    expect(overriddenKeys(config)).toEqual(['confidenceHigh'])
    const state = lineageConfigState(kb, {
      config,
      overridden: ['confidenceHigh'],
      issues: [],
      fingerprint: lineageConfigFingerprint(config),
      path: '/tmp/x.json',
    })
    expect(state.kb).toBe('config-kb')
    expect(state.fields).toHaveLength(Object.keys(LINEAGE_CONFIG_DEFAULTS).length)
    expect(state.fields.find((field) => field.key === 'maxCards')).toMatchObject({ kind: 'number', integer: true })
    expect(state.fields.find((field) => field.key === 'askAdditive')).toMatchObject({ kind: 'boolean', default: true })
    expect(state.defaults).toEqual(LINEAGE_CONFIG_DEFAULTS)
  })
})
