// @vitest-environment jsdom
/**
 * Client panel render test: mounts the real KnowledgePanel React tree in
 * jsdom with a mocked fetch serving canned /api/dsh-knowledge/* envelopes,
 * then drives the card wall, type chips, card detail, and tab switching —
 * the exact UI the user sees after the GUI restart.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelController } from '../src/client/controller.ts'
import { KnowledgePanel } from '../src/client/panel.tsx'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const KB = {
  id: 'finance-km',
  name: 'Finance KM',
  path: '/tmp/finance',
  createdAt: 1,
  stats: { total: 2, byType: { concept: 1, entity: 1 }, sourceCount: 1 },
}

const CARDS = [
  { slug: 'cost-allocation', type: 'concept', title: '成本分摊', description: '按动因分摊的方法', tags: ['财务'], related: ['profit-center'], sources: ['policy.md'], created: '2026-01-01', updated: '2026-01-02' },
  { slug: 'profit-center', type: 'entity', title: '利润中心', description: '归属单元', tags: ['财务'], related: [], sources: [], created: '2026-01-01', updated: '2026-01-02' },
]

const CARD_DETAIL = {
  ...CARDS[0],
  path: 'concepts/cost-allocation.md',
  body: '成本分摊遵循[[因果原则]]，按[[分摊动因]]归集到[[利润中心]]。',
  raw: '---\ntype: concept\ntitle: 成本分摊\n---\n成本分摊遵循[[因果原则]]。',
}

function jsonResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as unknown as Response
}

function installFetchMock(): void {
  // Stateful review queue so resolve/skip actually empties the pending view.
  let reviewItems = [
    { id: 'r1', kind: 'contradiction', title: '分摊动因取值口径', summary: '新资料称用本期实际值，与现有卡片矛盾', source: 'new-policy.md', options: ['创建页面', '深度研究', '跳过'], searchQuery: '分摊 动因 口径', status: 'pending' as const, createdAt: 1 },
  ]
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/api/dsh-knowledge/kbs') return Promise.resolve(jsonResponse({ ok: true, kbs: [KB] }))
    if (url.pathname === '/api/dsh-knowledge/cards') {
      const q = url.searchParams.get('q') ?? ''
      const type = url.searchParams.get('type') ?? 'all'
      let cards = CARDS
      if (q !== '') cards = cards.filter((card) => card.title.includes(q))
      if (type !== 'all') cards = cards.filter((card) => card.type === type)
      return Promise.resolve(jsonResponse({ ok: true, cards, total: cards.length }))
    }
    if (url.pathname === '/api/dsh-knowledge/card') return Promise.resolve(jsonResponse({ ok: true, card: CARD_DETAIL }))
    if (url.pathname === '/api/dsh-knowledge/card/edit') {
      return Promise.resolve(jsonResponse({ ok: true, result: { card: { ...CARD_DETAIL, description: '已更新摘要', body: '更新后的正文' }, changed: ['摘要', '正文'] } }))
    }
    if (url.pathname === '/api/dsh-knowledge/sources') return Promise.resolve(jsonResponse({ ok: true, sources: [], pending: 0 }))
    if (url.pathname === '/api/dsh-knowledge/lint') return Promise.resolve(jsonResponse({ ok: true, issues: [] }))
    if (url.pathname === '/api/dsh-knowledge/log') {
      const action = url.searchParams.get('action') ?? 'all'
      const all = [
        { date: '2026-08-23', action: 'edit', subject: '成本分摊', notes: ['摘要: "旧摘要" → "新摘要"', '标签: +revised'] },
        { date: '2026-08-22', action: 'ingest', subject: '6 pages', notes: ['新增页面: 利润中心、成本中心'] },
      ]
      const entries = action === 'all' ? all : all.filter((entry) => entry.action === action)
      return Promise.resolve(jsonResponse({ ok: true, entries, total: all.length }))
    }
    if (url.pathname === '/api/dsh-knowledge/code') return Promise.resolve(jsonResponse({ ok: true, files: [{ relPath: 'scripts/check.py', size: 12, mtime: 1 }] }))
    if (url.pathname === '/api/dsh-knowledge/code/content') return Promise.resolve(jsonResponse({ ok: true, content: 'print("hello")\n' }))
    if (url.pathname === '/api/dsh-knowledge/code/delete') return Promise.resolve(jsonResponse({ ok: true, deleted: true }))
    if (url.pathname === '/api/dsh-knowledge/reviews') {
      const status = url.searchParams.get('status') ?? 'pending'
      const items = status === 'all' ? reviewItems : reviewItems.filter((item) => item.status === status)
      return Promise.resolve(jsonResponse({ ok: true, items, pending: reviewItems.filter((item) => item.status === 'pending').length }))
    }
    if (url.pathname === '/api/dsh-knowledge/reviews/resolve') {
      reviewItems = reviewItems.map((item) => ({ ...item, status: 'resolved' as const }))
      return Promise.resolve(jsonResponse({ ok: true, item: { id: 'r1', status: 'resolved' } }))
    }
    if (url.pathname === '/api/dsh-knowledge/audit') {
      return Promise.resolve(jsonResponse({ ok: true, result: { submitted: [{ id: 'a1', kind: 'duplicate', title: '分摊动因' }], skippedExisting: 0, summary: { duplicate: 1, missingPage: 0 }, deepAuditPrompt: '请对知识库做语义审核…' } }))
    }
    if (url.pathname === '/api/dsh-knowledge/audit-prompt') {
      return Promise.resolve(jsonResponse({ ok: true, prompt: '请对知识库做一次全面语义审核…' }))
    }
    if (url.pathname === '/api/dsh-knowledge/commit') {
      return Promise.resolve(jsonResponse({ ok: true, result: { created: ['concepts/分摊动因.md'], updated: [], indexUpdated: true, logEntry: 'ingest | 分摊动因', overviewUpdated: true, cachedSources: [] } }))
    }
    return Promise.resolve(jsonResponse({ ok: false, error: 'not found' }))
  }))
}

let container: HTMLDivElement

beforeEach(() => {
  installFetchMock()
  // jsdom has no clipboard; stub it so copy actions resolve.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

async function renderPanel(): Promise<PanelController> {
  const controller = new PanelController()
  await act(async () => {
    createRoot(container).render(<KnowledgePanel controller={controller} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return controller
}

function text(): string {
  return container.textContent ?? ''
}

describe('KnowledgePanel', () => {
  it('renders the card wall from the host API', async () => {
    await renderPanel()
    expect(text()).toContain('知识卡片')
    expect(text()).toContain('成本分摊')
    expect(text()).toContain('利润中心')
    expect(text()).toContain('Finance KM')
    expect(text()).toContain('concept')
    expect(text()).toContain('entity')
  })

  it('filters by type chip', async () => {
    await renderPanel()
    // entity chip → only 利润中心 remains
    await act(async () => {
      const chips = Array.from(container.querySelectorAll('button'))
      const entityChip = chips.find((chip) => chip.textContent?.trim() === 'entity')
      entityChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('利润中心')
    expect(text()).not.toContain('成本分摊')
  })

  it('opens card detail with wikilinks and returns to the wall', async () => {
    await renderPanel()
    await act(async () => {
      const cards = Array.from(container.querySelectorAll('button'))
      const card = cards.find((entry) => entry.textContent?.includes('成本分摊'))
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('按动因分摊的方法')
    expect(text()).toContain('[[因果原则]]')
    expect(text()).toContain('← 返回')
    await act(async () => {
      const back = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('← 返回'))
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('成本分摊')
  })

  it('switches to the sources and knowledge-base tabs', async () => {
    await renderPanel()
    await act(async () => {
      const sourcesTab = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '资料')
      sourcesTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('raw/sources/ 为空')
    await act(async () => {
      const kbsTab = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '知识库')
      kbsTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('Finance KM')
    expect(text()).toContain('新建知识库')
  })

  it('lists and previews code files in the code tab', async () => {
    await renderPanel()
    await act(async () => {
      const codeTab = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '代码')
      codeTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('scripts/check.py')
    expect(text()).toContain('上传代码')
    await act(async () => {
      const fileRow = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('scripts/check.py'))
      fileRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('print("hello")')
    expect(text()).toContain('← 返回')
  })

  it('runs lint and shows the result', async () => {
    await renderPanel()
    await act(async () => {
      const lint = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('lint'))
      lint?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('lint：0 error / 0 warn')
  })

  it('edits a card from the detail view', async () => {
    await renderPanel()
    // open the card detail
    await act(async () => {
      const cards = Array.from(container.querySelectorAll('button'))
      cards.find((entry) => entry.textContent?.includes('成本分摊'))?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // click 编辑
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '编辑')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(text()).toContain('编辑卡片')
    expect(text()).toContain('正文（Markdown')
    // save
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '保存')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('已保存：修改字段 摘要、正文')
  })

  it('shows the modification log board with action filters', async () => {
    await renderPanel()
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '看板')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('edit')
    expect(text()).toContain('"旧摘要" → "新摘要"')
    expect(text()).toContain('+revised')
    expect(text()).toContain('ingest')
    expect(text()).toContain('新增页面: 利润中心、成本中心')
    // filter chips
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === 'edit')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('edit')
    expect(text()).not.toContain('6 pages')
  })

  it('shows the review queue and resolves an item', async () => {
    await renderPanel()
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '审核')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('⚠️ 矛盾')
    expect(text()).toContain('分摊动因取值口径')
    expect(text()).toContain('创建页面')
    expect(text()).toContain('🔎 分摊 动因 口径')
    expect(text()).toContain('待处理 1')
    // resolve
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('✓ 完成'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('审核队列为空')
  })

  it('runs the audit button and shows the result with the deep-audit copy action', async () => {
    await renderPanel()
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '审核')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('审核知识库'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('新增 1 条审核项（重复 1 · 缺失页面 0）')
    expect(text()).toContain('复制深度审核指令')
  })

  it('copies the deep-audit prompt without running the deterministic scan first', async () => {
    await renderPanel()
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '审核')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('复制深度审核指令'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('语义审核'))
    expect(text()).toContain('已复制深度审核指令')
  })

  it('creates a card from a review item and resolves it', async () => {
    await renderPanel()
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '审核')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // 创建页面 is now an action button
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === '创建页面')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('从审核项创建卡片')
    // title is pre-filled into the controlled input (not part of textContent)
    const titleInput = container.querySelector('input') as HTMLInputElement
    expect(titleInput.value).toContain('分摊动因取值口径')
    // save → commit + resolve → back to (empty) pending list
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.includes('创建并完成'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(text()).toContain('审核队列为空')
  })
})
