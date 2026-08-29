/**
 * KnowledgeCards panel: the center-column view toggled by the sidebar entry.
 * Three tabs — 卡片 (card wall + search + detail), 资料 (raw sources with
 * ingest status + copy-prompt for the agent), 知识库 (multi-KB management).
 * All data rides the host /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client/panel
 */
import { type ReactElement } from 'react';
import type { PanelController } from './controller.ts';
export declare function KnowledgePanel({ controller }: {
    controller: PanelController;
}): ReactElement;
//# sourceMappingURL=panel.d.ts.map