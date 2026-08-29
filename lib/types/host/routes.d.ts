/**
 * /api/dsh-knowledge/* route family: KB CRUD, card listing/search/detail,
 * source status, commit, lint. Loopback-fenced like dsh-ssh /
 * dsh-allocation-monitor (the routes read local files the web GUI owns, so a
 * LAN-exposed dsh web must not serve them to unpaired devices).
 * @module dsh-knowledge-cards/host/routes
 */
import type { Context } from '@deepseek-ai/cordis';
export declare function registerKnowledgeRoutes(ctx: Context): () => void;
//# sourceMappingURL=routes.d.ts.map