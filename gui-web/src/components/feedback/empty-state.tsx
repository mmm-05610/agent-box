/**
 * EmptyState — Placeholder when no data exists
 *
 * Visual: large muted circle containing the icon, followed by title,
 * description, and an optional CTA. The circle gives the empty state
 * presence without being loud.
 *
 * @example
 *   <EmptyState
 *     icon="◌"
 *     title="No providers yet"
 *     description="Add a provider to configure API endpoints."
 *     action={<Button>Add provider</Button>}
 *   />
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  /** Tighter padding for inside-list empty states. */
  compact?: boolean
}

export function EmptyState({
  icon = '◌',
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10 px-4' : 'py-16 px-4',
        className,
      )}
    >
      {icon != null && (
        <div
          className={cn(
            'mb-5 flex items-center justify-center rounded-full',
            'bg-gradient-to-br from-muted to-stone-100 dark:from-muted dark:to-stone-900',
            'ring-1 ring-border',
            compact ? 'h-14 w-14 text-2xl' : 'h-20 w-20 text-3xl',
            'text-muted-foreground',
            'shadow-inner',
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          'font-semibold tracking-tight text-foreground',
          compact ? 'text-base mb-1' : 'text-lg mb-2',
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            'text-sm text-muted-foreground max-w-sm leading-relaxed',
            compact ? 'mb-4' : 'mb-6',
          )}
        >
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}