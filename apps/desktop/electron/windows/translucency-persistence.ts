/**
 * windows/translucency-persistence.ts
 *
 * Debounced persistence for the translucency state.
 *
 * Extracted from `main.ts` (E5b). A drag-resize can change opacity dozens of times
 * a second, so the write is coalesced to one per settle rather than one per
 * change — the same reason `window-state` debounces geometry.
 */

const TRANSLUCENCY_WRITE_DEBOUNCE_MS = 250

export interface TranslucencyPersistenceDeps {
  /** Current translucency state, read at flush time so the last value wins. */
  getState: () => unknown
  /** Persist it. */
  write: (state: unknown) => void
}

export interface TranslucencyPersistence {
  /**
   * Cancel a pending write, reporting whether there was one. A quit handler uses
   * the report to decide whether it still owes a synchronous flush — cancelling
   * without flushing would lose the last opacity change.
   */
  cancelPending(): boolean
  /** Schedule a write, replacing any pending one. */
  schedule(): void
}

export function createTranslucencyPersistence(
  deps: TranslucencyPersistenceDeps
): TranslucencyPersistence {
  let timer: null | ReturnType<typeof setTimeout> = null

  return {
    cancelPending() {
      if (!timer) {
        return false
      }

      clearTimeout(timer)
      timer = null

      return true
    },
    schedule() {
      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(() => {
        timer = null
        deps.write(deps.getState())
      }, TRANSLUCENCY_WRITE_DEBOUNCE_MS)
    }
  }
}
