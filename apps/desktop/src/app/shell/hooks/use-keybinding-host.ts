import { useEffect, useRef } from 'react'

import { contributedKeybindHandler } from '@/lib/keybinds/actions'
import { actionAllowedInInput, comboFromEvent, isEditableTarget } from '@/lib/keybinds/combo'
import { $capture, $comboIndex, endCapture, setBinding } from '@/store/keybinds'

/** What the soft-combo gate decided for the matched action. */
export type KeybindingGateVerdict =
  /** The gate consumed the keydown itself: it prevented default and acted. */
  | 'consumed'
  /** The keydown must do nothing — a dialog, button or terminal owns the key. */
  | 'blocked'
  /** The combo is not soft for this action; dispatch normally. */
  | 'pass'

/**
 * The injected side of the product-neutral keybinding HOST. The host owns the
 * mechanics — listener lifecycle, binding capture, combo normalization,
 * editable gating, dispatch — and knows no action ids and no product
 * behavior; everything that names a product surface is supplied here by the
 * registration that mounts the host (`app/composition/registrations/
 * keybindings.ts`). Contributed actions bring their own `run` through the
 * keybind registry and need no entry in `handlers`.
 */
export interface KeybindingHostBindings {
  /** Rebindable action handlers by action id. */
  readonly handlers: Readonly<Record<string, () => void>>
  /** Consume a keydown BEFORE any combo dispatch (return true) — the one
   *  pre-dispatch interception an open overlay gets (e.g. abandoning itself
   *  on Escape before the registry can act on the same key). */
  readonly interceptKeyDown?: (event: KeyboardEvent) => boolean
  /** An open surface claims its chords while it is up, so the registry must
   *  not ALSO fire the action bound to the same combo. Both listeners sit on
   *  `window`, so the surface's stopPropagation cannot suppress this
   *  dispatcher — it has to yield explicitly here. */
  readonly claimsCombo?: (combo: string) => boolean
  /** An unbound printable keydown (no action bound to the combo). Bound
   *  chords win above this; the registration turns it into type-to-focus. */
  readonly onUnboundKey?: (event: KeyboardEvent) => void
  /** Soft-combo gate for the MATCHED action ('/', Enter): gated so dialogs,
   *  buttons and the terminal keep those keys. */
  readonly gateSoftCombo?: (actionId: string, combo: string, event: KeyboardEvent) => KeybindingGateVerdict
}

// Mount once near the top of the app. Owns the single global keydown listener
// for every rebindable hotkey: it dispatches the injected action for the
// pressed combo, or — while capture mode is active (edit overlay / panel
// rebind) — records the pressed combo.
export function useKeybindingHost(bindings: KeybindingHostBindings): void {
  // Keep the latest closures without re-subscribing the listener.
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // An active IME composition owns the keyboard. Windows Chinese IMEs
      // (Microsoft Pinyin, Sogou) use Ctrl+, as their punctuation-mode toggle,
      // so without this guard that keystroke ALSO matched a navigation binding
      // and navigated away mid-word — unmounting the composer and destroying
      // the unsent draft (#41079). The draft stash that makes navigation safe
      // lives in the registration; this makes the IME keystroke not navigate
      // at all.
      if (event.isComposing) {
        return
      }

      // Capture mode: the next real key becomes the binding. Swallow everything
      // so e.g. ⌘K rebinds instead of opening the palette.
      const capturing = $capture.get()

      if (capturing) {
        event.preventDefault()
        event.stopPropagation()

        if (event.key === 'Escape') {
          endCapture()

          return
        }

        const combo = comboFromEvent(event)

        if (!combo) {
          return
        }

        setBinding(capturing, [combo])
        endCapture()

        return
      }

      // Pre-dispatch interception: an open overlay consumes its key (Esc
      // abandon) before any combo dispatch — ⌃Tab keeps stepping through
      // its existing handler.
      if (bindingsRef.current.interceptKeyDown?.(event)) {
        return
      }

      const combo = comboFromEvent(event)

      if (!combo) {
        return
      }

      // The open surface owns its chords; bail here so the registry doesn't
      // ALSO fire the action bound to the same combo.
      if (bindingsRef.current.claimsCombo?.(combo)) {
        return
      }

      const actionId = $comboIndex.get().get(combo)

      // Unbound printable → registration policy (type-to-focus). Bound
      // chords (shift+n, …) win above.
      if (!actionId) {
        bindingsRef.current.onUnboundKey?.(event)

        return
      }

      if (isEditableTarget(event.target) && !actionAllowedInInput(actionId, combo)) {
        return
      }

      // Soft '/' / Enter: gated so dialogs/buttons/terminal keep those keys.
      // Rebound chords fall through to the normal handler.
      const verdict = bindingsRef.current.gateSoftCombo?.(actionId, combo, event) ?? 'pass'

      if (verdict !== 'pass') {
        return
      }

      // Injected handlers first (they carry React context); contributed
      // actions bring their own `run` through the registry.
      const handler = bindingsRef.current.handlers[actionId] ?? contributedKeybindHandler(actionId)

      if (!handler) {
        return
      }

      event.preventDefault()
      handler()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [])
}
