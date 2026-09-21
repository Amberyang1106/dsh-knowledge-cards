import { isManagedFrontmatterKey, parseFrontmatter } from "../core/frontmatter.js";
import { searchCards } from "../core/search.js";
import { D as purgeKb, E as purgeCard, N as restoreCard, O as readCard, P as restoreKb, S as listTrash, T as pendingSources, _ as listKbSummaries, a as createKb, b as listReviews, f as getKb, g as listCodeFiles, h as listCards, k as readCodeFile, l as deleteKb, m as kbSummary, n as commitPages, p as importCards, s as deleteCard, t as addReview, u as editCard, x as listSources } from "../store-Cago3cTl.js";
import { auditKb } from "./audit.js";
import { lintKb, renderLintReport } from "./lint.js";
import { promises } from "node:fs";
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/host/tools.ts
/**
* Agent tools — the cross-project context bridge. Registered globally via
* ctx.tools.register, so ANY dsh session (a finance project, a coding task,
* a different workspace) can pull domain knowledge in as context:
*
*   wiki_kbs()               → what knowledge bases exist
*   wiki_search(query, kb?)  → top matching card summaries (cheap)
*   wiki_read(slug, kb?)     → full card content (frontmatter + body)
*   wiki_ingest(kb?, source?)→ source status, or source content + KB context
*                              for the two-step ingest (analyze → generate)
*   wiki_commit(kb, pages, sourceFiles?) → write agent-generated cards with
*                              deterministic index/log/overview maintenance
*   wiki_lint(kb?)           → health report (broken links, orphans, ...)
*
* The LLM work stays with the agent (Karpathy: "the LLM writes, the human
* curates"); the plugin only does deterministic bookkeeping — frontmatter
* validation, index/log/overview rebuilds, SHA256 incremental cache.
* @module dsh-knowledge-cards/host/tools
*/
function text(value) {
	return [{
		type: "text",
		text: value
	}];
}
/** Resolve the kb argument: explicit id, env default, or the first KB. */
async function resolveKb(kbId) {
	const kbs = await listKbSummaries();
	if (kbs.length === 0) return null;
	if (kbId !== void 0 && kbId !== "") {
		const hit = kbs.find((kb) => kb.id === kbId);
		return hit !== void 0 ? {
			id: hit.id,
			name: hit.name
		} : null;
	}
	const env = process.env.DSH_KNOWLEDGE_CARDS_KB;
	if (env !== void 0 && env !== "") {
		const hit = kbs.find((kb) => kb.id === env);
		if (hit !== void 0) return {
			id: hit.id,
			name: hit.name
		};
	}
	return {
		id: kbs[0].id,
		name: kbs[0].name
	};
}
function renderCardSummary(card) {
	const tags = card.tags.length > 0 ? ` tags:[${card.tags.join(",")}]` : "";
	const sources = card.sources.length > 0 ? ` sources:[${card.sources.join(",")}]` : "";
	const related = card.related.length > 0 ? ` related:[${card.related.slice(0, 5).join(",")}]` : "";
	return `- [${card.type}] ${card.slug} — ${card.title}${card.description !== void 0 ? `\n  ${card.description}` : ""}${tags}${sources}${related}`;
}
function wikiKbsTool() {
	return defineTool({
		name: "wiki_kbs",
		description: "列出本机 dsh-knowledge-cards 插件管理的全部知识库（id / 名称 / 路径 / 卡片与资料统计）。做其他项目前先调它确认知识库，再 wiki_search / wiki_read 取知识作为上下文。Triggers: 知识库、知识卡片、wiki、KM。",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { kbs: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							id: {
								type: "string",
								required: true
							},
							name: {
								type: "string",
								required: true
							},
							path: {
								type: "string",
								required: true
							},
							description: { type: "string" },
							total: {
								type: "integer",
								required: true
							},
							sourceCount: {
								type: "integer",
								required: true
							}
						}
					}
				} }
			},
			render: (_args, value) => {
				if (value.kbs.length === 0) return text("尚无知识库。可在 GUI 侧边栏「知识卡片」面板的「知识库」标签创建，或告诉 agent 创建。");
				return text(value.kbs.map((kb) => `- ${kb.id} | ${kb.name} | ${kb.path} | ${kb.total} cards / ${kb.sourceCount} sources`).join("\n"));
			}
		},
		async execute() {
			return { kbs: (await listKbSummaries()).map((summary) => ({
				id: summary.id,
				name: summary.name,
				path: summary.path,
				description: summary.description,
				total: summary.stats.total,
				sourceCount: summary.stats.sourceCount
			})) };
		}
	});
}
function wikiSearchTool() {
	return defineTool({
		name: "wiki_search",
		description: "在知识卡片库中检索与 query 相关的卡片摘要（slug / type / title / description / tags / sources / related）。做其他项目需要领域知识时先搜这里，命中后再用 wiki_read 读全文作为上下文。kb 省略时用默认知识库。Triggers: 查知识库、知识卡片、wiki 检索。",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "检索词（支持中文与英文，标题/描述/标签/正文加权匹配）。"
			},
			kb: {
				type: "string",
				description: "知识库 id（wiki_kbs 查看；省略用默认库）。"
			},
			limit: {
				type: "integer",
				description: "返回条数上限（默认 10）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					total: {
						type: "integer",
						required: true
					},
					cards: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								slug: {
									type: "string",
									required: true
								},
								type: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								description: { type: "string" },
								tags: {
									type: "array",
									items: { type: "string" },
									required: true
								},
								sources: {
									type: "array",
									items: { type: "string" },
									required: true
								},
								related: {
									type: "array",
									items: { type: "string" },
									required: true
								},
								score: {
									type: "number",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				if (value.cards.length === 0) return text(`知识库「${value.kb}」没有匹配的卡片（命中 ${value.total}）。可尝试换检索词，或 wiki_ingest 摄入相关资料。`);
				return text(`知识库「${value.kb}」命中 ${value.total} 条（显示 ${value.cards.length}）：\n` + value.cards.map(renderCardSummary).join("\n"));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先创建知识库（GUI 面板「知识库」标签，或让 agent 用 wiki 工具创建）。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const cards = await listCards(kb);
			const limit = Number.isFinite(args.limit) && (args.limit ?? 0) > 0 ? Math.trunc(args.limit ?? 10) : 10;
			const hits = searchCards(cards, args.query, Math.min(limit, 50), (card) => card.description ?? "");
			return {
				kb: resolved.id,
				total: hits.length,
				cards: hits.map((hit) => ({
					slug: hit.card.slug,
					type: hit.card.type,
					title: hit.card.title,
					description: hit.card.description,
					tags: hit.card.tags,
					sources: hit.card.sources,
					related: hit.card.related,
					score: Math.round(hit.score * 100) / 100
				}))
			};
		}
	});
}
function wikiReadTool() {
	return defineTool({
		name: "wiki_read",
		description: "读取一张知识卡片的完整内容（YAML frontmatter + Markdown 正文，含 [[wikilink]] 交叉引用），作为当前任务的知识上下文。slug 来自 wiki_search / wiki_ingest / wiki_lint 的输出。kb 省略时用默认知识库。Triggers: 读知识卡片、卡片全文、wiki 页面。",
		parameters: {
			slug: {
				type: "string",
				required: true,
				description: "卡片 slug（文件名 stem 或标题）。"
			},
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					slug: {
						type: "string",
						required: true
					},
					card: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							path: {
								type: "string",
								required: true
							},
							type: {
								type: "string",
								required: true
							},
							title: {
								type: "string",
								required: true
							},
							description: { type: "string" },
							tags: {
								type: "array",
								items: { type: "string" },
								required: true
							},
							related: {
								type: "array",
								items: { type: "string" },
								required: true
							},
							sources: {
								type: "array",
								items: { type: "string" },
								required: true
							},
							raw: {
								type: "string",
								required: true
							}
						}
					}
				}
			},
			render: (_args, value) => {
				return text(`[wiki_read] 知识库「${value.kb}」卡片 ${value.slug}（${value.card.path}）:\n\n${value.card.raw}`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先创建知识库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const card = await readCard(kb, args.slug);
			if (card === null) throw new Error(`卡片不存在: ${args.slug}（先 wiki_search 确认 slug）`);
			return {
				kb: resolved.id,
				slug: args.slug,
				card: {
					path: card.path,
					type: card.type,
					title: card.title,
					description: card.description,
					tags: card.tags,
					related: card.related,
					sources: card.sources,
					raw: card.raw
				}
			};
		}
	});
}
const SOURCE_CONTENT_CAP = 6e4;
const CONTEXT_CAP = 8e3;
async function readContextFile(kbPath, name) {
	try {
		const content = await promises.readFile(join(kbPath, name), "utf8");
		return content.length > CONTEXT_CAP ? `${content.slice(0, CONTEXT_CAP)}\n…[截断]` : content;
	} catch {
		return "";
	}
}
function wikiIngestTool() {
	return defineTool({
		name: "wiki_ingest",
		description: "知识摄入准备（llm_wiki 两步摄入的第一步）。不带 source 时列出待摄入资料（新增/变更，SHA256 增量缓存）；带 source 时返回该资料全文 + 知识库 schema/purpose/索引上下文，并要求你按两步法分析后调用 wiki_commit 生成卡片（第二步）。摄入流程：先 wiki_ingest 拿上下文 → 分析关键实体/概念/与现有卡片的关联 → 调 wiki_commit 提交生成的卡片；分析发现矛盾/疑似重复/缺失页面/值得深挖的点时，先用 wiki_review_submit 提交审核项（预定义操作 + 预生成搜索查询），不擅自下结论。Triggers: 摄入、建卡片、消化资料。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			source: {
				type: "string",
				description: "可选：raw/sources/ 下的资料相对路径（如 \"policy-2024.pdf\" 或 \"sub/folder.docx\"）。省略则只列待摄入清单。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					pending: {
						type: "integer",
						required: true
					},
					sources: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								relPath: {
									type: "string",
									required: true
								},
								status: {
									type: "string",
									required: true
								},
								sha256: {
									type: "string",
									required: true
								},
								lastIngestedAt: { type: "integer" },
								pages: {
									type: "array",
									items: { type: "string" },
									required: true
								}
							}
						}
					},
					sourceContent: { type: "string" },
					context: { type: "string" }
				}
			},
			render: (_args, value) => {
				const header = `知识库「${value.kb}」资料状态（待摄入 ${value.pending}）：\n` + value.sources.map((source) => `- ${source.status} ${source.relPath} (${source.sha256.slice(0, 10)}…)`).join("\n");
				if (value.sourceContent === void 0) return text(header + "\n\n未指定 source。请先选定一份待摄入资料，或用文件工具把资料放入 raw/sources/ 后重试。");
				return text(header + "\n\n=== 资料全文（截断）===\n" + value.sourceContent + "\n\n=== 知识库上下文 ===\n" + (value.context ?? ""));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先创建知识库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const sources = await listSources(kb);
			const pending = await pendingSources(kb);
			let sourceContent;
			let context = "";
			const sourceArg = args.source;
			if (sourceArg !== void 0 && sourceArg !== "") {
				const match = sources.find((source) => source.relPath === sourceArg || source.relPath.endsWith(sourceArg));
				if (match === void 0) throw new Error(`raw/sources/ 下找不到 "${sourceArg}"。可用资料: ${sources.map((source) => source.relPath).join(", ") || "（空）"}`);
				const raw = await promises.readFile(join(kb.path, "raw", "sources", match.relPath), "utf8");
				sourceContent = raw.length > SOURCE_CONTENT_CAP ? `${raw.slice(0, SOURCE_CONTENT_CAP)}\n…[内容已截断]` : raw;
				context = [
					await readContextFile(kb.path, "schema.md"),
					await readContextFile(kb.path, "purpose.md"),
					`## 现有索引（index.md）\n${await readContextFile(join(kb.path, "wiki"), "index.md")}`
				].filter((part) => part !== "").join("\n\n");
			}
			return {
				kb: resolved.id,
				pending: pending.length,
				sources: sources.map((source) => ({
					relPath: source.relPath,
					status: source.status,
					sha256: source.sha256,
					lastIngestedAt: source.lastIngestedAt,
					pages: source.pages
				})),
				sourceContent,
				context: context !== "" ? context : void 0
			};
		}
	});
}
function wikiCommitTool() {
	return defineTool({
		name: "wiki_commit",
		description: "知识写入（llm_wiki 两步摄入的第二步）：把 agent 分析后生成的卡片页面写入知识库 wiki/，自动校验 frontmatter、更新 index.md / log.md / overview.md，并按 sourceFiles 更新 SHA256 增量缓存。每张卡片 {type, title, description?, tags?, related?, sources?, body, path?}；type ∈ entity|concept|source|query|comparison|synthesis（或 schema 自定义），related 用裸 slug，正文用 [[wikilink]] 交叉引用。先 wiki_ingest 分析再 commit。Triggers: 写卡片、提交页面、建 wiki 页。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			pages: {
				type: "array",
				required: true,
				description: "要写入的卡片页面列表（1-20 张）。",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						type: {
							type: "string",
							required: true
						},
						title: {
							type: "string",
							required: true
						},
						description: { type: "string" },
						tags: {
							type: "array",
							items: { type: "string" }
						},
						related: {
							type: "array",
							items: { type: "string" }
						},
						sources: {
							type: "array",
							items: { type: "string" }
						},
						body: {
							type: "string",
							required: true
						},
						path: { type: "string" }
					}
				}
			},
			sourceFiles: {
				type: "array",
				items: { type: "string" },
				description: "本次摄入涉及的 raw/sources/ 资料相对路径，用于标记增量缓存。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					created: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					updated: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					logEntry: {
						type: "string",
						required: true
					},
					cachedSources: {
						type: "array",
						items: { type: "string" },
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`知识库「${value.kb}」提交完成：新建 ${value.created.length} 页（${value.created.join(", ") || "-"}），更新 ${value.updated.length} 页（${value.updated.join(", ") || "-"}）；${value.logEntry}；缓存标记 ${value.cachedSources.length} 个资料源。`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先创建知识库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			if (!Array.isArray(args.pages) || args.pages.length === 0) throw new Error("pages 不能为空：至少提供一张 {type,title,body} 卡片。");
			if (args.pages.length > 20) throw new Error("单次 commit 最多 20 张卡片。");
			const result = await commitPages(kb, args.pages, args.sourceFiles ?? []);
			return {
				kb: resolved.id,
				created: result.created,
				updated: result.updated,
				logEntry: result.logEntry,
				cachedSources: result.cachedSources
			};
		}
	});
}
function wikiLintTool() {
	return defineTool({
		name: "wiki_lint",
		description: "知识库健康检查（llm_wiki 的 lint 操作）：断链 [[wikilink]]、孤立页面、缺 description、缺 frontmatter、正文为空、引用不存在的原始资料。发现问题后可让 agent 修复后再次 lint。Triggers: lint、健康检查、检查知识库。",
		parameters: { kb: {
			type: "string",
			description: "知识库 id（省略用默认库）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					report: {
						type: "string",
						required: true
					},
					errors: {
						type: "integer",
						required: true
					},
					warns: {
						type: "integer",
						required: true
					}
				}
			},
			render: (_args, value) => text(value.report)
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先创建知识库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const issues = await lintKb(kb);
			const summary = await kbSummary(kb);
			return {
				kb: resolved.id,
				report: renderLintReport(summary.name, issues),
				errors: issues.filter((issue) => issue.severity === "error").length,
				warns: issues.filter((issue) => issue.severity === "warn").length
			};
		}
	});
}
function wikiCreateKbTool() {
	return defineTool({
		name: "wiki_create_kb",
		description: "新建一个知识库（多库场景）：自动生成 llm_wiki 三层结构（raw/sources、wiki/ 各类型目录、schema.md、purpose.md、index/log/overview）。path 省略时用默认根目录 ~/.dsh/knowledge-cards/kbs/<id>。创建后即可用 wiki_import_cards 导入现成卡片，或用 wiki_ingest → wiki_commit 摄入原始资料。Triggers: 建知识库、新建库、新开一个知识库。",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "知识库名称（如 \"财务政策库\"）。"
			},
			path: {
				type: "string",
				description: "可选：知识库目录绝对路径；省略用默认根。"
			},
			description: {
				type: "string",
				description: "可选：一句话描述。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { kb: {
					type: "object",
					required: true,
					additionalProperties: false,
					properties: {
						id: {
							type: "string",
							required: true
						},
						name: {
							type: "string",
							required: true
						},
						path: {
							type: "string",
							required: true
						},
						total: {
							type: "integer",
							required: true
						}
					}
				} }
			},
			render: (_args, value) => {
				return text(`知识库「${value.kb.name}」(id=${value.kb.id}) 已创建 @ ${value.kb.path}（${value.kb.total} 张卡片）。可用 wiki_import_cards 导入现成卡片，或把原始资料放入 raw/sources/ 后用 wiki_ingest → wiki_commit 摄入。`);
			}
		},
		async execute(args) {
			const kb = await createKb({
				name: args.name,
				path: args.path,
				description: args.description
			});
			const summary = await kbSummary(kb);
			return { kb: {
				id: kb.id,
				name: kb.name,
				path: kb.path,
				total: summary.stats.total
			} };
		}
	});
}
function wikiImportCardsTool() {
	return defineTool({
		name: "wiki_import_cards",
		description: "批量导入已经切分好的知识卡片（带 YAML frontmatter 的 markdown 文件）到知识库 —— 纯确定性操作，不消耗 LLM：解析 frontmatter（type/title/description/tags/related/sources）、按类型写入 wiki/ 对应目录（保留原文件名作 slug 与 created/updated）、自动重建 index.md / log.md / overview.md 并标记引用的 raw 资料。无 frontmatter 或缺 type/title/body 的文件跳过并报告。Triggers: 导入卡片、导入现成知识、批量导入 markdown。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			dir: {
				type: "string",
				required: true,
				description: "本地目录绝对路径，内含要导入的 .md 卡片文件（递归扫描）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					imported: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					skipped: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								file: {
									type: "string",
									required: true
								},
								reason: {
									type: "string",
									required: true
								}
							}
						}
					},
					sourceFiles: {
						type: "array",
						items: { type: "string" },
						required: true
					}
				}
			},
			render: (_args, value) => {
				const lines = [`知识库「${value.kb}」导入完成：${value.imported.length} 张卡片（${value.sourceFiles.length} 个资料引用已标记）`];
				for (const path of value.imported) lines.push(`  ✓ ${path}`);
				for (const item of value.skipped) lines.push(`  ⚠ 跳过 ${item.file}: ${item.reason}`);
				return text(lines.join("\n"));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			if (typeof args.dir !== "string" || args.dir.trim() === "") throw new Error("dir 必填：要导入的卡片目录绝对路径。");
			return {
				kb: resolved.id,
				...await importCards(kb, args.dir)
			};
		}
	});
}
const CODE_READ_CAP = 6e4;
function wikiCodeListTool() {
	return defineTool({
		name: "wiki_code_list",
		description: "列出知识库 code/ 目录下的代码文件（相对路径 / 大小 / 修改时间）。代码文件由用户在面板「代码」标签上传，原样保存、不经 LLM 处理。Triggers: 列代码、看代码文件、代码清单。",
		parameters: { kb: {
			type: "string",
			description: "知识库 id（省略用默认库）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					files: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								relPath: {
									type: "string",
									required: true
								},
								size: {
									type: "integer",
									required: true
								},
								mtime: {
									type: "integer",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				if (value.files.length === 0) return text(`知识库「${value.kb}」暂无代码文件。可在侧边栏「知识卡片」→「代码」标签上传。`);
				return text(`知识库「${value.kb}」代码文件 ${value.files.length} 个：\n` + value.files.map((file) => `- ${file.relPath} (${file.size} B)`).join("\n"));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const files = await listCodeFiles(kb);
			return {
				kb: resolved.id,
				files: files.map((file) => ({
					relPath: file.relPath,
					size: file.size,
					mtime: file.mtime
				}))
			};
		}
	});
}
function wikiCodeReadTool() {
	return defineTool({
		name: "wiki_code_read",
		description: "读取知识库 code/ 目录下的一个代码文件内容（原样返回，超过 60KB 截断并提示）。做其他项目需要参考已沉淀的代码（脚本、SQL、配置、模板）时用这个工具把代码拉进上下文。Triggers: 读代码、看代码文件、参考脚本。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			path: {
				type: "string",
				required: true,
				description: "code/ 下的相对路径（wiki_code_list 查看）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					path: {
						type: "string",
						required: true
					},
					content: {
						type: "string",
						required: true
					},
					truncated: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`[wiki_code_read] 知识库「${value.kb}」代码 ${value.path}:\n\n${value.content}${value.truncated ? "\n…[内容已截断]" : ""}`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const full = await readCodeFile(kb, args.path);
			const truncated = Buffer.byteLength(full, "utf8") > CODE_READ_CAP;
			const content = truncated ? `${full.slice(0, CODE_READ_CAP)}\n…[已截断，完整内容见文件本身]` : full;
			return {
				kb: resolved.id,
				path: args.path,
				content,
				truncated
			};
		}
	});
}
function wikiEditCardTool() {
	return defineTool({
		name: "wiki_edit_card",
		description: "编辑一张知识卡片（替换语义：提供的字段替换原值，未提供的保留；同 slug 原地修改，[[wikilink]] 不受影响；自动记 edit 日志并重建索引）。除标题/摘要/标签/正文外，还可写**结构化字段元数据**与**血缘关系**：metadata 用于 field 卡（field_kind/data_type/aggregation/unit/source_table/source_field/status/review_status/evidence_level/domain/workstream/subject_area/aliases 等），relations 用于 depends_on / used_by / implemented_in / governed_by——按 key 整体替换、未提供的 key 保留。**约定**：AI 推断出来的关系与元数据要显式标注来源，即同时设 metadata.review_status=inferred、metadata.evidence_level=inferred（或按实际证据给 source_code/business_document），并把待人工判断的点用 wiki_review_submit 入审核队列；不要伪造 confirmed。写完后建议 wiki_lint 检查血缘（悬空/不对称/环）。Triggers: 改卡片、编辑卡片、补全血缘、维护字段元数据。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			slug: {
				type: "string",
				required: true,
				description: "卡片 slug（wiki_search 查看）。"
			},
			title: {
				type: "string",
				description: "新标题（留空不改）。"
			},
			description: {
				type: "string",
				description: "新一句话摘要（空串 = 清除）。"
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "新标签列表（提供即整体替换）。"
			},
			related: {
				type: "array",
				items: { type: "string" },
				description: "新关联 slug 列表（提供即整体替换）。"
			},
			sources: {
				type: "array",
				items: { type: "string" },
				description: "新来源文件名列表（提供即整体替换）。"
			},
			body: {
				type: "string",
				description: "新正文 markdown（提供即整体替换）。"
			},
			relations: {
				type: "object",
				description: "血缘关系（field 卡）：{ depends_on?: string[], used_by?: string[], implemented_in?: string[], governed_by?: string[] }；按 key 整体替换，未提供的 key 保留。目标建议用卡片 slug 或标题（lint 会校验 depends_on 是否存在对应字段卡）。",
				additionalProperties: true,
				properties: {
					depends_on: {
						type: "array",
						items: { type: "string" },
						description: "本字段直接依赖的字段卡（直达依赖；间接依赖交由链路推导）。"
					},
					used_by: {
						type: "array",
						items: { type: "string" },
						description: "使用本字段的下游（字段/指标卡优先）。"
					},
					implemented_in: {
						type: "array",
						items: { type: "string" },
						description: "各系统实现（数据集/measure/报表），可为非卡片目标。"
					},
					governed_by: {
						type: "array",
						items: { type: "string" },
						description: "受其约束的定义/规则卡。"
					}
				}
			},
			metadata: {
				type: "object",
				description: "结构化字段元数据（field 卡）：如 { field_kind, data_type, aggregation, unit, source_table, source_field, aliases, status, review_status, evidence_level, domain, workstream, subject_area, business_owner, effective_from, last_reviewed }；按 key 替换，未提供的 key 保留。",
				additionalProperties: true
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					slug: {
						type: "string",
						required: true
					},
					changed: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					title: {
						type: "string",
						required: true
					},
					relations: {
						type: "object",
						required: true,
						additionalProperties: true
					}
				}
			},
			render: (_args, value) => {
				const relationLines = Object.entries(value.relations).filter(([, targets]) => targets.length > 0).map(([key, targets]) => `  ${key}: ${targets.join(", ")}`);
				const head = value.changed.length === 0 ? `卡片「${value.title}」无变更（字段与原值相同）。` : `卡片「${value.title}」已编辑：修改字段 ${value.changed.join("、")}（已记入知识库 log，可查看板）。`;
				return text(relationLines.length === 0 ? head : `${head}\n当前关系：\n${relationLines.join("\n")}`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const usesStructured = args.relations !== void 0 || args.metadata !== void 0;
			let structured;
			if (usesStructured) {
				const existing = await readCard(kb, args.slug);
				if (existing === null) throw new Error(`卡片不存在: ${args.slug}`);
				const current = parseFrontmatter(existing.raw).frontmatter ?? {};
				const next = {};
				for (const [key, value] of Object.entries(current)) {
					if (isManagedFrontmatterKey(key)) continue;
					next[key] = value;
				}
				for (const [key, value] of Object.entries(args.metadata ?? {})) {
					if (isManagedFrontmatterKey(key)) continue;
					if (value === null || value === void 0) {
						delete next[key];
						continue;
					}
					next[key] = value;
				}
				for (const [key, value] of Object.entries(args.relations ?? {})) {
					if (isManagedFrontmatterKey(key)) continue;
					if (value === null || value === void 0) {
						delete next[key];
						continue;
					}
					const list = Array.isArray(value) ? value.map((item) => String(item).trim()).filter((item) => item !== "") : String(value).split(/[\n,]/).map((item) => item.trim()).filter((item) => item !== "");
					next[key] = [...new Set(list)];
				}
				structured = next;
			}
			const result = await editCard(kb, args.slug, {
				title: args.title,
				description: args.description,
				tags: args.tags,
				related: args.related,
				sources: args.sources,
				body: args.body,
				frontmatter: structured
			});
			const fm = parseFrontmatter(result.card.raw).frontmatter ?? {};
			const relationSnapshot = {};
			for (const key of [
				"depends_on",
				"used_by",
				"implemented_in",
				"governed_by"
			]) {
				const value = fm[key];
				relationSnapshot[key] = Array.isArray(value) ? value.map((item) => String(item)) : [];
			}
			return {
				kb: resolved.id,
				slug: args.slug,
				changed: result.changed,
				title: result.card.title,
				relations: relationSnapshot
			};
		}
	});
}
function wikiReviewSubmitTool() {
	return defineTool({
		name: "wiki_review_submit",
		description: "提交一条审核项到知识库的审核队列（llm_wiki 异步人机协作：摄入时标记需人工判断的项，用户稍后在面板「审核」tab 处理，不阻塞摄入）。kind ∈ contradiction（与现有知识矛盾）/ duplicate（疑似已有同名页面）/ missing-page（重要概念缺页面）/ suggestion（建议深挖）。options 是预定义操作（默认按 kind 给：创建页面/深度研究/跳过），不要凭空造操作；searchQuery 为可选预生成搜索查询（供深度研究用）。Triggers: 提交审核、标记矛盾、待人工判断。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			kind: {
				type: "string",
				required: true,
				description: "contradiction | duplicate | missing-page | suggestion"
			},
			title: {
				type: "string",
				required: true,
				description: "简短主题（涉及的实体/概念）。"
			},
			summary: {
				type: "string",
				required: true,
				description: "为什么需要人工判断。"
			},
			source: {
				type: "string",
				description: "触发该审核的资料或卡片。"
			},
			options: {
				type: "array",
				items: { type: "string" },
				description: "预定义操作（省略按 kind 默认）。"
			},
			searchQuery: {
				type: "string",
				description: "预生成搜索查询（深度研究用）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					item: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							id: {
								type: "string",
								required: true
							},
							kind: {
								type: "string",
								required: true
							},
							title: {
								type: "string",
								required: true
							},
							status: {
								type: "string",
								required: true
							},
							options: {
								type: "array",
								items: { type: "string" },
								required: true
							}
						}
					}
				}
			},
			render: (_args, value) => {
				return text(`审核项 ${value.item.id} 已提交到「${value.kb}」（kind=${value.item.kind}, ${value.item.title}）→ 状态 ${value.item.status}，预定义操作: ${value.item.options.join(" / ")}。用户可在面板「审核」tab 处理。`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const kinds = [
				"contradiction",
				"duplicate",
				"missing-page",
				"suggestion"
			];
			if (!kinds.includes(args.kind)) throw new Error(`kind 必须是 ${kinds.join("|")}`);
			const item = await addReview(kb, {
				kind: args.kind,
				title: args.title,
				summary: args.summary,
				source: args.source,
				options: args.options,
				searchQuery: args.searchQuery
			});
			return {
				kb: resolved.id,
				item: {
					id: item.id,
					kind: item.kind,
					title: item.title,
					status: item.status,
					options: item.options
				}
			};
		}
	});
}
function wikiReviewsTool() {
	return defineTool({
		name: "wiki_reviews",
		description: "列出知识库的审核队列（llm_wiki 审核系统）：矛盾/疑似重复/缺失页面/建议，含预定义操作与预生成搜索查询。用户可在面板「审核」tab 处理；agent 也可按用户指示代为处理（创建页面/深研/跳过）。Triggers: 审核队列、待处理审核、人工判断项。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			status: {
				type: "string",
				description: "all（默认）| pending | resolved | skipped。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					pending: {
						type: "integer",
						required: true
					},
					items: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								summary: {
									type: "string",
									required: true
								},
								source: { type: "string" },
								options: {
									type: "array",
									items: { type: "string" },
									required: true
								},
								searchQuery: { type: "string" },
								status: {
									type: "string",
									required: true
								},
								createdAt: {
									type: "integer",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				if (value.items.length === 0) return text(`知识库「${value.kb}」审核队列为空。`);
				const lines = [`知识库「${value.kb}」审核队列（待处理 ${value.pending}）:`];
				for (const item of value.items) {
					lines.push(`- [${item.status}] ${item.id} ${item.kind} | ${item.title}`);
					lines.push(`    ${item.summary}`);
					lines.push(`    操作: ${item.options.join(" / ")}${item.searchQuery !== void 0 ? ` · 搜索: ${item.searchQuery}` : ""}`);
				}
				return text(lines.join("\n"));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const items = await listReviews(kb, args.status);
			return {
				kb: resolved.id,
				pending: items.filter((item) => item.status === "pending").length,
				items: items.map((item) => ({
					id: item.id,
					kind: item.kind,
					title: item.title,
					summary: item.summary,
					source: item.source,
					options: item.options,
					searchQuery: item.searchQuery,
					status: item.status,
					createdAt: item.createdAt
				}))
			};
		}
	});
}
function wikiAuditTool() {
	return defineTool({
		name: "wiki_audit",
		description: "对知识库已有卡片做一次审核（导入现成知识库后主动审核，与摄入时自动标记互补）：确定性扫描（零 LLM、即时）自动把「疑似重复卡片」和「断链缺失页面」提交为审核项（与已有 pending 项去重，重复执行不刷屏）；同时返回一份深度审核指令——把指令交给 agent 后，agent 通读卡片做语义级审核（矛盾/建议/深挖），用 wiki_review_submit 提交。用户可在面板「审核」tab 统一处理。Triggers: 审核知识库、审核现有卡片、知识库审核。",
		parameters: { kb: {
			type: "string",
			description: "知识库 id（省略用默认库）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					submitted: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								}
							}
						}
					},
					skippedExisting: {
						type: "integer",
						required: true
					},
					summary: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							duplicate: {
								type: "integer",
								required: true
							},
							missingPage: {
								type: "integer",
								required: true
							}
						}
					},
					deepAuditPrompt: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const lines = [`知识库「${value.kb}」确定性审核完成：新增 ${value.submitted.length} 条审核项（重复 ${value.summary.duplicate} · 缺失页面 ${value.summary.missingPage}），跳过已有 pending ${value.skippedExisting} 条。`];
				for (const item of value.submitted) lines.push(`  ✓ ${item.id} [${item.kind}] ${item.title}`);
				lines.push("", "--- 深度审核指令（语义级，交给 agent 执行后提交审核项）---", value.deepAuditPrompt);
				return text(lines.join("\n"));
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const result = await auditKb(kb);
			return {
				kb: resolved.id,
				submitted: result.submitted,
				skippedExisting: result.skippedExisting,
				summary: result.summary,
				deepAuditPrompt: result.deepAuditPrompt
			};
		}
	});
}
function wikiCardDeleteTool() {
	return defineTool({
		name: "wiki_card_delete",
		description: "把一张知识卡片移入回收站（软删除，非物理删除）：从 wiki/ 移到 <kb>/.trash/cards/，自动重建 index/log/overview，卡片从搜索/lint/索引即刻消失。可在面板「回收站」标签或 wiki_card_restore 恢复。删除会使其 [[wikilink]] 变为断链（wiki_lint 会报告）。Triggers: 删卡片、删除卡片、移除卡片。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			slug: {
				type: "string",
				required: true,
				description: "要删除的卡片 slug（wiki_search 查看）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					slug: {
						type: "string",
						required: true
					},
					trashPath: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`卡片「${value.slug}」已移入回收站（${value.trashPath}）。可随时用 wiki_card_restore 恢复。`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const result = await deleteCard(kb, args.slug);
			return {
				kb: resolved.id,
				slug: args.slug,
				trashPath: result.trashPath
			};
		}
	});
}
function wikiCardRestoreTool() {
	return defineTool({
		name: "wiki_card_restore",
		description: "把回收站中的一张卡片恢复到 wiki/ 原位置（同 slug 卡片被重建时会报恢复冲突）。恢复后 index/overview 重建、记 restore 日志、[[wikilink]] 恢复可解析。Triggers: 恢复卡片、还原卡片、从回收站恢复。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			slug: {
				type: "string",
				required: true,
				description: "回收站中的卡片 slug（wiki_trash_list 查看）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					slug: {
						type: "string",
						required: true
					},
					path: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`卡片「${value.slug}」已恢复到 wiki/${value.path}。`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			const result = await restoreCard(kb, args.slug);
			return {
				kb: resolved.id,
				slug: args.slug,
				path: result.path
			};
		}
	});
}
function wikiCardPurgeTool() {
	return defineTool({
		name: "wiki_card_purge",
		description: "从回收站彻底删除一张卡片（物理删除，不可恢复！）。仅在用户明确要求永久删除时使用；一般用 wiki_card_restore 恢复即可。Triggers: 彻底删除卡片、永久删除卡片、清空回收站。",
		parameters: {
			kb: {
				type: "string",
				description: "知识库 id（省略用默认库）。"
			},
			slug: {
				type: "string",
				required: true,
				description: "回收站中的卡片 slug（wiki_trash_list 查看）。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					slug: {
						type: "string",
						required: true
					},
					purged: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`卡片「${value.slug}」已从回收站彻底删除（不可恢复）。`);
			}
		},
		async execute(args) {
			const resolved = await resolveKb(args.kb);
			if (resolved === null) throw new Error("尚无知识库。先 wiki_create_kb 建库。");
			const kb = await getKb(resolved.id);
			if (kb === null) throw new Error(`unknown knowledge base: ${resolved.id}`);
			await purgeCard(kb, args.slug);
			return {
				kb: resolved.id,
				slug: args.slug,
				purged: true
			};
		}
	});
}
function wikiKbDeleteTool() {
	return defineTool({
		name: "wiki_kb_delete",
		description: "把整个知识库移入回收站（软删除）：整个目录（含 raw/wiki/code + 审核队列）移到 <configRoot>/.trash/kbs/<id>/，并从知识库列表移除。kb 必填（不做默认库推断，防止误删）。可在面板「回收站」标签或 wiki_kb_restore 恢复。Triggers: 删知识库、删除知识库、移除知识库。",
		parameters: { kb: {
			type: "string",
			required: true,
			description: "要删除的知识库 id（wiki_kbs 查看）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					trashPath: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`知识库「${value.kb}」已移入回收站（${value.trashPath}，含其审核队列）。可随时用 wiki_kb_restore 恢复。`);
			}
		},
		async execute(args) {
			if (typeof args.kb !== "string" || args.kb.trim() === "") throw new Error("kb 必填：要删除的知识库 id。");
			const result = await deleteKb(args.kb.trim());
			return {
				kb: args.kb.trim(),
				trashPath: result.trashPath
			};
		}
	});
}
function wikiKbRestoreTool() {
	return defineTool({
		name: "wiki_kb_restore",
		description: "把回收站中的一个知识库恢复到原路径并重新登记（id 已被占用或原路径已存在时报恢复冲突）。其审核队列随库一起回来。Triggers: 恢复知识库、还原知识库。",
		parameters: { kb: {
			type: "string",
			required: true,
			description: "回收站中的知识库 id（wiki_trash_list 查看）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					path: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`知识库「${value.name}」(id=${value.kb}) 已恢复 @ ${value.path}。`);
			}
		},
		async execute(args) {
			if (typeof args.kb !== "string" || args.kb.trim() === "") throw new Error("kb 必填：回收站中的知识库 id。");
			const result = await restoreKb(args.kb.trim());
			return {
				kb: result.kb.id,
				name: result.kb.name,
				path: result.kb.path
			};
		}
	});
}
function wikiKbPurgeTool() {
	return defineTool({
		name: "wiki_kb_purge",
		description: "从回收站彻底删除一个知识库（物理删除，不可恢复！）。仅在用户明确要求永久删除时使用；一般用 wiki_kb_restore 恢复即可。Triggers: 彻底删除知识库、永久删除知识库。",
		parameters: { kb: {
			type: "string",
			required: true,
			description: "回收站中的知识库 id（wiki_trash_list 查看）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kb: {
						type: "string",
						required: true
					},
					purged: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return text(`知识库「${value.kb}」已从回收站彻底删除（不可恢复）。`);
			}
		},
		async execute(args) {
			if (typeof args.kb !== "string" || args.kb.trim() === "") throw new Error("kb 必填：回收站中的知识库 id。");
			await purgeKb(args.kb.trim());
			return {
				kb: args.kb.trim(),
				purged: true
			};
		}
	});
}
function wikiTrashListTool() {
	return defineTool({
		name: "wiki_trash_list",
		description: "列出回收站内容：指定知识库（kb 省略则全部知识库）的已删除卡片 + 全部已删除的知识库（含删除时间与原路径）。供 wiki_card_restore / wiki_kb_restore 恢复或 purge 彻底删除。Triggers: 回收站、已删除的卡片、恢复卡片。",
		parameters: { kb: {
			type: "string",
			description: "知识库 id（省略则列出所有知识库的已删卡片）。"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					cards: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								slug: {
									type: "string",
									required: true
								},
								originalPath: {
									type: "string",
									required: true
								},
								type: {
									type: "string",
									required: true
								},
								title: {
									type: "string",
									required: true
								},
								deletedAt: {
									type: "integer",
									required: true
								}
							}
						}
					},
					kbs: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: {
									type: "string",
									required: true
								},
								name: {
									type: "string",
									required: true
								},
								originalPath: {
									type: "string",
									required: true
								},
								deletedAt: {
									type: "integer",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => {
				const lines = [];
				if (value.kbs.length > 0) {
					lines.push(`回收站中已删除的知识库 ${value.kbs.length} 个:`);
					for (const kb of value.kbs) lines.push(`- [kb] ${kb.id} | ${kb.name} | 原路径: ${kb.originalPath} | 删除于 ${new Date(kb.deletedAt).toLocaleString()}`);
				}
				if (value.cards.length > 0) {
					lines.push(`回收站中已删除的卡片 ${value.cards.length} 张:`);
					for (const card of value.cards) lines.push(`- [${card.type}] ${card.slug} — ${card.title} | 原路径: ${card.originalPath} | 删除于 ${new Date(card.deletedAt).toLocaleString()}`);
				}
				if (lines.length === 0) lines.push("回收站为空。");
				lines.push("恢复用 wiki_card_restore / wiki_kb_restore；彻底删除用 wiki_card_purge / wiki_kb_purge（不可恢复）。");
				return text(lines.join("\n"));
			}
		},
		async execute(args) {
			const result = await listTrash(args.kb !== void 0 && args.kb !== "" ? args.kb : void 0);
			return {
				cards: result.cards.map((card) => ({
					slug: card.slug,
					originalPath: card.originalPath,
					type: card.type,
					title: card.title,
					deletedAt: Math.round(card.deletedAt)
				})),
				kbs: result.kbs.map((kb) => ({
					id: kb.id,
					name: kb.name,
					originalPath: kb.originalPath,
					deletedAt: Math.round(kb.deletedAt)
				}))
			};
		}
	});
}
//#endregion
export { wikiAuditTool, wikiCardDeleteTool, wikiCardPurgeTool, wikiCardRestoreTool, wikiCodeListTool, wikiCodeReadTool, wikiCommitTool, wikiCreateKbTool, wikiEditCardTool, wikiImportCardsTool, wikiIngestTool, wikiKbDeleteTool, wikiKbPurgeTool, wikiKbRestoreTool, wikiKbsTool, wikiLintTool, wikiReadTool, wikiReviewSubmitTool, wikiReviewsTool, wikiSearchTool, wikiTrashListTool };
