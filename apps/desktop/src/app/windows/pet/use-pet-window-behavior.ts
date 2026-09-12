import { type RefObject, useCallback, useEffect, useRef } from 'react'

import { type PetZoomAnchor, usePetZoomGesture } from '@/components/pet/use-pet-zoom-gesture'
import { type PetInfo } from '@/store/pet'
import { overlayWindowSize } from '@/store/pet-overlay'

import type { PetOverlayWindowPort } from './port'

// Fallbacks mirror pet-sprite's defaults; the pushed state normally carries real values.
const DEFAULT_FRAME_W = 192
const DEFAULT_FRAME_H = 208
const DEFAULT_SCALE = 0.33

// Must match the view's paddingBottom — the sprite renders bottom-centered, this
// many px above the window's bottom edge. Used to anchor the resize.
export const PET_PADDING_BOTTOM = 24

// A sprite pixel counts as "solid" (interactive) at/above this alpha (0-255).
// Low enough to catch anti-aliased edges, high enough that the faint halo around
// the art still clicks through.
const ALPHA_HIT_THRESHOLD = 16

// Below this much pointer travel, a press counts as a click, not a drag.
const CLICK_SLOP_PX = 3
// A second click within this window is a double-click (raise app) and cancels
// the deferred single-click (open composer), so a double never flashes it open.
const DOUBLE_CLICK_MS = 250

interface DragState {
  startX: number
  startY: number
  offX: number
  offY: number
  width: number
  height: number
  moved: boolean
}

export interface PetWindowBehaviorParams {
  /** The neutral window-host port: geometry, pass-through, focusability, intents. */
  port: PetOverlayWindowPort
  /** The projected pet display info (scale drives the fit-the-window resize). */
  info: PetInfo
  composerOpen: boolean
  /** The mini composer's input, focused when the window becomes keyboard-able. */
  composerInputRef: RefObject<HTMLInputElement | null>
  /** The draggable pet element (also the zoom-gesture surface). */
  petRef: RefObject<HTMLDivElement | null>
  /** A single click on the pet (not a drag, not a double) toggles the mini composer. */
  onComposerToggle: () => void
  /** Paint an optimistic local scale while the host reconciles the wheel resize. */
  paintScale: (scale: number) => void
}

/**
 * The overlay window's mechanical behavior, separate from what it renders:
 *
 * - Click-through: the window is a full rectangle but mostly transparent; only
 *   the solid sprite pixels (plus the bubble / mail button / open composer) are
 *   interactive and the empty margins pass clicks through to whatever is behind.
 * - Drag to move the window anywhere on screen (even outside the app), with
 *   the desktop spot remembered by the host.
 * - Alt+wheel to scale the pet, and the window is grown/shrunk to fit so the
 *   sprite is never cropped (anchored at the cursor, or bottom-center).
 * - Focusability flips on only while the composer needs the keyboard, so the
 *   panel never steals the app's cmd/alt-tab anchor.
 *
 * Clicks on the pet resolve single vs shift vs double: shift-click pops the pet
 * back into the window, double-click toggles the app window, a plain click
 * toggles the mini composer.
 */
export function usePetWindowBehavior({
  composerInputRef,
  composerOpen,
  info,
  onComposerToggle,
  paintScale,
  petRef,
  port
}: PetWindowBehaviorParams): {
  onPetPointerDown: (event: React.PointerEvent) => void
  onPetPointerMove: (event: React.PointerEvent) => void
  onPetPointerUp: (event: React.PointerEvent) => void
} {
  const dragRef = useRef<DragState | null>(null)
  // Last Alt+wheel anchor, consumed by the resize effect to zoom toward the
  // cursor; null means a non-wheel scale change (slider) → anchor bottom-center.
  const zoomAnchorRef = useRef<PetZoomAnchor | null>(null)
  const ignoreRef = useRef(true)
  const composerOpenRef = useRef(false)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const setIgnore = useCallback(
    (ignore: boolean) => {
      if (ignoreRef.current !== ignore) {
        ignoreRef.current = ignore
        port.setIgnoreMouse(ignore)
      }
    },
    [port]
  )

  // Click-through: make only the *solid* sprite pixels (plus the bubble / mail
  // button / open composer) interactive — clicks on the transparent rectangle
  // around the art pass through to whatever's behind. With ignore+forward, the
  // renderer still receives mousemove so we can re-arm the moment the cursor
  // returns to a solid pixel.
  useEffect(() => {
    setIgnore(true)

    // True when the point sits on a solid sprite pixel or on the pet's other
    // interactive chrome (bubble, mail button). Over the canvas we sample the
    // rendered alpha; elsewhere inside the pet (bubble/button) we trust DOM
    // hit-testing. Anything else is transparent backdrop.
    const isInteractiveAt = (x: number, y: number): boolean => {
      const pet = petRef.current
      const target = document.elementFromPoint(x, y)

      if (!pet || !target || !pet.contains(target)) {
        return false
      }

      if (!(target instanceof HTMLCanvasElement)) {
        return true
      }

      const rect = target.getBoundingClientRect()

      if (rect.width === 0 || rect.height === 0) {
        return true
      }

      const ctx = target.getContext('2d')

      if (!ctx) {
        return true
      }

      const px = Math.floor((x - rect.left) * (target.width / rect.width))
      const py = Math.floor((y - rect.top) * (target.height / rect.height))

      try {
        return ctx.getImageData(px, py, 1, 1).data[3] >= ALPHA_HIT_THRESHOLD
      } catch {
        // Tainted/zero-size read — fail open so the pet stays grabbable.
        return true
      }
    }

    const onMove = (ev: MouseEvent) => {
      if (dragRef.current || composerOpenRef.current) {
        setIgnore(false)

        return
      }

      setIgnore(!isInteractiveAt(ev.clientX, ev.clientY))
    }

    window.addEventListener('mousemove', onMove)

    return () => {
      window.removeEventListener('mousemove', onMove)
      clearTimeout(clickTimerRef.current)
    }
  }, [petRef, setIgnore])

  // The whole window must stay interactive while the composer is open (so the
  // input keeps focus); focus it on open. The overlay is a non-activating panel
  // (so it never steals the app's cmd/alt-tab anchor) — flip it focusable while
  // the composer needs the keyboard, then back to non-activating when it closes.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    composerOpenRef.current = composerOpen

    port.setFocusable(composerOpen)

    if (composerOpen) {
      setIgnore(false)
      // The OS window has to become key first (setFocusable + focus happen in
      // the host), so focus the input on the next frame.
      requestAnimationFrame(() => composerInputRef.current?.focus())
    }
  }, [composerInputRef, composerOpen, port, setIgnore])

  const onPetPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) {
      return
    }

    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = {
      height: window.outerHeight,
      moved: false,
      offX: e.screenX - window.screenX,
      offY: e.screenY - window.screenY,
      startX: e.screenX,
      startY: e.screenY,
      width: window.outerWidth
    }
  }

  const onPetPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current

    if (!drag) {
      return
    }

    if (Math.hypot(e.screenX - drag.startX, e.screenY - drag.startY) > CLICK_SLOP_PX) {
      drag.moved = true
    }

    port.setBounds({
      height: drag.height,
      width: drag.width,
      x: e.screenX - drag.offX,
      y: e.screenY - drag.offY
    })
  }

  const onPetPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)

    if (!drag) {
      return
    }

    if (drag.moved) {
      // A drag cancels any deferred single-click so the composer can't pop open
      // after you reposition the pet.
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = undefined

      // Remember the spot on the desktop (screen coords) so the pet reopens here
      // next time / after a restart.
      port.control({
        bounds: { height: drag.height, width: drag.width, x: e.screenX - drag.offX, y: e.screenY - drag.offY },
        type: 'bounds'
      })

      return
    }

    // Shift-click always pops the pet back in (no double-click ambiguity).
    if (e.shiftKey) {
      port.control({ type: 'pop-in' })

      return
    }

    // Double-click toggles the app window (minimize ↔ restore); defer the
    // single-click composer toggle so a double never flashes the composer open.
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = undefined
      port.control({ type: 'toggle-app' })

      return
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = undefined
      onComposerToggle()
    }, DOUBLE_CLICK_MS)
  }

  // Alt+wheel over the popped-out pet resizes it. Paint the new scale locally
  // for instant feedback, then ask the primary window to persist it (it pushes
  // the reconciled scale back). Stash the cursor anchor for the resize effect;
  // the window itself is grown to fit there.
  const onScale = useCallback(
    (next: number, anchor: PetZoomAnchor) => {
      zoomAnchorRef.current = anchor
      paintScale(next)
      port.control({ scale: next, type: 'scale' })
    },
    [paintScale, port]
  )

  usePetZoomGesture(petRef, onScale, Boolean(info.enabled && info.spritesheetBase64))

  // Grow/shrink the OS overlay window to fit the pet at its current scale so the
  // sprite is never cropped — covers both the wheel gesture here and a scale
  // changed from the app's settings slider (pushed in as a state update). With a
  // wheel anchor we zoom toward the cursor (keep the pixel under it fixed);
  // otherwise we anchor the bottom-center (the pet's feet stay planted). New
  // bounds are persisted so the pet reopens at the right size.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (!info.enabled || !info.spritesheetBase64) {
      return
    }

    const { width, height } = overlayWindowSize(
      info.frameW ?? DEFAULT_FRAME_W,
      info.frameH ?? DEFAULT_FRAME_H,
      info.scale ?? DEFAULT_SCALE
    )

    const curW = window.outerWidth
    const curH = window.outerHeight

    if (width === curW && height === curH) {
      zoomAnchorRef.current = null

      return
    }

    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null

    // The sprite scales about its bottom-center, at window-local (curW/2,
    // curH - paddingBottom). Hold the anchor pixel fixed on screen as it scales;
    // with no wheel anchor we pin the bottom-center itself (ratio 1 ⇒ no shift).
    const ratio = anchor?.ratio ?? 1
    const ax = anchor?.clientX ?? curW / 2
    const ay = anchor?.clientY ?? curH - PET_PADDING_BOTTOM

    const bounds = {
      height,
      width,
      x: Math.round(window.screenX + ax - (ax - curW / 2) * ratio - width / 2),
      y: Math.round(window.screenY + ay - (ay - (curH - PET_PADDING_BOTTOM)) * ratio - (height - PET_PADDING_BOTTOM))
    }

    port.setBounds(bounds)
    port.control({ bounds, type: 'bounds' })
  }, [info.enabled, info.spritesheetBase64, info.scale, info.frameW, info.frameH, port])

  return { onPetPointerDown, onPetPointerMove, onPetPointerUp }
}
