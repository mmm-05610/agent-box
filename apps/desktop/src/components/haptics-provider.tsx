import { useStore } from '@nanostores/react'
import { type ReactNode, useEffect } from 'react'
import { useWebHaptics } from 'web-haptics/react'

import { registerHapticTrigger, setHapticsMutedSource } from '@/lib/haptics'
import { $hapticsMuted } from '@/store/haptics'

export function HapticsProvider({ children }: { children: ReactNode }) {
  const muted = useStore($hapticsMuted)
  const { trigger } = useWebHaptics({ debug: true, showSwitch: false })

  useEffect(() => {
    registerHapticTrigger(muted ? null : trigger)
    // Publish the mute preference to `lib/haptics` as well: registration-time
    // gating alone leaves a window where a haptic fires after the user muted,
    // so the dispatch-time check must keep reading live state. No teardown —
    // the getter is stateless, and this component owns both the trigger and
    // the preference for the window's lifetime.
    setHapticsMutedSource(() => $hapticsMuted.get())

    return () => registerHapticTrigger(null)
  }, [muted, trigger])

  // web-haptics builds its AudioContext lazily inside the first trigger(), and
  // the process's first AudioContext pays the CoreAudio spin-up (~850ms stall
  // in profiles) — which landed on the first streamStart haptic as the first
  // token painted. Open/close a throwaway context at idle so the real one
  // connects to an already-warm audio service in single-digit ms.
  useEffect(() => {
    if (typeof requestIdleCallback !== 'function' || typeof AudioContext === 'undefined') {
      return undefined
    }

    const id = requestIdleCallback(
      () => {
        try {
          void new AudioContext().close().catch(() => undefined)
        } catch {
          // No audio device (headless CI) — nothing to warm.
        }
      },
      { timeout: 2000 }
    )

    return () => cancelIdleCallback(id)
  }, [])

  return <>{children}</>
}
