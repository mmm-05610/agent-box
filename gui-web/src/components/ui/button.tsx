/**
 * Button — Primary CTA and action button
 *
 * Variants: primary (default), secondary, ghost, destructive
 * Sizes: sm, md (default), lg
 *
 * @example
 *   <Button variant="primary" size="md">Save</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 *   <Button variant="destructive">Delete</Button>
 */

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  isLoading?: boolean
}

// ── Component ──────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      children,
      isLoading = false,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          (disabled || isLoading) && 'opacity-50 pointer-events-none',
          className,
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <span className="mr-2 animate-spin">⏳</span>}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

// ── Styles ─────────────────────────────────────────────────────────────

const baseStyles = [
  'inline-flex items-center justify-center gap-2',
  'rounded-md font-medium',
  'transition-colors duration-fast',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ')

const variantStyles = {
  primary: [
    'bg-primary text-primary-foreground',
    'hover:bg-primary-hover',
  ].join(' '),
  secondary: [
    'bg-secondary text-secondary-foreground',
    'hover:bg-secondary-hover',
  ].join(' '),
  ghost: [
    'bg-transparent text-muted-foreground',
    'hover:bg-card-hover hover:text-foreground',
  ].join(' '),
  destructive: [
    'bg-destructive text-destructive-foreground',
    'hover:bg-destructive-hover',
  ].join(' '),
} as const

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
  lg: 'h-10 px-6 text-lg',
} as const
