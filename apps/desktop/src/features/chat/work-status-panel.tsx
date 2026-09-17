import { useState } from 'react'

import { cn } from '@/lib/utils'

/** P20 work status panel: collapsed single line by default; expanded shows
 *  available facts. Dimensions with no backend source (git, goals, sub-agents,
 *  background) are NOT rendered — per the work order's honesty discipline. */
export interface WorkStatusPanelProps {
  busy: boolean
  elapsedSeconds: number
  queueCount: number
}

export function WorkStatusPanel({ busy, elapsedSeconds, queueCount }: WorkStatusPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const mm = Math.floor(elapsedSeconds / 60)
  const ss = String(elapsedSeconds % 60).padStart(2, '0')

  const parts: string[] = []
  if (busy) parts.push('Running')
  if (queueCount > 0) parts.push(`Queue: ${queueCount}`)
  if (elapsedSeconds > 0) parts.push(`${mm}:${ss}`)

  if (parts.length === 0) return null

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
        {parts.map((part, i) => (
          <span key={i}>{part}</span>
        ))}
      </button>
      {expanded && (
        <div className="border-t border-(--ui-stroke-tertiary) px-2 py-1.5 text-xs text-muted-foreground">
          <div>Details expand here when backend 59/52 data is available.</div>
        </div>
      )}
    </div>
  )
}
