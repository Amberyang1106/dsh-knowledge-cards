/**
 * Minimal panel controller: only the open/close state shared between the DOM
 * sidebar entry and the React panel. Panel data lives in React state.
 * @module dsh-knowledge-cards/client/controller
 */
export interface PanelState {
    open: boolean;
}
export declare class PanelController {
    private state;
    private listeners;
    getSnapshot(): PanelState;
    subscribe(listener: () => void): () => void;
    private emit;
    toggle(): void;
    close(): void;
}
//# sourceMappingURL=controller.d.ts.map