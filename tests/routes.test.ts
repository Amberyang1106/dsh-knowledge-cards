/**
 * Route-layer end-to-end test: register the real route handlers (captured
 * through apply()'s webServer stub) on a loopback node http server and drive
 * every /api/dsh-knowledge/* endpoint with real HTTP requests — KB create/
 * list, commit pages, card list/detail, source status, lint. This is the
 * exact surface the browser panel calls.
 * @module dsh-knowledge-cards/tests/routes
 */

import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

interface RouteSpec { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }

function makeStubCtx() {
  const routes: RouteSpec[] = []
  return {
    routes,
    ctx: {
      effect: (fn: () => unknown) => { const dispose = fn(); return typeof dispose === 'function' ? (dispose as () => void) : () => {} },
      webServer: { register: (route: RouteSpec) => { routes.push(route); return () => {} } },
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {} },
    },
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

function jsonRequest(port: number, method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    // node's http.request requires a percent-encoded path; URLSearchParams
    // handles CJK query values the panel sends (e.g. slug=成本分摊).
    const url = new URL(path, 'http://127.0.0.1')
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path: url.pathname + url.search,
        headers: { 'content-type': 'application/json', ...(payload !== undefined ? { 'content-length': Buffer.byteLength(payload) } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          let data: Record<string, unknown> = {}
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> } catch { /* empty */ }
          resolve({ status: res.statusCode ?? 0, data })
        })
      },
    )
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

describe('knowledge routes over HTTP', () => {
  let root: string
  let server: Server
  let port: number
  let kbId: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-routes-'))
    process.env.DSH_KNOWLEDGE_CARDS_ROOT = root
    const { ctx, routes } = makeStubCtx()
    apply(ctx as never)
    expect(routes.length).toBe(31)
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const route = routes.find((candidate) => candidate.kind === 'exact' && candidate.path === url.pathname)
      if (route === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      void route.handler(req, res)
    })
    port = await listen(server)
  })

  afterAll(async () => {
    server.close()
    delete process.env.DSH_KNOWLEDGE_CARDS_ROOT
    await rm(root, { recursive: true, force: true })
  })

  it('forbids nothing on loopback but rejects unknown methods with 405', async () => {
    const res = await jsonRequest(port, 'DELETE', '/api/dsh-knowledge/kbs')
    expect(res.status).toBe(405)
  })

  it('creates a KB and lists it', async () => {
    const created = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs', { name: '财务测试库', description: 'route test' })
    expect(created.status).toBe(200)
    expect(created.data.ok).toBe(true)
    const kb = (created.data.kb as { id?: string })
    kbId = kb.id ?? ''
    expect(kbId).not.toBe('')

    const listed = await jsonRequest(port, 'GET', '/api/dsh-knowledge/kbs')
    expect(listed.data.ok).toBe(true)
    const kbs = listed.data.kbs as Array<{ id: string; stats: { total: number } }>
    expect(kbs.some((entry) => entry.id === kbId)).toBe(true)
    expect(kbs[0].stats.total).toBe(0)
  })

  it('commits pages and serves them through cards/card', async () => {
    const committed = await jsonRequest(port, 'POST', '/api/dsh-knowledge/commit', {
      kb: kbId,
      pages: [
        { type: 'concept', title: '成本分摊', description: '测试概念', tags: ['财务'], body: '按 [[利润中心]] 分摊。', sources: [] },
        { type: 'entity', title: '利润中心', description: '归属单元', tags: ['财务'], body: '归属单元。', sources: [] },
      ],
      sourceFiles: [],
    })
    expect(committed.data.ok).toBe(true)
    expect((committed.data.result as { created: string[] }).created.length).toBe(2)

    const cards = await jsonRequest(port, 'GET', `/api/dsh-knowledge/cards?kb=${encodeURIComponent(kbId)}&q=分摊`)
    expect(cards.data.ok).toBe(true)
    const list = cards.data.cards as Array<{ title: string }>
    expect(list.some((card) => card.title === '成本分摊')).toBe(true)

    const detail = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(kbId)}&slug=成本分摊`)
    expect(detail.data.ok).toBe(true)
    expect((detail.data.card as { body: string }).body).toContain('[[利润中心]]')

    const missing = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(kbId)}&slug=nope`)
    expect(missing.status).toBe(404)
  })

  it('reports sources and runs lint', async () => {
    await mkdir(join(root, 'kbs', kbId, 'raw', 'sources'), { recursive: true })
    await writeFile(join(root, 'kbs', kbId, 'raw', 'sources', 'note.md'), 'note', 'utf8')

    const sources = await jsonRequest(port, 'GET', `/api/dsh-knowledge/sources?kb=${encodeURIComponent(kbId)}`)
    expect(sources.data.ok).toBe(true)
    const list = sources.data.sources as Array<{ relPath: string; status: string }>
    expect(list.some((entry) => entry.relPath === 'note.md' && entry.status === 'new')).toBe(true)

    const lint = await jsonRequest(port, 'POST', '/api/dsh-knowledge/lint', { kb: kbId })
    expect(lint.data.ok).toBe(true)
    expect(Array.isArray(lint.data.issues)).toBe(true)
  })

  it('rejects unknown KBs with 404', async () => {
    const cards = await jsonRequest(port, 'GET', '/api/dsh-knowledge/cards?kb=ghost')
    expect(cards.status).toBe(404)
  })

  it('bulk-imports existing cards and rebuilds aggregates', async () => {
    const importDir = join(root, 'import-me')
    await mkdir(join(importDir, 'entities'), { recursive: true })
    await writeFile(join(importDir, 'entities', '供应商.md'),
      '---\ntype: entity\ntitle: 供应商\ndescription: 成本来源方\ntags: [财务]\ncreated: 2025-03-01\nupdated: 2025-03-02\n---\n供应商是 [[成本分摊]] 的来源。', 'utf8')
    await writeFile(join(importDir, 'no-fm.md'), 'no frontmatter here', 'utf8')

    const imported = await jsonRequest(port, 'POST', '/api/dsh-knowledge/import-cards', { kb: kbId, dir: importDir })
    expect(imported.data.ok).toBe(true)
    const result = imported.data.result as { imported: string[]; skipped: Array<{ file: string; reason: string }> }
    expect(result.imported.length).toBe(1)
    expect(result.imported[0]).toContain('供应商.md')
    expect(result.skipped.some((item) => item.file === 'no-fm.md')).toBe(true)

    const detail = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(kbId)}&slug=供应商`)
    expect(detail.data.ok).toBe(true)
    // created/updated preserved from the imported frontmatter
    expect((detail.data.card as { created?: string }).created).toBe('2025-03-01')

    const rebuilt = await jsonRequest(port, 'POST', '/api/dsh-knowledge/rebuild', { kb: kbId })
    expect(rebuilt.data.ok).toBe(true)
    expect((rebuilt.data.rebuilt as { index: boolean }).index).toBe(true)
  })

  it('stores and serves raw code files (no LLM processing) with traversal protection', async () => {
    // empty list first
    const empty = await jsonRequest(port, 'GET', `/api/dsh-knowledge/code?kb=${encodeURIComponent(kbId)}`)
    expect((empty.data.files as unknown[]).length).toBe(0)

    // write a code file
    const written = await jsonRequest(port, 'POST', '/api/dsh-knowledge/code', {
      kb: kbId,
      path: 'scripts/check_allocation.py',
      content: 'print("hello")\n',
    })
    expect(written.data.ok).toBe(true)

    // list shows it
    const listed = await jsonRequest(port, 'GET', `/api/dsh-knowledge/code?kb=${encodeURIComponent(kbId)}`)
    const files = listed.data.files as Array<{ relPath: string; size: number }>
    expect(files.some((file) => file.relPath === 'scripts/check_allocation.py')).toBe(true)

    // read content back verbatim
    const content = await jsonRequest(port, 'GET', `/api/dsh-knowledge/code/content?kb=${encodeURIComponent(kbId)}&path=${encodeURIComponent('scripts/check_allocation.py')}`)
    expect((content.data.content as string)).toBe('print("hello")\n')

    // traversal is rejected (does not escape code/)
    const evil = await jsonRequest(port, 'POST', '/api/dsh-knowledge/code', { kb: kbId, path: '../../evil.py', content: 'x' })
    expect(evil.data.ok).toBe(false)

    // delete
    const removed = await jsonRequest(port, 'POST', '/api/dsh-knowledge/code/delete', { kb: kbId, path: 'scripts/check_allocation.py' })
    expect(removed.data.deleted).toBe(true)
    const after = await jsonRequest(port, 'GET', `/api/dsh-knowledge/code?kb=${encodeURIComponent(kbId)}`)
    expect((after.data.files as unknown[]).length).toBe(0)
  })

  it('edits a card manually and records the change in the modification log', async () => {
    // seed a card first
    const committed = await jsonRequest(port, 'POST', '/api/dsh-knowledge/commit', {
      kb: kbId,
      pages: [{ type: 'concept', title: '待编辑卡片', description: '旧摘要', tags: ['财务'], body: '旧正文。', sources: [] }],
      sourceFiles: [],
    })
    expect(committed.data.ok).toBe(true)

    const edited = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/edit', {
      kb: kbId,
      slug: '待编辑卡片',
      title: '待编辑卡片',
      description: '新摘要',
      tags: ['财务', 'allocation'],
      body: '新正文内容。',
    })
    expect(edited.data.ok).toBe(true)
    const result = edited.data.result as { changed: string[]; card: { description?: string; tags: string[]; body: string; updated?: string } }
    expect(result.changed).toEqual(['摘要', '标签', '正文'])
    expect(result.card.description).toBe('新摘要')
    expect(result.card.tags).toEqual(['财务', 'allocation'])
    expect(result.card.body).toContain('新正文内容。')

    // no-op edit (same values) → nothing changed
    const noop = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/edit', {
      kb: kbId, slug: '待编辑卡片', body: '新正文内容。',
    })
    expect((noop.data.result as { changed: string[] }).changed).toEqual([])

    // the modification log lists the edit entry with detailed notes
    const log = await jsonRequest(port, 'GET', `/api/dsh-knowledge/log?kb=${encodeURIComponent(kbId)}`)
    expect(log.data.ok).toBe(true)
    const entries = log.data.entries as Array<{ action: string; subject: string; notes: string[] }>
    const editEntry = entries.find((entry) => entry.action === 'edit' && entry.subject === '待编辑卡片')
    expect(editEntry).toBeDefined()
    expect(editEntry?.notes.some((note) => note.includes('摘要') && note.includes('旧摘要') && note.includes('新摘要'))).toBe(true)
    expect(editEntry?.notes.some((note) => note.includes('标签') && note.includes('+allocation'))).toBe(true)
    expect(editEntry?.notes.some((note) => note.includes('正文') && note.includes('新增'))).toBe(true)

    // filter by action
    const editsOnly = await jsonRequest(port, 'GET', `/api/dsh-knowledge/log?kb=${encodeURIComponent(kbId)}&action=edit`)
    expect((editsOnly.data.entries as unknown[]).every((entry) => (entry as { action: string }).action === 'edit')).toBe(true)
  })

  it('runs the review queue (submit → list → resolve → skip)', async () => {
    // empty queue
    const empty = await jsonRequest(port, 'GET', `/api/dsh-knowledge/reviews?kb=${encodeURIComponent(kbId)}`)
    expect((empty.data.items as unknown[]).length).toBe(0)

    // submit a contradiction review (as the agent would during ingest)
    const submitted = await jsonRequest(port, 'POST', '/api/dsh-knowledge/reviews', {
      kb: kbId,
      kind: 'contradiction',
      title: '分摊动因取值口径',
      summary: '新资料称动因应使用本期实际值，与现有卡片「分摊动因」的「使用上月实际值」矛盾，需人工判断',
      source: 'new-policy.md',
      searchQuery: '成本分摊 动因 本期实际值 vs 上月实际值 会计准则',
    })
    expect(submitted.data.ok).toBe(true)
    const item = submitted.data.item as { id: string; kind: string; options: string[]; status: string }
    expect(item.kind).toBe('contradiction')
    expect(item.options).toEqual(['创建页面', '深度研究', '跳过'])
    expect(item.status).toBe('pending')

    // list shows it as pending
    const listed = await jsonRequest(port, 'GET', `/api/dsh-knowledge/reviews?kb=${encodeURIComponent(kbId)}`)
    expect((listed.data.items as unknown[]).length).toBe(1)
    expect(listed.data.pending).toBe(1)

    // resolve it (human judged)
    const resolved = await jsonRequest(port, 'POST', '/api/dsh-knowledge/reviews/resolve', {
      kb: kbId, id: item.id, status: 'resolved', resolution: '确认为口径变更，已更新卡片',
    })
    expect((resolved.data.item as { status: string }).status).toBe('resolved')
    expect((resolved.data.item as { resolution: string }).resolution).toBe('确认为口径变更，已更新卡片')

    // pending filter excludes it
    const pendingOnly = await jsonRequest(port, 'GET', `/api/dsh-knowledge/reviews?kb=${encodeURIComponent(kbId)}&status=pending`)
    expect((pendingOnly.data.items as unknown[]).length).toBe(0)

    // unknown id → 404
    const missing = await jsonRequest(port, 'POST', '/api/dsh-knowledge/reviews/resolve', { kb: kbId, id: 'nope', status: 'skipped' })
    expect(missing.status).toBe(404)
  })

  it('audits existing cards (duplicates + broken links) into the review queue', async () => {
    // Seed cards with one duplicate-title pair (explicit distinct paths, since
    // commitPages would otherwise collide same-title pages onto one file) and
    // one broken [[wikilink]].
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/commit', {
      kb: kbId,
      pages: [
        { type: 'concept', title: '分摊动因', description: 'A', body: '正文 A。', sources: [] },
        { type: 'concept', title: '分摊动因', description: 'B', body: '正文 B。', sources: [], path: 'concepts/分摊动因-另版.md' },
        { type: 'entity', title: '利润中心', description: 'C', body: '引用 [[不存在概念]]。', sources: [] },
      ],
      sourceFiles: [],
    })

    const audited = await jsonRequest(port, 'POST', '/api/dsh-knowledge/audit', { kb: kbId })
    expect(audited.data.ok).toBe(true)
    const result = audited.data.result as { submitted: Array<{ kind: string; title: string }>; skippedExisting: number; summary: { duplicate: number; missingPage: number }; deepAuditPrompt: string }
    expect(result.summary.duplicate).toBeGreaterThanOrEqual(1)
    expect(result.summary.missingPage).toBeGreaterThanOrEqual(1)
    expect(result.submitted.some((item) => item.kind === 'duplicate')).toBe(true)
    expect(result.submitted.some((item) => item.kind === 'missing-page' && item.title === '不存在概念')).toBe(true)
    expect(result.deepAuditPrompt).toContain('wiki_review_submit')

    // Re-running dedupes: no new items, skippedExisting counts them.
    const rerun = await jsonRequest(port, 'POST', '/api/dsh-knowledge/audit', { kb: kbId })
    const rerunResult = rerun.data.result as { submitted: unknown[]; skippedExisting: number }
    expect(rerunResult.submitted.length).toBe(0)
    expect(rerunResult.skippedExisting).toBeGreaterThanOrEqual(result.submitted.length)
  })

  it('serves the deep-audit prompt without side effects', async () => {
    const prompt = await jsonRequest(port, 'GET', `/api/dsh-knowledge/audit-prompt?kb=${encodeURIComponent(kbId)}`)
    expect(prompt.data.ok).toBe(true)
    expect((prompt.data.prompt as string)).toContain('wiki_review_submit')
    expect((prompt.data.prompt as string)).toContain('现有卡片')
    // No review items were created by generating the prompt (pending stays
    // at the two created by the audit test; the earlier review test resolved
    // its own item, so the full queue is 3).
    const reviews = await jsonRequest(port, 'GET', `/api/dsh-knowledge/reviews?kb=${encodeURIComponent(kbId)}&status=pending`)
    expect((reviews.data.items as unknown[]).length).toBe(2)
  })

  it('creates a card manually, then deletes → trash → restore → purge', async () => {
    // manual create via the panel form path (empty body allowed)
    const created = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', {
      kb: kbId,
      type: 'concept',
      title: '手写卡片',
      description: '面板新建',
      tags: ['手动'],
      related: ['成本分摊'],
      sources: [],
      body: '',
    })
    expect(created.data.ok).toBe(true)
    const createdResult = created.data.result as { created: string[]; card: { slug: string; title: string; body: string } }
    expect(createdResult.created.length).toBe(1)
    const slug = createdResult.card.slug

    // the manual create lands in the log under the `create` action
    const log = await jsonRequest(port, 'GET', `/api/dsh-knowledge/log?kb=${encodeURIComponent(kbId)}&action=create`)
    expect((log.data.entries as Array<{ subject: string }>).some((entry) => entry.subject === '手写卡片')).toBe(true)

    // soft delete → gone from cards, present in trash
    const deleted = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/delete', { kb: kbId, slug })
    expect(deleted.data.ok).toBe(true)
    const afterDelete = await jsonRequest(port, 'GET', `/api/dsh-knowledge/cards?kb=${encodeURIComponent(kbId)}`)
    expect((afterDelete.data.cards as Array<{ slug: string }>).some((card) => card.slug === slug)).toBe(false)
    const trashAfterDelete = await jsonRequest(port, 'GET', `/api/dsh-knowledge/trash?kb=${encodeURIComponent(kbId)}`)
    const trashedCards = trashAfterDelete.data.cards as Array<{ slug: string; originalPath: string }>
    expect(trashedCards.some((card) => card.slug === slug)).toBe(true)
    expect(trashedCards.find((card) => card.slug === slug)?.originalPath).toContain('concepts/')

    // restore → back in cards, gone from trash
    const restored = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/restore', { kb: kbId, slug })
    expect(restored.data.ok).toBe(true)
    const afterRestore = await jsonRequest(port, 'GET', `/api/dsh-knowledge/cards?kb=${encodeURIComponent(kbId)}`)
    expect((afterRestore.data.cards as Array<{ slug: string }>).some((card) => card.slug === slug)).toBe(true)

    // delete again then purge → gone from trash too
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/delete', { kb: kbId, slug })
    const purged = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/purge', { kb: kbId, slug })
    expect(purged.data.ok).toBe(true)
    const trashAfterPurge = await jsonRequest(port, 'GET', `/api/dsh-knowledge/trash?kb=${encodeURIComponent(kbId)}`)
    expect((trashAfterPurge.data.cards as Array<{ slug: string }>).some((card) => card.slug === slug)).toBe(false)

    // unknown trash entry → 400 with a clear error
    const missingRestore = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/restore', { kb: kbId, slug: 'nope' })
    expect(missingRestore.status).toBe(400)
    expect(String(missingRestore.data.error)).toContain('回收站')
  })

  it('manages rule cards (type=rules) and compiles rule sets over /rules', async () => {
    // A dedicated KB so the later KB-delete test stays independent.
    const created = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs', { name: '规则测试库' })
    const rkb = (created.data.kb as { id: string })
    const rkbId = rkb.id

    const activeRule = [
      'type: rules',
      'title: MSPA03存在WBS但均非9位',
      'description: 规则卡测试',
      'rule_id: B3-NOWBS-003',
      'rule_set: b3-b4-no-wbs',
      'applies_to: [B3]',
      'status: active',
      'priority: 30',
      'match: all',
      'conditions:',
      '  - fact: mspa03_customer_row_count',
      '    operator: gt',
      '    value: 0',
      '  - fact: mspa03_valid_9char_wbs_count',
      '    operator: eq',
      '    value: 0',
      'outcome:',
      '  category: WBS_FORMAT',
      '  label: 非9位WBS',
      'test_cases:',
      '  - name: 支持案例',
      '    facts:',
      '      mspa03_customer_row_count: 1',
      '      mspa03_valid_9char_wbs_count: 0',
      '    expected: SUPPORTED',
    ].join('\n')

    // 1. create a rule card via the canonical YAML payload (no client parsing)
    const cardCreated = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', {
      kb: rkbId, type: 'rules', frontmatterYaml: activeRule, body: '业务说明。',
    })
    expect(cardCreated.data.ok).toBe(true)
    const result = cardCreated.data.result as { created: string[]; card: { slug: string; type: string } }
    expect(result.created[0]).toContain('rules/')
    expect(result.card.type).toBe('rules')

    // 2. /rules compiles the active set with a content version
    const compiled = await jsonRequest(port, 'GET', `/api/dsh-knowledge/rules?kb=${encodeURIComponent(rkbId)}&ruleSet=b3-b4-no-wbs&status=active`)
    expect(compiled.data.ok).toBe(true)
    const rulesData = compiled.data as { version: string; hash: string; rules: Array<{ slug: string; spec: { rule_id: string; conditions: Array<{ fact: string; operator: string }>; outcome: { category: string } } }>; invalidRules: unknown[] }
    expect(rulesData.rules).toHaveLength(1)
    expect(rulesData.rules[0].spec.rule_id).toBe('B3-NOWBS-003')
    expect(rulesData.rules[0].spec.conditions).toHaveLength(2)
    expect(rulesData.rules[0].spec.conditions[1]).toEqual({ fact: 'mspa03_valid_9char_wbs_count', operator: 'eq', value: 0 })
    expect(rulesData.rules[0].spec.outcome.category).toBe('WBS_FORMAT')
    expect(rulesData.version).toMatch(/^sha256:/)
    expect(rulesData.invalidRules).toHaveLength(0)

    // 3. draft rules are excluded from active but visible under status=all
    const draftRule = activeRule.replace('status: active', 'status: draft').replace('B3-NOWBS-003', 'B3-NOWBS-004').replace('title: MSPA03存在WBS但均非9位', 'title: 草案规则')
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', { kb: rkbId, type: 'rules', frontmatterYaml: draftRule, body: '' })
    const activeOnly = await jsonRequest(port, 'GET', `/api/dsh-knowledge/rules?kb=${encodeURIComponent(rkbId)}&ruleSet=b3-b4-no-wbs`)
    expect((activeOnly.data.rules as unknown[]).length).toBe(1)
    const allStatuses = await jsonRequest(port, 'GET', `/api/dsh-knowledge/rules?kb=${encodeURIComponent(rkbId)}&ruleSet=b3-b4-no-wbs&status=all`)
    expect((allStatuses.data.rules as unknown[]).length).toBe(2)

    // 4. structurally invalid rules surface in invalidRules and never run
    const badRule = [
      'type: rules',
      'title: 坏规则',
      'rule_id: B3-NOWBS-999',
      'rule_set: b3-b4-no-wbs',
      'status: active',
      'conditions:',
      '  - fact: mspa03_customer_row_count',
      '    operator: bogus_operator',
      '    value: 0',
    ].join('\n')
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', { kb: rkbId, type: 'rules', frontmatterYaml: badRule, body: '' })
    const withInvalid = await jsonRequest(port, 'GET', `/api/dsh-knowledge/rules?kb=${encodeURIComponent(rkbId)}&ruleSet=b3-b4-no-wbs`)
    const invalid = withInvalid.data.invalidRules as Array<{ slug: string; issues: string[] }>
    expect(withInvalid.data.rules as unknown[]).toHaveLength(1)
    expect(invalid.some((entry) => entry.issues.some((issue) => issue.includes('bogus_operator')))).toBe(true)

    // 5. edit whole frontmatter via frontmatterYaml (deprecate the active rule)
    const ruleSlug = result.card.slug
    const deprecatedYaml = activeRule.replace('status: active', 'status: deprecated')
    const edited = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/edit', {
      kb: rkbId, slug: ruleSlug, frontmatterYaml: deprecatedYaml, body: '业务说明。',
    })
    expect(edited.data.ok).toBe(true)
    expect((edited.data.result as { changed: string[] }).changed).toContain('规则配置')
    const afterDeprecate = await jsonRequest(port, 'GET', `/api/dsh-knowledge/rules?kb=${encodeURIComponent(rkbId)}&ruleSet=b3-b4-no-wbs`)
    expect((afterDeprecate.data.rules as unknown[]).length).toBe(0)

    // 6. unknown facts are preserved for the evaluator side (structure kept)
    const detail = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(rkbId)}&slug=${encodeURIComponent(ruleSlug)}`)
    expect((detail.data.card as { type: string }).type).toBe('rules')
  })

  it('creates and edits a field card through structured frontmatter (5-section form path)', async () => {
    const created = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs', { name: '字段测试库' })
    const fkbId = (created.data.kb as { id: string }).id

    const createdCard = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', {
      kb: fkbId,
      type: 'field',
      title: 'Premium Mix %',
      description: 'Premium 收入占 PC 收入比例（Non-additive measure）',
      tags: ['premium', 'measure'],
      sources: [],
      frontmatter: {
        field_id: 'field.premium_mix_pct',
        canonical_name: 'premium_mix_pct',
        aliases: ['Premium Mix', 'premium_mix'],
        field_kind: 'measure',
        data_type: 'percentage',
        aggregation: 'non-additive',
        unit: '%',
        status: 'active',
        review_status: 'confirmed',
        evidence_level: 'business_confirmation',
        source_table: 'magellanedw.cam_fi.fact_fin_qbr_por_consolidated_data_set_w_qtd_metric_view',
        source_field: 'ttl_rev_amt',
        depends_on: ['Premium-Flag'],
        used_by: ['QBR', 'AI Navigator'],
      },
      body: '业务定义与计算逻辑见正文。',
    })
    expect(createdCard.data.ok).toBe(true)
    const slug = (createdCard.data.result as { card: { slug: string; type: string } }).card.slug
    expect((createdCard.data.result as { created: string[] }).created[0]).toContain('fields/')

    // detail hands back the parsed frontmatter so structured editors can prefill
    const detail = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(fkbId)}&slug=${encodeURIComponent(slug)}`)
    const fm = detail.data.frontmatter as Record<string, unknown>
    expect(fm.field_kind).toBe('measure')
    expect(fm.aggregation).toBe('non-additive')
    expect(fm.aliases).toEqual(['Premium Mix', 'premium_mix'])
    expect(fm.depends_on).toEqual(['Premium-Flag'])
    expect(fm.used_by).toEqual(['QBR', 'AI Navigator'])
    expect((detail.data.card as { tags: string[] }).tags).toEqual(['premium', 'measure'])

    // structured edit replaces the non-managed metadata wholesale (removals included)
    const edited = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/edit', {
      kb: fkbId,
      slug,
      title: 'Premium Mix %',
      description: '更新后的定义',
      tags: ['premium'],
      sources: [],
      frontmatter: {
        field_id: 'field.premium_mix_pct',
        field_kind: 'measure',
        review_status: 'confirmed',
        depends_on: ['Premium-Flag', 'Premium-Revenue'],
      },
      body: '业务定义与计算逻辑见正文。',
    })
    expect(edited.data.ok).toBe(true)
    expect((edited.data.result as { changed: string[] }).changed).toContain('字段元数据')

    const after = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(fkbId)}&slug=${encodeURIComponent(slug)}`)
    const fm2 = after.data.frontmatter as Record<string, unknown>
    expect(fm2.depends_on).toEqual(['Premium-Flag', 'Premium-Revenue'])
    expect(fm2.used_by).toBeUndefined()
    expect(fm2.aggregation).toBeUndefined()
    expect((after.data.card as { description?: string }).description).toBe('更新后的定义')

    // the edit is visible on the 看板 with its own note
    const log = await jsonRequest(port, 'GET', `/api/dsh-knowledge/log?kb=${encodeURIComponent(fkbId)}&action=edit`)
    expect((log.data.entries as Array<{ notes: string[] }>).some((entry) => entry.notes.some((note) => note.includes('字段元数据')))).toBe(true)
  })

  it('runs the lineage button path: deterministic scan → apply → lint clean', async () => {
    const created = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs', { name: '血缘按钮库' })
    const lkbId = (created.data.kb as { id: string }).id
    const seed = async (title: string, body: string, frontmatter: Record<string, unknown>): Promise<void> => {
      const res = await jsonRequest(port, 'POST', '/api/dsh-knowledge/card/create', {
        kb: lkbId, type: 'field', title, description: `${title} 定义`, frontmatter, body,
      })
      expect(res.data.ok).toBe(true)
    }
    await seed('Premium Mix %', 'step 1: by Premium Revenue get amount from <fact_tbl>.', { field_kind: 'measure', status: 'active' })
    await seed('Premium Revenue', 'revenue base amount.', { field_kind: 'measure', status: 'active' })
    await seed('Legacy Dim', 'dimension text.', { field_kind: 'dimension', aggregation: 'additive', source_table: 'PBI', status: 'active' })

    const scan = await jsonRequest(port, 'POST', '/api/dsh-knowledge/lineage/scan', { kb: lkbId })
    expect(scan.data.ok).toBe(true)
    const scanResult = scan.data.result as { fieldCards: number; proposals: Array<{ slug: string; relations: Record<string, string[]>; metadata?: Record<string, unknown> }> }
    expect(scanResult.fieldCards).toBe(3)
    expect(scanResult.proposals.length).toBeGreaterThan(0)
    expect(scanResult.proposals.some((proposal) => JSON.stringify(proposal.relations).includes('depends_on'))).toBe(true)

    const applied = await jsonRequest(port, 'POST', '/api/dsh-knowledge/lineage/apply', { kb: lkbId, accepted: scanResult.proposals })
    expect(applied.data.ok).toBe(true)
    const applyResult = applied.data.result as { applied: Array<{ slug: string }> }
    expect(applyResult.applied.length).toBeGreaterThan(0)

    const mix = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(lkbId)}&slug=Premium-Mix`)
    const mixFm = mix.data.frontmatter as Record<string, unknown>
    expect(mixFm.depends_on).toContain('Premium-Revenue')
    expect(mixFm.review_status).toBe('inferred')
    const revenue = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(lkbId)}&slug=Premium-Revenue`)
    expect((revenue.data.frontmatter as Record<string, unknown>).used_by).toContain('Premium-Mix')

    const legacy = await jsonRequest(port, 'GET', `/api/dsh-knowledge/card?kb=${encodeURIComponent(lkbId)}&slug=Legacy-Dim`)
    const legacyFm = legacy.data.frontmatter as Record<string, unknown>
    expect(legacyFm.source_table).toBeUndefined()
    expect(legacyFm.aggregation).toBe('non-additive')

    const lint = await jsonRequest(port, 'POST', '/api/dsh-knowledge/lint', { kb: lkbId })
    const issues = lint.data.issues as Array<{ kind: string }>
    expect(issues.filter((issue) => issue.kind.startsWith('relation-'))).toHaveLength(0)

    const proposals = await jsonRequest(port, 'GET', `/api/dsh-knowledge/lineage/proposals?kb=${encodeURIComponent(lkbId)}`)
    expect(proposals.data.ok).toBe(true)
    expect(proposals.data.proposals).toBeNull()
  })

  it('deletes a knowledge base to the trash and restores it with its review queue', async () => {
    // seed a review that should follow the KB into the trash
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/reviews', {
      kb: kbId, kind: 'suggestion', title: '删库测试审核', summary: '随库进回收站',
    })

    // soft delete the KB → unregistered, present in the trash (global listing)
    const deleted = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs/delete', { kb: kbId })
    expect(deleted.data.ok).toBe(true)
    const afterDelete = await jsonRequest(port, 'GET', '/api/dsh-knowledge/kbs')
    expect((afterDelete.data.kbs as Array<{ id: string }>).some((kb) => kb.id === kbId)).toBe(false)
    const trashAfterDelete = await jsonRequest(port, 'GET', `/api/dsh-knowledge/trash?kb=${encodeURIComponent(kbId)}`)
    expect((trashAfterDelete.data.kbs as Array<{ id: string }>).some((kb) => kb.id === kbId)).toBe(true)

    // restore → re-registered, review queue back
    const restored = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs/restore', { kb: kbId })
    expect(restored.data.ok).toBe(true)
    const afterRestore = await jsonRequest(port, 'GET', '/api/dsh-knowledge/kbs')
    expect((afterRestore.data.kbs as Array<{ id: string }>).some((kb) => kb.id === kbId)).toBe(true)
    const reviews = await jsonRequest(port, 'GET', `/api/dsh-knowledge/reviews?kb=${encodeURIComponent(kbId)}`)
    expect((reviews.data.items as Array<{ title: string }>).some((item) => item.title === '删库测试审核')).toBe(true)

    // delete again then purge → gone from the trash too
    await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs/delete', { kb: kbId })
    const purged = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs/purge', { kb: kbId })
    expect(purged.data.ok).toBe(true)
    const trashAfterPurge = await jsonRequest(port, 'GET', '/api/dsh-knowledge/trash')
    expect((trashAfterPurge.data.kbs as Array<{ id: string }>).some((kb) => kb.id === kbId)).toBe(false)

    // restoring an unknown trashed KB → 400
    const missingRestore = await jsonRequest(port, 'POST', '/api/dsh-knowledge/kbs/restore', { kb: 'ghost' })
    expect(missingRestore.status).toBe(400)
  })
})
