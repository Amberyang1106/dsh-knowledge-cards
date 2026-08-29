/**
 * Minimal panel controller: only the open/close state shared between the DOM
 * sidebar entry and the React panel. Panel data lives in React state.
 * @module dsh-knowledge-cards/client/controller
 */

export interface PanelState {
  open: boolean
}

export class PanelController {
  private state: PanelState = { open: false }
  private listeners = new Set<() => void>()

  getSnapshot(): PanelState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  toggle(): void {
    this.state = { ...this.state, open: !this.state.open }
    this.emit()
  }

  close(): void {
    if (!this.state.open) return
    this.state = { ...this.state, open: false }
    this.emit()
  }
}
