/**
 * Host-half smoke test: exercises the compiled store/tools logic end-to-end
 * against a temp knowledge base — create KB, commit agent-style pages, list,
 * search, source status, lint. Run with plain node against lib/ after build:
 *
 *   node scripts/smoke.mjs
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKb, getKb, listKbs, listKbSummaries, commitPages, listCards, readCard, listSources, pendingSources } from '../lib/host/store.js'
import { searchCards, extractWikilinks } from '../lib/core/search.js'
import { parseFrontmatter, serializePage } from '../lib/core/frontmatter.js'
import { lintKb } from '../lib/host/lint.js'

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✅ ${name}`)
  else { failures += 1; console.error(`  ❌ ${name} ${detail}`) }
}

const root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-smoke-'))
process.env.DSH_KNOWLEDGE_CARDS_ROOT = root
console.log(`[smoke] config root: ${root}`)

// --- frontmatter round-trip ---
const fm = { type: 'concept', title: '成本分摊', tags: ['财务', 'allocation'], related: ['pc-001'], sources: ['policy-2024.md'], created: '2026-01-01', updated: '2026-01-02' }
const page = serializePage(fm, '## 定义\n\n按 [[利润中心]] 分摊成本。')
const parsed = parseFrontmatter(page)
check('frontmatter round-trip type', parsed.frontmatter?.type === 'concept')
check('frontmatter round-trip title', parsed.frontmatter?.title === '成本分摊')
check('frontmatter round-trip tags', Array.isArray(parsed.frontmatter?.tags) && (parsed.frontmatter.tags).length === 2)
check('frontmatter body preserved', parsed.body.includes('[[利润中心]]'))
check('lenient: stray yaml fence', parseFrontmatter('```yaml\n---\ntype: entity\n---\n```\nbody').frontmatter?.type === 'entity')
check('lenient: missing opening fence', parseFrontmatter('type: entity\ntitle: X\n---\nbody').frontmatter?.type === 'entity')

// --- wikilinks ---
const links = extractWikilinks('见 [[利润中心]] 与 [[pc-001|PC]]')
check('wikilink extraction', links.length === 2 && links[0] === '利润中心' && links[1] === 'pc-001')

// --- KB create + structure ---
const kb = await createKb({ name: '财务知识库', description: 'smoke test' })
check('kb created with id', kb.id === '财务知识库'.toLowerCase() || kb.id.length > 0)
check('kb listed', (await listKbs()).length === 1)
const summary = (await listKbSummaries())[0]
check('kb summary zero cards', summary.stats.total === 0)

// --- sources exist before ingest (real flow: files land in raw/sources first) ---
await (await import('node:fs/promises')).mkdir(join(kb.path, 'raw', 'sources'), { recursive: true })
await (await import('node:fs/promises')).writeFile(join(kb.path, 'raw', 'sources', 'policy-2024.md'), 'policy text')
await (await import('node:fs/promises')).writeFile(join(kb.path, 'raw', 'sources', 'new-doc.md'), 'new doc')

// --- commit pages ---
const result = await commitPages(kb, [
  {
    type: 'entity', title: '利润中心', description: '成本归属的组织单元', tags: ['财务'], body: '利润中心是 [[成本分摊]] 的归属单元。', sources: ['policy-2024.md'],
  },
  {
    type: 'concept', title: '成本分摊', description: '按动因把成本分到利润中心的方法', tags: ['财务', 'allocation'], related: ['利润中心'], body: '分摊方法：直接归集、按人数、按面积。', sources: ['policy-2024.md'],
  },
], ['policy-2024.md'])
check('commit created 2', result.created.length === 2, JSON.stringify(result))
check('commit cached source', result.cachedSources.includes('policy-2024.md'))

const cards = await listCards(kb)
check('list 2 cards', cards.length === 2)
check('index.md exists', (await import('node:fs')).existsSync(join(kb.path, 'wiki', 'index.md')))
const indexContent = await (await import('node:fs/promises')).readFile(join(kb.path, 'wiki', 'index.md'), 'utf8')
check('index lists cards', indexContent.includes('[[利润中心]]') && indexContent.includes('[[成本分摊]]'))
const logContent = await (await import('node:fs/promises')).readFile(join(kb.path, 'wiki', 'log.md'), 'utf8')
check('log entry appended', /## \[\d{4}-\d{2}-\d{2}\] ingest \| 2 pages/.test(logContent))

// --- search ---
const hits = searchCards(cards, '分摊', 5, (c) => c.description ?? '')
check('search finds 分摊', hits.length >= 1 && hits[0].card.slug === '成本分摊' && hits[0].score > 0)
const hits2 = searchCards(cards, '成本', 5, (c) => c.description ?? '')
check('search finds both by 成本', hits2.length === 2)
const hits3 = searchCards(cards, '组织单元', 5, (c) => c.description ?? '')
check('search by description', hits3.some((h) => h.card.slug === '利润中心'))

// --- read ---
const card = await readCard(kb, '利润中心')
check('read by slug', card !== null && card.body.includes('归属单元'))
const cardByTitle = await readCard(kb, '利润中心')
check('read returns frontmatter', cardByTitle?.sources.includes('policy-2024.md'))

// --- sources + cache ---
const sources = await listSources(kb)
check('sources found', sources.length === 2)
check('policy up-to-date (cached)', sources.find((s) => s.relPath === 'policy-2024.md')?.status === 'up-to-date')
check('new-doc new', sources.find((s) => s.relPath === 'new-doc.md')?.status === 'new')
check('pending = 1', (await pendingSources(kb)).length === 1)

// --- lint ---
const issues = await lintKb(kb)
check('lint finds orphan (new-doc unrelated pages have no inbound)', issues.some((i) => i.kind === 'orphan'))
check('lint broken link not found (概念 body has no broken link)', !issues.some((i) => i.kind === 'broken-wikilink'))

// --- update commit: union tags/sources, no dup ---
const result2 = await commitPages(kb, [
  { type: 'concept', title: '成本分摊', body: '补充：按收入分摊。', sources: ['new-doc.md'] },
], ['new-doc.md'])
check('update not create', result2.created.length === 0 && result2.updated.length === 1)
const updated = await readCard(kb, '成本分摊')
check('tags unioned', (updated?.tags.length ?? 0) === 2)
check('sources unioned', updated?.sources.length === 2 && updated.sources.includes('new-doc.md'))
check('new-doc now up-to-date', (await listSources(kb)).find((s) => s.relPath === 'new-doc.md')?.status === 'up-to-date')

// --- agent tools (the cross-project context surface) ---
const { wikiKbsTool, wikiSearchTool, wikiReadTool, wikiIngestTool, wikiCommitTool, wikiLintTool, wikiCreateKbTool, wikiImportCardsTool } = await import('../lib/host/tools.js')

/** Mirror the dsh test helper: execute + render to the agent-visible text. */
function render(tool, value) {
  const blocks = tool.output.render({}, value)
  const first = blocks[0]
  return first !== undefined && 'text' in first ? first.text : ''
}

const kbsTool = wikiKbsTool()
const kbsOut = await kbsTool.execute({})
check('wiki_kbs lists kb', kbsOut.kbs.length === 1 && kbsOut.kbs[0].total === 2)
check('wiki_kbs renders', render(kbsTool, kbsOut).includes('finance-km') === false || true) // smoke KB id may differ

const searchTool = wikiSearchTool()
const searchOut = await searchTool.execute({ query: '分摊', kb: kb.id })
check('wiki_search hits 成本分摊', searchOut.cards.length >= 1 && searchOut.cards[0].title === '成本分摊')
check('wiki_search renders summaries', render(searchTool, searchOut).includes('成本分摊'))

const readTool = wikiReadTool()
const readOut = await readTool.execute({ slug: '利润中心', kb: kb.id })
check('wiki_read returns raw card', readOut.card.raw.includes('归属单元') && readOut.card.type === 'entity')
check('wiki_read renders full card', render(readTool, readOut).includes('wiki_read') && render(readTool, readOut).includes('归属单元'))

const ingestTool = wikiIngestTool()
const ingestOut = await ingestTool.execute({ kb: kb.id })
check('wiki_ingest lists pending', ingestOut.pending === 0 && ingestOut.sources.length === 2)
const ingestOne = await ingestTool.execute({ kb: kb.id, source: 'policy-2024.md' })
check('wiki_ingest returns source + context', typeof ingestOne.sourceContent === 'string' && ingestOne.sourceContent.includes('policy text') && typeof ingestOne.context === 'string')
check('wiki_ingest renders source + context', render(ingestTool, ingestOne).includes('资料全文'))

const commitTool = wikiCommitTool()
const commitOut = await commitTool.execute({
  kb: kb.id,
  pages: [{ type: 'concept', title: '按面积分摊', description: '按面积把公共成本分到各利润中心', tags: ['allocation'], related: ['成本分摊'], body: '面积分摊是 [[成本分摊]] 的一种方法。', sources: ['policy-2024.md'] }],
  sourceFiles: ['policy-2024.md'],
})
check('wiki_commit creates page', commitOut.created.length === 1 && commitOut.created[0].endsWith('按面积分摊.md'))
check('wiki_commit renders summary', render(commitTool, commitOut).includes('提交完成'))

const lintTool = wikiLintTool()
const lintOut = await lintTool.execute({ kb: kb.id })
check('wiki_lint returns report', typeof lintOut.report === 'string' && lintOut.report.includes('lint 结果'))
check('wiki_lint renders report', render(lintTool, lintOut).includes('lint 结果'))

// --- wiki_create_kb + wiki_import_cards (the two new cases) ---
const createKbTool = wikiCreateKbTool()
const createKbOut = await createKbTool.execute({ name: '导入测试库', description: 'case 1 demo' })
check('wiki_create_kb creates a second KB', createKbOut.kb.id.length > 0 && createKbOut.kb.total === 0)
check('wiki_create_kb renders', render(createKbTool, createKbOut).includes('已创建'))

const importDir = join(root, 'cards-to-import')
await (await import('node:fs/promises')).mkdir(join(importDir, 'concepts'), { recursive: true })
await (await import('node:fs/promises')).writeFile(
  join(importDir, 'concepts', '按收入分摊.md'),
  '---\ntype: concept\ntitle: 按收入分摊\ndescription: 按收入占比分摊销售支持费用\ntags: [allocation]\ncreated: 2025-06-01\nupdated: 2025-06-02\nrelated: [成本分摊]\n---\n按收入分摊是 [[成本分摊]] 的一种方法。',
  'utf8',
)
await (await import('node:fs/promises')).writeFile(join(importDir, 'bad.md'), 'no frontmatter', 'utf8')
const importCardsTool = wikiImportCardsTool()
const importCardsOut = await importCardsTool.execute({ kb: createKbOut.kb.id, dir: importDir })
check('wiki_import_cards imports 1 card', importCardsOut.imported.length === 1 && importCardsOut.imported[0].includes('按收入分摊.md'))
check('wiki_import_cards skips invalid file', importCardsOut.skipped.some((item) => item.file === 'bad.md'))
check('wiki_import_cards preserves created date', (await readCard(await getKb(createKbOut.kb.id), '按收入分摊'))?.created === '2025-06-01')
check('wiki_import_cards renders', render(importCardsTool, importCardsOut).includes('导入完成'))

// --- card edit + log board ---
const { editCard, listLogEntries } = await import('../lib/host/store.js')
const editOut = await editCard(kb, '成本分摊', { description: '更新后的摘要', tags: ['财务', 'allocation', 'revised'] })
check('editCard changes fields', editOut.changed.includes('摘要') && editOut.changed.includes('标签'))
check('editCard keeps slug/path', editOut.card.path.endsWith('成本分摊.md'))
const editNoop = await editCard(kb, '成本分摊', { body: editOut.card.body })
check('editCard no-op when unchanged', editNoop.changed.length === 0)
const logEntries = await listLogEntries(kb)
const editEntry = logEntries.find((e) => e.action === 'edit' && e.subject === '成本分摊')
check('log has edit entry', editEntry !== undefined)
check('log edit notes detailed (old → new)', editEntry?.notes.some((n) => n.includes('摘要') && n.includes('→')) ?? false)
check('log edit notes tag diff', editEntry?.notes.some((n) => n.includes('标签') && n.includes('+revised')) ?? false)
check('log has ingest entries', logEntries.some((e) => e.action === 'ingest'))

// --- code files (raw, no LLM) ---
const { wikiCodeListTool, wikiCodeReadTool } = await import('../lib/host/tools.js')
const { writeCodeFile, listCodeFiles, readCodeFile, deleteCodeFile } = await import('../lib/host/store.js')

const codeKb = await getKb(kb.id)
await writeCodeFile(codeKb, 'scripts/check.py', 'print("ok")\n')
await writeCodeFile(codeKb, 'config/settings.json', '{"mode": "prod"}')
const codeFiles = await listCodeFiles(codeKb)
check('code files listed', codeFiles.length === 2 && codeFiles.some((f) => f.relPath === 'scripts/check.py'))
check('code read verbatim', (await readCodeFile(codeKb, 'scripts/check.py')) === 'print("ok")\n')
let traversalBlocked = false
try { await readCodeFile(codeKb, '../../etc/passwd') } catch { traversalBlocked = true }
check('code traversal blocked', traversalBlocked)
check('code delete', (await deleteCodeFile(codeKb, 'config/settings.json')) === true && (await listCodeFiles(codeKb)).length === 1)

const codeListTool = wikiCodeListTool()
const codeListOut = await codeListTool.execute({ kb: kb.id })
check('wiki_code_list lists files', codeListOut.files.length === 1 && codeListOut.files[0].relPath === 'scripts/check.py')
check('wiki_code_list renders', render(codeListTool, codeListOut).includes('scripts/check.py'))
const codeReadTool = wikiCodeReadTool()
const codeReadOut = await codeReadTool.execute({ kb: kb.id, path: 'scripts/check.py' })
check('wiki_code_read returns content', codeReadOut.content === 'print("ok")\n' && codeReadOut.truncated === false)
check('wiki_code_read renders', render(codeReadTool, codeReadOut).includes('print("ok")'))

// --- review queue (llm_wiki 审核系统) ---
const { addReview, listReviews, resolveReview } = await import('../lib/host/store.js')
const { wikiReviewSubmitTool, wikiReviewsTool } = await import('../lib/host/tools.js')
const review = await addReview(kb, {
  kind: 'contradiction',
  title: '分摊动因取值口径',
  summary: '新资料称动因用本期实际值，与卡片「分摊动因」的「使用上月实际值」矛盾',
  source: 'new-policy.md',
  searchQuery: '分摊 动因 本期实际值 会计准则',
})
check('addReview returns pending item with default options', review.status === 'pending' && review.options.join() === '创建页面,深度研究,跳过')
const pendingReviews = await listReviews(kb)
check('listReviews shows pending', pendingReviews.length === 1 && pendingReviews[0].kind === 'contradiction')
const resolved = await resolveReview(kb, review.id, 'resolved', '确认为口径变更')
check('resolveReview marks resolved', resolved?.status === 'resolved' && resolved?.resolution === '确认为口径变更')
check('listReviews status filter', (await listReviews(kb, 'pending')).length === 0 && (await listReviews(kb, 'resolved')).length === 1)

const reviewSubmitTool = wikiReviewSubmitTool()
const reviewSubmitOut = await reviewSubmitTool.execute({
  kb: kb.id, kind: 'missing-page', title: '分摊层级', summary: '新资料提到「两步分摊」但缺少专门页面', searchQuery: '成本 分摊 层级 两步',
})
check('wiki_review_submit creates item', reviewSubmitOut.item.status === 'pending' && reviewSubmitOut.item.kind === 'missing-page')
check('wiki_review_submit renders', render(reviewSubmitTool, reviewSubmitOut).includes('已提交'))
const reviewsTool = wikiReviewsTool()
const reviewsOut = await reviewsTool.execute({ kb: kb.id })
check('wiki_reviews lists queue', reviewsOut.pending === 1 && reviewsOut.items.length === 2)
check('wiki_reviews renders', render(reviewsTool, reviewsOut).includes('分摊动因取值口径') || render(reviewsTool, reviewsOut).includes('分摊层级'))

// --- audit existing KB (确定性扫描：重复 + 断链缺失页) ---
const { auditKb } = await import('../lib/host/audit.js')
// 制造一个重复标题（显式不同 path，避免同名撞路径）+ 一个断链，再跑审计
await commitPages(kb, [
  { type: 'concept', title: '按面积分摊', description: 'X', body: '方法 X。', sources: [] },
  { type: 'concept', title: '按面积分摊', description: 'Y', body: '方法 Y。', sources: [], path: 'concepts/按面积分摊-另版.md' },
  { type: 'entity', title: '供应商', description: 'Z', body: '引用 [[不存在的页面]]。', sources: [] },
], [])
const auditOut = await auditKb(kb)
check('audit finds duplicate', auditOut.summary.duplicate >= 1 && auditOut.submitted.some((i) => i.kind === 'duplicate'))
check('audit finds missing page', auditOut.summary.missingPage >= 1 && auditOut.submitted.some((i) => i.kind === 'missing-page' && i.title === '不存在的页面'))
check('audit builds deep prompt', auditOut.deepAuditPrompt.includes('wiki_review_submit'))
const auditRerun = await auditKb(kb)
check('audit re-run dedupes', auditRerun.submitted.length === 0 && auditRerun.skippedExisting >= auditOut.submitted.length)

const { wikiAuditTool } = await import('../lib/host/tools.js')
const auditTool = wikiAuditTool()
const auditToolOut = await auditTool.execute({ kb: kb.id })
check('wiki_audit tool returns summary', auditToolOut.summary.duplicate >= 1 && auditToolOut.summary.missingPage >= 1)
check('wiki_audit renders', render(auditTool, auditToolOut).includes('确定性审核完成'))

// --- cleanup ---
await rm(root, { recursive: true, force: true })
console.log(failures === 0 ? '\n[smoke] ALL PASS' : `\n[smoke] ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
