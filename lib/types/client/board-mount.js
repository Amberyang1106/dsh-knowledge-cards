import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Panel mounting: takes over the center column at the DOM level (the
 * conversation slot is single-occupant), appending a container and rendering
 * the React panel into it. Visibility rides a data attribute on <html>.
 * Cross-plugin eviction follows dsh-ssh: opening this panel removes the
 * sibling task-board attr and announces via dsh-panel-activate, and being
 * announced by a sibling closes us.
 * @module dsh-knowledge-cards/client/board-mount
 */
import { createRoot } from 'react-dom/client';
import { KnowledgePanel } from "./panel.js";
import css from './panel.module.css';
const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
const ACTIVE_ATTR = 'data-dsh-knowledge-active';
const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active'];
const ACTIVATE_EVENT = 'dsh-panel-activate';
const PANEL_NAME = 'knowledge-cards';
function conversationColumn() {
    return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? undefined;
}
export function mountPanel(controller) {
    let root;
    let container;
    const ensure = () => {
        if (container !== undefined) {
            if (container.isConnected)
                return;
            root?.unmount();
            root = undefined;
            container.remove();
            container = undefined;
        }
        const column = conversationColumn();
        if (column === undefined)
            return;
        container = document.createElement('div');
        container.dataset.dshKnowledgeView = '';
        container.dataset.dshPlugin = 'knowledge-cards';
        container.className = css.view;
        column.appendChild(container);
        root = createRoot(container);
        root.render(_jsx(KnowledgePanel, { controller: controller }));
    };
    const waitObserver = new MutationObserver(() => { ensure(); });
    waitObserver.observe(document.body, { childList: true, subtree: true });
    const applyActive = () => {
        if (controller.getSnapshot().open) {
            for (const attr of OTHER_ACTIVE_ATTRS)
                document.documentElement.removeAttribute(attr);
            document.documentElement.setAttribute(ACTIVE_ATTR, '');
            document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
        }
        else {
            document.documentElement.removeAttribute(ACTIVE_ATTR);
        }
    };
    const onOtherActivate = (event) => {
        if (event.detail !== PANEL_NAME && controller.getSnapshot().open) {
            controller.close();
        }
    };
    // Jump out on sidebar context clicks: clicking a session/workspace row hands
    // the center column back to the conversation. Capture phase.
    const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';
    const onClickSidebarRow = (event) => {
        if (!controller.getSnapshot().open)
            return;
        const target = event.target;
        if (target !== null && target.closest(SIDEBAR_ROW_SELECTOR) !== null)
            controller.close();
    };
    document.addEventListener('click', onClickSidebarRow, true);
    document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
    const unsubscribe = controller.subscribe(applyActive);
    applyActive();
    ensure();
    return () => {
        document.removeEventListener('click', onClickSidebarRow, true);
        document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
        waitObserver.disconnect();
        unsubscribe();
        document.documentElement.removeAttribute(ACTIVE_ATTR);
        root?.unmount();
        root = undefined;
        container?.remove();
        container = undefined;
    };
}
