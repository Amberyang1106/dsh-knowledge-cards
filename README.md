# @amberyang1106/dsh-knowledge-cards

DSH Web GUI 的 **知识卡片** 侧边栏插件：侧边栏新增「知识卡片」入口，中央列展示知识库面板（卡片墙 / 资料 / 代码 / 看板 / 审核 / 知识库管理 / 回收站），宿主经 `/api/dsh-knowledge/*` 路由读写本地知识库，并提供 22 个 `wiki_*` agent 工具，让任意项目会话把领域知识作为上下文拉进来。支持 **`rules` 规则卡**（供 ROW PSD Recon 等对账管道读取执行）、**`field` 字段卡**（业务语义字段：定义/计算/实现/血缘/治理，配 5 分区结构化表单与一键血缘补齐）。

基于 [Karpathy 的 LLM Wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 与 [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) 的实现范式：**原始资料（只读）→ LLM 维护的知识卡片 → schema/purpose 规则**。

自包含分发：独立 git仓库，经 `dsh plugin` 单命令安装。

## 目的与背景

做任何项目（尤其是分摊监测、GAAP 对账这类财务任务）都需要领域知识，但知识散落在各处：对话历史、Excel、PDF、个人笔记——每次都要重新查找、重新解释，且无法跨会话复用。

本插件把「知识库」做成 DSH 的一等公民：

- **三层架构**：`raw/sources/` 原始资料（只读、不可变）→ LLM 维护的 wiki 卡片（`entities/ concepts/ sources/ queries/ synthesis/ comparisons/`）→ `schema.md` / `purpose.md` 规则层。LLM 负责理解与提炼，插件负责确定性的簿记（frontmatter 校验、`index.md` / `log.md` / `overview.md` 自动重建、SHA256 增量缓存、lint）。
- **跨会话复用**：任何项目会话都能 `wiki_search` → `wiki_read` 拉取领域知识，不必重复解释背景。
- **人机协作**：卡片库是人类策展、agent 维护——原始资料与代码永远只读；摄入遵循两步法（`wiki_ingest` 分析 → `wiki_commit` 写入），发现矛盾/疑似重复/缺失页面用 `wiki_review_submit` 提交审核项，由用户在面板「审核」tab 处理，不阻塞摄入。

## 功能

- **面板 7 个 tab**：
  - 卡片墙：按类型分组浏览 / 搜索 / 详情（frontmatter + Markdown + `[[wikilink]]` 交叉引用）,同时可以点击右上角进行知识库的切换；**「+ 新建卡片」直接手写创建卡片**（type/title/摘要/标签/关联/来源/正文全字段，无需走 agent）
    <img width="2964" height="774" alt="image" src="https://github.com/user-attachments/assets/5219cb90-ba66-413a-a139-543824891faa" />
    <img width="1958" height="1464" alt="image" src="https://github.com/user-attachments/assets/a3e47071-de13-4f26-8410-8032bc78d9e8" />


  - 资料：`raw/sources/` 资料源状态（SHA256 增量缓存），一键把待摄入清单交给 agent
    <img width="2974" height="768" alt="image" src="https://github.com/user-attachments/assets/52a3cc26-b250-4a45-9859-92d7fff73a07" />

  - 代码：`code/` 目录代码文件浏览 / 上传 / 读取 / 删除（原样保存，不经 LLM）
    <img width="2954" height="720" alt="image" src="https://github.com/user-attachments/assets/e9385757-f37a-402a-8d74-a063a3b8cc52" />

  - 看板：`log.md` 时序操作记录（摄入 / 提交 / 编辑 / 创建 / 删除 / 恢复）
    <img width="2944" height="690" alt="image" src="https://github.com/user-attachments/assets/5a6e6231-7041-450a-b235-34898b12deff" />

  - 审核：llm_wiki 异步人机协作队列（矛盾 / 重复 / 缺页 / 建议，含预定义操作与预生成搜索查询）
    <img width="2970" height="680" alt="image" src="https://github.com/user-attachments/assets/185f0573-487c-476e-b25e-4d135b3436e9" />

  - 知识库管理：多知识库创建 / 切换 / **删除**（软删除入回收站）
    <img width="2954" height="1128" alt="image" src="https://github.com/user-attachments/assets/cf2220d0-dcd9-417c-be32-1bdb38839862" />

  - 回收站：已删除的卡片与知识库，逐项**恢复**或**彻底删除**（删除是软删除——卡片在 `<kb>/.trash/`、知识库在 `~/.dsh/knowledge-cards/.trash/`，可随时恢复；彻底删除才物理清除）
    <img width="1990" height="454" alt="image" src="https://github.com/user-attachments/assets/0976e3fe-47ad-48aa-bb40-fe4ba40cd391" />

- **宿主 `/api/dsh-knowledge/*` 路由（31 条）**：kbs（列表/创建）、cards（列表/搜索）、card（详情，附解析后的 frontmatter）、commit、card/edit、**card/create（手动建卡）**、**card/delete · card/restore · card/purge（卡片回收站）**、**kbs/delete · kbs/restore · kbs/purge（知识库回收站）**、**trash**、**rules（规则集编译）**、**lineage/scan · lineage/llm-status · lineage/run · lineage/proposals · lineage/apply（血缘补齐）**、log、sources、lint、import-cards、rebuild、code（列表/上传）、code/content、code/delete、reviews、reviews/resolve、audit、audit-prompt
- **规则卡（type=rules）+ 规则集接口**：面板「+ 新建卡片」选 `rules` 类型可直接编写规则卡（type/title/rule_id/rule_set/status/conditions/outcome/test_cases 整卡 frontmatter 为**嵌套 YAML**，建卡与编辑提供模板化 YAML 编辑器）；生命周期 `draft → review → active → deprecated`。`GET /api/dsh-knowledge/rules?kb&ruleSet&status` 批量编译 active（且生效期内）规则：结构校验（必填字段 / 状态机 / 操作符白名单 eq/ne/gt/ge/lt/le/in/not_in/is_blank/is_not_blank/contains）、过滤非 active、生成内容版本 `sha256:` 哈希，返回 `{ruleSet, version, hash, rules[], invalidRules[]}`——坏规则显式报告、不静默丢。规则供 ROW PSD Recon 等对账程序运行时读取执行；新增/停用场景只需维护卡片，无需改消费方代码。
- **字段卡（type=field）+ 一键血缘补齐**：一张卡 = 一个**业务语义字段**（如 Revenue），其各系统物理实现写在卡内；结构化元数据（field_kind / data_type / aggregation / unit / source_table / source_field / aliases / status / review_status / evidence_level / domain / workstream …）进 frontmatter，正文写业务定义、计算逻辑、口径、血缘与校验。面板对 field 卡提供 **5 分区结构化表单**（① Overview ② Logic ③ Implementation ④ Lineage & Impact ⑤ Governance），卡片详情显示 **🧬 血缘** 区（依赖/被使用/实现于/受约束，能对上卡片的目标可点击跳转，物理表/报表等外部目标显示为灰色胶囊）。卡片 tab 的 **「🧬 血缘补齐」按钮**：① 确定性预扫（零成本、不改卡，从正文与元数据挖候选边 + 补反向 used_by + 体检元数据缺口）→ ② 可选 AI 分析（发起一次 agent 运行读全库字段卡，把带证据与置信度的提案写入待审文件）→ ③ 预览勾选后「应用选中」（确定性写入：关系取并集、统一标 `inferred`、已 confirmed 的卡不降级、每卡记看板明细）。配套 `wiki_lint` 血缘体检：悬空 depends_on / 单向不对称 / 自指 / 环。
- **22 个 agent 工具**（任意项目会话可用，跨项目上下文注入）：`wiki_kbs` / `wiki_create_kb` / `wiki_search` / `wiki_read` / `wiki_edit_card`（可写结构化 `relations` 与字段 `metadata`）/ `wiki_ingest` / `wiki_commit` / `wiki_import_cards` / `wiki_lint` / `wiki_audit` / `wiki_review_submit` / `wiki_reviews` / `wiki_code_list` / `wiki_code_read` / **`wiki_card_delete` / `wiki_card_restore` / `wiki_card_purge`** / **`wiki_kb_delete` / `wiki_kb_restore` / `wiki_kb_purge`** / **`wiki_trash_list`** / **`wiki_lineage_propose`**（提交血缘提案，不直接改卡）

## 知识库布局（每库）

```
<path>/
├── purpose.md              # 为什么存在、关键问题
├── schema.md               # 页面类型与约定
├── raw/sources/            # 原始资料（不可变）
└── wiki/
    ├── index.md            # 内容目录（自动维护）
    ├── log.md              # 时序操作记录（自动维护）
    ├── overview.md         # 全局概要（自动维护）
    ├── entities/ concepts/ sources/ queries/ synthesis/ comparisons/
```

配置与缓存默认在 `~/.dsh/knowledge-cards/`（`kbs.json` / `cache.json`；环境变量 `DSH_KNOWLEDGE_CARDS_ROOT` / `DSH_KNOWLEDGE_CARDS_KB` 可覆盖）。

## 安装

前提：已安装 DSH（`dsh web`）。

> ⚠️ **仓库为私有**：安装前需先被授予该仓库的读权限（维护者将你加为 GitHub 协作者，或你已在组织的允许列表内）。首次安装时 git 会弹出 GitHub 登录，用你自己的账号登录即可；未授权时会报 `Authentication failed` / `could not read Username`。

```sh
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.4.1
```

> 安装命令中的 tag 请使用**最新发布版本**（见仓库 Tags 页），升级时把 `#v0.4.1` 换成新 tag。

重启 `dsh web`，侧边栏出现「知识卡片」。你的知识库数据在 `~/.dsh/knowledge-cards/`，安装/升级/卸载插件均不影响。

## 首次使用

1. 打开侧边栏「知识卡片」→「知识库管理」tab → 新建知识库（或使用默认库）。
2. 把原始资料放入该库的 `raw/sources/` 目录（插件不会主动扫描库外文件）。
3. 在对话中让 agent 摄入：`先 wiki_ingest 分析资料全文与知识库上下文，再 wiki_commit 生成卡片，完成后跑一次 wiki_lint`——或直接在面板「资料」tab 点「交给 agent 摄入」。
4. 日常做项目前，让 agent `wiki_search` 查相关卡片，命中后 `wiki_read` 读全文。

## 更新

维护者发布新 tag 后，更新 specifier 并重启：

```sh
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#<新tag>
```

重启 `dsh web` 即生效。你配置的知识库数据、卡片、原始资料**永不覆盖**。

## 日常开发与维护

> 本仓库是插件的**唯一开发源**（monorepo 里的旧副本视为冻结存档，不再同步）。日常开发用 **link: 模式**（改完 build 即生效），发布时打 tag 推送，想验证用户视角时临时切到 **github spec 模式**——两种模式切换都只是单条命令。

### 两种安装模式与切换命令

| 模式 | 命令 | 用途 |
|---|---|---|
| 开发模式（link:） | `dsh plugin --profile web add C:/Users/yangtt16/dsh-knowledge-cards` | 日常开发：改代码 → build → 重启即生效 |
| 发布验证模式（github spec） | `dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.4.1` | 验证用户视角的安装；与 README 安装命令一致 |
| 卸载 | `dsh plugin --profile web remove @amberyang1106/dsh-knowledge-cards` | 移除依赖与 bundles 条目 |

原理：`dsh plugin` 把参数转发给 profile 目录里的 pnpm，成功后自动 reconcile `dsh.profile.bundles`——同名包增删 spec 不会双重挂载。

### 日常开发循环（默认：link: 模式）

1. 确认 profile 指向独立仓库：`dsh plugin --profile web add C:/Users/yangtt16/dsh-knowledge-cards`（一次性；包名不变，bundles 条目无需改动）
2. 编辑 `src/` 下的 `client/` / `host/` / `core/`
3. `pnpm build`（`tsc -b && tsdown`，重新生成 `lib/`）——**每次改完源码必做**：link: 只链接目录，宿主加载的是构建产物 `lib/`
4. 重启 `dsh web` → 侧边栏「知识卡片」验证；host 半（路由/工具/提示词）改动必须重启，client 半改动稳妥起见也重启
5. 质量门：`pnpm typecheck` && `pnpm test`（4 个 vitest 测试文件、28 个用例）通过后再提交

### 发布更新循环（给用户发新版本）

1. 改 `package.json` 的 `version`（如 0.1.0 → 0.2.0，与 tag 对齐）
2. 更新 README（功能变化、Roadmap 里已完成项勾掉）
3. **同步本地 dsh-wiki 工作区 README**（`C:\Users\yangtt16\OneDrive - Lenovo\AI Test\Finance KM\dsh-wiki\README.md`）：功能特性 / 路由数 / 工具数 / 面板 tab / 测试数 / Changelog / 后续计划，与本仓库 README、CHANGELOG.md 保持口径一致
4. `pnpm build` 确保 `lib/` 同步 → `git add -A && git commit`
5. `git tag v0.4.1 && git push && git push --tags`
6. （可选）验证用户视角：`dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.4.1` → 重启验证 → 再切回 link: 开发
7. 更新 GitHub Release（`gh release create v0.4.1 --notes-file ...`），通知用户把安装命令的 tag 换成 `#v0.4.1` 重装

### 关键注意点

- **改完源码必须 `pnpm build` 再重启**——package 入口是 `lib/index.js` / `lib/client.js`，link: 只链接目录不编译。
- **`lib/` 是提交进仓库的**——每次发布 commit 必须包含重新构建后的 `lib/`，否则用户从 git 装到的是旧产物（git 分发不装 devDependencies、也不适用 npm `files` 白名单）。
- **同名包切换不会双重挂载**——`reconcilePlugins` 按包名协调 bundles，`@amberyang1106/dsh-knowledge-cards` 在 link: 与 github: 两种 spec 下是同一个名字。唯一要避免的是**旧名 `@linxin666/dsh-knowledge-cards` 还留在 bundles 里**（迁移时先 remove 旧包再加新的，顺序很重要）。
- **私有仓库 push 时** git 会弹一次 GitHub 登录（Windows 凭据管理器），日常 push 用你的账号即可；用户安装同样需要读权限。

## Roadmap（未完成 / 规划中）

以下能力当前**尚未实现**，供使用者了解功能边界：

- **审核队列的 agent 代为处理**：当前 `reviews/resolve` 仅面板「审核」tab 可用（预定义操作 + 预生成搜索查询），agent 只能 `wiki_review_submit` 提交、`wiki_reviews` 查看，不能直接 resolve / 跳过——规划中让 agent 能按用户指示代为处理审核项。
- **血缘图谱与 Impact Analysis 接口**：结构化血缘（depends_on / used_by / implemented_in / governed_by）与面板预览已就绪，但还缺「给一个字段 → 返回受影响字段/报表」的图查询接口与可视化；此外「🧬 血缘补齐」的 ② AI 分析分支（宿主 `subagents` 路径）在作者环境尚未实机验证 provider 解析，当前以确定性预扫为主。
- **资料源在线上传**：当前 `raw/sources/` 需手动放入文件（面板「代码」tab 已支持上传而「资料」tab 未支持）；规划中支持资料拖拽上传 + 自动入待摄入清单。
- **知识库导出 / 备份**：当前无导出接口（备份 = 直接拷贝 `~/.dsh/knowledge-cards/` 目录）；规划中提供 JSON / Markdown 导出与一键备份。
- **知识图谱 / 卡片关系可视化**：`[[wikilink]]` 交叉引用与结构化血缘数据已具备，但无可视化；规划中做卡片关系图谱。
- **定时自动 lint / 摄入提醒**：当前无调度能力；规划中支持周期性 `wiki_lint` 与待摄入资料提醒。
- **npm 分发**（可选路径）：当前经 GitHub 私有仓库分发（需读权限）；如使用者增多，可发布到 npm 实现零权限安装，规划中未实施。

「功能」章节所列能力均已实现；其余交互按本 README 描述工作。

## 环境变量

| 变量 | 含义 |
|---|---|
| `DSH_KNOWLEDGE_CARDS_ROOT` | 配置与缓存根目录（`kbs.json` / `cache.json`）；未设置时用 `~/.dsh/knowledge-cards` |
| `DSH_KNOWLEDGE_CARDS_KB` | 默认知识库 id；未设置时用第一个 |

## 安全说明

`/api/dsh-knowledge/*` 路由仅接受 loopback（127.0.0.1 / localhost / ::1）请求；知识库文件读写发生在本地用户目录，请勿将 dsh web 暴露到局域网/公网。

## 常见问题（FAQ）

- **安装报错 `Authentication failed` / `could not read Username`？** 仓库为私有：先确认你已被授予该仓库的读权限（见「安装」），首次安装时 git 会弹出 GitHub 登录，用你自己的账号登录。
- **安装报 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 或提示 blocked build？** 我们的包没有 `prepare` 脚本、无运行时依赖，正常不需要 allowBuilds；若 pnpm 仍提示，按提示把对应 key 加到 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 后重跑安装命令。
- **我的知识库数据会丢吗？** 不会——数据在 `~/.dsh/knowledge-cards/`，与插件包安装方式（link: / github spec）无关，安装、升级、卸载插件均不影响。
- **日常开发怎么改代码？** 见「日常开发与维护」：切到 link: 模式 → 改 `src/` → `pnpm build` → 重启 dsh web。
- **为什么我改完代码重启没变化？** 没有执行 `pnpm build`——宿主加载的是 `lib/` 构建产物，link: 只链接目录不编译。
- **agent 摄入时报错 / lint 出问题？** 用面板「看板」tab 查看操作日志，或直接让 agent 跑 `wiki_lint` 看健康检查明细（断链 / 孤立页 / 缺摘要）。

## 开发

```sh
pnpm install
pnpm build    # tsc -b && tsdown → lib/index.js（host 半）+ lib/client.js（browser 半）
pnpm test     # vitest：4 个测试文件、28 个用例
pnpm typecheck
pnpm watch    # tsdown --watch，client 半改动自动重建
```

`lib/` 构建产物必须提交进仓库（GitHub 分发不经 npm files 白名单，且 pnpm 从 git 安装不装 devDependencies）。`scripts/smoke.mjs` 是对 `lib/` 的端到端冒烟（`node scripts/smoke.mjs`）。

## License

Apache-2.0
