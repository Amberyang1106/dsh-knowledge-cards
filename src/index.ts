/**
 * @amberyang1106/dsh-knowledge-cards — host half: the /api/dsh-knowledge/*
 * routes (KB config, card list/search/detail, source status, commit, lint),
 * the agent tools (wiki_kbs / wiki_search / wiki_read / wiki_ingest /
 * wiki_commit / wiki_lint) that let ANY project session pull domain
 * knowledge in as context, and a system-prompt announcement. The browser
 * half (exports "./client") is served by client-modules from the same
 * package's dsh.client declaration.
 *
 * Architecture follows the Karpathy / llm_wiki three-layer pattern:
 * raw sources (immutable) → LLM-maintained wiki cards → schema/purpose.
 * The LLM work is done by the agent (two-step ingest: wiki_ingest to
 * analyze, wiki_commit to write); the plugin does deterministic
 * bookkeeping (frontmatter validation, index/log/overview rebuilds,
 * SHA256 incremental cache, lint).
 * @module @amberyang1106/dsh-knowledge-cards
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { registerKnowledgeRoutes } from './host/routes.ts'
import {
  wikiAuditTool, wikiCardDeleteTool, wikiCardPurgeTool, wikiCardRestoreTool, wikiCodeListTool, wikiCodeReadTool,
  wikiCommitTool, wikiCreateKbTool, wikiEditCardTool, wikiImportCardsTool, wikiIngestTool, wikiKbDeleteTool,
  wikiKbPurgeTool, wikiKbRestoreTool, wikiKbsTool, wikiLintTool, wikiLineageProposeTool, wikiReadTool,
  wikiReviewSubmitTool, wikiReviewsTool, wikiSearchTool, wikiTrashListTool,
} from './host/tools.ts'

/** Required services: the route registry, the tool registry, and the prompt band. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 240

/** Model-facing announcement: plugin presence, tools, and cooperation rules. */
export const KNOWLEDGE_CARDS_GUIDANCE =
  '本机已安装 dsh-knowledge-cards 插件（知识卡片，基于 Karpathy / llm_wiki 三层架构）：侧边栏「知识卡片」入口，中央列展示知识库面板（卡片墙 / 资料 / 代码 / 看板 / 审核 / 知识库管理）；宿主经 /api/dsh-knowledge/* 路由读写本地知识库（配置与缓存默认在 ~/.dsh/knowledge-cards）。' +
  '能力：wiki_kbs 列出知识库；wiki_create_kb 新建知识库；wiki_search 检索相关卡片摘要；wiki_read 读取卡片全文（frontmatter + Markdown 正文 + [[wikilink]]）；wiki_edit_card 手动编辑卡片（替换语义、记 edit 日志、面板「看板」可见）；wiki_ingest 摄入资料（两步法第一步：返回资料全文与 schema/purpose/索引上下文，供分析；分析发现矛盾/疑似重复/缺失页面/值得深挖的点时，用 wiki_review_submit 提交审核项）；wiki_commit 写入 agent 生成的卡片（自动校验 frontmatter、维护 index.md / log.md / overview.md、SHA256 增量缓存）；wiki_import_cards 批量导入已切好的卡片（纯确定性，不耗 LLM）；wiki_lint 健康检查（断链/孤立页/缺摘要）；wiki_audit 主动审核现有知识库（确定性扫描：重复卡片/断链缺失页自动入审核队列 + 返回深度审核指令供 agent 做语义级审核）；wiki_review_submit / wiki_reviews 提交与查看审核队列（llm_wiki 异步人机协作：预定义操作 + 预生成搜索查询，用户稍后在面板「审核」tab 处理，不阻塞摄入）；wiki_code_list / wiki_code_read 列出与读取知识库 code/ 目录下的代码文件（用户上传，原样保存、不经 LLM 处理，项目需要参考脚本/SQL/配置时用）。' +
  '删除与回收站：用户可在面板「卡片」标签直接手写创建卡片（新建卡片按钮）；wiki_card_delete / wiki_kb_delete 是软删除——卡片移入 <kb>/.trash/cards/、知识库（含其审核队列）移入 ~/.dsh/knowledge-cards/.trash/kbs/，删除即刻从搜索/lint/索引消失，但可用 wiki_card_restore / wiki_kb_restore 或面板「回收站」标签恢复；wiki_trash_list 查看回收站；wiki_card_purge / wiki_kb_purge 才是物理删除（不可恢复），仅在用户明确要求永久删除时使用。' +
  '字段卡与血缘：type=field 的卡片表示「业务语义字段」（一张卡 = 一个字段，其各系统物理实现写在卡内），结构化元数据在 frontmatter（field_kind / data_type / aggregation / unit / source_table / source_field / aliases / status / review_status / evidence_level / domain / workstream …），血缘在 depends_on / used_by / implemented_in / governed_by（面板对 field 卡提供 5 分区结构化表单）。用户要求「补全/维护字段血缘」时：先 wiki_search + wiki_read 读相关字段卡（含正文 SQL 与口径）→ 给出候选边（from / to / 关系 / 证据 / 置信度）→ 用 wiki_edit_card 的 relations 参数（按 key 替换）写入、metadata 参数补元数据；AI 推断出的内容必须显式标注 metadata.review_status=inferred 与 evidence_level=inferred（严禁伪造 confirmed），需人工判断的点用 wiki_review_submit 入审核队列；写完用 wiki_lint 校验血缘（悬空 depends_on / 不对称 used_by / 自环与环）。' +
  '协作方式：做任何项目（包括分摊监测、GAAP 对账等财务任务）需要领域知识时，先 wiki_search 查相关卡片，再 wiki_read 把命中卡片全文作为上下文；需要参考沉淀的代码时用 wiki_code_list / wiki_code_read；有新资料要沉淀时，把资料放进知识库 raw/sources/ 后用 wiki_ingest → wiki_commit 两步摄入（发现需要人工判断的点先 wiki_review_submit 提交审核，不擅自下结论）；定期 wiki_lint 保持知识库健康。卡片库是人类策展、agent 维护——原始资料与代码永远只读。' +
  '用户提到「知识卡片 / 知识库 / wiki / KM / 参考知识」时即指本插件，请据此协作。'

/**
 * Mount the knowledge-card routes, agent tools, and prompt section.
 * @param ctx - context carrying webServer, tools, systemPrompt.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => registerKnowledgeRoutes(ctx), 'dsh-knowledge-cards: /api/dsh-knowledge routes')
  ctx.effect(() => {
    const disposers = [
      wikiKbsTool(),
      wikiSearchTool(),
      wikiReadTool(),
      wikiIngestTool(),
      wikiCommitTool(),
      wikiLintTool(),
      wikiCreateKbTool(),
      wikiImportCardsTool(),
      wikiCodeListTool(),
      wikiCodeReadTool(),
      wikiEditCardTool(),
      wikiReviewSubmitTool(),
      wikiReviewsTool(),
      wikiAuditTool(),
      wikiCardDeleteTool(),
      wikiCardRestoreTool(),
      wikiCardPurgeTool(),
      wikiKbDeleteTool(),
      wikiKbRestoreTool(),
      wikiKbPurgeTool(),
      wikiTrashListTool(),
      wikiLineageProposeTool(),
    ].map((tool) => ctx.tools.register(tool))
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-knowledge-cards: wiki_* tools')
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:knowledge-cards',
    order: SECTION_ORDER,
    text: KNOWLEDGE_CARDS_GUIDANCE,
  }), 'dsh-knowledge-cards: prompt section')
}
