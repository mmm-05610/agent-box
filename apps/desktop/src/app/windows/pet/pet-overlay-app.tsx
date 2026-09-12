import { useRef, useState } from 'react'

import { playVibeHearts } from '@/components/chat/vibe-hearts'

import { PetOverlayComposer } from './pet-overlay-composer'
import { PetOverlayView } from './pet-overlay-view'
import { type PetOverlayWindowPort } from './port'
import { usePetOverlayState } from './use-pet-overlay-state'
import { usePetWindowBehavior } from './use-pet-window-behavior'

export interface PetOverlayAppProps {
  /** The neutral window-host port: pushed activity frames in, user intents out. */
  port: PetOverlayWindowPort
}

/**
 * The pop-out overlay's surface — a small composition, not a component that
 * does everything. Activity arrives as a local projection (`usePetOverlayState`),
 * window mechanics (drag / click-through / focus / bounds / zoom) live in
 * `usePetWindowBehavior`, and the pieces below pick presentation
 * (`PetOverlayView`) and the prompt capture (`PetOverlayComposer`).
 *
 * This runs in a separate, backend-less BrowserWindow (`?win=overlay`). It is a
 * pure puppet — the primary window pushes the live pet state through the port
 * and we project it locally, so `PetSprite` / `PetBubble` render identically
 * with zero extra logic.
 *
 * Gestures on the pet: drag to move it anywhere on screen (even outside the
 * app), shift-click to pop it back into the window, single-click to open a small
 * composer, double-click to toggle the app window (minimize ↔ restore). A mail
 * icon (shown only when a turn finished while you were away) raises the app on
 * the most recent thread.
 */
export function PetOverlayApp({ port }: PetOverlayAppProps) {
  const { info, markRead, paintScale, unread } = usePetOverlayState({
    onReaction: kind => {
      if (kind === 'vibe') {
        playVibeHearts()
      }
    },
    port
  })

  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const inputRef = useRef<HTMLInputElement | null>(null)
  const petRef = useRef<HTMLDivElement | null>(null)

  const { onPetPointerDown, onPetPointerMove, onPetPointerUp } = usePetWindowBehavior({
    composerInputRef: inputRef,
    composerOpen,
    info,
    onComposerToggle: () => setComposerOpen(open => !open),
    paintScale,
    petRef,
    port
  })

  const send = () => {
    const text = draft.trim()

    if (text) {
      port.control({ text, type: 'submit' })
    }

    setDraft('')
    setComposerOpen(false)
  }

  const openApp = () => {
    // Hide the icon immediately; the primary window also clears the source flag.
    markRead()
    port.control({ type: 'open-app' })
  }

  if (!info.enabled || !info.spritesheetBase64) {
    return null
  }

  return (
    <PetOverlayView
      composer={
        composerOpen ? (
          <PetOverlayComposer
            inputRef={inputRef}
            onChange={setDraft}
            onDismiss={() => setComposerOpen(false)}
            onSubmit={send}
            value={draft}
          />
        ) : null
      }
      info={info}
      onBackdropPointerDown={e => {
        // Click on the transparent backdrop (not the pet/composer) dismisses
        // the composer.
        if (composerOpen && e.target === e.currentTarget) {
          setComposerOpen(false)
        }
      }}
      onOpenApp={openApp}
      onPetPointerDown={onPetPointerDown}
      onPetPointerMove={onPetPointerMove}
      onPetPointerUp={onPetPointerUp}
      petRef={petRef}
      unread={unread}
    />
  )
}
