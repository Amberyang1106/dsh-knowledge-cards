/**
 * Knowledge-cards client plugin: mounts the sidebar entry and the center
 * column panel, driving the host /api/dsh-knowledge/* routes.
 * @module dsh-knowledge-cards/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type KnowledgeCardsKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'dsh-knowledge-cards': KnowledgeCardsKey;
    }
}
/** Required services: locale for the surface copy. */
export declare const inject: string[];
/** Stable plugin name (client half). */
export declare const name = "dsh-knowledge-cards";
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map