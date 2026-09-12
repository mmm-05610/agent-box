import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { $petActivity, $petInfo, type PetInfo, setPetInfo } from '@/store/pet'

import type { PetOverlayWindowPort } from './port'

export interface PetOverlayStateParams {
  /** The neutral window-host port: pushed activity frames in. */
  port: PetOverlayWindowPort
  /** A new reaction beat arrived from the primary window (id bumped). */
  onReaction: (kind: string) => void
}

export interface PetOverlayViewModel {
  info: PetInfo
  /** A turn finished while the user was away; shown as the mail icon until opened. */
  unread: boolean
  /** Paint an optimistic local scale (Alt+wheel) before the host reconciles. */
  paintScale: (scale: number) => void
  /** The user answered the mail icon — drop the glance hint locally. */
  markRead: () => void
}

/**
 * The overlay's activity ViewModel — a LOCAL projection of the pushed frames.
 *
 * The overlay window owns no session state: the primary window remains the
 * single authority and pushes each frame over the host port. This hook projects
 * a frame into the pet's own display atoms (`$petInfo` / `$petActivity`) —
 * exactly what `PetSprite` / `PetBubble` render from — so the popped-out mascot
 * is pixel-identical to the in-window one with zero bespoke render logic. The
 * pushed busy flag rides INSIDE the activity projection; this surface never
 * writes shared session state.
 */
export function usePetOverlayState({ onReaction, port }: PetOverlayStateParams): PetOverlayViewModel {
  const info = useStore($petInfo)
  // Mirrored from the primary window: a finish landed while you were away.
  const [unread, setUnread] = useState(false)
  // Last mirrored reaction id — a bump means the primary window fired a reaction.
  const lastReactionRef = useRef<number | null>(null)
  // Latest-callback ref: the subscription below must not resubscribe (and replay
  // a frame) just because the caller's reaction renderer changed identity.
  const onReactionRef = useRef(onReaction)
  onReactionRef.current = onReaction

  // Mirror pushed state into the pet's display atoms so PetSprite/PetBubble just work.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    const off = port.onState(payload => {
      // Project the pushed frame into the pet's own display atoms.
      setPetInfo(payload.info)
      $petActivity.set({ ...(payload.activity ?? {}), busy: payload.activity?.busy ?? Boolean(payload.busy) })
      setUnread(Boolean(payload.unread))

      // Play a reaction on a new id (ignore the first sync, which just primes it).
      const reaction = payload.reaction ?? null

      if (lastReactionRef.current === null) {
        lastReactionRef.current = reaction?.id ?? 0
      } else if (reaction && reaction.id > lastReactionRef.current) {
        lastReactionRef.current = reaction.id
        onReactionRef.current(reaction.kind)
      }
    })

    // Tell the primary window we're mounted so it pushes the current frame (the
    // subscribe-time pushes during open() can land before this view exists).
    port.control({ type: 'ready' })

    return off
  }, [port])

  const paintScale = useCallback((scale: number) => {
    setPetInfo({ ...$petInfo.get(), scale })
  }, [])

  const markRead = useCallback(() => setUnread(false), [])

  return { info, markRead, paintScale, unread }
}
