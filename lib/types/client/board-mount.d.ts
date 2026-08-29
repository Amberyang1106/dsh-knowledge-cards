/**
 * Panel mounting: takes over the center column at the DOM level (the
 * conversation slot is single-occupant), appending a container and rendering
 * the React panel into it. Visibility rides a data attribute on <html>.
 * Cross-plugin eviction follows dsh-ssh: opening this panel removes the
 * sibling task-board attr and announces via dsh-panel-activate, and being
 * announced by a sibling closes us.
 * @module dsh-knowledge-cards/client/board-mount
 */
import type { PanelController } from './controller.ts';
export declare function mountPanel(controller: PanelController): () => void;
//# sourceMappingURL=board-mount.d.ts.map