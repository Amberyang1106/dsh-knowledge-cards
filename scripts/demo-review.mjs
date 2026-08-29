/**
 * Demo: seed realistic review items into the real finance-km KB exactly the
 * way an agent would during ingest (wiki_review_submit), then show what the
 * 审核 tab / wiki_reviews tool will display.
 */
import { wikiReviewSubmitTool, wikiReviewsTool } from '../lib/host/tools.js'
import { listReviews } from '../lib/host/store.js'

const submit = wikiReviewSubmitTool()
const list = wikiReviewsTool()

// 场景 A：摄入的新资料与现有卡片「分摊动因」矛盾
const a = await submit.execute({
  kb: 'finance-km',
  kind: 'contradiction',
  title: '分摊动因取值口径',
  summary: '新摄入资料《分摊规则修订草案》称动因应使用本期实际值；现有卡片「分摊动因」记录为「使用上月实际值」——两处口径矛盾，需确认哪版生效。',
  source: 'allocation-policy-revision-draft.md',
  searchQuery: '成本分摊 动因 本期实际值 vs 上月实际值 会计准则 口径变更',
})

// 场景 B：卡片正文提到「两步分摊」但缺专门页面
const b = await submit.execute({
  kb: 'finance-km',
  kind: 'missing-page',
  title: '两步分摊（公共成本）',
  summary: '卡片「成本分摊」提到公共成本经「先 CC 后 PC」两步分摊，但知识库没有专门页面说明该流程与例外；新资料也反复出现该概念，建议建页沉淀。',
  source: 'allocation-policy-revision-draft.md',
  searchQuery: '公共成本 两步分摊 成本中心 利润中心 流程',
})

console.log(`[seed] 审核项 A=${a.item.id} (contradiction) · B=${b.item.id} (missing-page)`)

const out = await list.execute({ kb: 'finance-km' })
console.log('\n===== wiki_reviews 返回（agent 视角） =====')
for (const item of out.items) {
  console.log(`[${item.status}] ${item.id} ${item.kind} | ${item.title}`)
  console.log(`    ${item.summary}`)
  console.log(`    操作: ${item.options.join(' / ')}`)
  if (item.searchQuery !== undefined) console.log(`    搜索: ${item.searchQuery}`)
}
console.log(`\n队列: 共 ${out.items.length} 条（待处理 ${out.pending}）`)
