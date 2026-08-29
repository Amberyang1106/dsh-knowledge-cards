/**
 * Demo: 导入现成知识库 → 对已有卡片主动审核。
 * 1. 建一个临时库，用 wiki_import_cards 导入一批「已切好的卡片」（含一张重复标题 + 一个断链），
 *    模拟「导入已有知识库」；2. 跑 wiki_audit（= 面板「审核知识库」按钮的宿主侧），展示确定性
 *    扫描产出的审核项与深度审核指令；3. 对真实 finance-km 也跑一次只读确定性扫描。
 */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKb, getKb } from '../lib/host/store.js'
import { wikiImportCardsTool, wikiAuditTool } from '../lib/host/tools.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-audit-demo-'))
process.env.DSH_KNOWLEDGE_CARDS_ROOT = root

// ---- 1. 导入现成卡片（模拟用户已有切好的知识库） ----
const kb = await createKb({ name: '导入审核演示库' })
const cardsDir = join(root, 'existing-cards')
await mkdir(join(cardsDir, 'entities'), { recursive: true })
await mkdir(join(cardsDir, 'concepts'), { recursive: true })
await writeFile(join(cardsDir, 'concepts', '成本分摊.md'),
  '---\ntype: concept\ntitle: 成本分摊\ndescription: 按动因把成本分到利润中心\ntags: [财务]\n---\n公共成本按 [[分摊动因]] 分摊。\n', 'utf8')
await writeFile(join(cardsDir, 'concepts', '成本分摊-副本.md'),
  '---\ntype: concept\ntitle: 成本分摊\ndescription: 成本分配的另一种写法\ntags: [财务]\n---\n成本按动因归集到利润中心。\n', 'utf8')
await writeFile(join(cardsDir, 'entities', '利润中心.md'),
  '---\ntype: entity\ntitle: 利润中心\ndescription: 归属单元\ntags: [财务]\n---\nPC 是 [[成本分摊]] 的归属单元，另见 [[分摊动因]]。\n', 'utf8')

const importTool = wikiImportCardsTool()
const imported = await importTool.execute({ kb: kb.id, dir: cardsDir })
console.log(`[1] 导入现成卡片: ${imported.imported.length} 张（${imported.imported.join(', ')}）`)

// ---- 2. 主动审核（= 面板「审核知识库」按钮） ----
const auditTool = wikiAuditTool()
const out = await auditTool.execute({ kb: kb.id })
console.log(`\n[2] 确定性审核结果: 新增 ${out.submitted.length} 条审核项（重复 ${out.summary.duplicate} · 缺失页面 ${out.summary.missingPage}），跳过已有 ${out.skippedExisting}`)
for (const item of out.submitted) console.log(`    ✓ [${item.kind}] ${item.title}`)
console.log(`\n[3] 深度审核指令（面板「复制深度审核指令」→ 发给 agent 做语义级审核）: ${out.deepAuditPrompt.length} 字，开头：\n${out.deepAuditPrompt.split('\n').slice(0, 4).join('\n')}`)

// 队列最终状态
const { listReviews } = await import('../lib/host/store.js')
const queue = await listReviews(kb)
console.log(`\n[4] 审核队列: ${queue.length} 条（${queue.filter((i) => i.status === 'pending').length} 待处理）`)
for (const item of queue) console.log(`    - [${item.status}] ${item.kind} | ${item.title} | 操作: ${item.options.join('/')}`)

// ---- 3. 真实 finance-km 只读确定性扫描 ----
const real = await getKb('finance-km')
if (real !== null) {
  const realOut = await auditKbDirect(real)
  console.log(`\n[5] 真实 finance-km 确定性扫描: 重复 ${realOut.summary.duplicate} · 缺失页面 ${realOut.summary.missingPage}，新增审核项 ${realOut.submitted.length}`)
}

await rm(root, { recursive: true, force: true })

async function auditKbDirect(kbConfig) {
  const { auditKb } = await import('../lib/host/audit.js')
  return auditKb(kbConfig)
}
