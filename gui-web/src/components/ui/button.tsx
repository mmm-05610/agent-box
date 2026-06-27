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

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  isLoading?: boolean
}

// ── Component ──────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  isLoading = false,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
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
      {isLoading && (
        <svg
          className="mr-2 h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const baseStyles = [
  'inline-flex items-center justify-center gap-2',
  'rounded-md font-medium tracking-tight',
  'cursor-pointer select-none',
  'transition-[color,background-color,box-shadow,transform] duration-normal',
  'motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.97]',
  'motion-safe:transition-transform',
  'focus-visible:outline-none',
  'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

const variantStyles = {
  primary:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md hover:-translate-y-px',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
  ghost:
    'bg-transparent text-muted-foreground hover:bg-card-hover hover:text-foreground',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive-hover hover:shadow-md hover:-translate-y-px',
} as const

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
  lg: 'h-10 px-6 text-base',
} as const