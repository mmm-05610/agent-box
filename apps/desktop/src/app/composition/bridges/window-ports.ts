import type { HudWindowPort } from '@/app/windows/hud/port'
import type { PetOverlayWindowPort } from '@/app/windows/pet/port'
import type { QuickEntryWindowPort } from '@/app/windows/quick-entry/port'
import { getActiveComposer } from '@/components/composer/focus'
import { $selectedStoredSessionId } from '@/store/session'

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

let hudPort: HudWindowPort | null = null

/** The HUD's host port (no-op when the shell lacks the API — the mechanics then degrade exactly as before). */
export function hudWindowPort(): HudWindowPort {
  if (hudPort) {
    return hudPort
  }

  const api = typeof window === 'undefined' ? undefined : window.hermesDesktop?.hud

  hudPort = api
    ? {
        beginMove: () => api.beginMove(),
        endMove: () => api.endMove(),
        moveBy: size => api.moveBy(size),
        onCursor: api.onCursor
          ? callback => api.onCursor(point => callback(point))
          : // No cursor feed: the mousemove path still decides solidity.
            () => () => undefined,
        onGameOverlay: callback => api.onGameOverlay(state => callback({ active: state.active })),
        onRetarget: callback => api.onGoto(callback),
        placement: api.windowing,
        reportSession: sessionId => api.setSession(sessionId),
        setBounds: bounds => api.setBounds(bounds),
        setFrost: showing => api.setFrost(showing),
        setIgnoreMouse: ignore => api.setIgnoreMouse(ignore),
        setWorkspaceTransfer: api.setWorkspaceTransfer
          ? transferring => {
              api.setWorkspaceTransfer?.(transferring)
            }
          : undefined
      }
    : {
        beginMove: () => undefined,
        endMove: () => undefined,
        moveBy: () => undefined,
        onCursor: () => () => undefined,
        onGameOverlay: () => () => undefined,
        onRetarget: () => () => undefined,
        reportSession: () => undefined,
        setBounds: () => undefined,
        setFrost: () => undefined,
        setIgnoreMouse: () => undefined
      }

  return hudPort
}

/** Session tiles route on `tile:<storedSessionId>` (see session-tile.tsx). */
const TILE_TARGET_PREFIX = 'tile:'

/**
 * The conversation the user is actually looking at — the one a newly-opened
 * compact surface should show. Answered HERE because it reads the composer
 * focus bus (a component-layer fact): `$selectedStoredSessionId` is the
 * WORKSPACE pane's session, so reading it alone sent the main tab into the
 * surface no matter which tile was fronted — the tabs exist precisely so that
 * isn't the same question. `getActiveComposer()` already answers it for the
 * focus bus, healing to the visible surface when its cached claim is buried or
 * gone, and a tile's routing key IS its stored session id.
 */
export function frontConversationId(): null | string {
  const target = getActiveComposer()
  const tile = target.startsWith(TILE_TARGET_PREFIX) ? target.slice(TILE_TARGET_PREFIX.length) : null

  return tile || $selectedStoredSessionId.get()
}
