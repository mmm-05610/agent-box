/**
 * StatusPill — small "live" indicator pill
 *
 * No box outline — the bg color alone defines the shape. A ring around
 * a tiny pill makes it look like a "form input chip" rather than a live
 * indicator. Live status should feel like a status bar, not a tag.
 */

import { cn } from '@/lib/utils'
import { StatusDot } from '@/components/feedback'

type Variant = 'running' | 'idle' | 'error' | 'info' | 'success'

const VARIANT_STYLES: Record<Variant, string> = {
  running: 'bg-accent/10 text-accent',
  idle: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
}

export function StatusPill({
  variant = 'idle',
  children,
  className,
}: {
  variant?: Variant
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <StatusDot
        variant={
          variant === 'idle'
            ? 'stopped'
            : variant === 'error'
              ? 'error'
              : 'running'
        }
        size="sm"
      />
      {children}
    </span>
  )
}