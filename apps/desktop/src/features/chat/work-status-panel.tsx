import { useState } from 'react'

import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n'
import { cn } from '@/lib/utils'

type WorkCopy = Translations['composer']['emptyState']

/** P20 work status panel: collapsed single line by default; expanded shows
 *  available facts. Dimensions with no backend source (git, goals,
 *  sub-agents, background) are NOT rendered — per the work order's honesty
 *  discipline. Uses existing `motion` and Tailwind tokens; no new deps. */
export function WorkStatusPanel({ busy, elapsedSeconds, queueCount, className }: {
  busy: boolean
  elapsedSeconds: number
  queueCount: number
  className?: string
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const copy: WorkCopy = t.composer.emptyState

  const mm = Math.floor(elapsedSeconds / 60)
  const ss = String(elapsedSeconds % 60).padStart(2, '0')

  return (
    <div data-work-status-panel="">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[0.6875rem] text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(prev => !prev)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-1.5 shrink-0 rounded-full',
            busy ? 'animate-pulse bg-(--ui-accent)' : 'bg-(--ui-stroke-quaternary)'
          )}
        />
        <span className="truncate">
          {busy ? `${copy.waiting} · ${mm}:${ss}` : '—'}
        </span>
        {queueCount > 0 && <span className="ml-auto tabular-nums">{queueCount}</span>}
      </button>
      {expanded && (
        <div className="border-t border-(--ui-stroke-tertiary) px-2 py-1.5 text-xs text-muted-foreground">
          <div>{copy.subtitle}</div>
        </div>
      )}
    </div>
  )
}
