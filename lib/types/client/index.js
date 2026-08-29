/**
 * Knowledge-cards client plugin: mounts the sidebar entry and the center
 * column panel, driving the host /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client
 */
import { PanelController } from "./controller.js";
import { mountSidebarEntry } from "./sidebar-entry.js";
import { mountPanel } from "./board-mount.js";
import { NS, en, zh } from "./locales.js";
/** Required services: locale for the surface copy. */
export const inject = ['locale'];
/** Stable plugin name (client half). */
export const name = 'dsh-knowledge-cards';
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-knowledge-cards: dictionaries');
    ctx.effect(() => {
        const controller = new PanelController();
        const disposers = [];
        try {
            disposers.push(mountSidebarEntry(controller));
            disposers.push(mountPanel(controller));
        }
        catch (error) {
            // DOM failures degrade the panel, never the GUI.
            console.warn('[dsh-knowledge-cards] mount failed:', error);
        }
        return () => {
            for (const dispose of disposers.splice(0))
                dispose();
        };
    }, 'dsh-knowledge-cards: wiring');
}
