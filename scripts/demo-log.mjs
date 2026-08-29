/**
 * Demo: show the detailed modification-log format produced by editCard /
 * commitPages / importCards, using a throwaway KB (real KB untouched).
 */
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKb, commitPages, editCard, importCards, listLogEntries } from '../lib/host/store.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-log-demo-'))
process.env.DSH_KNOWLEDGE_CARDS_ROOT = root

const kb = await createKb({ name: '日志演示库' })

// 1. 摄入（两步法产出，走 commitPages）
await commitPages(kb, [
  { type: 'concept', title: '成本分摊', description: '按动因分摊', tags: ['财务'], body: '分摊三原则。\n因果、受益、可追溯。', sources: ['policy.md'] },
  { type: 'entity', title: '利润中心', description: '归属单元', tags: ['财务'], body: 'PC 是归属单元。', sources: ['policy.md'] },
], ['policy.md'])

// 2. 批量导入（importCards）
const importDir = join(root, 'cards')
await mkdir(join(importDir), { recursive: true })
await writeFile(join(importDir, '分摊动因.md'), '---\ntype: concept\ntitle: 分摊动因\ndescription: 人头/面积/收入/工时\ntags: [allocation]\n---\n动因表。', 'utf8')
await writeFile(join(importDir, 'bad.md'), 'no frontmatter', 'utf8')
await importCards(kb, importDir)

// 3. 手动编辑（editCard）
await editCard(kb, '成本分摊', {
  description: '按动因把成本分到利润中心的方法',
  tags: ['财务', 'allocation', 'revised'],
  body: '分摊三原则。\n因果、受益、可追溯。\n新增：动因缺失回退上月值。',
})

const logPath = join(kb.path, 'wiki', 'log.md')
console.log('===== wiki/log.md 原文 =====')
console.log(await readFile(logPath, 'utf8'))

const entries = await listLogEntries(kb)
console.log('===== 看板解析结果 =====')
for (const entry of entries) {
  console.log(`[${entry.date}] ${entry.action} | ${entry.subject}`)
  for (const note of entry.notes) console.log(`    · ${note}`)
}

await rm(root, { recursive: true, force: true })
