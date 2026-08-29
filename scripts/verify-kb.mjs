/**
 * Verify the real finance-km knowledge base end state after the two-step
 * ingest demonstration. Read-only.
 */
import { readFile } from 'node:fs/promises'
import { listCards, listKbs, listSources } from '../lib/host/store.js'
import { lintKb } from '../lib/host/lint.js'

const kb = (await listKbs())[0]
console.log(`KB: ${kb.id} @ ${kb.path}`)

const cards = await listCards(kb)
console.log(`\n=== cards: ${cards.length} ===`)
for (const card of cards) {
  console.log(`  [${card.type}] ${card.slug} | related: ${card.related.join(', ') || '-'} | sources: ${card.sources.join(', ')}`)
}

const sources = await listSources(kb)
console.log('\n=== sources ===')
for (const source of sources) {
  console.log(`  ${source.status} ${source.relPath} pages=[${source.pages.join(', ')}]`)
}

console.log('\n=== index.md ===')
console.log(await readFile(`${kb.path}/wiki/index.md`, 'utf8'))

console.log('=== overview.md ===')
console.log(await readFile(`${kb.path}/wiki/overview.md`, 'utf8'))

const issues = await lintKb(kb)
console.log(`\n=== lint: ${issues.filter((i) => i.severity === 'error').length} errors / ${issues.filter((i) => i.severity === 'warn').length} warns ===`)
for (const issue of issues) console.log(`  [${issue.severity}] ${issue.kind} ${issue.path ?? ''}: ${issue.message}`)
