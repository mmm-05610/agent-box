/**
 * Input — Text input field
 *
 * Sizes: sm, md (default), lg
 *
 * @example
 *   <Input placeholder="Search..." />
 *   <Input size="sm" error="Name is required" />
 */

import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  error?: string
  label?: ReactNode
}

// ── Component ──────────────────────────────────────────────────────────

export function Input({ size = 'md', error, label, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
      )}
      <input
        className={cn(
          'w-full rounded-md bg-input px-3 text-foreground placeholder:text-muted-foreground',
          'border border-border',
          'transition-colors duration-fast',
          'focus:outline-none focus:border-foreground/30',
          'hover:border-foreground/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-destructive' : '',
          sizeStyles[size],
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const sizeStyles = {
  sm: 'h-8 text-sm',
  md: 'h-9 text-base',
  lg: 'h-10 text-lg',
} as const
