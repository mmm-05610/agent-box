import type { QuickEntryStatePush, QuickEntrySubmitPayload } from '@/store/quick-entry'

/**
 * The neutral window-host contract for the Quick Entry capture window.
 *
 * Quick Entry is generic prompt capture: pick a visible target, type, submit
 * or dismiss. Everything it knows about the outside world arrives through
 * this port — the capture context is pushed in, the captured prompt and the
 * dismissal requests go out. The surface never touches the shell's API
 * itself; composition assembles the implementation (see
 * `app/composition/bridges/window-ports.ts`).
 */
export interface QuickEntryWindowPort {
  /** Hand a captured prompt to the host and ask it to hide the window. */
  submit(payload: QuickEntrySubmitPayload): void
  /** Hide without sending (Escape / focus loss). */
  dismiss(): void
  /** The window was just re-summoned: reset the draft and take the keyboard back. */
  onShown(callback: () => void): () => void
  /** Pushed capture context: whether sending is currently possible, and which visible targets exist. */
  onState(callback: (payload: QuickEntryStatePush) => void): () => void
}
