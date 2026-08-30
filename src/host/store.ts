/**
 * Knowledge-base store (host side): multi-KB config, llm_wiki directory
 * structure seeding, card listing/reading, deterministic commit maintenance
 * (index.md / log.md / overview.md are app-maintained, never LLM-rewritten —
 * llm_wiki's rule), and the SHA256 incremental ingest cache.
 *
 * Layout of one KB (Karpathy / llm_wiki three layers):
 *   <path>/purpose.md            why this wiki exists
 *   <path>/schema.md             page types + conventions
 *   <path>/raw/sources/          immutable source documents
 *   <path>/wiki/index.md         content catalog (auto)
 *   <path>/wiki/log.md           chronological activity log (auto)
 *   <path>/wiki/overview.md      global summary (auto)
 *   <path>/wiki/<type-dirs>/     entity/concept/source/query/... cards
 *
 * Config + cache live in $DSH_KNOWLEDGE_CARDS_ROOT (default ~/.dsh/knowledge-cards).
 * @module dsh-knowledge-cards/host/store
 */

import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parseFrontmatter, serializePage, slugFromTitle } from '../core/frontmatter.ts'
import { extractWikilinks } from '../core/search.ts'
import type { Card, CardMeta, CommitResult, KbConfig, KbSummary, PageInput, ReviewItem, ReviewKind, SourceStatus, TrashCardEntry, TrashKbEntry } from '../core/types.ts'
import { REVIEW_OPTIONS } from '../core/types.ts'
import { TYPE_DIRS } from '../core/types.ts'

/** Config/cache root for the plugin. Override via env for tests. */
export function configRoot(): string {
  return process.env.DSH_KNOWLEDGE_CARDS_ROOT ?? join(homedir(), '.dsh', 'knowledge-cards')
}

const KBS_FILE = 'kbs.json'
const CACHE_FILE = 'cache.json'

const WIKI_AGGREGATES = new Set(['index.md', 'log.md', 'overview.md'])

interface CacheEntry {
  sha256: string
  ingestedAt: number
  pages: string[]
}

type CacheFile = Record<string, Record<string, CacheEntry>>

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function writeTextAtomic(path: string, text: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, path)
}

/** Recursively list files under dir as forward-slash relative paths. */
async function walkFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        results.push(relative(dir, full).split(sep).join('/'))
      }
    }
  }
  await walk(dir)
  return results.sort()
}

export function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// ---------------------------------------------------------------------------
// KB config
// ---------------------------------------------------------------------------

async function loadConfig(): Promise<{ kbs: KbConfig[] }> {
  const text = await readText(join(configRoot(), KBS_FILE))
  if (text === null) return { kbs: [] }
  try {
    const parsed = JSON.parse(text) as { kbs?: KbConfig[] }
    return { kbs: Array.isArray(parsed.kbs) ? parsed.kbs : [] }
  } catch {
    return { kbs: [] }
  }
}

async function saveConfig(config: { kbs: KbConfig[] }): Promise<void> {
  await writeTextAtomic(join(configRoot(), KBS_FILE), JSON.stringify(config, null, 2))
}

export async function listKbs(): Promise<KbConfig[]> {
  const config = await loadConfig()
  return config.kbs
}

export async function getKb(id: string): Promise<KbConfig | null> {
  const config = await loadConfig()
  return config.kbs.find((kb) => kb.id === id) ?? null
}

export function defaultKbId(): string {
  return process.env.DSH_KNOWLEDGE_CARDS_KB ?? ''
}

function slugifyId(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return slug === '' ? `kb-${Date.now()}` : slug
}

/** Seed the three-layer structure for a KB directory (idempotent). */
export async function ensureKbStructure(kbPath: string): Promise<void> {
  const raw = join(kbPath, 'raw', 'sources')
  const code = join(kbPath, 'code')
  const wiki = join(kbPath, 'wiki')
  for (const dir of [
    raw,
    code,
    wiki,
    ...Object.values(TYPE_DIRS).map((sub) => join(wiki, sub)),
  ]) {
    await fs.mkdir(dir, { recursive: true })
  }
  const schema = `# Wiki Schema

## Page Types

| Type | Directory | Purpose |
|------|-----------|---------|
| entity | wiki/entities/ | Named things (people, tools, organizations, datasets) |
| concept | wiki/concepts/ | Ideas, techniques, phenomena, frameworks |
| source | wiki/sources/ | Papers, articles, talks, books, blog posts |
| query | wiki/queries/ | Open questions under active investigation |
| comparison | wiki/comparisons/ | Side-by-side analysis of related entities |
| synthesis | wiki/synthesis/ | Cross-cutting summaries and conclusions |
| overview | wiki/ | High-level project summary (one per project) |

## Naming Conventions

- Files: kebab-case.md; CJK titles keep the CJK characters.
- Entities: match the official name where possible.
- Concepts: descriptive noun phrases.
- Sources: author-year-slug.md.

## Frontmatter

All pages must include YAML frontmatter: type, title, tags, related (bare
slugs), sources (source filenames), created, updated. Use [[wikilink]] syntax
in the body for cross-references. Every entity and concept should appear in
wiki/index.md.

## Contradiction Handling

When sources contradict each other, note the contradiction in the relevant
concept/entity page and open a query page tracking the open question.
`
  const purpose = `# Project Purpose

## Goal

<!-- What are you trying to understand or build? -->

## Key Questions

1.

## Scope

**In scope:** -
**Out of scope:** -
`
  const index = `# 索引

<!-- 由 dsh-knowledge-cards 自动维护，请勿手改。 -->
`
  const log = `# 日志

`
  const overview = `# 概览

<!-- 由 dsh-knowledge-cards 自动生成。 -->
`
  const seeds: Array<[string, string]> = [
    [join(kbPath, 'schema.md'), schema],
    [join(kbPath, 'purpose.md'), purpose],
    [join(wiki, 'index.md'), index],
    [join(wiki, 'log.md'), log],
    [join(wiki, 'overview.md'), overview],
  ]
  for (const [file, content] of seeds) {
    if (!(await pathExists(file))) await writeTextAtomic(file, content)
  }
}

export async function createKb(input: { name: string; path?: string; description?: string }): Promise<KbConfig> {
  const name = input.name.trim()
  if (name === '') throw new Error('knowledge base name is required')
  const id = slugifyId(name)
  const config = await loadConfig()
  if (config.kbs.some((kb) => kb.id === id)) throw new Error(`knowledge base "${id}" already exists`)
  const kbPath = input.path !== undefined && input.path.trim() !== ''
    ? resolve(input.path.trim())
    : join(configRoot(), 'kbs', id)
  await fs.mkdir(kbPath, { recursive: true })
  await ensureKbStructure(kbPath)
  const kb: KbConfig = {
    id,
    name,
    path: kbPath,
    description: input.description?.trim() || undefined,
    createdAt: Date.now(),
  }
  config.kbs.push(kb)
  await saveConfig(config)
  return kb
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

function wikiDir(kb: KbConfig): string {
  return join(kb.path, 'wiki')
}

/** Parse one wiki file into CardMeta (null when it is an aggregate file). */
async function readCardFile(kb: KbConfig, relPath: string): Promise<CardMeta | null> {
  if (WIKI_AGGREGATES.has(basename(relPath))) return null
  if (extname(relPath) !== '.md') return null
  const raw = await readText(join(wikiDir(kb), relPath))
  if (raw === null) return null
  const parsed = parseFrontmatter(raw)
  const fm = parsed.frontmatter ?? {}
  const type = String(fm.type ?? 'unknown')
  const title = String(fm.title ?? basename(relPath, '.md'))
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : []
  const related = Array.isArray(fm.related) ? fm.related.map(String) : []
  const sources = Array.isArray(fm.sources) ? fm.sources.map(String) : []
  const slug = basename(relPath, '.md')
  return {
    slug,
    path: relPath,
    type,
    title,
    description: fm.description !== undefined ? String(fm.description) : undefined,
    tags,
    related,
    sources,
    created: fm.created !== undefined ? String(fm.created) : undefined,
    updated: fm.updated !== undefined ? String(fm.updated) : undefined,
  }
}

export async function listCards(kb: KbConfig): Promise<CardMeta[]> {
  const files = await walkFiles(wikiDir(kb))
  const cards: CardMeta[] = []
  for (const file of files) {
    const card = await readCardFile(kb, file)
    if (card !== null) cards.push(card)
  }
  return cards.sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function readCard(kb: KbConfig, slug: string): Promise<Card | null> {
  const files = await walkFiles(wikiDir(kb))
  const target = slug.replace(/^wiki\//, '').replace(/\.md$/, '')
  for (const file of files) {
    const stem = basename(file, '.md')
    if (stem !== target && file !== `${target}.md`) continue
    if (WIKI_AGGREGATES.has(basename(file))) continue
    const raw = await readText(join(wikiDir(kb), file))
    if (raw === null) continue
    const parsed = parseFrontmatter(raw)
    const fm = parsed.frontmatter ?? {}
    const meta = await readCardFile(kb, file)
    if (meta === null) continue
    // Also match by normalized title when the slug did not hit a filename.
    const titleSlug = slugFromTitle(String(fm.title ?? ''))
    if (file !== `${target}.md` && stem !== target && titleSlug !== target) continue
    return { ...meta, body: parsed.body, raw }
  }
  // Title fallback: search all cards by normalized title.
  const cards = await listCards(kb)
  const byTitle = cards.find((card) => slugFromTitle(card.title) === target)
  if (byTitle !== undefined) {
    const raw = await readText(join(wikiDir(kb), byTitle.path))
    if (raw !== null) {
      const parsed = parseFrontmatter(raw)
      return { ...byTitle, body: parsed.body, raw }
    }
  }
  return null
}

/** Resolve every wikilink target to an existing card slug. */
export async function resolveLinkTargets(kb: KbConfig): Promise<Set<string>> {
  const cards = await listCards(kb)
  const bySlug = new Set(cards.map((card) => card.slug))
  const byTitle = new Map(cards.map((card) => [slugFromTitle(card.title), card.slug]))
  return new Set([...bySlug, ...byTitle.keys()])
}

// ---------------------------------------------------------------------------
// aggregate maintenance (index / log / overview)
// ---------------------------------------------------------------------------

async function rebuildIndex(kb: KbConfig): Promise<void> {
  const cards = await listCards(kb)
  const byType = new Map<string, CardMeta[]>()
  for (const card of cards) {
    const list = byType.get(card.type) ?? []
    list.push(card)
    byType.set(card.type, list)
  }
  const lines: string[] = ['# 索引', '', '<!-- 由 dsh-knowledge-cards 自动维护，请勿手改。 -->', '']
  for (const [type, list] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${type}`, '')
    for (const card of list) {
      lines.push(`- [[${card.slug}]] — ${card.description ?? card.title}`)
    }
    lines.push('')
  }
  await writeTextAtomic(join(wikiDir(kb), 'index.md'), lines.join('\n'))
}

async function appendLog(kb: KbConfig, entry: string, notes?: string[]): Promise<void> {
  const logPath = join(wikiDir(kb), 'log.md')
  const existing = (await readText(logPath)) ?? '# 日志\n\n'
  // Always insert right after the first line (# 日志) — scanning for a blank
  // line separator is wrong once entries carry multi-line notes (the file's
  // trailing \n\n would be mistaken for the header separator and entries
  // would append at the bottom instead of staying reverse-chronological).
  const firstLineEnd = existing.indexOf('\n')
  const head = firstLineEnd === -1 ? existing : existing.slice(0, firstLineEnd + 1)
  const tail = firstLineEnd === -1 ? '' : existing.slice(firstLineEnd + 1)
  const noteLines = (notes ?? []).map((note) => `  - ${note}\n`).join('')
  const line = `## [${today()}] ${entry}\n${noteLines}`
  // Keep reverse-chronological (newest first), like llm_wiki.
  await writeTextAtomic(logPath, `${head}${line}${tail}`)
}

/** One parsed log.md entry (reverse-chronological). */
export interface LogEntry {
  date: string
  action: string
  subject: string
  /** Detailed change notes, one per line (e.g. `摘要: "旧" → "新"`, `标签: +x -y`). */
  notes: string[]
}

/** Parse wiki/log.md into entries (`## [YYYY-MM-DD] action | subject` + note lines). */
export async function listLogEntries(kb: KbConfig): Promise<LogEntry[]> {
  const text = (await readText(join(wikiDir(kb), 'log.md'))) ?? ''
  const entries: LogEntry[] = []
  const pattern = /^## \[(\d{4}-\d{2}-\d{2})\] (.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const date = match[1]
    const rest = match[2]
    const pipe = rest.indexOf('|')
    const action = (pipe === -1 ? rest : rest.slice(0, pipe)).trim()
    const subject = pipe === -1 ? '' : rest.slice(pipe + 1).trim()
    // Note lines: consecutive lines starting with `  - ` right after the header.
    const notes: string[] = []
    const after = text.slice(match.index + match[0].length)
    for (const line of after.split('\n')) {
      if (line.trim() === '') continue
      if (/^\s*-\s+/.test(line)) notes.push(line.replace(/^\s*-\s+/, '').trim())
      else break
    }
    entries.push({ date, action, subject, notes })
  }
  return entries
}

/** Human-readable `"old" → "new"` for a scalar field change. */
function scalarChange(label: string, oldValue: string, newValue: string): string {
  return `${label}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`
}

/** `+added -removed` diff for an array field. */
function arrayChange(label: string, oldValues: string[], newValues: string[]): string | null {
  const added = newValues.filter((value) => !oldValues.includes(value))
  const removed = oldValues.filter((value) => !newValues.includes(value))
  if (added.length === 0 && removed.length === 0) return null
  const parts: string[] = []
  if (added.length > 0) parts.push(`+${added.join(', ')}`)
  if (removed.length > 0) parts.push(`-${removed.join(', ')}`)
  return `${label}: ${parts.join(' ')}`
}

/** Summarize a body change: added/removed line counts + first added snippet. */
function bodyChange(oldBody: string, newBody: string): string {
  const toLines = (text: string): string[] => text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const oldLines = toLines(oldBody)
  const newLines = toLines(newBody)
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)
  const added = newLines.filter((line) => !oldSet.has(line))
  const removed = oldLines.filter((line) => !newSet.has(line))
  const parts: string[] = []
  if (added.length > 0) parts.push(`新增 ${added.length} 行`)
  if (removed.length > 0) parts.push(`删除 ${removed.length} 行`)
  const snippet = added[0]
  if (snippet !== undefined) {
    const clipped = snippet.length > 40 ? `${snippet.slice(0, 40)}…` : snippet
    parts.push(`新增片段「${clipped}」`)
  }
  return `正文: ${parts.join(' · ') || '内容变更'}`
}

async function rebuildOverview(kb: KbConfig): Promise<void> {
  const cards = await listCards(kb)
  const byType = new Map<string, number>()
  let maxUpdated: string | undefined
  for (const card of cards) {
    byType.set(card.type, (byType.get(card.type) ?? 0) + 1)
    if (card.updated !== undefined && (maxUpdated === undefined || card.updated > maxUpdated)) {
      maxUpdated = card.updated
    }
  }
  const sources = await listSources(kb)
  const codeFiles = (await listCodeFiles(kb)).length
  const lines = [
    '# 概览',
    '',
    '<!-- 由 dsh-knowledge-cards 自动生成。 -->',
    '',
    `- 卡片总数: ${cards.length}`,
    `- 资料源文件: ${sources.length}（新增 ${sources.filter((s) => s.status === 'new').length} · 变更 ${sources.filter((s) => s.status === 'changed').length}）`,
    `- 代码文件: ${codeFiles}`,
  ]
  for (const [type, count] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${type}: ${count}`)
  }
  if (maxUpdated !== undefined) lines.push(`- 最近更新: ${maxUpdated}`)
  await writeTextAtomic(join(wikiDir(kb), 'overview.md'), lines.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// commit (agent-generated pages)
// ---------------------------------------------------------------------------

function unionStrings(...lists: string[][]): string[] {
  return [...new Set(lists.flat().map((item) => item.trim()).filter((item) => item !== ''))]
}

function safeWikiRelPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (normalized.includes('..')) return null
  if (!normalized.endsWith('.md')) return null
  if (!/^[A-Za-z0-9_\u4e00-\u9fff\-\/ ]+\.md$/.test(normalized)) return null
  return normalized
}

/** Write agent-generated pages into the wiki + maintain aggregates + cache. */
export async function commitPages(
  kb: KbConfig,
  pages: PageInput[],
  sourceFiles: string[],
  options?: { logAction?: 'ingest' | 'import' | 'create'; extraNotes?: string[] },
): Promise<CommitResult> {
  if (pages.length === 0) throw new Error('no pages to commit')
  const created: string[] = []
  const updated: string[] = []
  const now = today()
  const existingByPath = new Map<string, CardMeta>()
  for (const card of await listCards(kb)) existingByPath.set(card.path, card)

  for (const page of pages) {
    const title = page.title.trim()
    if (title === '') throw new Error('every page needs a title')
    const type = page.type.trim()
    if (type === '') throw new Error(`page "${title}" needs a type`)
    const dir = TYPE_DIRS[type] ?? 'entities'
    const explicit = page.path !== undefined ? safeWikiRelPath(page.path) : null
    const path = explicit ?? `${dir}/${slugFromTitle(title)}.md`
    const existing = existingByPath.get(path)

    const fm: Record<string, unknown> = {
      type,
      title,
      created: existing?.created ?? page.created ?? now,
      updated: page.updated ?? now,
    }
    if (page.description !== undefined && page.description.trim() !== '') {
      fm.description = page.description.trim()
    } else if (existing?.description !== undefined) {
      fm.description = existing.description
    }
    fm.tags = unionStrings(existing?.tags ?? [], page.tags ?? [])
    fm.related = unionStrings(existing?.related ?? [], page.related ?? [])
    fm.sources = unionStrings(existing?.sources ?? [], page.sources ?? [])

    const content = serializePage(fm, page.body)
    await writeTextAtomic(join(wikiDir(kb), path), content)
    if (existing !== undefined) updated.push(path)
    else created.push(path)
  }

  await rebuildIndex(kb)
  const subject = pages.length === 1 ? pages[0].title : `${pages.length} pages`
  const action = options?.logAction ?? 'ingest'
  const logEntry = `${action} | ${subject}`
  const pageNames = (paths: string[]): string => paths.map((path) => basename(path, '.md')).join('、')
  const notes: string[] = []
  if (created.length > 0) {
    const names = pageNames(created)
    notes.push(created.length <= 10 ? `新增页面: ${names}` : `新增页面: ${pageNames(created.slice(0, 10))} 等 ${created.length} 页`)
  }
  if (updated.length > 0) {
    const names = pageNames(updated)
    notes.push(updated.length <= 10 ? `更新页面: ${names}` : `更新页面: ${pageNames(updated.slice(0, 10))} 等 ${updated.length} 页`)
  }
  if (sourceFiles.length > 0) notes.push(`资料源: ${sourceFiles.join('、')}`)
  if (options?.extraNotes !== undefined) notes.push(...options.extraNotes)
  await appendLog(kb, logEntry, notes)

  // Update the SHA256 cache first so the overview's new/changed counts are
  // accurate for the state just committed.
  const cached: string[] = []
  const cache = await loadCache()
  const kbCache = cache[kb.id] ?? (cache[kb.id] = {})
  for (const relPath of unionStrings(sourceFiles)) {
    const sourcePath = join(kb.path, 'raw', 'sources', relPath)
    if (!(await pathExists(sourcePath))) continue
    const buffer = await fs.readFile(sourcePath)
    const entry = kbCache[relPath] ?? { sha256: '', ingestedAt: 0, pages: [] }
    entry.sha256 = sha256Of(buffer)
    entry.ingestedAt = Date.now()
    entry.pages = unionStrings(entry.pages, pages.map((page) => slugFromTitle(page.title)))
    kbCache[relPath] = entry
    cached.push(relPath)
  }
  await saveCache(cache)

  await rebuildOverview(kb)

  return { created, updated, indexUpdated: true, logEntry, overviewUpdated: true, cachedSources: cached }
}

/**
 * Manually create one card from the panel form (the counterpart of the
 * agent's /commit path). Same deterministic pipeline as commitPages — new
 * page, frontmatter validation, index/log/overview maintenance — with a
 * `create` log action so the 看板 can distinguish manual cards from ingest.
 */
export async function createCard(kb: KbConfig, input: PageInput): Promise<{ created: string[]; logEntry: string; card: Card }> {
  const result = await commitPages(kb, [input], input.sources ?? [], { logAction: 'create' })
  const card = await readCard(kb, input.title)
  if (card === null) throw new Error(`卡片创建失败: ${input.title}`)
  return { created: result.created, logEntry: result.logEntry, card }
}

// ---------------------------------------------------------------------------
// sources + SHA256 cache
// ---------------------------------------------------------------------------

async function loadCache(): Promise<CacheFile> {
  const text = await readText(join(configRoot(), CACHE_FILE))
  if (text === null) return {}
  try {
    const parsed = JSON.parse(text) as CacheFile
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

async function saveCache(cache: CacheFile): Promise<void> {
  await writeTextAtomic(join(configRoot(), CACHE_FILE), JSON.stringify(cache, null, 2))
}

export async function listSources(kb: KbConfig): Promise<SourceStatus[]> {
  const rawDir = join(kb.path, 'raw', 'sources')
  const files = await walkFiles(rawDir)
  const cache = await loadCache()
  const kbCache = cache[kb.id] ?? {}
  const statuses: SourceStatus[] = []
  for (const relPath of files) {
    const full = join(rawDir, relPath)
    const buffer = await fs.readFile(full)
    const sha = sha256Of(buffer)
    const entry = kbCache[relPath]
    const status: SourceStatus['status'] = entry === undefined
      ? 'new'
      : entry.sha256 === sha ? 'up-to-date' : 'changed'
    statuses.push({
      relPath,
      sha256: sha,
      status,
      lastIngestedAt: entry?.ingestedAt,
      pages: entry?.pages ?? [],
    })
  }
  return statuses.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/** Sources that still need ingest (new or changed). */
export async function pendingSources(kb: KbConfig): Promise<SourceStatus[]> {
  const sources = await listSources(kb)
  return sources.filter((source) => source.status !== 'up-to-date')
}

// ---------------------------------------------------------------------------
// summaries
// ---------------------------------------------------------------------------

export async function kbSummary(kb: KbConfig): Promise<KbSummary> {
  const cards = await listCards(kb)
  const sources = await listSources(kb)
  const byType: Record<string, number> = {}
  let maxUpdated: string | undefined
  for (const card of cards) {
    byType[card.type] = (byType[card.type] ?? 0) + 1
    if (card.updated !== undefined && (maxUpdated === undefined || card.updated > maxUpdated)) {
      maxUpdated = card.updated
    }
  }
  return {
    id: kb.id,
    name: kb.name,
    path: kb.path,
    description: kb.description,
    createdAt: kb.createdAt,
    stats: {
      total: cards.length,
      byType,
      sourceCount: sources.length,
      codeCount: (await listCodeFiles(kb)).length,
      updatedAt: maxUpdated,
    },
  }
}

export async function listKbSummaries(): Promise<KbSummary[]> {
  const kbs = await listKbs()
  const summaries: KbSummary[] = []
  for (const kb of kbs) {
    try {
      summaries.push(await kbSummary(kb))
    } catch (error) {
      // A KB with a missing directory should not break the whole list.
      summaries.push({
        id: kb.id,
        name: kb.name,
        path: kb.path,
        description: kb.description,
        createdAt: kb.createdAt,
        stats: { total: 0, byType: {}, sourceCount: 0, codeCount: 0 },
      })
    }
  }
  return summaries
}

/** Rebuild index.md + overview.md from the current wiki content (used when
 * cards are dropped into wiki/ directly, or after a bulk import). */
export async function rebuildAggregates(kb: KbConfig): Promise<{ index: boolean; overview: boolean }> {
  await rebuildIndex(kb)
  await rebuildOverview(kb)
  return { index: true, overview: true }
}

/**
 * Bulk-import already-split knowledge cards (markdown files with YAML
 * frontmatter) from a local directory into the KB — the "I already have
 * cards, just import them" path. Deterministic, no LLM: files are parsed,
 * validated and written via commitPages (which maintains index/log/overview
 * and the SHA cache for any referenced raw sources).
 */
export async function importCards(
  kb: KbConfig,
  dir: string,
): Promise<{ imported: string[]; skipped: Array<{ file: string; reason: string }>; sourceFiles: string[] }> {
  const files = await walkFiles(dir)
  const mdFiles = files.filter((file) => file.endsWith('.md'))
  const pages: PageInput[] = []
  const skipped: Array<{ file: string; reason: string }> = []
  for (const file of mdFiles) {
    const full = join(dir, file)
    const raw = await readText(full)
    if (raw === null) {
      skipped.push({ file, reason: 'unreadable' })
      continue
    }
    const parsed = parseFrontmatter(raw)
    const fm = parsed.frontmatter
    if (fm === null) {
      skipped.push({ file, reason: 'no frontmatter (need type/title)' })
      continue
    }
    const type = String(fm.type ?? '').trim()
    const title = String(fm.title ?? '').trim()
    if (type === '' || title === '' || parsed.body.trim() === '') {
      skipped.push({ file, reason: 'missing type/title/body' })
      continue
    }
    // Preserve the source filename as the slug when it is usable.
    const stem = basename(file, '.md').trim()
    const targetDir = TYPE_DIRS[type] ?? 'entities'
    const path = stem === '' || stem === '.' ? undefined : `${targetDir}/${stem}.md`
    pages.push({
      type,
      title,
      description: fm.description !== undefined ? String(fm.description) : undefined,
      tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      related: Array.isArray(fm.related) ? fm.related.map(String) : [],
      sources: Array.isArray(fm.sources) ? fm.sources.map(String) : [],
      body: parsed.body,
      path,
      created: fm.created !== undefined ? String(fm.created) : undefined,
      updated: fm.updated !== undefined ? String(fm.updated) : undefined,
    })
  }
  const sourceFiles = [...new Set(pages.flatMap((page) => page.sources ?? []))]
  if (pages.length === 0) return { imported: [], skipped, sourceFiles }
  const extraNotes: string[] = []
  if (skipped.length > 0) extraNotes.push(`跳过无效文件 ${skipped.length} 个: ${skipped.map((item) => item.file).join('、')}`)
  const result = await commitPages(kb, pages, sourceFiles, { logAction: 'import', extraNotes })
  return { imported: [...result.created, ...result.updated], skipped, sourceFiles }
}

/** Editable fields of a card (manual edit; absent fields keep their values). */
export interface CardEditInput {
  title?: string
  description?: string
  tags?: string[]
  related?: string[]
  sources?: string[]
  body?: string
}

/**
 * Manually edit one card in place (same slug/path — inbound [[wikilinks]]
 * keep resolving), stamp updated=today, append an `edit` log entry listing
 * the changed fields, and rebuild the index. Replace semantics: fields the
 * caller provides replace the card's values; absent fields are untouched.
 */
export async function editCard(kb: KbConfig, slug: string, input: CardEditInput): Promise<{ card: Card; changed: string[] }> {
  const existing = await readCard(kb, slug)
  if (existing === null) throw new Error(`卡片不存在: ${slug}`)
  const fm = parseFrontmatter(existing.raw).frontmatter ?? {}
  const now = today()

  const changed: string[] = []
  const title = input.title?.trim()
  if (title !== undefined && title !== '' && title !== existing.title) {
    fm.title = title
    changed.push('标题')
  }
  if (input.description !== undefined) {
    const description = input.description.trim()
    if (description !== (existing.description ?? '')) {
      fm.description = description === '' ? '' : description
      changed.push('摘要')
    }
  }
  if (input.tags !== undefined) {
    const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))]
    if (tags.join('\u0000') !== existing.tags.join('\u0000')) {
      fm.tags = tags
      changed.push('标签')
    }
  }
  if (input.related !== undefined) {
    const related = [...new Set(input.related.map((item) => item.trim()).filter((item) => item !== ''))]
    if (related.join('\u0000') !== existing.related.join('\u0000')) {
      fm.related = related
      changed.push('关联')
    }
  }
  if (input.sources !== undefined) {
    const sources = [...new Set(input.sources.map((item) => item.trim()).filter((item) => item !== ''))]
    if (sources.join('\u0000') !== existing.sources.join('\u0000')) {
      fm.sources = sources
      changed.push('来源')
    }
  }
  const body = input.body ?? existing.body
  // Normalize surrounding whitespace so cosmetic newlines (frontmatter
  // separator / trailing) are not counted as changes.
  const normalizeBody = (text: string): string => text.replace(/^\s+/, '').replace(/\s+$/, '')
  if (normalizeBody(body) !== normalizeBody(existing.body)) changed.push('正文')

  if (changed.length > 0) {
    fm.updated = now
    const content = serializePage(fm, body)
    await writeTextAtomic(join(wikiDir(kb), existing.path), content)
    await rebuildIndex(kb)
    const titleForLog = String(fm.title ?? existing.title)

    // Detailed change notes: per-field old → new, +added/-removed arrays,
    // and a body change summary (line counts + first added snippet).
    const notes: string[] = []
    if (title !== undefined && title !== '' && title !== existing.title) {
      notes.push(scalarChange('标题', existing.title, title))
    }
    if (input.description !== undefined) {
      const description = input.description.trim()
      if (description !== (existing.description ?? '')) {
        notes.push(scalarChange('摘要', existing.description ?? '', description === '' ? '（已清空）' : description))
      }
    }
    if (input.tags !== undefined) {
      const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))]
      if (tags.join('\u0000') !== existing.tags.join('\u0000')) {
        const diff = arrayChange('标签', existing.tags, tags)
        if (diff !== null) notes.push(diff)
      }
    }
    if (input.related !== undefined) {
      const related = [...new Set(input.related.map((item) => item.trim()).filter((item) => item !== ''))]
      if (related.join('\u0000') !== existing.related.join('\u0000')) {
        const diff = arrayChange('关联', existing.related, related)
        if (diff !== null) notes.push(diff)
      }
    }
    if (input.sources !== undefined) {
      const sources = [...new Set(input.sources.map((item) => item.trim()).filter((item) => item !== ''))]
      if (sources.join('\u0000') !== existing.sources.join('\u0000')) {
        const diff = arrayChange('来源', existing.sources, sources)
        if (diff !== null) notes.push(diff)
      }
    }
    if (normalizeBody(body) !== normalizeBody(existing.body)) {
      notes.push(bodyChange(existing.body, body))
    }
    if (notes.length === 0) notes.push(`修改字段: ${changed.join('、')}`)
    await appendLog(kb, `edit | ${titleForLog}`, notes)
  }

  const updatedCard = await readCard(kb, slug)
  if (updatedCard === null) throw new Error(`edit failed for: ${slug}`)
  return { card: updatedCard, changed }
}

// ---------------------------------------------------------------------------
// code files (raw, no LLM processing)
// ---------------------------------------------------------------------------

function codeDir(kb: KbConfig): string {
  return join(kb.path, 'code')
}

/** Validate a code-relative path stays inside code/ (no traversal). */
function safeCodeRelPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (normalized === '' || normalized.includes('..')) return null
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null
  return normalized
}

export interface CodeFileInfo {
  relPath: string
  size: number
  mtime: number
}

/** List code files (recursive) under the KB's code/ directory. */
export async function listCodeFiles(kb: KbConfig): Promise<CodeFileInfo[]> {
  const dir = codeDir(kb)
  const files = await walkFiles(dir)
  const infos: CodeFileInfo[] = []
  for (const relPath of files) {
    const stat = await fs.stat(join(dir, relPath))
    infos.push({ relPath, size: stat.size, mtime: stat.mtimeMs })
  }
  return infos.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/** Read one code file (full content, UTF-8). Throws when the path escapes code/. */
export async function readCodeFile(kb: KbConfig, relPath: string): Promise<string> {
  const safe = safeCodeRelPath(relPath)
  if (safe === null) throw new Error(`invalid code path: ${relPath}`)
  return fs.readFile(join(codeDir(kb), safe), 'utf8')
}

/** Write one code file (UTF-8, raw content — no frontmatter, no LLM). */
export async function writeCodeFile(kb: KbConfig, relPath: string, content: string): Promise<CodeFileInfo> {
  const safe = safeCodeRelPath(relPath)
  if (safe === null) throw new Error(`invalid code path: ${relPath}`)
  const full = join(codeDir(kb), safe)
  await fs.mkdir(join(codeDir(kb), safe.includes('/') ? safe.slice(0, safe.lastIndexOf('/')) : '.'), { recursive: true })
  await writeTextAtomic(full, content)
  const stat = await fs.stat(full)
  return { relPath: safe, size: stat.size, mtime: stat.mtimeMs }
}

/** Delete one code file. */
export async function deleteCodeFile(kb: KbConfig, relPath: string): Promise<boolean> {
  const safe = safeCodeRelPath(relPath)
  if (safe === null) throw new Error(`invalid code path: ${relPath}`)
  const full = join(codeDir(kb), safe)
  try {
    await fs.unlink(full)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// recycle bin (回收站): soft delete cards → <kb>/.trash/cards/<type>/ and
// knowledge bases → <configRoot>/.trash/kbs/<id>/ (with trash-meta.json +
// the KB's review queue). Both trash roots live OUTSIDE every scan path
// (wiki/ for cards, kbs.json registry for KBs), so deleted items disappear
// from list/search/lint/overview instantly and only come back via restore.
// ---------------------------------------------------------------------------

const TRASH_META_FILE = 'trash-meta.json'

function cardTrashDir(kb: KbConfig): string {
  return join(kb.path, '.trash', 'cards')
}

function kbTrashRoot(): string {
  return join(configRoot(), '.trash', 'kbs')
}

/** Sanitize a card type into a safe trash subdirectory name. */
function safeTrashTypeDir(type: string): string {
  const dir = type.replace(/[^\w\u4e00-\u9fff-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return dir === '' ? 'other' : dir
}

/**
 * Move a path across filesystems if needed: fs.rename works within a volume;
 * on EXDEV/EPERM (cross-device, e.g. a KB on another drive) fall back to a
 * recursive copy + delete so trashing never fails on custom KB paths.
 */
async function movePath(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EXDEV' || code === 'EPERM') {
      await fs.cp(src, dest, { recursive: true })
      await fs.rm(src, { recursive: true, force: true })
      return
    }
    throw error
  }
}

// ---- card recycle bin ----

/** List every soft-deleted card of one KB (parsed from trash files). */
export async function listTrashedCards(kb: KbConfig): Promise<TrashCardEntry[]> {
  const root = cardTrashDir(kb)
  const files = await walkFiles(root)
  const entries: TrashCardEntry[] = []
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const full = join(root, file)
    const raw = await readText(full)
    if (raw === null) continue
    const parsed = parseFrontmatter(raw)
    const fm = parsed.frontmatter ?? {}
    const type = String(fm.type ?? 'unknown')
    const title = String(fm.title ?? basename(file, '.md'))
    const stat = await fs.stat(full)
    const typeDir = dirname(file)
    entries.push({
      slug: basename(file, '.md'),
      originalPath: `${TYPE_DIRS[type] ?? typeDir}/${basename(file)}`,
      type,
      title,
      description: fm.description !== undefined ? String(fm.description) : undefined,
      trashPath: full,
      deletedAt: stat.mtimeMs,
    })
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** Find one trashed card by slug (or normalized title). */
async function findTrashedCard(kb: KbConfig, slug: string): Promise<TrashCardEntry | null> {
  const target = slug.replace(/^wiki\//, '').replace(/\.md$/, '')
  const entries = await listTrashedCards(kb)
  return entries.find((entry) => entry.slug === target || slugFromTitle(entry.title) === target) ?? null
}

/** Soft-delete one card: move its file into the KB recycle bin, rebuild
 * index/overview and append a `delete` log entry. */
export async function deleteCard(kb: KbConfig, slug: string): Promise<{ trashPath: string }> {
  const card = await readCard(kb, slug)
  if (card === null) throw new Error(`卡片不存在: ${slug}`)
  const trashPath = join(cardTrashDir(kb), safeTrashTypeDir(card.type), `${card.slug}.md`)
  const source = join(wikiDir(kb), card.path)
  await fs.mkdir(dirname(trashPath), { recursive: true })
  await movePath(source, trashPath)
  await rebuildIndex(kb)
  await rebuildOverview(kb)
  await appendLog(kb, `delete | ${card.title}`, [`类型: ${card.type}`, `原路径: ${card.path}`])
  return { trashPath }
}

/** Restore one card from the recycle bin back to wiki/ (conflict-guarded). */
export async function restoreCard(kb: KbConfig, slug: string): Promise<{ path: string }> {
  const entry = await findTrashedCard(kb, slug)
  if (entry === null) throw new Error(`回收站中没有该卡片: ${slug}`)
  const target = join(wikiDir(kb), entry.originalPath)
  if (await pathExists(target)) {
    throw new Error(`恢复冲突: wiki/${entry.originalPath} 已存在（可能已重建同 slug 卡片）。请先彻底删除回收站中的旧条目，或手动处理。`)
  }
  await fs.mkdir(dirname(target), { recursive: true })
  await movePath(entry.trashPath, target)
  await rebuildIndex(kb)
  await rebuildOverview(kb)
  await appendLog(kb, `restore | ${entry.title}`, [`原路径: ${entry.originalPath}`])
  return { path: entry.originalPath }
}

/** Permanently remove one card from the recycle bin (not recoverable). */
export async function purgeCard(kb: KbConfig, slug: string): Promise<{ purged: boolean }> {
  const entry = await findTrashedCard(kb, slug)
  if (entry === null) throw new Error(`回收站中没有该卡片: ${slug}`)
  await fs.rm(entry.trashPath, { force: true })
  await appendLog(kb, `purge | ${entry.title}`, ['已从回收站彻底删除'])
  return { purged: true }
}

// ---- knowledge-base recycle bin ----

interface TrashKbMeta {
  id: string
  name: string
  originalPath: string
  description?: string
  createdAt?: number
  deletedAt?: number
}

async function readTrashMeta(trashDir: string): Promise<TrashKbMeta | null> {
  const text = await readText(join(trashDir, TRASH_META_FILE))
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as Partial<TrashKbMeta>
    if (typeof parsed.id !== 'string' || parsed.id === '') return null
    return {
      id: parsed.id,
      name: parsed.name ?? parsed.id,
      originalPath: parsed.originalPath ?? '',
      description: parsed.description,
      createdAt: parsed.createdAt,
      deletedAt: parsed.deletedAt,
    }
  } catch {
    return null
  }
}

/** List every soft-deleted knowledge base in the config-root recycle bin. */
export async function listTrashedKbs(): Promise<TrashKbEntry[]> {
  const root = kbTrashRoot()
  let dirs: string[]
  try {
    dirs = await fs.readdir(root)
  } catch {
    return []
  }
  const entries: TrashKbEntry[] = []
  for (const dir of dirs) {
    const trashDir = join(root, dir)
    const meta = await readTrashMeta(trashDir)
    let stat
    try {
      stat = await fs.stat(trashDir)
    } catch {
      continue
    }
    entries.push({
      id: meta?.id ?? dir,
      name: meta?.name ?? dir,
      originalPath: meta?.originalPath ?? '',
      description: meta?.description,
      createdAt: meta?.createdAt,
      deletedAt: meta?.deletedAt ?? stat.mtimeMs,
      trashPath: trashDir,
    })
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** Locate a trashed KB by id (exact dir first, then meta scan for suffixed dirs). */
async function findTrashedKb(id: string): Promise<string | null> {
  const candidate = join(kbTrashRoot(), id)
  if (await pathExists(candidate)) return candidate
  const hit = (await listTrashedKbs()).find((entry) => entry.id === id)
  return hit?.trashPath ?? null
}

/** Soft-delete one knowledge base: move its whole directory (with trash-meta
 * and its review queue) into the config-root recycle bin and unregister it. */
export async function deleteKb(id: string): Promise<{ trashPath: string }> {
  const config = await loadConfig()
  const kb = config.kbs.find((entry) => entry.id === id)
  if (kb === undefined) throw new Error(`知识库不存在: ${id}`)
  let trashDir = join(kbTrashRoot(), kb.id)
  if (await pathExists(trashDir)) trashDir = join(kbTrashRoot(), `${kb.id}-${Date.now()}`)
  await fs.mkdir(kbTrashRoot(), { recursive: true })
  await movePath(kb.path, trashDir)
  const meta: TrashKbMeta = {
    id: kb.id,
    name: kb.name,
    originalPath: kb.path,
    description: kb.description,
    createdAt: kb.createdAt,
    deletedAt: Date.now(),
  }
  await writeTextAtomic(join(trashDir, TRASH_META_FILE), JSON.stringify(meta, null, 2))
  const reviewsSrc = reviewsFile(kb)
  if (await pathExists(reviewsSrc)) {
    await fs.mkdir(join(trashDir, 'reviews'), { recursive: true })
    await movePath(reviewsSrc, join(trashDir, 'reviews', `${kb.id}.json`))
  }
  config.kbs = config.kbs.filter((entry) => entry.id !== id)
  await saveConfig(config)
  return { trashPath: trashDir }
}

/** Restore one knowledge base from the recycle bin (id/path conflict-guarded). */
export async function restoreKb(id: string): Promise<{ kb: KbConfig }> {
  const trashDir = await findTrashedKb(id)
  if (trashDir === null) throw new Error(`回收站中没有该知识库: ${id}`)
  const meta = await readTrashMeta(trashDir)
  const config = await loadConfig()
  if (config.kbs.some((kb) => kb.id === id)) throw new Error(`恢复冲突: 知识库 id "${id}" 已被占用`)
  const target = meta !== null && meta.originalPath !== '' ? meta.originalPath : join(configRoot(), 'kbs', id)
  if (await pathExists(target)) throw new Error(`恢复冲突: 原路径已存在: ${target}`)
  await movePath(trashDir, target)
  const reviewsBackup = join(target, 'reviews', `${id}.json`)
  if (await pathExists(reviewsBackup)) {
    await fs.mkdir(join(configRoot(), 'reviews'), { recursive: true })
    await movePath(reviewsBackup, reviewsFile({ id } as KbConfig))
    await fs.rm(join(target, 'reviews'), { recursive: true, force: true })
  }
  const kb: KbConfig = {
    id: meta?.id ?? id,
    name: meta?.name ?? id,
    path: target,
    description: meta?.description,
    createdAt: meta?.createdAt ?? Date.now(),
  }
  config.kbs.push(kb)
  await saveConfig(config)
  return { kb }
}

/** Permanently remove one knowledge base from the recycle bin. */
export async function purgeKb(id: string): Promise<{ purged: boolean }> {
  const trashDir = await findTrashedKb(id)
  if (trashDir === null) throw new Error(`回收站中没有该知识库: ${id}`)
  await fs.rm(trashDir, { recursive: true, force: true })
  return { purged: true }
}

/** Combined recycle-bin listing: current KB's deleted cards + all deleted KBs. */
export async function listTrash(kbId?: string): Promise<{ cards: TrashCardEntry[]; kbs: TrashKbEntry[] }> {
  const kbs = await listTrashedKbs()
  const cards: TrashCardEntry[] = []
  if (kbId !== undefined && kbId !== '') {
    const kb = await getKb(kbId)
    if (kb !== null) cards.push(...(await listTrashedCards(kb)))
  } else {
    for (const kb of await listKbs()) cards.push(...(await listTrashedCards(kb)))
  }
  return { cards, kbs }
}

// ---------------------------------------------------------------------------
// review queue (llm_wiki 审核系统: async human-in-the-loop)
// ---------------------------------------------------------------------------

function reviewsFile(kb: KbConfig): string {
  return join(configRoot(), 'reviews', `${kb.id}.json`)
}

async function loadReviews(kb: KbConfig): Promise<ReviewItem[]> {
  const text = await readText(reviewsFile(kb))
  if (text === null) return []
  try {
    const parsed = JSON.parse(text) as ReviewItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveReviews(kb: KbConfig, items: ReviewItem[]): Promise<void> {
  await writeTextAtomic(reviewsFile(kb), JSON.stringify(items, null, 2))
}

/** Add one review item (agent-flagged during ingest, or manual). */
export async function addReview(
  kb: KbConfig,
  input: { kind: ReviewKind; title: string; summary: string; source?: string; options?: string[]; searchQuery?: string },
): Promise<ReviewItem> {
  const items = await loadReviews(kb)
  const item: ReviewItem = {
    id: randomUUID().slice(0, 8),
    kbId: kb.id,
    kind: input.kind,
    title: input.title.trim(),
    summary: input.summary.trim(),
    source: input.source,
    options: input.options !== undefined && input.options.length > 0
      ? [...new Set(input.options)]
      : REVIEW_OPTIONS[input.kind] ?? ['跳过'],
    searchQuery: input.searchQuery,
    status: 'pending',
    createdAt: Date.now(),
  }
  items.push(item)
  await saveReviews(kb, items)
  return item
}

/** List review items, optionally filtered by status. */
export async function listReviews(kb: KbConfig, status?: string): Promise<ReviewItem[]> {
  const items = await loadReviews(kb)
  const filtered = status !== undefined && status !== '' && status !== 'all'
    ? items.filter((item) => item.status === status)
    : items
  return filtered.sort((a, b) => b.createdAt - a.createdAt)
}

/** Resolve a review item (resolved / skipped) with an optional note. */
export async function resolveReview(kb: KbConfig, id: string, status: 'resolved' | 'skipped', resolution?: string): Promise<ReviewItem | null> {
  const items = await loadReviews(kb)
  const item = items.find((candidate) => candidate.id === id)
  if (item === undefined) return null
  item.status = status
  item.resolvedAt = Date.now()
  item.resolution = resolution?.trim() || undefined
  await saveReviews(kb, items)
  return item
}

export { extractWikilinks }
