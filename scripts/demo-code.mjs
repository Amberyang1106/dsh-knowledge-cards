/**
 * Demo: seed a sample code file into the real finance-km KB and show the
 * wiki_code_list / wiki_code_read tool output (what other project sessions
 * will receive).
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureKbStructure, listKbs, writeCodeFile, listCodeFiles } from '../lib/host/store.js'
import { wikiCodeListTool, wikiCodeReadTool } from '../lib/host/tools.js'

const kb = (await listKbs())[0]
// The finance-km KB predates the code/ directory — ensure it exists.
await ensureKbStructure(kb.path)

const sample = `-- 分摊异常检查点 1-3 的核查 SQL（示例，与知识卡片「分摊异常监测」对应）
SELECT
  pc_id,
  period,
  SUM(allocation_amount) AS total_amount,
  SUM(basis_value)       AS total_basis
FROM allocation_fact
WHERE period = @period
GROUP BY pc_id, period
HAVING SUM(basis_value) = 0            -- 检查点1：零分摊（动因为 0）
    OR SUM(allocation_amount) < 0      -- 检查点2：负分摊
;
`
await writeCodeFile(kb, 'sql/check_allocation.sql', sample)
console.log(`[seed] wrote sql/check_allocation.sql to ${kb.id}`)

const list = await wikiCodeListTool().execute({ kb: kb.id })
console.log('\n===== wiki_code_list 返回 =====')
for (const file of list.files) console.log(`- ${file.relPath} (${file.size} B)`)

const read = await wikiCodeReadTool().execute({ kb: kb.id, path: 'sql/check_allocation.sql' })
console.log('\n===== wiki_code_read 返回（进上下文的就是这段） =====')
console.log(read.content)
console.log(`\n本地文件位置: ${join(kb.path, 'code', 'sql', 'check_allocation.sql')}`)
