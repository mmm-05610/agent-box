/**
 * StatusDot — small status indicator with optional pulse animation.
 *
 * Used in Sidebar (running sessions), SessionsPage rows, and any
 * place that needs to surface "alive / idle / error" at a glance.
 *
 * Variants:
 * - "running" — green dot with subtle pulse ring (live feel)
 * - "stopped" — muted gray dot, static
 * - "error"   — red dot, static
 * - "warning" — amber dot, static
 */

import { cn } from '@/lib/utils'

export type StatusDotVariant = 'running' | 'stopped' | 'error' | 'warning'

interface StatusDotProps {
  variant: StatusDotVariant
  size?: 'sm' | 'md'
  pulse?: boolean
  className?: string
}

const COLOR_MAP: Record<StatusDotVariant, string> = {
  running: 'bg-success',
  stopped: 'bg-muted-foreground',
  error: 'bg-destructive',
  warning: 'bg-warning',
}

export function StatusDot({
  variant,
  size = 'sm',
  pulse,
  className,
}: StatusDotProps) {
  const dotSize = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2'
  const showPulse = pulse ?? variant === 'running'

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      aria-hidden="true"
    >
      {/* Pulse ring — only for running */}
      {showPulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            COLOR_MAP[variant],
          )}
        />
      )}
      {/* Solid dot */}
      <span
        className={cn(
          'relative inline-flex rounded-full',
          dotSize,
          COLOR_MAP[variant],
        )}
      />
    </span>
  )
}