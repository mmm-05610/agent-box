import type { QuickEntryWindowPort } from '@/app/windows/quick-entry/port'

/**
 * The shell's window API assembled behind the neutral window-host ports.
 *
 * Auxiliary window surfaces (Quick Entry, Pet overlay, HUD) consume narrow
 * typed port contracts and never name the shell's API themselves. This module
 * is the one place that adapts the real implementation — and the one place
 * that decides what "the host is absent" means: a port whose calls no-op,
 * which is exactly how the surfaces behaved before the ports existed.
 *
 * Ports are memoized per window: the shell API is constant for a window's
 * life, and the surface hooks key their effects on port identity.
 */

let quickEntryPort: QuickEntryWindowPort | null = null

/** The Quick Entry capture window's host port (no-op when the shell lacks the API). */
export function quickEntryWindowPort(): QuickEntryWindowPort {
  if (quickEntryPort) {
    return quickEntryPort
  }

  const api = typeof window === 'undefined' ? undefined : window.hermesDesktop?.quickEntry

  quickEntryPort = api
    ? {
        dismiss: () => api.dismiss(),
        onShown: callback => api.onShown(callback),
        onState: callback => api.onState(callback),
        submit: payload => api.submit(payload)
      }
    : // Host absent: captures can't be delivered, so the surface's own
      // pushed-state gate keeps the input disabled — same as before.
      {
        dismiss: () => undefined,
        onShown: () => () => undefined,
        onState: () => () => undefined,
        submit: () => undefined
      }

  return quickEntryPort
}
