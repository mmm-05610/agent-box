import { type RefObject } from 'react'

import { useI18n } from '@/i18n'

export interface PetOverlayComposerProps {
  /** Focused on open by the window behavior (after the host makes the window key). */
  inputRef: RefObject<HTMLInputElement | null>
  onChange: (draft: string) => void
  onDismiss: () => void
  onSubmit: () => void
  value: string
}

/**
 * The popped-out pet's mini composer — a neutral prompt capture. Enter
 * submits, Escape dismisses; everything else is the surface's decision.
 */
export function PetOverlayComposer({ inputRef, onChange, onDismiss, onSubmit, value }: PetOverlayComposerProps) {
  const { t } = useI18n()

  return (
    <input
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onSubmit()
        } else if (e.key === 'Escape') {
          onDismiss()
        }
      }}
      placeholder={t.windows.pet.composerPlaceholder}
      ref={inputRef}
      style={{
        background: 'var(--ui-bg-elevated)',
        border: '1px solid var(--ui-stroke-secondary)',
        borderRadius: 2,
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        color: 'var(--foreground)',
        fontSize: 12,
        marginBottom: 8,
        outline: 'none',
        padding: '4px 8px',
        width: 184
      }}
      value={value}
    />
  )
}
