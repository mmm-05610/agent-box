/**
 * Input — Text input field
 *
 * Sizes: sm, md (default), lg
 *
 * @example
 *   <Input placeholder="Search..." />
 *   <Input size="sm" error="Name is required" />
 */

import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md' | 'lg'
  error?: string
}

// ── Component ──────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'md', error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={ref}
          className={cn(
            'w-full rounded-md border bg-card px-3',
            'text-foreground placeholder:text-muted-foreground',
            'transition-colors duration-fast',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-destructive' : 'border-input',
            sizeStyles[size],
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

// ── Styles ─────────────────────────────────────────────────────────────

const sizeStyles = {
  sm: 'h-8 text-sm',
  md: 'h-9 text-base',
  lg: 'h-10 text-lg',
} as const
