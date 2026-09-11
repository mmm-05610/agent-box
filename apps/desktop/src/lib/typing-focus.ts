/**
 * The typing-focus handoff channel: one event, one dispatcher, one subscriber.
 *
 * Dismissing a keyboard-driven overlay (the ⌘K palette, the model menu) ends its
 * claim on focus. Radix returns focus to the TRIGGER on close, which for the
 * model menu is a toolbar button — so committing with Enter left the next
 * keystroke going nowhere instead of into the message you were about to write.
 *
 * The dispatcher names no surface and the subscriber does the focusing
 * (`app/hooks/use-keybinds.ts` wires it to the composer bus), so this stays
 * ignorant of what "typing" means anywhere in particular. That is why it sits on
 * the leaf layer: the store that dismisses a palette and the app that owns the
 * composer both need it, and neither may be reached from here.
 */

const RELEASE_EVENT = 'hermes:release-typing-focus'

/** Hand the keyboard back to wherever the user was typing. */
export function releaseTypingFocus(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RELEASE_EVENT))
  }
}

/** Subscribe to the handoff. Returns the unsubscribe. */
export function onReleaseTypingFocus(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  window.addEventListener(RELEASE_EVENT, handler)

  return () => window.removeEventListener(RELEASE_EVENT, handler)
}
