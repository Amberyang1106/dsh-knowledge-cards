// @vitest-environment jsdom
/**
 * Sidebar entry injection test: builds a fake dsh sidebar shell (the
 * [data-pane="sidebar"] / logoRow / newSession structure the real shell
 * renders) and verifies the knowledge-cards row is injected after the New
 * Session button, reflects the controller's open state, and is removed on
 * dispose — the exact DOM surface the user clicks after restart.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PanelController } from '../src/client/controller.ts'
import { ENTRY_SELECTOR, mountSidebarEntry } from '../src/client/sidebar-entry.ts'

function buildShell(): void {
  document.body.innerHTML = `
    <div data-pane="sidebar">
      <div class="shellWrapper">
        <div class="logoRow"><button class="newSession">+ New</button></div>
        <div class="workspaceBrowser"></div>
      </div>
    </div>`
}

beforeEach(() => { buildShell() })
afterEach(() => { document.body.replaceChildren() })

describe('mountSidebarEntry', () => {
  it('injects the entry after the New Session row and toggles the controller', () => {
    const controller = new PanelController()
    const dispose = mountSidebarEntry(controller)

    const entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)
    expect(entry).not.toBeNull()
    expect(entry?.textContent).toContain('知识卡片')
    const logoRow = document.querySelector<HTMLElement>('[class*="logoRow"]')
    expect(entry?.previousElementSibling).toBe(logoRow)
    expect(entry?.getAttribute('data-active')).toBeNull()

    entry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(controller.getSnapshot().open).toBe(true)
    expect(entry?.getAttribute('data-active')).toBe('true')

    entry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(controller.getSnapshot().open).toBe(false)
    expect(entry?.getAttribute('data-active')).toBeNull()

    dispose()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
  })

  it('is idempotent: a second mount does not duplicate the row', () => {
    const first = mountSidebarEntry(new PanelController())
    const second = mountSidebarEntry(new PanelController())
    expect(document.querySelectorAll(ENTRY_SELECTOR).length).toBe(1)
    first()
    second()
  })

  it('self-heals when React displaces the row', () => {
    const controller = new PanelController()
    const dispose = mountSidebarEntry(controller)
    expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()

    // Simulate a shell re-render removing the entry.
    document.querySelector(ENTRY_SELECTOR)?.remove()
    // The MutationObserver re-inserts it.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()
        dispose()
        resolve()
      }, 20)
    })
  })
})
