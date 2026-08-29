/**
 * Knowledge-cards client plugin: mounts the sidebar entry and the center
 * column panel, driving the host /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { PanelController } from './controller.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { mountPanel } from './board-mount.tsx'
import { NS, en, zh, type KnowledgeCardsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-knowledge-cards': KnowledgeCardsKey
  }
}

/** Required services: locale for the surface copy. */
export const inject = ['locale']

/** Stable plugin name (client half). */
export const name = 'dsh-knowledge-cards'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-knowledge-cards: dictionaries')

  ctx.effect(() => {
    const controller = new PanelController()
    const disposers: Array<() => void> = []
    try {
      disposers.push(mountSidebarEntry(controller))
      disposers.push(mountPanel(controller))
    } catch (error) {
      // DOM failures degrade the panel, never the GUI.
      console.warn('[dsh-knowledge-cards] mount failed:', error)
    }
    return () => {
      for (const dispose of disposers.splice(0)) dispose()
    }
  }, 'dsh-knowledge-cards: wiring')
}
