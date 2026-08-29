/**
 * Minimal panel controller: only the open/close state shared between the DOM
 * sidebar entry and the React panel. Panel data lives in React state.
 * @module dsh-knowledge-cards/client/controller
 */
export class PanelController {
    state = { open: false };
    listeners = new Set();
    getSnapshot() {
        return this.state;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    emit() {
        for (const listener of this.listeners)
            listener();
    }
    toggle() {
        this.state = { ...this.state, open: !this.state.open };
        this.emit();
    }
    close() {
        if (!this.state.open)
            return;
        this.state = { ...this.state, open: false };
        this.emit();
    }
}
