/**
 * Demo: what an agent receives when it references a knowledge card.
 * Runs the same compiled tool code the host registers for agent sessions.
 */
import { wikiSearchTool, wikiReadTool } from '../lib/host/tools.js'

const search = await wikiSearchTool().execute({ query: '分摊异常', kb: 'finance-km' })
console.log('===== wiki_search("分摊异常") → 卡片摘要 =====')
for (const card of search.cards) {
  console.log(`[${card.type}] ${card.slug} (score ${card.score})`)
  console.log(`   ${card.description}`)
}

const read = await wikiReadTool().execute({ slug: '分摊异常监测', kb: 'finance-km' })
console.log('\n===== wiki_read("分摊异常监测") → 卡片全文（进上下文的就是这段） =====')
console.log(read.card.raw)
