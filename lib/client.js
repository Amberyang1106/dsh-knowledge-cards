window.__ModuleLoader__.load({
	id: "@amberyang1106/dsh-knowledge-cards",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/controller.ts
		var PanelController = class {
			state = { open: false };
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return this.state;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			emit() {
				for (const listener of this.listeners) listener();
			}
			toggle() {
				this.state = {
					...this.state,
					open: !this.state.open
				};
				this.emit();
			}
			close() {
				if (!this.state.open) return;
				this.state = {
					...this.state,
					open: false
				};
				this.emit();
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* Locale dictionaries for the knowledge-cards panel.
		* @module dsh-knowledge-cards/client/locales
		*/
		const NS = "dsh-knowledge-cards";
		const zh = {
			"entry.label": "知识卡片",
			"entry.tooltip": "浏览与维护知识卡片库",
			"panel.title": "知识卡片",
			"kb.placeholder": "选择知识库",
			"kb.empty": "还没有知识库 — 在「知识库」标签创建",
			"tab.cards": "卡片",
			"tab.sources": "资料",
			"tab.code": "代码",
			"tab.board": "看板",
			"tab.review": "审核",
			"tab.kbs": "知识库",
			"tab.trash": "回收站",
			"review.all": "全部",
			"review.pending": "待处理 {n}",
			"review.hint": "摄入时 agent 标记的需人工判断项，处理不阻塞摄入",
			"review.empty": "审核队列为空。",
			"review.status.pending": "待处理",
			"review.status.resolved": "已完成",
			"review.status.skipped": "已跳过",
			"review.resolve": "✓ 完成",
			"review.skip": "跳过",
			"audit.run": "审核知识库",
			"audit.deep": "复制深度审核指令",
			"audit.hint": "确定性扫描（重复/断链）即时入队；语义级审核交给 agent",
			"audit.result": "新增 {n} 条审核项（重复 {dup} · 缺失页面 {missing}），跳过已有 pending {skipped} 条",
			"audit.copied": "已复制深度审核指令，发给 agent 即可",
			"review.create.title": "从审核项创建卡片",
			"review.create.save": "创建并完成",
			"edit.button": "编辑",
			"edit.save": "保存",
			"edit.title": "编辑卡片",
			"card.cancel": "取消",
			"card.title": "标题",
			"card.desc": "摘要",
			"card.body": "正文（Markdown，[[wikilink]] 互链）",
			"log.all": "全部",
			"log.count": "显示 {n} / 共 {total} 条",
			"log.empty": "暂无日志记录。",
			"code.upload": "上传代码",
			"code.count": "{n} 个代码文件",
			"code.hint": "代码原样保存（不经 LLM 拆分），其他项目会话可用 wiki_code_list / wiki_code_read 读取作为参考。",
			"code.empty": "还没有代码文件 — 点「上传代码」选择文件。",
			"search.placeholder": "搜索卡片（标题 / 描述 / 标签 / 正文）",
			"filter.all": "全部",
			"cards.empty": "没有卡片。可点「+ 新建卡片」直接手写创建，或把资料放进 raw/sources/ 后告诉 agent「摄入 <资料>」（wiki_ingest → wiki_commit）。",
			"cards.total": "共 {total} 张",
			"cards.create": "新建卡片",
			"create.title": "新建卡片",
			"create.type": "类型",
			"create.save": "创建",
			"create.created": "已创建卡片「{title}」",
			"create.ruleHint": "规则卡（type=rules）：整卡 frontmatter 即可执行规则 YAML——必填 title / rule_id / rule_set / status / conditions / outcome.category；生命周期 draft → review → active → deprecated，仅 active 且在生效期内的规则会被对账程序读取执行（GET /api/dsh-knowledge/rules）。正文写业务说明与证据，供人阅读。",
			"create.ruleYaml": "规则 YAML（frontmatter 可执行部分）",
			"create.fieldHint": "字段卡（type=field）：一张卡 = 一个业务语义字段（如 Revenue），不是数据库列——同一字段在各系统（BPC/Databricks/Genie/Power BI）的物理实现写在卡内。frontmatter 承载结构化元数据（field_kind / data_type / aggregation / unit / source_table / source_field / depends_on / used_by / business_owner / review_status / evidence_level），正文写业务定义、计算逻辑、口径条件、血缘、校验与例外。首次只需填关键事实，其余交给 agent 补齐。",
			"create.fieldYaml": "字段卡 YAML（结构化元数据）",
			"form.tags": "标签（逗号分隔）",
			"form.related": "关联 slug（逗号分隔）",
			"form.sources": "来源文件名（逗号分隔）",
			"card.back": "← 返回",
			"card.sources": "来源",
			"card.related": "关联",
			"card.tags": "标签",
			"card.delete": "删除",
			"card.delete.confirm": "删除卡片「{title}」？将移入回收站，可在「回收站」标签恢复。",
			"card.created": "创建",
			"card.updated": "更新",
			"card.wikilink": "[[{slug}]]",
			"sources.pending": "{n} 份待摄入",
			"sources.empty": "raw/sources/ 为空 — 把文档放进去后刷新。",
			"sources.status.new": "新增",
			"sources.status.changed": "变更",
			"sources.status.up-to-date": "已摄入",
			"sources.copyPrompt": "复制摄入指令",
			"sources.promptCopied": "已复制：把指令发给 agent 即可摄入",
			"sources.ingestHint": "摄入由 agent 执行：复制下方指令发给当前会话，agent 会按两步法分析资料并生成卡片。",
			"kbs.add": "新建知识库",
			"kbs.name": "名称",
			"kbs.path": "路径（可选，默认 ~/.dsh/knowledge-cards/kbs/<id>）",
			"kbs.description": "描述（可选）",
			"kbs.create": "创建",
			"kbs.empty": "还没有知识库。",
			"kbs.created": "已创建",
			"kbs.stats": "{total} 卡片 · {sources} 资料",
			"kbs.delete": "删除",
			"kbs.delete.confirm": "删除知识库「{name}」？将移入回收站（含其审核队列），可在「回收站」标签恢复。",
			"trash.hint": "删除的卡片与知识库在此保留，可恢复或彻底删除。",
			"trash.cards": "已删除的卡片",
			"trash.kbs": "已删除的知识库",
			"trash.empty": "回收站为空。",
			"trash.restore": "恢复",
			"trash.purge": "彻底删除",
			"trash.purge.confirm": "彻底删除「{title}」？此操作不可恢复！",
			"trash.deletedAt": "删除于",
			"trash.restored": "已恢复",
			"trash.purged": "已彻底删除",
			"error.load": "加载失败：{message}",
			"refresh": "刷新",
			"lint.run": "运行 lint",
			"lint.result": "lint：{errors} error / {warns} warn",
			"close": "关闭"
		};
		const en = {
			"entry.label": "Knowledge Cards",
			"entry.tooltip": "Browse & maintain knowledge cards",
			"panel.title": "Knowledge Cards",
			"kb.placeholder": "Select knowledge base",
			"kb.empty": "No knowledge base yet — create one in the KB tab",
			"tab.cards": "Cards",
			"tab.sources": "Sources",
			"tab.code": "Code",
			"tab.board": "Board",
			"tab.review": "Review",
			"tab.kbs": "Knowledge Bases",
			"tab.trash": "Trash",
			"review.all": "All",
			"review.pending": "Pending {n}",
			"review.hint": "Items flagged by the agent during ingest for human judgment; handling does not block ingest",
			"review.empty": "Review queue is empty.",
			"review.status.pending": "Pending",
			"review.status.resolved": "Resolved",
			"review.status.skipped": "Skipped",
			"review.resolve": "✓ Resolve",
			"review.skip": "Skip",
			"audit.run": "Audit knowledge base",
			"audit.deep": "Copy deep-audit prompt",
			"audit.hint": "Deterministic scan (duplicates/broken links) enqueues instantly; semantic audit goes to the agent",
			"audit.result": "Added {n} review items ({dup} duplicate · {missing} missing page), skipped {skipped} existing pending",
			"audit.copied": "Deep-audit prompt copied — send it to the agent",
			"review.create.title": "Create card from review item",
			"review.create.save": "Create & resolve",
			"edit.button": "Edit",
			"edit.save": "Save",
			"edit.title": "Edit card",
			"card.cancel": "Cancel",
			"card.title": "Title",
			"card.desc": "Description",
			"card.body": "Body (Markdown, [[wikilink]] links)",
			"log.all": "All",
			"log.count": "Showing {n} / {total}",
			"log.empty": "No log entries yet.",
			"code.upload": "Upload code",
			"code.count": "{n} code files",
			"code.hint": "Code is stored as-is (no LLM processing); other project sessions can read it via wiki_code_list / wiki_code_read.",
			"code.empty": "No code files yet — click \"Upload code\" to pick files.",
			"search.placeholder": "Search cards (title / description / tags / body)",
			"filter.all": "All",
			"cards.empty": "No cards. Click \"+ New card\" to write one by hand, or drop sources into raw/sources/ and tell the agent to ingest them (wiki_ingest → wiki_commit).",
			"cards.total": "{total} cards",
			"cards.create": "New card",
			"create.title": "New card",
			"create.type": "Type",
			"create.save": "Create",
			"create.created": "Card \"{title}\" created",
			"create.ruleHint": "Rule card (type=rules): the whole frontmatter is the executable rule YAML — required title / rule_id / rule_set / status / conditions / outcome.category; lifecycle draft → review → active → deprecated; only active (in-effect) rules are read by the check pipeline (GET /api/dsh-knowledge/rules). Body holds the business explanation & evidence for humans.",
			"create.ruleYaml": "Rule YAML (executable frontmatter)",
			"create.fieldHint": "Field card (type=field): one card = one BUSINESS SEMANTIC FIELD (e.g. Revenue), not a database column — every system-specific physical implementation (BPC / Databricks / Genie / Power BI) lives inside the card. Frontmatter carries structured metadata (field_kind / data_type / aggregation / unit / source_table / source_field / depends_on / used_by / business_owner / review_status / evidence_level); the body holds business definition, calculation logic, scope, lineage, validation and exceptions. Fill only the key facts first — let the agent complete the rest.",
			"create.fieldYaml": "Field YAML (structured metadata)",
			"form.tags": "Tags (comma separated)",
			"form.related": "Related slugs (comma separated)",
			"form.sources": "Source filenames (comma separated)",
			"card.back": "← Back",
			"card.sources": "Sources",
			"card.related": "Related",
			"card.tags": "Tags",
			"card.delete": "Delete",
			"card.delete.confirm": "Delete card \"{title}\"? It moves to the recycle bin (restore via the Trash tab).",
			"card.created": "Created",
			"card.updated": "Updated",
			"card.wikilink": "[[{slug}]]",
			"sources.pending": "{n} pending",
			"sources.empty": "raw/sources/ is empty — drop documents in and refresh.",
			"sources.status.new": "New",
			"sources.status.changed": "Changed",
			"sources.status.up-to-date": "Ingested",
			"sources.copyPrompt": "Copy ingest prompt",
			"sources.promptCopied": "Copied — send it to the agent to ingest",
			"sources.ingestHint": "Ingest runs through the agent: copy the prompt below into the chat; the agent analyzes and generates cards.",
			"kbs.add": "New knowledge base",
			"kbs.name": "Name",
			"kbs.path": "Path (optional, default ~/.dsh/knowledge-cards/kbs/<id>)",
			"kbs.description": "Description (optional)",
			"kbs.create": "Create",
			"kbs.empty": "No knowledge bases yet.",
			"kbs.created": "Created",
			"kbs.stats": "{total} cards · {sources} sources",
			"kbs.delete": "Delete",
			"kbs.delete.confirm": "Delete knowledge base \"{name}\"? It moves to the recycle bin (with its review queue; restore via the Trash tab).",
			"trash.hint": "Deleted cards and knowledge bases are kept here — restore or purge.",
			"trash.cards": "Deleted cards",
			"trash.kbs": "Deleted knowledge bases",
			"trash.empty": "Trash is empty.",
			"trash.restore": "Restore",
			"trash.purge": "Purge",
			"trash.purge.confirm": "Purge \"{title}\" permanently? This cannot be undone!",
			"trash.deletedAt": "Deleted",
			"trash.restored": "Restored",
			"trash.purged": "Purged",
			"error.load": "Load failed: {message}",
			"refresh": "Refresh",
			"lint.run": "Run lint",
			"lint.result": "lint: {errors} error / {warns} warn",
			"close": "Close"
		};
		function t(locale, key, params) {
			let template = (locale?.zh ?? zh)[key];
			if (params !== void 0) for (const [name, value] of Object.entries(params)) template = template.replace(`{${name}}`, String(value));
			return template;
		}
		//#endregion
		//#region \0dsh-css:src/client/panel.module.css.mjs
		const css = ".WKhQka_view{z-index:30;background:var(--dsw-alias-bg-base);display:none;position:absolute;inset:0;overflow:auto}html[data-dsh-knowledge-active] .WKhQka_view{display:block}.WKhQka_entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}.WKhQka_entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}.WKhQka_entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}.WKhQka_entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.WKhQka_entryLabel{text-overflow:ellipsis;overflow:hidden}[data-dsh-frame][data-sidebar-collapsed] .WKhQka_entry{justify-content:center;width:100%;padding:0}[data-dsh-frame][data-sidebar-collapsed] .WKhQka_entryLabel{display:none}.WKhQka_panel{color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);padding:16px;font-size:13px}.WKhQka_header{justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;display:flex}.WKhQka_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:700}.WKhQka_headerActions{align-items:center;gap:8px;display:flex}.WKhQka_close{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 8px;font-size:16px;line-height:1}.WKhQka_close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}.WKhQka_tabs{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:2px;margin-bottom:14px;display:flex}.WKhQka_tab,.WKhQka_tabActive{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-bottom:2px solid #0000;padding:8px 16px;font-size:13px;transition:color .15s}.WKhQka_tab:hover{color:var(--dsw-alias-label-primary)}.WKhQka_tabActive{border-bottom-color:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary);font-weight:600}.WKhQka_tabSpacer{flex:1}.WKhQka_controls{gap:8px;margin-bottom:10px;display:flex}.WKhQka_input,.WKhQka_select{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 10px}.WKhQka_input{flex:1}.WKhQka_select{max-width:220px}.WKhQka_run,.WKhQka_runSmall{background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground);cursor:pointer;border:none;border-radius:6px;padding:6px 14px;font-weight:500}.WKhQka_runSmall{padding:4px 10px;font-size:12px}.WKhQka_run:hover,.WKhQka_runSmall:hover{background:var(--dsw-alias-button-info-hover)}.WKhQka_run:disabled,.WKhQka_runSmall:disabled{opacity:.6;cursor:default}.WKhQka_hint{color:var(--dsw-alias-label-tertiary);flex:1;align-self:center;font-size:12px}.WKhQka_note{color:var(--dsw-alias-label-tertiary);margin:0 0 10px;font-size:12px;line-height:1.5}.WKhQka_error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-state-error-primary);border-radius:6px;margin-bottom:12px;padding:10px}.WKhQka_lintResult{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-state-success-primary);border-radius:6px;margin-bottom:12px;padding:8px 12px;font-size:12px}.WKhQka_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:13px}.WKhQka_chips{flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:12px;display:flex}.WKhQka_chip,.WKhQka_chipActive{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:999px;padding:3px 10px;font-size:12px}.WKhQka_chip:hover{color:var(--dsw-alias-label-primary)}.WKhQka_chipActive{background:color-mix(in srgb, var(--dsw-alias-button-info-fill) 18%, transparent);border-color:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary);font-weight:600}.WKhQka_grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;display:grid}.WKhQka_card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;font-family:var(--dsw-font-family);border-radius:10px;flex-direction:column;gap:6px;padding:12px;transition:background .15s,border-color .15s;display:flex}.WKhQka_card:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}.WKhQka_cardTop{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_cardTitle{font-size:14px;font-weight:600;line-height:1.4}.WKhQka_cardDesc{color:var(--dsw-alias-label-secondary);-webkit-line-clamp:3;-webkit-box-orient:vertical;font-size:12px;line-height:1.5;display:-webkit-box;overflow:hidden}.WKhQka_cardTags{flex-wrap:wrap;gap:4px;margin-top:auto;display:flex}.WKhQka_cardSources{color:var(--dsw-alias-label-tertiary);font-size:11px}.WKhQka_tag{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:4px;padding:1px 6px;font-size:11px}.WKhQka_typeBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:16px}.WKhQka_type-entity{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)}.WKhQka_type-concept{color:var(--dsw-alias-state-info-primary);background:color-mix(in srgb, var(--dsw-alias-state-info-primary) 14%, transparent)}.WKhQka_type-source{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)}.WKhQka_type-query{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)}.WKhQka_type-comparison{color:var(--dsw-alias-state-danger-primary);background:color-mix(in srgb, var(--dsw-alias-state-danger-primary) 14%, transparent)}.WKhQka_type-synthesis{color:var(--dsw-alias-state-purple-primary);background:color-mix(in srgb, var(--dsw-alias-state-purple-primary) 14%, transparent)}.WKhQka_type-rules{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-button-info-fill) 22%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-button-info-fill) 55%, transparent)}.WKhQka_type-field{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)}.WKhQka_typeOther{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}.WKhQka_detailHeader{justify-content:space-between;align-items:center;margin-bottom:8px;display:flex}.WKhQka_back{color:var(--dsw-alias-button-info-fill);cursor:pointer;background:0 0;border:none;padding:4px 8px 4px 0;font-size:13px;font-weight:600}.WKhQka_detailTitle{margin:0 0 8px;font-size:18px;font-weight:700}.WKhQka_detailDesc{color:var(--dsw-alias-label-secondary);margin:0 0 10px;line-height:1.6}.WKhQka_meta{color:var(--dsw-alias-label-tertiary);font-size:12px}.WKhQka_kv{background:var(--dsw-alias-bg-layer-2);border-radius:8px;flex-direction:column;gap:4px;margin-bottom:12px;padding:10px 12px;display:flex}.WKhQka_kvItem{flex-wrap:wrap;align-items:baseline;gap:8px;font-size:12px;display:flex}.WKhQka_kvKey{color:var(--dsw-alias-label-tertiary);flex:none;min-width:52px}.WKhQka_relatedLink{color:var(--dsw-alias-button-info-fill);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px}.WKhQka_relatedLink:hover{text-decoration:underline}.WKhQka_body{color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7}.WKhQka_bodyLink{color:var(--dsw-alias-button-info-fill);cursor:pointer;background:0 0;border:none;padding:0;font-size:13px}.WKhQka_bodyLink:hover{text-decoration:underline}.WKhQka_table{border-collapse:collapse;width:100%}.WKhQka_table th,.WKhQka_table td{text-align:left;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top;padding:6px 10px;font-size:12px}.WKhQka_table th{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);font-size:12px;font-weight:600}.WKhQka_table tbody tr:hover{background:var(--dsw-alias-bg-layer-2)}.WKhQka_mono{font-family:var(--dsw-font-family-mono,monospace);color:var(--dsw-alias-label-tertiary)}.WKhQka_badgeNew,.WKhQka_badgeChanged,.WKhQka_badgeSuccess{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:16px;display:inline-block}.WKhQka_badgeNew{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)}.WKhQka_badgeChanged{color:var(--dsw-alias-state-danger-primary);background:color-mix(in srgb, var(--dsw-alias-state-danger-primary) 14%, transparent)}.WKhQka_badgeSuccess{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)}.WKhQka_kbRow,.WKhQka_kbRowActive{border:1px solid var(--dsw-alias-border-l1);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border-radius:8px;margin-bottom:8px;padding:10px 12px}.WKhQka_kbRow:hover{background:var(--dsw-alias-bg-layer-2)}.WKhQka_kbRowActive{border-color:var(--dsw-alias-button-info-fill);background:color-mix(in srgb, var(--dsw-alias-button-info-fill) 8%, var(--dsw-alias-bg-layer-1))}.WKhQka_kbName{font-size:14px;font-weight:600}.WKhQka_kbMeta{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px}.WKhQka_kbPath{color:var(--dsw-alias-label-tertiary);word-break:break-all;margin-top:2px;font-size:11px}.WKhQka_kbDesc{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px}.WKhQka_kbForm{border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;flex-direction:column;gap:8px;margin-top:16px;padding:12px;display:flex}.WKhQka_kbFormTitle{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600}.WKhQka_kbForm .WKhQka_run{align-self:flex-start}.WKhQka_hiddenInput{display:none}.WKhQka_fileRow{color:var(--dsw-alias-button-info-fill);cursor:pointer;text-align:left;font-size:13px;font-family:var(--dsw-font-family-mono,monospace);background:0 0;border:none;padding:0}.WKhQka_fileRow:hover{text-decoration:underline}.WKhQka_codePath{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:var(--dsw-font-family-mono,monospace);word-break:break-all}.WKhQka_codeBlock{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family-mono,monospace);white-space:pre;border-radius:8px;margin:0;padding:12px;font-size:12px;line-height:1.6;overflow-x:auto}.WKhQka_dangerSmall{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:2px 6px;font-size:13px}.WKhQka_dangerSmall:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}.WKhQka_editForm{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:12px;display:flex}.WKhQka_editLabel{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;font-size:12px;font-weight:600;display:flex}.WKhQka_editActions{align-items:center;gap:8px;display:flex}.WKhQka_editorTextarea{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-input-major);width:100%;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family-mono,monospace);resize:vertical;border-radius:6px;padding:6px 10px;font-size:12px;line-height:1.6}.WKhQka_logList{flex-direction:column;display:flex}.WKhQka_logRow{border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;align-items:baseline;gap:10px;padding:8px 4px;font-size:13px;display:flex}.WKhQka_logIcon{flex:none;font-size:13px}.WKhQka_logDate{color:var(--dsw-alias-label-tertiary);font-size:12px;font-family:var(--dsw-font-family-mono,monospace);flex:none}.WKhQka_logAction,.WKhQka_logActionEdit{border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:600;line-height:16px}.WKhQka_logAction{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}.WKhQka_logActionEdit{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)}.WKhQka_logSubject{color:var(--dsw-alias-label-primary);font-weight:500}.WKhQka_logNote{width:100%;color:var(--dsw-alias-label-tertiary);padding-left:26px;font-size:12px}.WKhQka_reviewList{flex-direction:column;gap:10px;display:flex}.WKhQka_reviewItem{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:12px 14px}.WKhQka_reviewDone{opacity:.6}.WKhQka_reviewTop{justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;display:flex}.WKhQka_reviewKind,.WKhQka_reviewKindDanger,.WKhQka_reviewKindWarn{border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:16px}.WKhQka_reviewKind{color:var(--dsw-alias-state-info-primary);background:color-mix(in srgb, var(--dsw-alias-state-info-primary) 14%, transparent)}.WKhQka_reviewKindDanger{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}.WKhQka_reviewKindWarn{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)}.WKhQka_reviewStatus{color:var(--dsw-alias-label-tertiary);font-size:11px}.WKhQka_reviewTitle{margin-bottom:4px;font-size:14px;font-weight:600}.WKhQka_reviewSummary{color:var(--dsw-alias-label-secondary);margin-bottom:6px;font-size:12px;line-height:1.5}.WKhQka_reviewSource{color:var(--dsw-alias-label-tertiary);word-break:break-all;margin-bottom:6px;font-size:11px}.WKhQka_reviewOptions{flex-wrap:wrap;gap:4px;margin-bottom:6px;display:flex}.WKhQka_reviewSearch{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-business-primary);word-break:break-all;border-radius:6px;margin-bottom:8px;padding:6px 10px;font-size:12px}.WKhQka_reviewActions{align-items:center;gap:8px;display:flex}.WKhQka_auditBar{border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;padding:10px 12px;display:flex}.WKhQka_kbRowTop{justify-content:space-between;align-items:center;gap:8px;display:flex}.WKhQka_sectionTitle{color:var(--dsw-alias-label-secondary);margin:14px 0 8px;font-size:13px;font-weight:600}.WKhQka_trashItem{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;margin-bottom:8px;padding:10px 12px}.WKhQka_trashTop{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;display:flex}.WKhQka_trashTitle{align-items:center;gap:6px;font-size:13px;font-weight:600;display:flex}.WKhQka_trashMeta{color:var(--dsw-alias-label-tertiary);word-break:break-all;font-size:11px}.WKhQka_trashActions{align-items:center;gap:8px;margin-top:8px;display:flex}";
		const tagId = "@amberyang1106/dsh-knowledge-cards/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@amberyang1106/dsh-knowledge-cards";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"auditBar": "WKhQka_auditBar",
			"back": "WKhQka_back",
			"badgeChanged": "WKhQka_badgeChanged",
			"badgeNew": "WKhQka_badgeNew",
			"badgeSuccess": "WKhQka_badgeSuccess",
			"body": "WKhQka_body",
			"bodyLink": "WKhQka_bodyLink",
			"card": "WKhQka_card",
			"cardDesc": "WKhQka_cardDesc",
			"cardSources": "WKhQka_cardSources",
			"cardTags": "WKhQka_cardTags",
			"cardTitle": "WKhQka_cardTitle",
			"cardTop": "WKhQka_cardTop",
			"chip": "WKhQka_chip",
			"chipActive": "WKhQka_chipActive",
			"chips": "WKhQka_chips",
			"close": "WKhQka_close",
			"codeBlock": "WKhQka_codeBlock",
			"codePath": "WKhQka_codePath",
			"controls": "WKhQka_controls",
			"dangerSmall": "WKhQka_dangerSmall",
			"detailDesc": "WKhQka_detailDesc",
			"detailHeader": "WKhQka_detailHeader",
			"detailTitle": "WKhQka_detailTitle",
			"editActions": "WKhQka_editActions",
			"editForm": "WKhQka_editForm",
			"editLabel": "WKhQka_editLabel",
			"editorTextarea": "WKhQka_editorTextarea",
			"empty": "WKhQka_empty",
			"entry": "WKhQka_entry",
			"entryIcon": "WKhQka_entryIcon",
			"entryLabel": "WKhQka_entryLabel",
			"error": "WKhQka_error",
			"fileRow": "WKhQka_fileRow",
			"grid": "WKhQka_grid",
			"header": "WKhQka_header",
			"headerActions": "WKhQka_headerActions",
			"hiddenInput": "WKhQka_hiddenInput",
			"hint": "WKhQka_hint",
			"input": "WKhQka_input",
			"kbDesc": "WKhQka_kbDesc",
			"kbForm": "WKhQka_kbForm",
			"kbFormTitle": "WKhQka_kbFormTitle",
			"kbMeta": "WKhQka_kbMeta",
			"kbName": "WKhQka_kbName",
			"kbPath": "WKhQka_kbPath",
			"kbRow": "WKhQka_kbRow",
			"kbRowActive": "WKhQka_kbRowActive",
			"kbRowTop": "WKhQka_kbRowTop",
			"kv": "WKhQka_kv",
			"kvItem": "WKhQka_kvItem",
			"kvKey": "WKhQka_kvKey",
			"lintResult": "WKhQka_lintResult",
			"logAction": "WKhQka_logAction",
			"logActionEdit": "WKhQka_logActionEdit",
			"logDate": "WKhQka_logDate",
			"logIcon": "WKhQka_logIcon",
			"logList": "WKhQka_logList",
			"logNote": "WKhQka_logNote",
			"logRow": "WKhQka_logRow",
			"logSubject": "WKhQka_logSubject",
			"meta": "WKhQka_meta",
			"mono": "WKhQka_mono",
			"note": "WKhQka_note",
			"panel": "WKhQka_panel",
			"relatedLink": "WKhQka_relatedLink",
			"reviewActions": "WKhQka_reviewActions",
			"reviewDone": "WKhQka_reviewDone",
			"reviewItem": "WKhQka_reviewItem",
			"reviewKind": "WKhQka_reviewKind",
			"reviewKindDanger": "WKhQka_reviewKindDanger",
			"reviewKindWarn": "WKhQka_reviewKindWarn",
			"reviewList": "WKhQka_reviewList",
			"reviewOptions": "WKhQka_reviewOptions",
			"reviewSearch": "WKhQka_reviewSearch",
			"reviewSource": "WKhQka_reviewSource",
			"reviewStatus": "WKhQka_reviewStatus",
			"reviewSummary": "WKhQka_reviewSummary",
			"reviewTitle": "WKhQka_reviewTitle",
			"reviewTop": "WKhQka_reviewTop",
			"run": "WKhQka_run",
			"runSmall": "WKhQka_runSmall",
			"sectionTitle": "WKhQka_sectionTitle",
			"select": "WKhQka_select",
			"tab": "WKhQka_tab",
			"tabActive": "WKhQka_tabActive",
			"tabSpacer": "WKhQka_tabSpacer",
			"table": "WKhQka_table",
			"tabs": "WKhQka_tabs",
			"tag": "WKhQka_tag",
			"title": "WKhQka_title",
			"trashActions": "WKhQka_trashActions",
			"trashItem": "WKhQka_trashItem",
			"trashMeta": "WKhQka_trashMeta",
			"trashTitle": "WKhQka_trashTitle",
			"trashTop": "WKhQka_trashTop",
			"type-comparison": "WKhQka_type-comparison",
			"type-concept": "WKhQka_type-concept",
			"type-entity": "WKhQka_type-entity",
			"type-field": "WKhQka_type-field",
			"type-query": "WKhQka_type-query",
			"type-rules": "WKhQka_type-rules",
			"type-source": "WKhQka_type-source",
			"type-synthesis": "WKhQka_type-synthesis",
			"typeBadge": "WKhQka_typeBadge",
			"typeOther": "WKhQka_typeOther",
			"view": "WKhQka_view"
		};
		const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h7a2 2 0 0 1 2 2v7a2 2 0 0 0-2-2h-7z"/><path d="M5.5 3.5v9"/><path d="M13.5 6.5v6a2 2 0 0 1-2 2"/></svg>`;
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshKnowledgeEntry = "";
			entry.dataset.dshPlugin = "knowledge-cards";
			entry.dataset.dshPart = "sidebar-entry";
			entry.className = panel_module_css_default.entry;
			entry.setAttribute("aria-label", t(void 0, "entry.label"));
			entry.setAttribute("title", t(void 0, "entry.tooltip"));
			entry.innerHTML = `<span class="${panel_module_css_default.entryIcon}">${ICON}</span><span class="${panel_module_css_default.entryLabel}">${t(void 0, "entry.label")}</span>`;
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return entry;
		}
		function mountSidebarEntry(controller) {
			if (document.querySelector("[data-dsh-knowledge-entry]") !== null) return () => {};
			const entry = createEntry(controller);
			let root;
			let placed = false;
			const tryPlace = () => {
				if (placed) {
					if (document.body.contains(entry)) return;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				const button = newSessionButton(root);
				if (button === void 0) return;
				if (entry.parentElement !== root) {
					const row = button.closest("[class*=\"logoRow\"]");
					const base = row !== null && row.parentElement === root ? row : button;
					root.insertBefore(entry, base.nextElementSibling);
				}
				placed = true;
				rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) {
					placed = false;
					tryPlace();
				}
			});
			const syncActive = () => {
				if (controller.getSnapshot().open) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			syncActive();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/panel.tsx
		/**
		* KnowledgeCards panel: the center-column view toggled by the sidebar entry.
		* Tabs — 卡片 (card wall + search + detail + manual create), 资料 (raw sources
		* with ingest status + copy-prompt for the agent), 代码 (code files), 看板
		* (activity log), 审核 (review queue), 知识库 (multi-KB management), 回收站
		* (deleted cards/KBs, restore or purge). All data rides the host
		* /api/dsh-knowledge/* routes.
		* @module dsh-knowledge-cards/client/panel
		*/
		async function api(path, init) {
			const response = await fetch(path, init);
			const data = await response.json().catch(() => ({}));
			if (!response.ok || data.ok === false) throw new Error(String(data.error ?? `HTTP ${response.status}`));
			return data;
		}
		function query(params) {
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) if (value !== "" && value !== void 0) search.set(key, value);
			const text = search.toString();
			return text === "" ? "" : `?${text}`;
		}
		/** Extract the frontmatter payload (between the `---` fences) of a raw card
		* file — used to prefill the YAML editor of rule cards. */
		function frontmatterPayloadOf(raw) {
			const lines = raw.replace(/\r\n/g, "\n").split("\n");
			const start = lines[0]?.trim() === "---" ? 1 : 0;
			const payload = [];
			for (let index = start; index < lines.length; index += 1) {
				if (lines[index].trim() === "---") break;
				payload.push(lines[index]);
			}
			return payload.join("\n").replace(/\n+$/, "");
		}
		const KB_STORAGE_KEY = "dsh-knowledge-cards:kb";
		const TYPE_FILTERS = [
			"all",
			"entity",
			"concept",
			"source",
			"query",
			"comparison",
			"synthesis",
			"rules",
			"field"
		];
		/** Types offered by the manual create form (overview is auto-maintained). */
		const CREATE_TYPES = [
			"concept",
			"entity",
			"source",
			"query",
			"comparison",
			"synthesis",
			"rules",
			"field"
		];
		/** Types whose whole frontmatter is edited as one canonical YAML payload. */
		const YAML_EDITOR_TYPES = ["rules", "field"];
		/** Starter template for a field card (type=field) — structured metadata in
		* the frontmatter (identity / logic / implementation / lineage / governance),
		* narrative sections go in the body. Minimal first version: fill the key
		* facts, let the agent complete the rest. */
		const FIELD_YAML_TEMPLATE = [
			"type: field",
			"title: ",
			"description: 一句话业务定义",
			"",
			"# --- Identity ---",
			"field_id: field.",
			"canonical_name: ",
			"aliases: []",
			"field_kind: measure",
			"data_type: percentage",
			"status: draft",
			"domain: Finance",
			"workstream: Management Reporting",
			"subject_area: ",
			"",
			"# --- Logic ---",
			"aggregation: non-additive",
			"unit: ",
			"source_table: ",
			"source_field: ",
			"",
			"# --- Relations（slug 或名称，支撑 Impact Analysis）---",
			"depends_on: []",
			"used_by: []",
			"implemented_in: []",
			"governed_by: []",
			"",
			"# --- Governance ---",
			"business_owner: ",
			"technical_owner: ",
			"effective_from: ",
			"last_reviewed: ",
			"review_status: draft",
			"evidence_level: ",
			"",
			"# --- 常规卡片字段 ---",
			"tags: []",
			"related: []",
			"sources: []"
		].join("\n");
		/** Starter template for a rule card (type=rules) — canonical YAML frontmatter. */
		const RULE_YAML_TEMPLATE = [
			"type: rules",
			"title: ",
			"description: 一句话说明",
			"rule_id: ",
			"rule_set: b3-b4-no-wbs",
			"applies_to: [B3]",
			"status: draft",
			"priority: 30",
			"owner: Finance Transformation",
			"effective_from: ",
			"effective_to: ",
			"version: 1",
			"match: all",
			"conditions:",
			"  - fact: mspa03_customer_row_count",
			"    operator: gt",
			"    value: 0",
			"outcome:",
			"  category: WBS_FORMAT",
			"  label: 结论标签",
			"  explanation: 结论说明",
			"  suggested_action: 建议动作",
			"test_cases:",
			"  - name: 支持案例",
			"    facts:",
			"      mspa03_customer_row_count: 1",
			"    expected: SUPPORTED"
		].join("\n");
		function TypeBadge({ type }) {
			const className = panel_module_css_default[`type-${type}`] ?? panel_module_css_default.typeOther;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${panel_module_css_default.typeBadge} ${className}`,
				children: type
			});
		}
		/** Minimal body renderer: plain text with clickable [[wikilinks]]. */
		function BodyText({ body, onOpen }) {
			const parts = (0, react.useMemo)(() => {
				const output = [];
				const pattern = /\[\[([^\]]+)\]\]/g;
				let last = 0;
				let match;
				while ((match = pattern.exec(body)) !== null) {
					if (match.index > last) output.push({
						kind: "text",
						value: body.slice(last, match.index)
					});
					output.push({
						kind: "link",
						value: match[1].split("|")[0].trim()
					});
					last = match.index + match[0].length;
				}
				if (last < body.length) output.push({
					kind: "text",
					value: body.slice(last)
				});
				return output;
			}, [body]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.body,
				children: parts.map((part, index) => part.kind === "link" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: panel_module_css_default.bodyLink,
					title: t(void 0, "card.wikilink", { slug: part.value }),
					onClick: () => onOpen(part.value),
					children: [
						"[[",
						part.value,
						"]]"
					]
				}, index) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: part.value }, index))
			});
		}
		function CardsTab({ kbId, onOpenCard }) {
			const [cards, setCards] = (0, react.useState)([]);
			const [total, setTotal] = (0, react.useState)(0);
			const [search, setSearch] = (0, react.useState)("");
			const [typeFilter, setTypeFilter] = (0, react.useState)("all");
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const timerRef = (0, react.useRef)(void 0);
			const load = (0, react.useCallback)((queryText, type) => {
				setLoading(true);
				api(`/api/dsh-knowledge/cards${query({
					kb: kbId,
					q: queryText,
					type,
					limit: "200"
				})}`).then((data) => {
					setCards(data.cards);
					setTotal(data.total);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err))).finally(() => setLoading(false));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load("", typeFilter);
			}, [load, typeFilter]);
			(0, react.useEffect)(() => {
				if (timerRef.current !== void 0) window.clearTimeout(timerRef.current);
				timerRef.current = window.setTimeout(() => load(search, typeFilter), 250);
				return () => {
					if (timerRef.current !== void 0) window.clearTimeout(timerRef.current);
				};
			}, [
				search,
				load,
				typeFilter
			]);
			const [creating, setCreating] = (0, react.useState)(false);
			const [draftType, setDraftType] = (0, react.useState)("concept");
			const [draftTitle, setDraftTitle] = (0, react.useState)("");
			const [draftDesc, setDraftDesc] = (0, react.useState)("");
			const [draftTags, setDraftTags] = (0, react.useState)("");
			const [draftRelated, setDraftRelated] = (0, react.useState)("");
			const [draftSources, setDraftSources] = (0, react.useState)("");
			const [draftBody, setDraftBody] = (0, react.useState)("");
			const [draftYaml, setDraftYaml] = (0, react.useState)("");
			const [savingDraft, setSavingDraft] = (0, react.useState)(false);
			const [createError, setCreateError] = (0, react.useState)(null);
			const [createdNote, setCreatedNote] = (0, react.useState)(null);
			const isYamlDraft = YAML_EDITOR_TYPES.includes(draftType);
			const openCreate = () => {
				setDraftType("concept");
				setDraftTitle("");
				setDraftDesc("");
				setDraftTags("");
				setDraftRelated("");
				setDraftSources("");
				setDraftBody("");
				setDraftYaml("");
				setCreateError(null);
				setCreatedNote(null);
				setCreating(true);
			};
			const switchDraftType = (type) => {
				setDraftType(type);
				if (draftYaml.trim() === "") {
					if (type === "rules") setDraftYaml(RULE_YAML_TEMPLATE);
					else if (type === "field") setDraftYaml(FIELD_YAML_TEMPLATE);
				}
			};
			const saveCreate = async () => {
				if (isYamlDraft ? draftYaml.trim() === "" : draftTitle.trim() === "") return;
				setSavingDraft(true);
				setCreateError(null);
				try {
					const data = await api("/api/dsh-knowledge/card/create", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: isYamlDraft ? JSON.stringify({
							kb: kbId,
							type: draftType,
							frontmatterYaml: draftYaml,
							body: draftBody
						}) : JSON.stringify({
							kb: kbId,
							type: draftType,
							title: draftTitle.trim(),
							description: draftDesc.trim(),
							tags: draftTags.split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""),
							related: draftRelated.split(",").map((item) => item.trim()).filter((item) => item !== ""),
							sources: draftSources.split(",").map((item) => item.trim()).filter((item) => item !== ""),
							body: draftBody
						})
					});
					setCreating(false);
					setCreatedNote(t(void 0, "create.created", { title: data.result.card.title }));
					window.setTimeout(() => setCreatedNote(null), 4e3);
					load(search, typeFilter);
				} catch (err) {
					setCreateError(String(err.message ?? err));
				} finally {
					setSavingDraft(false);
				}
			};
			if (creating) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.detailHeader,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.back,
						onClick: () => setCreating(false),
						children: t(void 0, "card.cancel")
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
					className: panel_module_css_default.detailTitle,
					children: ["+ ", t(void 0, "create.title")]
				}),
				createError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: createError
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.editForm,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [t(void 0, "create.type"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: panel_module_css_default.select,
								value: draftType,
								onChange: (event) => switchDraftType(event.target.value),
								children: CREATE_TYPES.map((type) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: type,
									children: type
								}, type))
							})]
						}),
						isYamlDraft ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.note,
								children: draftType === "field" ? t(void 0, "create.fieldHint") : t(void 0, "create.ruleHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [draftType === "field" ? t(void 0, "create.fieldYaml") : t(void 0, "create.ruleYaml"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.editorTextarea,
									rows: 22,
									value: draftYaml,
									spellCheck: false,
									onChange: (event) => setDraftYaml(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.body"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.editorTextarea,
									rows: 6,
									value: draftBody,
									placeholder: "业务说明 / 证据 / 备注（Markdown）",
									onChange: (event) => setDraftBody(event.target.value)
								})]
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: draftTitle,
									onChange: (event) => setDraftTitle(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.desc"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: draftDesc,
									onChange: (event) => setDraftDesc(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "form.tags"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: draftTags,
									placeholder: "财务, allocation",
									onChange: (event) => setDraftTags(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "form.related"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: draftRelated,
									placeholder: "利润中心, 成本分摊",
									onChange: (event) => setDraftRelated(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "form.sources"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: draftSources,
									placeholder: "policy-2024.pdf",
									onChange: (event) => setDraftSources(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.body"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.editorTextarea,
									rows: 14,
									value: draftBody,
									placeholder: "Markdown，[[wikilink]] 互链",
									onChange: (event) => setDraftBody(event.target.value)
								})]
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.editActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.run,
								disabled: savingDraft || (isYamlDraft ? draftYaml.trim() === "" : draftTitle.trim() === ""),
								onClick: () => void saveCreate(),
								children: savingDraft ? "…" : t(void 0, "create.save")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.runSmall,
								onClick: () => setCreating(false),
								children: t(void 0, "card.cancel")
							})]
						})
					]
				})
			] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						placeholder: t(void 0, "search.placeholder"),
						value: search,
						onChange: (event) => setSearch(event.target.value)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: panel_module_css_default.run,
						onClick: openCreate,
						children: ["+ ", t(void 0, "cards.create")]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.chips,
					children: [TYPE_FILTERS.map((filter) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: filter === typeFilter ? panel_module_css_default.chipActive : panel_module_css_default.chip,
						onClick: () => setTypeFilter(filter),
						children: filter === "all" ? t(void 0, "filter.all") : filter
					}, filter)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.hint,
						children: t(void 0, "cards.total", { total })
					})]
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				createdNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.lintResult,
					children: createdNote
				}),
				!loading && cards.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "cards.empty")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.grid,
					children: cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: panel_module_css_default.card,
						onClick: () => onOpenCard(card),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.cardTop,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TypeBadge, { type: card.type }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.cardSources,
									children: card.sources.length > 0 ? `${card.sources.length} 📎` : ""
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardTitle,
								children: card.title
							}),
							card.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardDesc,
								children: card.description
							}),
							card.tags.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.cardTags,
								children: card.tags.slice(0, 4).map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.tag,
									children: ["#", tag]
								}, tag))
							})
						]
					}, card.slug))
				})
			] });
		}
		function CardDetail({ kbId, slug, onBack, onOpenCard, onDeleted }) {
			const [card, setCard] = (0, react.useState)(null);
			const [editing, setEditing] = (0, react.useState)(false);
			const [editTitle, setEditTitle] = (0, react.useState)("");
			const [editDesc, setEditDesc] = (0, react.useState)("");
			const [editTags, setEditTags] = (0, react.useState)("");
			const [editBody, setEditBody] = (0, react.useState)("");
			const [editYaml, setEditYaml] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [savedNote, setSavedNote] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [deleting, setDeleting] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				setCard(null);
				setEditing(false);
				api(`/api/dsh-knowledge/card${query({
					kb: kbId,
					slug
				})}`).then((data) => {
					setCard(data.card);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId, slug]);
			const startEdit = () => {
				if (card === null) return;
				setEditTitle(card.title);
				setEditDesc(card.description ?? "");
				setEditTags(card.tags.join(", "));
				setEditBody(card.body);
				setEditYaml(frontmatterPayloadOf(card.raw));
				setSavedNote(null);
				setEditing(true);
			};
			const saveEdit = async () => {
				if (card === null) return;
				setSaving(true);
				setError(null);
				try {
					const data = await api("/api/dsh-knowledge/card/edit", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: YAML_EDITOR_TYPES.includes(card.type) ? JSON.stringify({
							kb: kbId,
							slug: card.slug,
							frontmatterYaml: editYaml,
							body: editBody
						}) : JSON.stringify({
							kb: kbId,
							slug: card.slug,
							title: editTitle,
							description: editDesc,
							tags: editTags.split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""),
							body: editBody
						})
					});
					setCard(data.result.card);
					setEditing(false);
					setSavedNote(data.result.changed.length > 0 ? `已保存：修改字段 ${data.result.changed.join("、")}` : "已保存（无字段变化）");
					window.setTimeout(() => setSavedNote(null), 4e3);
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setSaving(false);
				}
			};
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.error,
				children: error
			});
			if (card === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: "…"
			});
			const openFromSlug = (target) => onOpenCard({ slug: target });
			const removeCard = async () => {
				if (card === null) return;
				if (!window.confirm(t(void 0, "card.delete.confirm", { title: card.title }))) return;
				setDeleting(true);
				try {
					await api("/api/dsh-knowledge/card/delete", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							kb: kbId,
							slug: card.slug
						})
					});
					onDeleted();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setDeleting(false);
				}
			};
			if (editing) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.detailHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.back,
						onClick: () => setEditing(false),
						children: t(void 0, "card.cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.close,
						onClick: () => setEditing(false),
						children: "✕"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: panel_module_css_default.detailTitle,
					children: t(void 0, "edit.title")
				}),
				savedNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.lintResult,
					children: savedNote
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.editForm,
					children: [
						YAML_EDITOR_TYPES.includes(card.type) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.note,
							children: card.type === "field" ? t(void 0, "create.fieldHint") : t(void 0, "create.ruleHint")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [card.type === "field" ? t(void 0, "create.fieldYaml") : t(void 0, "create.ruleYaml"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.editorTextarea,
								rows: 22,
								value: editYaml,
								spellCheck: false,
								onChange: (event) => setEditYaml(event.target.value)
							})]
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: editTitle,
									onChange: (event) => setEditTitle(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.desc"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: editDesc,
									onChange: (event) => setEditDesc(event.target.value)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.editLabel,
								children: [t(void 0, "card.tags"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									value: editTags,
									placeholder: "逗号分隔，如 财务, allocation",
									onChange: (event) => setEditTags(event.target.value)
								})]
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [t(void 0, "card.body"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.editorTextarea,
								rows: YAML_EDITOR_TYPES.includes(card.type) ? 6 : 14,
								value: editBody,
								onChange: (event) => setEditBody(event.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.editActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.run,
								disabled: saving,
								onClick: () => void saveEdit(),
								children: saving ? "…" : t(void 0, "edit.save")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.runSmall,
								onClick: () => setEditing(false),
								children: t(void 0, "card.cancel")
							})]
						})
					]
				})
			] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.detailHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.back,
						onClick: onBack,
						children: t(void 0, "card.back")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.headerActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.runSmall,
								onClick: startEdit,
								children: t(void 0, "edit.button")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.dangerSmall,
								disabled: deleting,
								onClick: () => void removeCard(),
								children: ["🗑 ", t(void 0, "card.delete")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.close,
								onClick: onBack,
								children: "✕"
							})
						]
					})]
				}),
				savedNote !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.lintResult,
					children: savedNote
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: panel_module_css_default.detailTitle,
					children: card.title
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.cardTop,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TypeBadge, { type: card.type }), card.updated !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.meta,
						children: [
							t(void 0, "card.updated"),
							": ",
							card.updated
						]
					})]
				}),
				card.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.detailDesc,
					children: card.description
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.kv,
					children: [
						card.tags.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.kvItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.kvKey,
								children: [t(void 0, "card.tags"), ":"]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: card.tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.tag,
								children: ["#", tag]
							}, tag)) })]
						}),
						card.sources.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.kvItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.kvKey,
								children: [t(void 0, "card.sources"), ":"]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: card.sources.join(", ") })]
						}),
						card.related.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.kvItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.kvKey,
								children: [t(void 0, "card.related"), ":"]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: card.related.map((related) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.relatedLink,
								onClick: () => openFromSlug(related),
								children: [
									"[[",
									related,
									"]]"
								]
							}, related)) })]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BodyText, {
					body: card.body,
					onOpen: openFromSlug
				})
			] });
		}
		function buildIngestPrompt(kbName, pending) {
			return `请用知识卡片插件摄入以下资料到知识库「${kbName}」：\n${pending.map((source) => `- ${source.relPath}（${source.status === "new" ? "新增" : "变更"}）`).join("\n")}\n\n流程：先 wiki_ingest 取资料全文与知识库上下文（分析关键实体/概念、与现有卡片的关联），再用 wiki_commit 生成并提交卡片（frontmatter 含 type/title/description/tags/related/sources，正文用 [[wikilink]] 互链），完成后跑一次 wiki_lint。\n重要：分析中若发现与现有知识矛盾、疑似已有同名卡片、重要概念缺页面、或值得深挖的点，用 wiki_review_submit 提交审核项（kind + 简短说明 + 预定义操作 + 可选的预生成搜索查询），不要擅自下结论——用户稍后在「审核」tab 处理。`;
		}
		function SourcesTab({ kbId, kbName }) {
			const [sources, setSources] = (0, react.useState)([]);
			const [pending, setPending] = (0, react.useState)(0);
			const [copied, setCopied] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)(() => {
				api(`/api/dsh-knowledge/sources${query({ kb: kbId })}`).then((data) => {
					setSources(data.sources);
					setPending(data.pending);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const pendingSources = sources.filter((source) => source.status !== "up-to-date");
			const copyPrompt = async () => {
				const prompt = buildIngestPrompt(kbName, pendingSources);
				try {
					await navigator.clipboard.writeText(prompt);
					setCopied(true);
					window.setTimeout(() => setCopied(false), 2e3);
				} catch {
					window.prompt("复制以下摄入指令发给 agent：", prompt);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.hint,
							children: t(void 0, "sources.pending", { n: pending })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: panel_module_css_default.run,
							disabled: pendingSources.length === 0,
							onClick: () => void copyPrompt(),
							children: [copied ? "✓ " : "", t(void 0, "sources.copyPrompt")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.run,
							onClick: load,
							children: t(void 0, "refresh")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.note,
					children: t(void 0, "sources.ingestHint")
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				sources.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "sources.empty")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					className: panel_module_css_default.table,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "文件" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "状态" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "SHA256" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "关联卡片" })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: sources.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: source.relPath }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: source.status === "up-to-date" ? panel_module_css_default.badgeSuccess : source.status === "new" ? panel_module_css_default.badgeNew : panel_module_css_default.badgeChanged,
							children: source.status === "up-to-date" ? t(void 0, "sources.status.up-to-date") : source.status === "new" ? t(void 0, "sources.status.new") : t(void 0, "sources.status.changed")
						}) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
							className: panel_module_css_default.mono,
							children: [source.sha256.slice(0, 10), "…"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: source.pages.length > 0 ? source.pages.join(", ") : "-" })
					] }, source.relPath)) })]
				})
			] });
		}
		function KbsTab({ kbs, activeId, onSelect, onCreated, onDeleted }) {
			const [name, setName] = (0, react.useState)("");
			const [path, setPath] = (0, react.useState)("");
			const [description, setDescription] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [deletingId, setDeletingId] = (0, react.useState)(null);
			const remove = async (kb) => {
				if (!window.confirm(t(void 0, "kbs.delete.confirm", { name: kb.name }))) return;
				setDeletingId(kb.id);
				setError(null);
				try {
					await api("/api/dsh-knowledge/kbs/delete", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kb: kb.id })
					});
					onDeleted(kb.id);
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setDeletingId(null);
				}
			};
			const create = async () => {
				if (name.trim() === "") return;
				setBusy(true);
				setError(null);
				try {
					onSelect((await api("/api/dsh-knowledge/kbs", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							name: name.trim(),
							path: path.trim() || void 0,
							description: description.trim() || void 0
						})
					})).kb.id);
					setName("");
					setPath("");
					setDescription("");
					onCreated();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: error
				}),
				kbs.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "kbs.empty")
				}),
				kbs.map((kb) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: kb.id === activeId ? panel_module_css_default.kbRowActive : panel_module_css_default.kbRow,
					onClick: () => onSelect(kb.id),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.kbRowTop,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.kbName,
								children: [kb.name, kb.id === activeId && " ✓"]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.dangerSmall,
								disabled: deletingId === kb.id,
								title: t(void 0, "kbs.delete"),
								onClick: (event) => {
									event.stopPropagation();
									remove(kb);
								},
								children: ["🗑 ", t(void 0, "kbs.delete")]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.kbMeta,
							children: t(void 0, "kbs.stats", {
								total: kb.stats.total,
								sources: kb.stats.sourceCount
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.kbPath,
							children: kb.path
						}),
						kb.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.kbDesc,
							children: kb.description
						})
					]
				}, kb.id)),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.kbForm,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.kbFormTitle,
							children: t(void 0, "kbs.add")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							placeholder: t(void 0, "kbs.name"),
							value: name,
							onChange: (event) => setName(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							placeholder: t(void 0, "kbs.path"),
							value: path,
							onChange: (event) => setPath(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							placeholder: t(void 0, "kbs.description"),
							value: description,
							onChange: (event) => setDescription(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.run,
							disabled: busy || name.trim() === "",
							onClick: () => void create(),
							children: t(void 0, "kbs.create")
						})
					]
				})
			] });
		}
		function formatBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		}
		function CodeTab({ kbId }) {
			const [files, setFiles] = (0, react.useState)([]);
			const [preview, setPreview] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const fileInputRef = (0, react.useRef)(null);
			const load = (0, react.useCallback)(() => {
				api(`/api/dsh-knowledge/code${query({ kb: kbId })}`).then((data) => {
					setFiles(data.files);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const openPreview = (relPath) => {
				api(`/api/dsh-knowledge/code/content${query({
					kb: kbId,
					path: relPath
				})}`).then((data) => {
					setPreview({
						path: relPath,
						content: data.content
					});
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			};
			const removeFile = async (relPath) => {
				await api("/api/dsh-knowledge/code/delete", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						kb: kbId,
						path: relPath
					})
				});
				if (preview?.path === relPath) setPreview(null);
				load();
			};
			const uploadFiles = async (selected) => {
				if (selected === null || selected.length === 0) return;
				setBusy(true);
				setError(null);
				try {
					for (const file of Array.from(selected)) {
						const content = await file.text();
						const path = file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name;
						await api("/api/dsh-knowledge/code", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								kb: kbId,
								path,
								content
							})
						});
					}
					load();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(false);
					if (fileInputRef.current !== null) fileInputRef.current.value = "";
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							ref: fileInputRef,
							type: "file",
							multiple: true,
							className: panel_module_css_default.hiddenInput,
							onChange: (event) => void uploadFiles(event.target.files)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: panel_module_css_default.run,
							disabled: busy,
							onClick: () => fileInputRef.current?.click(),
							children: [busy ? "…" : "⬆ ", t(void 0, "code.upload")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.run,
							onClick: load,
							children: t(void 0, "refresh")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.hint,
							children: t(void 0, "code.count", { n: files.length })
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.note,
					children: t(void 0, "code.hint")
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				preview !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.detailHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.back,
						onClick: () => setPreview(null),
						children: t(void 0, "card.back")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.codePath,
						children: preview.path
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
					className: panel_module_css_default.codeBlock,
					children: preview.content
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					className: panel_module_css_default.table,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "文件" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "大小" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "操作" })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: files.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.fileRow,
							onClick: () => openPreview(file.relPath),
							children: file.relPath
						}) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							className: panel_module_css_default.mono,
							children: formatBytes(file.size)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.dangerSmall,
							onClick: () => void removeFile(file.relPath),
							children: "🗑"
						}) })
					] }, file.relPath)) })]
				}),
				files.length === 0 && preview === null && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "code.empty")
				})
			] });
		}
		const LOG_ACTIONS = [
			"all",
			"edit",
			"ingest",
			"import"
		];
		function LogBoard({ kbId }) {
			const [entries, setEntries] = (0, react.useState)([]);
			const [total, setTotal] = (0, react.useState)(0);
			const [filter, setFilter] = (0, react.useState)("all");
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)((action) => {
				api(`/api/dsh-knowledge/log${query({
					kb: kbId,
					action
				})}`).then((data) => {
					setEntries(data.entries);
					setTotal(data.total);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load(filter);
			}, [load, filter]);
			const actionLabel = (action) => {
				if (action === "edit") return "✏️";
				if (action === "ingest") return "📥";
				if (action === "import") return "📦";
				return "·";
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [LOG_ACTIONS.map((action) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: action === filter ? panel_module_css_default.chipActive : panel_module_css_default.chip,
						onClick: () => setFilter(action),
						children: action === "all" ? t(void 0, "log.all") : action
					}, action)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.hint,
						children: t(void 0, "log.count", {
							n: entries.length,
							total
						})
					})]
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				entries.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "log.empty")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.logList,
					children: entries.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.logRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.logIcon,
								children: actionLabel(entry.action)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.logDate,
								children: entry.date
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: entry.action === "edit" ? panel_module_css_default.logActionEdit : panel_module_css_default.logAction,
								children: entry.action
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.logSubject,
								children: entry.subject
							}),
							(entry.notes ?? []).map((note, noteIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.logNote,
								children: note
							}, noteIndex))
						]
					}, `${entry.date}-${entry.action}-${index}`))
				})
			] });
		}
		const REVIEW_STATUSES = [
			"all",
			"pending",
			"resolved",
			"skipped"
		];
		function ReviewsTab({ kbId }) {
			const [items, setItems] = (0, react.useState)([]);
			const [pending, setPending] = (0, react.useState)(0);
			const [filter, setFilter] = (0, react.useState)("pending");
			const [busyId, setBusyId] = (0, react.useState)(null);
			const [auditing, setAuditing] = (0, react.useState)(false);
			const [auditResult, setAuditResult] = (0, react.useState)(null);
			const [deepPrompt, setDeepPrompt] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const load = (0, react.useCallback)((status) => {
				api(`/api/dsh-knowledge/reviews${query({
					kb: kbId,
					status
				})}`).then((data) => {
					setItems(data.items);
					setPending(data.pending);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load(filter);
			}, [load, filter]);
			/** Run the deterministic audit over existing cards (duplicates + missing pages). */
			const runAudit = async () => {
				setAuditing(true);
				setError(null);
				try {
					const { submitted, skippedExisting, summary, deepAuditPrompt } = (await api("/api/dsh-knowledge/audit", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kb: kbId })
					})).result;
					setAuditResult(t(void 0, "audit.result", {
						n: submitted.length,
						dup: summary.duplicate,
						missing: summary.missingPage,
						skipped: skippedExisting
					}));
					setDeepPrompt(deepAuditPrompt);
					load(filter);
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setAuditing(false);
				}
			};
			const copyDeepPrompt = async () => {
				try {
					let prompt = deepPrompt;
					if (prompt === null) {
						prompt = (await api(`/api/dsh-knowledge/audit-prompt${query({ kb: kbId })}`)).prompt;
						setDeepPrompt(prompt);
					}
					await navigator.clipboard.writeText(prompt);
					setAuditResult(t(void 0, "audit.copied"));
					window.setTimeout(() => setAuditResult(null), 3e3);
				} catch {
					if (deepPrompt !== null) window.prompt(t(void 0, "audit.copied"), deepPrompt);
				}
			};
			const resolve = async (id, status, resolution) => {
				setBusyId(id);
				try {
					await api("/api/dsh-knowledge/reviews/resolve", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							kb: kbId,
							id,
							status,
							resolution
						})
					});
					load(filter);
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusyId(null);
				}
			};
			/** 深度研究指令：agent 拿 searchQuery 做网络搜索并沉淀卡片。 */
			const buildResearchPrompt = (item) => [
				`请对以下审核项做深度研究（网络搜索），并把结论沉淀为知识卡片：`,
				`主题: ${item.title}`,
				`背景: ${item.summary}`,
				item.searchQuery !== void 0 && item.searchQuery !== "" ? `搜索方向: ${item.searchQuery}` : "",
				item.source !== void 0 ? `来源: ${item.source}` : "",
				`流程：用 web 搜索查「${item.searchQuery ?? item.title}」→ 综合结论 → 用 wiki_commit 创建卡片（frontmatter 含 type/description/tags/sources，正文 [[wikilink]] 互链）→ 完成后把该审核项标记为已完成（wiki_reviews 查看）。`
			].filter((line) => line !== "").join("\n");
			/** 合并指令：agent 读取涉及卡片判断是否同一事物并合并。 */
			const buildMergePrompt = (item) => [
				`请处理以下疑似重复的审核项：`,
				`主题: ${item.title}`,
				`判断要点: ${item.summary}`,
				item.source !== void 0 ? `涉及卡片: ${item.source}` : "",
				`流程：wiki_read 读取涉及卡片 → 判断是否同一事物 → 若是，保留信息更完整的卡片（可用 wiki_edit_card 补充），多余的用 wiki_commit 重建或直接删除 → 完成后把该审核项标记为已完成。`
			].filter((line) => line !== "").join("\n");
			const copyText = async (text) => {
				try {
					await navigator.clipboard.writeText(text);
					setAuditResult(t(void 0, "audit.copied"));
					window.setTimeout(() => setAuditResult(null), 3e3);
				} catch {
					window.prompt(t(void 0, "audit.copied"), text);
				}
			};
			const [creating, setCreating] = (0, react.useState)(null);
			const [draftType, setDraftType] = (0, react.useState)("concept");
			const [draftTitle, setDraftTitle] = (0, react.useState)("");
			const [draftDesc, setDraftDesc] = (0, react.useState)("");
			const [draftBody, setDraftBody] = (0, react.useState)("");
			const [savingDraft, setSavingDraft] = (0, react.useState)(false);
			const openCreate = (item) => {
				setCreating(item);
				setDraftType("concept");
				setDraftTitle(item.title);
				setDraftDesc(item.summary);
				setDraftBody([
					`<!-- 由审核项（${item.kind}）创建，请补充完善。 -->`,
					"",
					item.summary,
					"",
					"## 待补充",
					"",
					"- ",
					item.searchQuery !== void 0 && item.searchQuery !== "" ? `\n> 参考搜索: ${item.searchQuery}` : ""
				].join("\n"));
			};
			const saveDraft = async () => {
				if (creating === null) return;
				setSavingDraft(true);
				setError(null);
				try {
					await api("/api/dsh-knowledge/commit", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							kb: kbId,
							pages: [{
								type: draftType,
								title: draftTitle,
								description: draftDesc,
								body: draftBody
							}],
							sourceFiles: []
						})
					});
					await resolve(creating.id, "resolved", "已创建页面");
					setCreating(null);
					load(filter);
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setSavingDraft(false);
				}
			};
			if (creating !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.detailHeader,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.back,
						onClick: () => setCreating(null),
						children: t(void 0, "card.cancel")
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: panel_module_css_default.detailTitle,
					children: t(void 0, "review.create.title")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.editForm,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [t(void 0, "card.title"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: draftTitle,
								onChange: (event) => setDraftTitle(event.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [t(void 0, "card.desc"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: draftDesc,
								onChange: (event) => setDraftDesc(event.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: ["type", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: panel_module_css_default.select,
								value: draftType,
								onChange: (event) => setDraftType(event.target.value),
								children: CREATE_TYPES.map((type) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: type,
									children: type
								}, type))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.editLabel,
							children: [t(void 0, "card.body"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.editorTextarea,
								rows: 12,
								value: draftBody,
								onChange: (event) => setDraftBody(event.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.editActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.run,
								disabled: savingDraft || draftTitle.trim() === "",
								onClick: () => void saveDraft(),
								children: savingDraft ? "…" : t(void 0, "review.create.save")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.runSmall,
								onClick: () => setCreating(null),
								children: t(void 0, "card.cancel")
							})]
						})
					]
				})
			] });
			const kindLabel = (kind) => {
				if (kind === "contradiction") return "⚠️ 矛盾";
				if (kind === "duplicate") return "🔁 疑似重复";
				if (kind === "missing-page") return "📄 缺失页面";
				if (kind === "suggestion") return "💡 建议";
				return kind;
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [REVIEW_STATUSES.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: status === filter ? panel_module_css_default.chipActive : panel_module_css_default.chip,
						onClick: () => setFilter(status),
						children: status === "all" ? t(void 0, "review.all") : status === "pending" ? t(void 0, "review.pending", { n: pending }) : status
					}, status)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.hint,
						children: t(void 0, "review.hint")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.auditBar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: panel_module_css_default.run,
							disabled: auditing,
							onClick: () => void runAudit(),
							children: [auditing ? "…" : "🔍 ", t(void 0, "audit.run")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: panel_module_css_default.runSmall,
							onClick: () => void copyDeepPrompt(),
							children: t(void 0, "audit.deep")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.hint,
							children: t(void 0, "audit.hint")
						})
					]
				}),
				auditResult !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.lintResult,
					children: auditResult
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				items.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "review.empty")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.reviewList,
					children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: item.status === "pending" ? panel_module_css_default.reviewItem : `${panel_module_css_default.reviewItem} ${panel_module_css_default.reviewDone}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.reviewTop,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: item.kind === "contradiction" ? panel_module_css_default.reviewKindDanger : item.kind === "suggestion" ? panel_module_css_default.reviewKindWarn : panel_module_css_default.reviewKind,
									children: kindLabel(item.kind)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.reviewStatus,
									children: item.status === "pending" ? t(void 0, "review.status.pending") : item.status === "skipped" ? t(void 0, "review.status.skipped") : t(void 0, "review.status.resolved")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.reviewTitle,
								children: item.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.reviewSummary,
								children: item.summary
							}),
							item.source !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.reviewSource,
								children: ["来源: ", item.source]
							}),
							item.searchQuery !== void 0 && item.searchQuery !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.reviewSearch,
								children: ["🔎 ", item.searchQuery]
							}),
							item.status === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.reviewActions,
								children: [item.options.map((option) => {
									if (option === "创建页面") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.runSmall,
										disabled: busyId === item.id,
										onClick: () => openCreate(item),
										children: option
									}, option);
									if (option === "深度研究") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.runSmall,
										disabled: busyId === item.id,
										onClick: () => void copyText(buildResearchPrompt(item)),
										children: option
									}, option);
									if (option === "合并页面") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.runSmall,
										disabled: busyId === item.id,
										onClick: () => void copyText(buildMergePrompt(item)),
										children: option
									}, option);
									if (option === "跳过") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: panel_module_css_default.runSmall,
										disabled: busyId === item.id,
										onClick: () => void resolve(item.id, "skipped"),
										children: option
									}, option);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.tag,
										children: option
									}, option);
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.runSmall,
									disabled: busyId === item.id,
									onClick: () => void resolve(item.id, "resolved"),
									children: t(void 0, "review.resolve")
								})]
							})
						]
					}, item.id))
				})
			] });
		}
		function formatDate(timestamp) {
			return new Date(timestamp).toLocaleString();
		}
		function TrashTab({ kbId, onKbChanged }) {
			const [cards, setCards] = (0, react.useState)([]);
			const [kbs, setKbs] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [note, setNote] = (0, react.useState)(null);
			const load = (0, react.useCallback)(() => {
				api(`/api/dsh-knowledge/trash${query({ kb: kbId })}`).then((data) => {
					setCards(data.cards);
					setKbs(data.kbs);
					setError(null);
				}).catch((err) => setError(String(err.message ?? err)));
			}, [kbId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			const flash = (message) => {
				setNote(message);
				window.setTimeout(() => setNote(null), 2500);
			};
			const restoreCard = async (card) => {
				setBusy(`c:${card.slug}`);
				setError(null);
				try {
					await api("/api/dsh-knowledge/card/restore", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							kb: kbId,
							slug: card.slug
						})
					});
					flash(t(void 0, "trash.restored"));
					load();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(null);
				}
			};
			const purgeCard = async (card) => {
				if (!window.confirm(t(void 0, "trash.purge.confirm", { title: card.title }))) return;
				setBusy(`c:${card.slug}`);
				setError(null);
				try {
					await api("/api/dsh-knowledge/card/purge", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							kb: kbId,
							slug: card.slug
						})
					});
					flash(t(void 0, "trash.purged"));
					load();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(null);
				}
			};
			const restoreKb = async (kb) => {
				setBusy(`k:${kb.id}`);
				setError(null);
				try {
					await api("/api/dsh-knowledge/kbs/restore", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kb: kb.id })
					});
					flash(t(void 0, "trash.restored"));
					load();
					onKbChanged();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(null);
				}
			};
			const purgeKb = async (kb) => {
				if (!window.confirm(t(void 0, "trash.purge.confirm", { title: kb.name }))) return;
				setBusy(`k:${kb.id}`);
				setError(null);
				try {
					await api("/api/dsh-knowledge/kbs/purge", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kb: kb.id })
					});
					flash(t(void 0, "trash.purged"));
					load();
					onKbChanged();
				} catch (err) {
					setError(String(err.message ?? err));
				} finally {
					setBusy(null);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.controls,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.hint,
						children: t(void 0, "trash.hint")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: panel_module_css_default.run,
						onClick: load,
						children: t(void 0, "refresh")
					})]
				}),
				note !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.lintResult,
					children: note
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					children: t(void 0, "error.load", { message: error })
				}),
				kbs.length === 0 && cards.length === 0 && error === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t(void 0, "trash.empty")
				}),
				kbs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
					className: panel_module_css_default.sectionTitle,
					children: [
						"📚 ",
						t(void 0, "trash.kbs"),
						"（",
						kbs.length,
						"）"
					]
				}), kbs.map((kb) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.trashItem,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashTop,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.trashTitle,
								children: kb.name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.trashMeta,
								children: [
									kb.id,
									" · ",
									t(void 0, "trash.deletedAt"),
									" ",
									formatDate(kb.deletedAt)
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashMeta,
							children: ["📁 ", kb.originalPath]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.runSmall,
								disabled: busy === `k:${kb.id}`,
								onClick: () => void restoreKb(kb),
								children: ["↩ ", t(void 0, "trash.restore")]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dangerSmall,
								disabled: busy === `k:${kb.id}`,
								onClick: () => void purgeKb(kb),
								children: t(void 0, "trash.purge")
							})]
						})
					]
				}, kb.id))] }),
				cards.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
					className: panel_module_css_default.sectionTitle,
					children: [
						"🗂 ",
						t(void 0, "trash.cards"),
						"（",
						cards.length,
						"）"
					]
				}), cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.trashItem,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashTop,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.trashTitle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TypeBadge, { type: card.type }),
									" ",
									card.title
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.trashMeta,
								children: [
									t(void 0, "trash.deletedAt"),
									" ",
									formatDate(card.deletedAt)
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashMeta,
							children: ["wiki/", card.originalPath]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.trashActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: panel_module_css_default.runSmall,
								disabled: busy === `c:${card.slug}`,
								onClick: () => void restoreCard(card),
								children: ["↩ ", t(void 0, "trash.restore")]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.dangerSmall,
								disabled: busy === `c:${card.slug}`,
								onClick: () => void purgeCard(card),
								children: t(void 0, "trash.purge")
							})]
						})
					]
				}, card.slug))] })
			] });
		}
		function KnowledgePanel({ controller }) {
			const [kbs, setKbs] = (0, react.useState)([]);
			const [kbId, setKbId] = (0, react.useState)("");
			const [tab, setTab] = (0, react.useState)("cards");
			const [selected, setSelected] = (0, react.useState)(null);
			const [lintResult, setLintResult] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const loadKbs = (0, react.useCallback)(() => {
				api("/api/dsh-knowledge/kbs").then((data) => {
					setKbs(data.kbs);
					if (data.kbs.length === 0) return;
					const stored = window.localStorage.getItem(KB_STORAGE_KEY);
					const preferred = data.kbs.some((kb) => kb.id === stored) ? stored ?? "" : "";
					const active = preferred !== "" ? preferred : data.kbs[0].id;
					setKbId((current) => current !== "" ? current : active);
					if (preferred !== "") setKbId(preferred);
				}).catch((err) => setError(String(err.message ?? err)));
			}, []);
			(0, react.useEffect)(() => {
				loadKbs();
			}, [loadKbs]);
			const selectKb = (id) => {
				setKbId(id);
				window.localStorage.setItem(KB_STORAGE_KEY, id);
				setSelected(null);
			};
			/** After a KB is deleted: drop its local preference and fall back to the first remaining KB. */
			const handleKbDeleted = (deletedId) => {
				if (kbId === deletedId) window.localStorage.removeItem(KB_STORAGE_KEY);
				setKbId((current) => {
					if (current !== deletedId) return current;
					const remaining = kbs.filter((kb) => kb.id !== deletedId);
					return remaining.length > 0 ? remaining[0].id : "";
				});
				loadKbs();
			};
			const openCard = (card) => setSelected(card);
			const closeCard = () => setSelected(null);
			const runLint = async () => {
				if (kbId === "") return;
				try {
					const data = await api("/api/dsh-knowledge/lint", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kb: kbId })
					});
					const errors = data.issues.filter((issue) => issue.severity === "error").length;
					const warns = data.issues.filter((issue) => issue.severity === "warn").length;
					setLintResult(t(void 0, "lint.result", {
						errors,
						warns
					}));
					window.setTimeout(() => setLintResult(null), 4e3);
				} catch (err) {
					setLintResult(String(err.message ?? err));
				}
			};
			const activeKb = kbs.find((kb) => kb.id === kbId);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							className: panel_module_css_default.title,
							children: ["📇 ", t(void 0, "panel.title")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.headerActions,
							children: [kbs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								className: panel_module_css_default.select,
								value: kbId,
								onChange: (event) => selectKb(event.target.value),
								children: kbs.map((kb) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: kb.id,
									children: kb.name
								}, kb.id))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: panel_module_css_default.close,
								title: t(void 0, "close"),
								onClick: () => controller.close(),
								children: "✕"
							})]
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						children: t(void 0, "error.load", { message: error })
					}),
					lintResult !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.lintResult,
						children: lintResult
					}),
					kbs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KbsTab, {
						kbs,
						activeId: kbId,
						onSelect: selectKb,
						onCreated: loadKbs,
						onDeleted: handleKbDeleted
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.tabs,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "cards" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("cards"),
									children: t(void 0, "tab.cards")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "sources" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("sources"),
									children: t(void 0, "tab.sources")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "code" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("code"),
									children: t(void 0, "tab.code")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "board" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("board"),
									children: t(void 0, "tab.board")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "review" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("review"),
									children: t(void 0, "tab.review")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "kbs" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("kbs"),
									children: t(void 0, "tab.kbs")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tab === "trash" ? panel_module_css_default.tabActive : panel_module_css_default.tab,
									onClick: () => setTab("trash"),
									children: t(void 0, "tab.trash")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.tabSpacer }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: panel_module_css_default.runSmall,
									onClick: () => void runLint(),
									children: t(void 0, "lint.run")
								})
							]
						}),
						tab === "cards" && (selected === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardsTab, {
							kbId,
							onOpenCard: openCard
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardDetail, {
							kbId,
							slug: selected.slug,
							onBack: closeCard,
							onOpenCard: openCard,
							onDeleted: closeCard
						})),
						tab === "sources" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourcesTab, {
							kbId,
							kbName: activeKb?.name ?? kbId
						}),
						tab === "code" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodeTab, { kbId }),
						tab === "board" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogBoard, { kbId }),
						tab === "review" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewsTab, { kbId }),
						tab === "kbs" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KbsTab, {
							kbs,
							activeId: kbId,
							onSelect: selectKb,
							onCreated: loadKbs,
							onDeleted: handleKbDeleted
						}),
						tab === "trash" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashTab, {
							kbId,
							onKbChanged: loadKbs
						})
					] })
				]
			});
		}
		//#endregion
		//#region src/client/board-mount.tsx
		/**
		* Panel mounting: takes over the center column at the DOM level (the
		* conversation slot is single-occupant), appending a container and rendering
		* the React panel into it. Visibility rides a data attribute on <html>.
		* Cross-plugin eviction follows dsh-ssh: opening this panel removes the
		* sibling task-board attr and announces via dsh-panel-activate, and being
		* announced by a sibling closes us.
		* @module dsh-knowledge-cards/client/board-mount
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"], [class*=\"centerCol\"]";
		const ACTIVE_ATTR = "data-dsh-knowledge-active";
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "knowledge-cards";
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		function mountPanel(controller) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshKnowledgeView = "";
				container.dataset.dshPlugin = "knowledge-cards";
				container.className = panel_module_css_default.view;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(KnowledgePanel, { controller }));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().open) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const onOtherActivate = (event) => {
				if (event.detail !== PANEL_NAME && controller.getSnapshot().open) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().open) return;
				const target = event.target;
				if (target !== null && target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: locale for the surface copy. */
		const inject = ["locale"];
		/** Stable plugin name (client half). */
		const name = "dsh-knowledge-cards";
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-knowledge-cards: dictionaries");
			ctx.effect(() => {
				const controller = new PanelController();
				const disposers = [];
				try {
					disposers.push(mountSidebarEntry(controller));
					disposers.push(mountPanel(controller));
				} catch (error) {
					console.warn("[dsh-knowledge-cards] mount failed:", error);
				}
				return () => {
					for (const dispose of disposers.splice(0)) dispose();
				};
			}, "dsh-knowledge-cards: wiring");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map