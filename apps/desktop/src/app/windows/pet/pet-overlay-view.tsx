import { type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { PetHeartField } from '@/components/chat/vibe-hearts'
import { PetBubble } from '@/components/pet/pet-bubble'
import { PetSprite } from '@/components/pet/pet-sprite'
import { useI18n } from '@/i18n'
import { Mail } from '@/lib/icons'
import { type PetInfo } from '@/store/pet'

import { PET_PADDING_BOTTOM } from './use-pet-window-behavior'

export interface PetOverlayViewProps {
  /** The mini composer slot, rendered above the pet when open. */
  composer: ReactNode
  info: PetInfo
  /** A click on the transparent backdrop (not the pet/composer) dismisses the composer. */
  onBackdropPointerDown: (event: ReactPointerEvent) => void
  onOpenApp: () => void
  onPetPointerDown: (event: ReactPointerEvent) => void
  onPetPointerMove: (event: ReactPointerEvent) => void
  onPetPointerUp: (event: ReactPointerEvent) => void
  /** The draggable pet element (the window behavior's gesture surface). */
  petRef: RefObject<HTMLDivElement | null>
  unread: boolean
}

// Fallbacks mirror pet-sprite's defaults; the pushed state normally carries real values.
const DEFAULT_FRAME_W = 192
const DEFAULT_FRAME_H = 208
const DEFAULT_SCALE = 0.33

/**
 * The pop-out overlay's only view: a transparent window with the mascot at the
 * bottom and an optional composer above it. Presentation only — every gesture,
 * bounds and pass-through decision lives in `usePetWindowBehavior`, every
 * displayed value in the pushed activity projection.
 */
export function PetOverlayView({
  composer,
  info,
  onBackdropPointerDown,
  onOpenApp,
  onPetPointerDown,
  onPetPointerMove,
  onPetPointerUp,
  petRef,
  unread
}: PetOverlayViewProps) {
  const { t } = useI18n()

  return (
    <div
      onPointerDown={onBackdropPointerDown}
      style={{
        alignItems: 'center',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        justifyContent: 'flex-end',
        paddingBottom: PET_PADDING_BOTTOM,
        userSelect: 'none',
        width: '100vw'
      }}
    >
      {composer}

      <div
        onPointerDown={onPetPointerDown}
        onPointerMove={onPetPointerMove}
        onPointerUp={onPetPointerUp}
        ref={petRef}
        style={{
          alignItems: 'center',
          cursor: 'grab',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          touchAction: 'none'
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <PetBubble />
        </div>
        <div style={{ lineHeight: 0, position: 'relative' }}>
          <PetSprite info={info} pauseWhenUnfocused={false} />

          {/* Hearts on the popped-out pet — identical to in-window. */}
          <PetHeartField
            petH={(info.frameH ?? DEFAULT_FRAME_H) * (info.scale ?? DEFAULT_SCALE)}
            petW={(info.frameW ?? DEFAULT_FRAME_W) * (info.scale ?? DEFAULT_SCALE)}
          />

          {/* Mail icon: only when a finish landed while you were away. Jumps to
              the app's most recent thread. Anchored to the sprite (kept inside
              its box so the overlay's click-through hit-test still catches it);
              stopPropagation keeps a click from starting a window drag. */}
          {unread && (
            <button
              aria-label={t.windows.pet.openInApp}
              onClick={onOpenApp}
              onPointerDown={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              style={{
                alignItems: 'center',
                background: 'var(--ui-bg-elevated)',
                border: '1px solid var(--ui-stroke-secondary)',
                borderRadius: 999,
                boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                color: 'var(--foreground)',
                cursor: 'pointer',
                display: 'inline-flex',
                height: 24,
                justifyContent: 'center',
                padding: 0,
                position: 'absolute',
                right: 0,
                top: 0,
                width: 24
              }}
              title={t.windows.pet.openInApp}
              type="button"
            >
              <Mail style={{ height: 13, width: 13 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
