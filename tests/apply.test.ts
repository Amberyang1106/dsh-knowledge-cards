/**
 * Host-half integration: apply() must register the /api/dsh-knowledge/*
 * routes, the six wiki_* tools and the system-prompt section against a
 * (stubbed) cordis context without throwing — this is the exact code path
 * the dsh loader runs at boot, so a regression here would take down plugin
 * startup after a profile reload.
 * @module dsh-knowledge-cards/tests/apply
 */

import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

interface StubContext {
  effect: (fn: () => unknown, label?: string) => () => void
  webServer: { register: (route: unknown) => () => void }
  tools: { register: (tool: unknown) => () => void }
  systemPrompt: { section: (section: unknown) => () => void }
  [key: string]: unknown
}

function makeCtx(): { ctx: StubContext; routes: unknown[]; tools: unknown[]; sections: unknown[]; disposers: Array<() => void> } {
  const routes: unknown[] = []
  const tools: unknown[] = []
  const sections: unknown[] = []
  const disposers: Array<() => void> = []
  const ctx: StubContext = {
    effect: (fn) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    },
    webServer: { register: (route) => { routes.push(route); return () => {} } },
    tools: { register: (tool) => { tools.push(tool); return () => {} } },
    systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
  }
  return { ctx, routes, tools, sections, disposers }
}

describe('host apply (boot path)', () => {
  it('registers all routes, tools and the prompt section without throwing', () => {
    const { ctx, routes, tools, sections } = makeCtx()
    expect(() => apply(ctx as never)).not.toThrow()

    // 35 exact routes under /api/dsh-knowledge (one handler per path, method-dispatched).
    expect(routes).toHaveLength(35)
    const paths = routes.map((route) => (route as { path?: string }).path)
    expect(paths).toEqual([
      '/api/dsh-knowledge/kbs',
      '/api/dsh-knowledge/cards',
      '/api/dsh-knowledge/card',
      '/api/dsh-knowledge/commit',
      '/api/dsh-knowledge/card/edit',
      '/api/dsh-knowledge/log',
      '/api/dsh-knowledge/sources',
      '/api/dsh-knowledge/lint',
      '/api/dsh-knowledge/import-cards',
      '/api/dsh-knowledge/rebuild',
      '/api/dsh-knowledge/code',
      '/api/dsh-knowledge/code/content',
      '/api/dsh-knowledge/code/delete',
      '/api/dsh-knowledge/reviews',
      '/api/dsh-knowledge/reviews/resolve',
      '/api/dsh-knowledge/audit',
      '/api/dsh-knowledge/audit-prompt',
      '/api/dsh-knowledge/card/create',
      '/api/dsh-knowledge/card/delete',
      '/api/dsh-knowledge/card/restore',
      '/api/dsh-knowledge/card/purge',
      '/api/dsh-knowledge/kbs/delete',
      '/api/dsh-knowledge/kbs/restore',
      '/api/dsh-knowledge/kbs/purge',
      '/api/dsh-knowledge/trash',
      '/api/dsh-knowledge/rules',
      '/api/dsh-knowledge/lineage/cards',
      '/api/dsh-knowledge/lineage/confirm',
      '/api/dsh-knowledge/lineage/config',
      '/api/dsh-knowledge/lineage/jev',
      '/api/dsh-knowledge/lineage/scan',
      '/api/dsh-knowledge/lineage/llm-status',
      '/api/dsh-knowledge/lineage/run',
      '/api/dsh-knowledge/lineage/proposals',
      '/api/dsh-knowledge/lineage/apply',
    ])
    for (const route of routes) {
      expect((route as { kind?: string }).kind).toBe('exact')
    }

    // 22 agent tools.
    expect(tools).toHaveLength(22)
    const names = tools.map((tool) => (tool as { name?: string }).name).sort()
    expect(names).toEqual(['wiki_audit', 'wiki_card_delete', 'wiki_card_purge', 'wiki_card_restore', 'wiki_code_list', 'wiki_code_read', 'wiki_commit', 'wiki_create_kb', 'wiki_edit_card', 'wiki_import_cards', 'wiki_ingest', 'wiki_kb_delete', 'wiki_kb_purge', 'wiki_kb_restore', 'wiki_kbs', 'wiki_lineage_propose', 'wiki_lint', 'wiki_read', 'wiki_review_submit', 'wiki_reviews', 'wiki_search', 'wiki_trash_list'])

    // One system-prompt announcement.
    expect(sections).toHaveLength(1)
    const section = sections[0] as { name?: string; text?: string }
    expect(section.name).toBe('plugin:knowledge-cards')
    expect(section.text).toContain('wiki_search')
  })

  it('returns working disposers (clean teardown)', () => {
    const { ctx, disposers } = makeCtx()
    apply(ctx as never)
    expect(disposers.length).toBeGreaterThanOrEqual(3)
    expect(() => { for (const dispose of disposers) dispose() }).not.toThrow()
  })
})
