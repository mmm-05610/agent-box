/**
 * Badge — Small label for status, category, or metadata
 *
 * Variants: neutral (default), primary, success, warning, destructive, info
 *
 * @example
 *   <Badge variant="success">Active</Badge>
 *   <Badge variant="destructive">Error</Badge>
 *   <Badge>Default</Badge>
 */

import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'
  children: ReactNode
}

// ── Component ──────────────────────────────────────────────────────────

export function Badge({
  variant = 'neutral',
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5',
        'text-xs font-medium uppercase tracking-wider',
        'transition-colors duration-fast',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const variantStyles = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  destructive: 'bg-destructive-subtle text-destructive',
  info: 'bg-info-subtle text-info',
} as const
