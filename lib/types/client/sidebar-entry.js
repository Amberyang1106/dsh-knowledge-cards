/**
 * Sidebar entry injection (DOM-level, following dsh-task-board /
 * dsh-allocation-monitor precedent): the dsh sidebar shell exposes no
 * externally-registrable slot for top-level rows, so the entry is injected
 * after the New Session button with a MutationObserver self-heal against
 * React re-renders.
 * @module dsh-knowledge-cards/client/sidebar-entry
 */
import { t } from "./locales.js";
import css from './panel.module.css';
export const ENTRY_SELECTOR = '[data-dsh-knowledge-entry]';
const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h7a2 2 0 0 1 2 2v7a2 2 0 0 0-2-2h-7z"/><path d="M5.5 3.5v9"/><path d="M13.5 6.5v6a2 2 0 0 1-2 2"/></svg>`;
function sidebarRoot() {
    const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
    if (column === null)
        return undefined;
    const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
    return logoOwner ?? column.firstElementChild;
}
function newSessionButton(root) {
    const nested = root.querySelector('button[class*="newSession"]');
    if (nested !== null)
        return nested;
    for (const child of root.children) {
        if (child.tagName === 'BUTTON')
            return child;
    }
    return undefined;
}
function createEntry(controller) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.dataset.dshKnowledgeEntry = '';
    entry.dataset.dshPlugin = 'knowledge-cards';
    entry.dataset.dshPart = 'sidebar-entry';
    entry.className = css.entry;
    entry.setAttribute('aria-label', t(undefined, 'entry.label'));
    entry.setAttribute('title', t(undefined, 'entry.tooltip'));
    entry.innerHTML = `<span class="${css.entryIcon}">${ICON}</span><span class="${css.entryLabel}">${t(undefined, 'entry.label')}</span>`;
    entry.addEventListener('click', () => { controller.toggle(); });
    return entry;
}
export function mountSidebarEntry(controller) {
    if (document.querySelector(ENTRY_SELECTOR) !== null)
        return () => { };
    const entry = createEntry(controller);
    let root;
    let placed = false;
    const tryPlace = () => {
        if (placed) {
            if (document.body.contains(entry))
                return;
            placed = false;
        }
        root ??= sidebarRoot();
        if (root === undefined)
            return;
        const button = newSessionButton(root);
        if (button === undefined)
            return;
        if (entry.parentElement !== root) {
            const row = button.closest('[class*="logoRow"]');
            const base = (row !== null && row.parentElement === root) ? row : button;
            root.insertBefore(entry, base.nextElementSibling);
        }
        placed = true;
        rootObserver.observe(root, { childList: true, subtree: true });
    };
    const waitObserver = new MutationObserver(() => { tryPlace(); });
    waitObserver.observe(document.body, { childList: true, subtree: true });
    const rootObserver = new MutationObserver(() => {
        if (root === undefined || !root.isConnected) {
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
        if (controller.getSnapshot().open)
            entry.dataset.active = 'true';
        else
            delete entry.dataset.active;
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
