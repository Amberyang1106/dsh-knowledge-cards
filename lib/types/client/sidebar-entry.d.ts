/**
 * Sidebar entry injection (DOM-level, following dsh-task-board /
 * dsh-allocation-monitor precedent): the dsh sidebar shell exposes no
 * externally-registrable slot for top-level rows, so the entry is injected
 * after the New Session button with a MutationObserver self-heal against
 * React re-renders.
 * @module dsh-knowledge-cards/client/sidebar-entry
 */
import type { PanelController } from './controller.ts';
export declare const ENTRY_SELECTOR = "[data-dsh-knowledge-entry]";
export declare function mountSidebarEntry(controller: PanelController): () => void;
//# sourceMappingURL=sidebar-entry.d.ts.map