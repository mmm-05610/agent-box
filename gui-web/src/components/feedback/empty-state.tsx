/**
 * EmptyState — Placeholder when no data exists
 *
 * @example
 *   <EmptyState
 *     icon="📦"
 *     title="No providers yet"
 *     description="Add your first provider to get started."
 *     action={<Button>Add provider</Button>}
 *   />
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

// ── Component ──────────────────────────────────────────────────────────

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        'text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-3xl">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
