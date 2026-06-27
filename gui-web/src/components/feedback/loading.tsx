/**
 * Loading — Loading indicators
 *
 * Variants:
 * - "spinner" (default) — centered spinner with subtle ring
 * - "skeleton"           — list of pulsing placeholder rows
 */

import { cn } from '@/lib/utils'

interface LoadingProps {
  variant?: 'spinner' | 'skeleton'
  rows?: number
  className?: string
}

export function Loading({ variant = 'spinner', rows = 3, className }: LoadingProps) {
  if (variant === 'skeleton') {
    return <SkeletonRows rows={rows} className={className} />
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center py-16',
        className,
      )}
    >
      <div className="relative h-8 w-8">
        {/* Soft background ring */}
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        {/* Spinning accent arc */}
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
      </div>
    </div>
  )
}

function SkeletonRows({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl ring-1 ring-border bg-gradient-to-r from-muted via-muted/60 to-muted"
          style={{
            width: `${80 + ((i * 7) % 20)}%`,
          }}
        />
      ))}
    </div>
  )
}