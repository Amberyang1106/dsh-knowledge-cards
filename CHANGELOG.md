# Changelog

本插件的版本发布记录。安装/升级方式见 [README](README.md#安装)。

## v0.5.0（2026-09-22）— JEV（System One）血缘判定 + OpenRouter 线路 + 单轮 20 张卡

### ✨ 新功能 1：`② JEV 判断（一键）`——用「只输出结构化决策」的模型做字段血缘判定

- **背景**：Jev 不是聊天模型。它把一段 `state` 与一组**类型化问题**（`noul` 概率 / `choice` 枚举 / `score` 评分）对照后返回带置信度的结构化答案——**请求体是 `{model, state, questions}`，不是 `chat/completions`**，所以 chat SDK 用不了。
- **做法**：把血缘补齐拆成原子问题（每对有序卡片一个 `noul`：「A 是否**直接**依赖 B，而不是兄弟属性/仅提及/间接依赖」+ 每卡一个 `field_kind` 枚举判定与一个可加性判定），把答案映射回普通 `LineageProposal`（`source: 'jev'`、带 0–1 `score` 与 high/medium/low 置信度），因此**预览 → 勾选 → 应用仍走同一条确定性通道**，标 `inferred`、已 `confirmed` 不降级。
- **外发最小化**：只发元数据 + 去掉代码围栏/行内代码/长数字串的正文摘要（≤400 字符/卡）。
- **接口**：`POST /api/dsh-knowledge/lineage/jev`；未配置 key 时 503 + `jev-key-missing`（面板显示配置指引），API 报错时 502 并原样带出上游信息。

### ✨ 新功能 2：两条可互换线路（默认 OpenRouter）

- **默认 OpenRouter**：`POST https://openrouter.ai/api/v1/systemone`，模型 `typesafe/jev-1.13`，key 读 `OPENROUTER_API_KEY`。响应额外返回 `id` / `provider` / `usage.cost`，面板显示实际服务线路与请求体量。
- **直连兜底**：仅当未设置 `OPENROUTER_API_KEY` 时走 `POST https://api.typesafe.ai/v1/systemone`（模型 `jev-latest`，key 读 `TYPESAFE_API_KEY`）——已有 TypeSafe 直连配置的用户**无需改动**。
- `JEV_MODEL` / `JEV_ENDPOINT` 可覆盖模型与端点；响应里的 `model` 会回带版本化 id（如 `typesafe/jev-1.13-20260917`），因此按原样展示、不做相等断言。
- 价格两线路一致：$0.042/M 输入、输出免费。

### 🐛 修复：单轮 20 张字段卡的承诺此前不成立

- **问题**：问题的 `instructions` 把每对卡片的正文摘要都内联了一份，于是请求体随卡片数**平方增长**，实测（ISG 真实卡片内容）：7 张卡 62k 字符，10 张已到 32k 上下文边缘，12 张起超出，20 张达 508k 字符（约 127k tokens，超限 4 倍）——标签写着「上限 20 张」，实际约 10 张就发不出去。
- **两处修复**：① 卡片内容只在 `state.cards` 出现一次，问题改为**仅按 slug 引用**（同一批卡片体量降约 43%）；② 一轮按**每批 60 个问题**拆成多次请求，答案合并、`usage` 累加。
- **实测结果**（真实代码路径 + 真实卡内容，20 张卡）：420 个问题 → **7 批请求**，最大单批 40,667 字符（≈10–14k tokens），稳在 32k 之内，输入成本约 $0.004。另加**每批请求体预算硬闸**（96k 字符，按保守 ≤3 字符/token 折算 32k），超限显式报错而非静默截断。
- 测试 54/54（新增 3 个：JSON 去重保证、线路解析优先级、分批与 usage 合并）。

> ⚠️ **验证状态**：JEV 的**真实 API 调用尚未执行过**（本机无 key），`fetch` 路径由桩测试覆盖；线路连通性仅实证到「不带 key POST OpenRouter SystemOne 返回 401 而非 404」（路由存在）。模型输出质量、真实 `input_tokens` 与阈值（0.8 自动选 / 0.5–0.8 预选）需一次真实运行校准。

---

## v0.4.2（2026-09-21）— AI 分析改为「会话内执行」（一键复制指令）

- **背景**：宿主 `subagents.startContinuable` 要求 `parent: Agent`（只能由 agent 轮次内发起），而面板按钮走 HTTP 路由、拿不到 Agent；强行注入「某个会话」还可能跑错会话。上一版的宿主 spawn 路径因此在点击时报 `Cannot read properties of undefined (reading 'id')`。
- **新行为**：点「② AI 分析（会话内）」→ 宿主生成血缘分析指令并返回面板 → 面板**一键复制**并提示粘贴到当前会话 → agent 用 `wiki_lineage_propose` 提交提案（依旧不改卡）→ 面板保持轮询，提案自动并入预览，再勾选「应用选中」确定性写入。
- `GET /lineage/llm-status` 改为报告 `promptMode: true` 与 `spawnAvailable`（仅信息用途，不再显示误导性的「AI 可用」）；`POST /lineage/run` 恒 200 返回 `{ mode: 'prompt', prompt, requestedAt }`。
- 测试 46/46：run 端点断言改为「返回 prompt 且包含 wiki_lineage_propose 与目标 KB id」，llm-status 断言 promptMode。

---
## v0.4.1（2026-09-21）— 修复：AI 分析报 cannot get property "subagents" without inject
- **原因**：cordis 禁止用 `ctx.<服务名>` 访问未在 `inject` 中声明的服务，此前的「防御性访问」写法触发了它的代理守卫，导致点击「② AI 分析」直接报错、整个请求 500。
- **修复**：改用官方反射 API `ctx.reflect.get('subagents', false)`——服务未提供时返回 `undefined` 而不抛错；**刻意不把 `subagents` 加入 `inject`**，否则缺少该服务的 profile 会导致整个插件无法加载。
- **行为**：`GET /lineage/llm-status` 现在总是 200（`subagentsAvailable: true/false`）；`POST /lineage/run` 在不可用时返回 503 + `llm-unavailable`，面板显示友好提示并回退确定性预扫。
- **测试**：46/46（新增断言：无 subagents 时探测不崩 + run 返回 503）。

---

## v0.4.0（2026-09-21）— field 字段卡 + 一键血缘补齐

### 与 v0.3.0 的主要差异

v0.3.0 让「规则」可被外部程序读取执行；v0.4.0 面向**财务报表字段的语义资产化**：新增 `field` 卡片类型，把「一个业务语义字段在各系统的定义/计算/实现/血缘/治理」收进一张卡，并提供**面板一键血缘补齐**。

### ✨ 新功能 1：`field` 字段卡（一张卡 = 一个业务语义字段）

- **不是数据库列**：`Revenue` 这类字段在 BPC / Databricks / Genie / Power BI 的实现差异写在卡内，避免按物理列建出多张重复卡。
- **结构化元数据进 frontmatter**：`field_id` / `canonical_name` / `aliases` / `field_kind` / `data_type` / `aggregation` / `unit` / `status` / `review_status` / `evidence_level` / `domain` / `workstream` / `subject_area` / `source_table` / `source_field` / `business_owner` / `effective_from` / `last_reviewed`；血缘在 `depends_on` / `used_by` / `implemented_in` / `governed_by`。
- **5 分区结构化表单（仅 field）**：① Overview（身份与定义）② Logic（口径与逻辑）③ Implementation（物理实现）④ Lineage & Impact（血缘与相关阅读）⑤ Governance（治理与证据）；①② 默认展开，其余按需展开。其他类型不受影响（rules 仍用整卡 YAML 编辑器，其余仍是简单表单）。
- **卡片详情新增 🧬 血缘区**：依赖 / 被使用 / 实现于 / 受约束四行；能对上卡片的目标可点击跳转，物理表/报表等外部目标显示为灰色胶囊（不再与「关联」混淆）。表单同时补齐 `related`（相关阅读）输入——此前手工建卡无法写入该键。

### ✨ 新功能 2：血缘读写与体检

- `wiki_edit_card` 新增 `relations`（depends_on / used_by / implemented_in / governed_by，按 key 替换）与 `metadata`（字段元数据）参数，走结构化通道写入：保留其他键、自动记日志、重建索引。**溯源纪律**：AI 推断内容必须标 `review_status` / `evidence_level` = `inferred`，严禁伪造 `confirmed`。
- `wiki_lint` 新增**血缘检查**：悬空 `depends_on`、单向不对称（A depends_on B 但 B 缺 used_by A）、自指、环；关系指向的卡片同时计入入链，字段卡不再被误报孤立。

### ✨ 新功能 3：面板「🧬 血缘补齐」按钮

- **① 确定性预扫**（零成本、不改卡）：从卡内正文/元数据挖候选边（引用 + 推导关键词匹配，自动补反向边），并体检元数据缺口（source_table 填了 PBI 这类消费端、dimension 却标 additive、field_id 残缺、缺 evidence_level）。
- **② AI 分析**（可选）：宿主经 `ctx.subagents` 发起一次 agent 运行读全库字段卡，agent 用新工具 `wiki_lineage_propose` 把带证据与置信度的提案写入待审文件（**不直接改卡**）；面板轮询自动并入预览。宿主无 subagents 服务时优雅降级并提示。
- **③ 应用选中**：确定性写入——关系取并集、元数据设/清、统一标 `inferred`、已 `confirmed` 的卡不降级、每卡记看板明细。
- 新增 5 条路由：`lineage/scan`、`lineage/llm-status`、`lineage/run`、`lineage/proposals`、`lineage/apply`；新增工具 `wiki_lineage_propose`。

### 🔧 其它

- 路由 26 → **31**；agent 工具 21 → **22**；测试 40 → **46**（新增字段卡结构化表单路径、血缘 lint、血缘按钮端到端用例）
- 实机验证（ISG Service 库）：确定性预扫复现出人工推导的边（opportunity-name/number → depends_on opportunity-ID + 反向 used_by，以及 aggregation / evidence_level 元数据缺口），且**不编造**无证据的关系（Sales-Doc-Number 未生成边）

### ⚠️ 已知限制

- 「② AI 分析」依赖宿主 `subagents` 服务，作者环境尚未实机跑通 provider 解析（面板会显示探测结果，不可用时自动降级为预扫）。
- 血缘目前是结构化数据 + 面板预览/体检，**尚无**「给一个字段 → 返回受影响字段/报表」的图查询接口与可视化。

### 安装 / 升级

```sh
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.4.0
```

重启 `dsh web` 生效；知识库数据不受影响。

---

## v0.3.0（2026-09-03）— 规则卡（type=rules）+ 嵌套 YAML frontmatter + 规则集接口

### 与 v0.2.0 的主要差异

v0.3.0 为「知识驱动的可执行校验规则」铺路：知识卡片从「人/agent 阅读的知识库」扩展为**可被对账管道（如 ROW PSD Recon）运行时读取执行的声明式规则库**——规则不写死在 SQL/Python，而是作为卡片维护，版本可追溯。

### ✨ 新功能 1：`rules` 卡片类型

- 新增页面类型 **`rules`**（存放于 `wiki/rules/`，新库自动播种目录与 schema 行，旧库首次写入自动建目录）
- 面板「+ 新建卡片」选择 `rules` → 自动载入**模板化 YAML 编辑器**，整卡 frontmatter 即规则定义；卡片详情「编辑」对 rules 卡走**整卡 YAML 全量替换**（type 不可改、created 保留、看板记「规则配置已更新」）
- 规则生命周期：`draft → review → active → deprecated`；仅 `active` 且生效期内（effective_from/to）的规则参与运行

### ✨ 新功能 2：嵌套 YAML frontmatter（frontmatter.ts 结构化子集）

- 解析/序列化从「扁平标量」扩展为结构化子集：**flow map** `{k: v, …}`、**缩进块 map/列表**、**对象数组**（如 `conditions` / `outcome` / `test_cases`），规范序列化可无损回环
- 纯增量扩展：平铺卡片（既有格式）不触发新分支、行为不变；宽容解析保留（```yaml 围栏 / CRLF / 缺失开栏自动修复）；嵌套 null/undefined 值安全跳过
- 新增 9 项单测（嵌套回环 / 宽容手写 YAML / flow 解析 / managed 键判定 / 兼容性）

### ✨ 新功能 3：规则集编译接口 `GET /api/dsh-knowledge/rules`

- 按 `?kb&ruleSet&status`（status 默认 active）批量编译：定位规则卡 → 解析 frontmatter → **结构校验**（必填 rule_id/rule_set/conditions/outcome.category、状态机、操作符白名单 `eq/ne/gt/ge/lt/le/in/not_in/is_blank/is_not_blank/contains`）→ 过滤非 active 与非生效期 → 生成内容版本 `sha256:xxxxxxxx` 哈希
- 返回 `{kb, ruleSet, version, hash, generatedAt, statusFilter, rules[], invalidRules[]}`——**坏规则显式报告**（invalidRules 带 issue 明细），绝不静默转「未命中」
- 事实注册表由消费方（对账程序）持有：新场景若只用已有事实字段与操作符，仅需维护知识卡，无需改动消费方代码

### 🔧 写路径与其它

- `commitPages` / 批量导入支持额外 frontmatter 键透传（托管键 type/title/description/tags/related/sources/created/updated 恒优先）
- `/card/create` 与 `/card/edit` 接受整卡 `frontmatterYaml`（服务端解析，前端零 YAML 依赖）；`createCard` 按 slug 回读（含空格/斜杠标题可用）
- schema 播种模板新增 rules 类型说明行
- 路由 25 → 26；测试 30 → 40（+frontmatter 9 + 规则卡全流程用例）+ smoke ALL PASS
- 随库示例：`row-psd` 知识库已播种 6 张 B3/B4 无 WBS 诊断规则卡（001~004 active / 005~006 draft，compile 验证 4 active 无 invalid）

### 安装 / 升级

```sh
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.3.0
```

重启 `dsh web` 生效；知识库数据不受影响。

---

## v0.2.0（2026-08-30）— 手动建卡 + 删除/回收站

### 与 v0.1.0 的主要差异

v0.1.0 是首个独立发布版本（从 dsh-web-ui monorepo 抽离为独立仓库、经 GitHub 单命令分发）。v0.2.0 在此之上新增两大能力：

### ✨ 新功能 1：在面板直接手写创建卡片

此前卡片只能由 agent 经 `wiki_commit` 生成，或 `wiki_import_cards` 批量导入；现在面板即可创建：

- 卡片 tab 新增 **「+ 新建卡片」** 按钮：直接在界面上填写 **类型**（entity / concept / source / query / comparison / synthesis）、**标题**、**摘要**、**标签**、**关联 slug**、**来源文件名**、**正文**（Markdown + `[[wikilink]]` 互链，正文可留空）即可创建
- 新路由 `POST /api/dsh-knowledge/card/create`（与 agent 的 `/commit` 区分，正文可空、可带 sources/related；看板日志记 `create` 动作）
- 创建的卡片自动走确定性管线：frontmatter 校验、`index.md` / `log.md` / `overview.md` 重建、进入卡片墙与搜索

### 🗑 新功能 2：删除 + 回收站（软删除）

此前卡片与知识库均无删除接口；现在删除是**可恢复的软删除**：

- **卡片删除**：卡片详情页新增「🗑 删除」→ 卡片文件移入 `<kb>/.trash/cards/<type>/`（保留类型目录），即刻从搜索 / lint / 索引消失
- **知识库删除**：知识库管理 tab 每行新增「🗑 删除」→ 整个目录（含 raw / wiki / code **及其审核队列** `reviews/<id>.json`）移入 `~/.dsh/knowledge-cards/.trash/kbs/<id>/`（带 `trash-meta.json` 记录原路径与删除时间），从知识库列表移除
- **新「回收站」tab**（面板第 7 个）：列出已删除的卡片与知识库（类型 / 原路径 / 删除时间），逐项 **「恢复」** 或 **「彻底删除」**（purge 需二次确认，物理删除不可恢复）
- 新路由：`card/delete` · `card/restore` · `card/purge` · `kbs/delete` · `kbs/restore` · `kbs/purge` · `trash`（列表），全部 loopback 守卫

### 🧰 新增 7 个 agent 工具（14 → 21）

- `wiki_card_delete` / `wiki_card_restore` / `wiki_card_purge`
- `wiki_kb_delete` / `wiki_kb_restore` / `wiki_kb_purge`
- `wiki_trash_list`

**语义约定**：`delete` 均为软删除入回收站（可恢复）；`purge` 才是物理删除，仅在用户明确要求永久删除时使用。

### 🔧 其他改进

- 系统提示词（`KNOWLEDGE_CARDS_GUIDANCE`）增补删除 / 回收站协作规则
- 看板（log）新增 `create` / `delete` / `restore` / `purge` 动作
- 健壮性：跨盘（EXDEV/EPERM）复制回退、恢复冲突检测（slug / id 已被占用时报错、不覆盖）、聚合文件（index/log/overview）天然不可删除
- 测试 28 → 30（新增手动建卡 + 回收站全流程 HTTP 用例）；路由 17 → 25；工具 14 → 21
- README：功能（7 tab / 25 路由 / 21 工具）、Roadmap（「删除 / 归档」项已实现移除）、安装示例 tag 更新

### 安装 / 升级

```sh
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.2.0
```

重启 `dsh web` 生效；知识库数据（`~/.dsh/knowledge-cards/`）与安装方式无关，不受影响。

---

## v0.1.0（2026-08-30）— 首个独立发布

- 从 dsh-web-ui monorepo 抽离为独立仓库（包名 `@amberyang1106/dsh-knowledge-cards`），经 GitHub 私有仓库 + `dsh plugin` 单命令分发，不再依赖 linxin666 发布通道
- 自带 `shared/` 构建预设与提交进仓库的 `lib/` 产物（git 分发不装 devDependencies）
- 完整 README（目的与背景 / 功能 / 安装 / 首次使用 / 更新 / 日常开发与维护 / Roadmap / FAQ）
- 功能基线：6 tab 面板（卡片墙 / 资料 / 代码 / 看板 / 审核 / 知识库管理）、17 条 `/api/dsh-knowledge/*` 路由、14 个 `wiki_*` agent 工具、SHA256 增量摄入缓存、lint / audit / 审核队列
