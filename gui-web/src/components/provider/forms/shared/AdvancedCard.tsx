import { useEffect, useState, type ReactNode } from 'react'
import { ChevronIcon } from './icons'
import { Toggle } from './Toggle'

export interface AdvancedCardProps {
  icon?: ReactNode
  title: string
  /** When true, the card is enabled (highlighted + auto-opens). */
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  enabledLabel?: string
  children: ReactNode
}

/** Collapsible card with a "use custom config" toggle on the right.
 *  Default-closed; auto-opens when `enabled` flips to true. */
export function AdvancedCard({ icon, title, enabled, onEnabledChange, enabledLabel = '使用单独配置', children }: AdvancedCardProps) {
  const [open, setOpen] = useState(enabled)
  useEffect(() => {
    if (enabled) setOpen(true)
  }, [enabled])

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between p-3"
      >
        <span className="flex items-center gap-3 text-sm font-medium">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{enabledLabel}</span>
          <span onClick={(event) => event.stopPropagation()}>
            <Toggle checked={enabled} onChange={onEnabledChange} ariaLabel={enabledLabel} />
          </span>
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && <div className="space-y-4 border-t border-border p-3">{children}</div>}
    </div>
  )
}
