import type { PetOverlayWindowPort } from '@/app/windows/pet/port'
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

let petOverlayPort: PetOverlayWindowPort | null = null

/** The popped-out pet overlay's host port (no-op when the shell lacks the API). */
export function petOverlayWindowPort(): PetOverlayWindowPort {
  if (petOverlayPort) {
    return petOverlayPort
  }

  const api = typeof window === 'undefined' ? undefined : window.hermesDesktop?.petOverlay

  petOverlayPort = api
    ? {
        control: payload => api.control(payload),
        onState: callback => api.onState(callback),
        setBounds: bounds => api.setBounds(bounds),
        setFocusable: focusable => api.setFocusable(focusable),
        setIgnoreMouse: ignore => api.setIgnoreMouse(ignore)
      }
    : {
        control: () => undefined,
        onState: () => () => undefined,
        setBounds: () => undefined,
        setFocusable: () => undefined,
        setIgnoreMouse: () => undefined
      }

  return petOverlayPort
}
