# @amberyang1106/dsh-knowledge-cards

DSH Web GUI 的 **知识卡片** 侧边栏插件：侧边栏新增「知识卡片」入口，中央列展示知识库面板（卡片墙 / 资料 / 代码 / 看板 / 审核 / 知识库管理），宿主经 `/api/dsh-knowledge/*` 路由读写本地知识库，并提供 14 个 `wiki_*` agent 工具，让任意项目会话把领域知识作为上下文拉进来。

基于 [Karpathy 的 LLM Wiki 方法论](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 与 [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) 的实现范式：**原始资料（只读）→ LLM 维护的知识卡片 → schema/purpose 规则**。

自包含分发：独立 git仓库，经 `dsh plugin` 单命令安装。

## 目的与背景

做任何项目（尤其是分摊监测、GAAP 对账这类财务任务）都需要领域知识，但知识散落在各处：对话历史、Excel、PDF、个人笔记——每次都要重新查找、重新解释，且无法跨会话复用。

本插件把「知识库」做成 DSH 的一等公民：

- **三层架构**：`raw/sources/` 原始资料（只读、不可变）→ LLM 维护的 wiki 卡片（`entities/ concepts/ sources/ queries/ synthesis/ comparisons/`）→ `schema.md` / `purpose.md` 规则层。LLM 负责理解与提炼，插件负责确定性的簿记（frontmatter 校验、`index.md` / `log.md` / `overview.md` 自动重建、SHA256 增量缓存、lint）。
- **跨会话复用**：任何项目会话都能 `wiki_search` → `wiki_read` 拉取领域知识，不必重复解释背景。
- **人机协作**：卡片库是人类策展、agent 维护——原始资料与代码永远只读；摄入遵循两步法（`wiki_ingest` 分析 → `wiki_commit` 写入），发现矛盾/疑似重复/缺失页面用 `wiki_review_submit` 提交审核项，由用户在面板「审核」tab 处理，不阻塞摄入。

## 功能

- **面板 6 个 tab**：
  - 卡片墙：按类型分组浏览 / 搜索 / 详情（frontmatter + Markdown + `[[wikilink]]` 交叉引用）,同时可以点击右上角进行知识库的切换
    <img width="2964" height="774" alt="image" src="https://github.com/user-attachments/assets/5219cb90-ba66-413a-a139-543824891faa" />

  - 资料：`raw/sources/` 资料源状态（SHA256 增量缓存），一键把待摄入清单交给 agent
    <img width="2974" height="768" alt="image" src="https://github.com/user-attachments/assets/52a3cc26-b250-4a45-9859-92d7fff73a07" />

  - 代码：`code/` 目录代码文件浏览 / 上传 / 读取 / 删除（原样保存，不经 LLM）
    <img width="2954" height="720" alt="image" src="https://github.com/user-attachments/assets/e9385757-f37a-402a-8d74-a063a3b8cc52" />

  - 看板：`log.md` 时序操作记录（摄入 / 提交 / 编辑 / 审核）
    <img width="2944" height="690" alt="image" src="https://github.com/user-attachments/assets/5a6e6231-7041-450a-b235-34898b12deff" />

  - 审核：llm_wiki 异步人机协作队列（矛盾 / 重复 / 缺页 / 建议，含预定义操作与预生成搜索查询）
    <img width="2970" height="680" alt="image" src="https://github.com/user-attachments/assets/185f0573-487c-476e-b25e-4d135b3436e9" />

  - 知识库管理：多知识库创建 / 切换
    <img width="2954" height="1128" alt="image" src="https://github.com/user-attachments/assets/cf2220d0-dcd9-417c-be32-1bdb38839862" />

- **宿主 `/api/dsh-knowledge/*` 路由**：kbs（列表/创建）、cards（列表/搜索）、card（详情）、commit、card/edit、log、sources、lint、import-cards、rebuild、code（列表/上传）、code/content、code/delete、reviews、reviews/resolve、audit、audit-prompt
- **14 个 agent 工具**（任意项目会话可用，跨项目上下文注入）：`wiki_kbs` / `wiki_create_kb` / `wiki_search` / `wiki_read` / `wiki_edit_card` / `wiki_ingest` / `wiki_commit` / `wiki_import_cards` / `wiki_lint` / `wiki_audit` / `wiki_review_submit` / `wiki_reviews` / `wiki_code_list` / `wiki_code_read`

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
dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.1.0
```

> 安装命令中的 tag 请使用**最新发布版本**（见仓库 Tags 页），升级时把 `#v0.1.0` 换成新 tag。

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
| 发布验证模式（github spec） | `dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.2.0` | 验证用户视角的安装；与 README 安装命令一致 |
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
3. `pnpm build` 确保 `lib/` 同步 → `git add -A && git commit`
4. `git tag v0.2.0 && git push && git push --tags`
5. （可选）验证用户视角：`dsh plugin --profile web add github:Amberyang1106/dsh-knowledge-cards#v0.2.0` → 重启验证 → 再切回 link: 开发
6. 通知用户把安装命令的 tag 换成 `#v0.2.0` 重装

### 关键注意点

- **改完源码必须 `pnpm build` 再重启**——package 入口是 `lib/index.js` / `lib/client.js`，link: 只链接目录不编译。
- **`lib/` 是提交进仓库的**——每次发布 commit 必须包含重新构建后的 `lib/`，否则用户从 git 装到的是旧产物（git 分发不装 devDependencies、也不适用 npm `files` 白名单）。
- **同名包切换不会双重挂载**——`reconcilePlugins` 按包名协调 bundles，`@amberyang1106/dsh-knowledge-cards` 在 link: 与 github: 两种 spec 下是同一个名字。唯一要避免的是**旧名 `@linxin666/dsh-knowledge-cards` 还留在 bundles 里**（迁移时先 remove 旧包再加新的，顺序很重要）。
- **私有仓库 push 时** git 会弹一次 GitHub 登录（Windows 凭据管理器），日常 push 用你的账号即可；用户安装同样需要读权限。

## Roadmap（未完成 / 规划中）

以下能力当前**尚未实现**，供使用者了解功能边界：

- **审核队列的 agent 代为处理**：当前 `reviews/resolve` 仅面板「审核」tab 可用（预定义操作 + 预生成搜索查询），agent 只能 `wiki_review_submit` 提交、`wiki_reviews` 查看，不能直接 resolve / 跳过——规划中让 agent 能按用户指示代为处理审核项。
- **卡片与知识库的删除 / 归档**：当前没有删除接口（卡片只能 `wiki_edit_card` 覆盖、知识库只能创建）；`wiki_lint` 报告的孤立页 / 重复卡片需人工清理。删除 + 回收站规划中。
- **资料源在线上传**：当前 `raw/sources/` 需手动放入文件（面板「代码」tab 已支持上传而「资料」tab 未支持）；规划中支持资料拖拽上传 + 自动入待摄入清单。
- **知识库导出 / 备份**：当前无导出接口（备份 = 直接拷贝 `~/.dsh/knowledge-cards/` 目录）；规划中提供 JSON / Markdown 导出与一键备份。
- **知识图谱 / 卡片关系可视化**：`[[wikilink]]` 交叉引用数据已具备，但无可视化；规划中做卡片关系图谱。
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
