/** Run the deterministic audit on the real finance-km KB (real config root). */
import { auditKb } from '../lib/host/audit.js'
import { getKb, listReviews } from '../lib/host/store.js'

const kb = await getKb('finance-km')
if (kb === null) {
  console.log('finance-km 不存在')
  process.exit(0)
}
const result = await auditKb(kb)
console.log(`确定性审核（${kb.name}）: 新增 ${result.submitted.length} 条审核项（重复 ${result.summary.duplicate} · 缺失页面 ${result.summary.missingPage}），跳过已有 pending ${result.skippedExisting}`)
for (const item of result.submitted) console.log(`  ✓ [${item.kind}] ${item.title}`)
const queue = await listReviews(kb)
console.log(`\n当前审核队列: 共 ${queue.length} 条（待处理 ${queue.filter((i) => i.status === 'pending').length}）`)
for (const item of queue) console.log(`  - [${item.status}] ${item.kind} | ${item.title}`)
