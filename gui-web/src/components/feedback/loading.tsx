/**
 * Loading — Loading indicators
 *
 * Variants: spinner (default), skeleton
 *
 * @example
 *   <Loading />                          // Centered spinner
 *   <Loading variant="skeleton" rows={3} /> // Skeleton rows
 */

import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

interface LoadingProps {
  variant?: 'spinner' | 'skeleton'
  rows?: number
  className?: string
}

// ── Component ──────────────────────────────────────────────────────────

export function Loading({ variant = 'spinner', rows = 3, className }: LoadingProps) {
  if (variant === 'skeleton') {
    return <SkeletonRows rows={rows} className={className} />
  }

  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────

function SkeletonRows({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-muted"
          style={{ width: `${85 + Math.random() * 15}%` }}
        />
      ))}
    </div>
  )
}
