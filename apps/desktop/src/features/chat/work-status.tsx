import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * P20 work status line: surfaces only the facts the product already holds —
 * turn running state, elapsed seconds, queue count. A dimension with no
 * backend source (git, goals, sub-agents, background) is not rendered.
 *
 * This is NOT the full P20 panel (five cards + expand/collapse); it is the
 * collapsed single line that the order describes as the default state.
 */
export function WorkStatusLine({ busy, elapsedSeconds, queueCount, className }: {
  busy: boolean
  elapsedSeconds: number
  queueCount: number
  className?: string
}) {
  const { t } = useI18n()

  const parts: string[] = []

  if (busy) {
    parts.push(t.composer.emptyState.waiting)
  }

  if (queueCount > 0) {
    parts.push(`${t.composer.queueMessage}: ${queueCount}`)
  }

  if (elapsedSeconds > 0) {
    parts.push(`${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`)
  }

  if (parts.length === 0) {
    return null
  }

  return (
    <div
      className={cn('flex items-center gap-1.5 px-2 py-0.5 text-[0.6875rem] text-muted-foreground', className)}
      data-work-status=""
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
    </div>
  )
}
