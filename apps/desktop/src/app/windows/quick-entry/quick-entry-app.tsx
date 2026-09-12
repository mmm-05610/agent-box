import { useEffect, useReducer, useRef } from 'react'

import { useI18n } from '@/i18n'
import {
  initialQuickComposerState,
  QUICK_TARGET_CURRENT,
  QUICK_TARGET_NEW,
  type QuickComposerEvent,
  quickComposerReducer,
  type QuickComposerState
} from '@/store/quick-entry'

import type { QuickEntryWindowPort } from './port'

/**
 * The Quick Entry composer — the whole renderer surface of the global-hotkey
 * mini window. Deliberately one input plus a target picker and nothing else:
 * this is a capture surface, not a second chat.
 *
 * All behavior rides `quickComposerReducer` (pure, unit-tested): submit sends
 * the trimmed text + target through the window-host port and asks to hide; an
 * empty submit does neither so a stray Enter can't make the window vanish;
 * Escape and losing focus dismiss without sending; a host that can't accept
 * sends disables the input entirely (the reducer refuses the send AND the
 * input paints the reconnect hint).
 *
 * The window itself has no backend connection. Its view of capture truth —
 * can a prompt be delivered, which visible targets exist — is pushed in by
 * the primary window through the host port (`onState`), and its text goes
 * back the same road to the primary window's normal prompt-submit path.
 */
export interface QuickEntryAppProps {
  /** The neutral window-host port: capture context in, prompt + dismissal out. */
  port: QuickEntryWindowPort
}

export function QuickEntryApp({ port }: QuickEntryAppProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)

  // The reducer returns { send, state }; this wrapper performs the side effect
  // (hand the payload to the host, ask to hide) and stores the next state, so
  // the decision stays pure and testable while the effects stay in one place.
  const [state, dispatch] = useReducer((current: QuickComposerState, event: QuickComposerEvent) => {
    const { send, state: next } = quickComposerReducer(current, event)

    if (send) {
      port.submit(send)
    } else if (!next.visible && current.visible) {
      port.dismiss()
    }

    return next
  }, initialQuickComposerState)

  // Re-summoned by the chord: the shell reuses the window, so reset the draft
  // and take the keyboard back for a fresh capture. Also adopt pushed capture
  // context (deliverability + visible targets) relayed from the primary window.
  useEffect(() => {
    const offShown = port.onShown(() => {
      dispatch({ type: 'shown' })
      requestAnimationFrame(() => inputRef.current?.focus())
    })

    const offState = port.onState(payload => {
      dispatch({
        connected: payload?.connected === true,
        sessions: Array.isArray(payload?.sessions) ? payload.sessions : [],
        type: 'state'
      })
    })

    inputRef.current?.focus()

    return () => {
      offShown()
      offState()
    }
  }, [port])

  return (
    <div
      style={{
        alignItems: 'center',
        background: 'transparent',
        display: 'flex',
        height: '100vh',
        justifyContent: 'center',
        padding: 12,
        width: '100vw'
      }}
    >
      <div
        style={{
          background: 'var(--ui-bg-elevated, var(--background))',
          border: '1px solid var(--ui-stroke-secondary, rgba(127,127,127,0.35))',
          borderRadius: 12,
          boxShadow: '0 18px 48px rgba(0,0,0,0.38)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '10px 14px',
          width: '100%'
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span
            aria-hidden
            style={{
              color: 'var(--muted-foreground, #8a8a8a)',
              flexShrink: 0,
              fontSize: 15,
              lineHeight: 1,
              userSelect: 'none'
            }}
          >
            ›
          </span>
          <input
            aria-label={t.windows.quickEntry.inputLabel}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            disabled={!state.connected}
            onBlur={event => {
              // Moving focus to the target picker is not leaving the window.
              if (!event.relatedTarget) {
                dispatch({ type: 'blur' })
              }
            }}
            onChange={event => dispatch({ draft: event.target.value, type: 'edit' })}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                dispatch({ type: 'submit' })
              } else if (event.key === 'Escape') {
                event.preventDefault()
                dispatch({ type: 'dismiss' })
              }
            }}
            placeholder={
              state.connected ? t.windows.quickEntry.placeholder : t.windows.quickEntry.placeholderDisconnected
            }
            ref={inputRef}
            spellCheck={false}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground, #eee)',
              flex: 1,
              fontFamily: 'inherit',
              fontSize: 15,
              minWidth: 0,
              opacity: state.connected ? 1 : 0.55,
              outline: 'none'
            }}
            value={state.draft}
          />
        </div>
        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
          <label
            htmlFor="quick-entry-target"
            style={{
              color: 'var(--muted-foreground, #8a8a8a)',
              flexShrink: 0,
              fontSize: 11,
              userSelect: 'none'
            }}
          >
            {t.windows.quickEntry.sendTo}
          </label>
          <select
            aria-label={t.windows.quickEntry.targetLabel}
            disabled={!state.connected}
            id="quick-entry-target"
            onChange={event => dispatch({ target: event.target.value, type: 'target' })}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                dispatch({ type: 'dismiss' })
              }
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--ui-stroke-secondary, rgba(127,127,127,0.35))',
              borderRadius: 6,
              color: 'var(--foreground, #eee)',
              fontSize: 11,
              maxWidth: 320,
              padding: '2px 6px'
            }}
            value={state.target}
          >
            <option value={QUICK_TARGET_CURRENT}>{t.windows.quickEntry.targetCurrent}</option>
            <option value={QUICK_TARGET_NEW}>{t.windows.quickEntry.targetNew}</option>
            {state.sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
