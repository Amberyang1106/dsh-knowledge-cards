/** Read-only check of the real finance-km modification log. */
import { listKbs, listLogEntries, listCards } from '../lib/host/store.js'

const kb = (await listKbs())[0]
console.log('=== 真实 finance-km 修改日志（看板将显示）===')
const entries = await listLogEntries(kb)
for (const entry of entries) {
  console.log(`[${entry.date}] ${entry.action} | ${entry.subject}${entry.note !== undefined ? ` — ${entry.note}` : ''}`)
}
console.log(`共 ${entries.length} 条`)
const cards = await listCards(kb)
console.log(`卡片数: ${cards.length}（看板编辑入口作用于这些卡片）`)
