import type { PetOverlayBounds, PetOverlayControl, PetOverlayStatePayload } from '@/store/pet-overlay'

/**
 * The neutral window-host contract for the popped-out pet overlay.
 *
 * The overlay is a passive projection: activity frames are pushed in, and the
 * surface answers with user intents (pop back in, submit a prompt, move,
 * resize, open the app) plus the window mechanics calls (bounds, click-through,
 * focusability). It never names the shell's API itself; composition assembles
 * the implementation (see `app/composition/bridges/window-ports.ts`).
 */
export interface PetOverlayWindowPort {
  /** Pushed activity frame from the primary window — the only state source. */
  onState(callback: (payload: PetOverlayStatePayload) => void): () => void
  /** Send a user intent back to the primary window. */
  control(payload: PetOverlayControl): void
  /** Window mechanics: geometry, mouse pass-through, keyboard focusability. */
  setBounds(bounds: PetOverlayBounds): void
  setIgnoreMouse(ignore: boolean): void
  setFocusable(focusable: boolean): void
}
