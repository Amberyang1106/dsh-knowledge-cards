# Changelog

本插件的版本发布记录。安装/升级方式见 [README](README.md#安装)。

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
