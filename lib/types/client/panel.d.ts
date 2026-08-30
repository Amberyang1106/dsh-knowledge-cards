/**
 * KnowledgeCards panel: the center-column view toggled by the sidebar entry.
 * Tabs — 卡片 (card wall + search + detail + manual create), 资料 (raw sources
 * with ingest status + copy-prompt for the agent), 代码 (code files), 看板
 * (activity log), 审核 (review queue), 知识库 (multi-KB management), 回收站
 * (deleted cards/KBs, restore or purge). All data rides the host
 * /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client/panel
 */
import { type ReactElement } from 'react';
import type { PanelController } from './controller.ts';
export declare function KnowledgePanel({ controller }: {
    controller: PanelController;
}): ReactElement;
//# sourceMappingURL=panel.d.ts.map