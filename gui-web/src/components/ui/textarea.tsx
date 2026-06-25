/**
 * Textarea — Multi-line text input
 *
 * @example
 *   <Textarea placeholder="Enter JSON..." rows={6} />
 *   <Textarea error="Invalid JSON" />
 */

import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

// ── Component ──────────────────────────────────────────────────────────

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-md border bg-card px-3 py-2',
            'text-foreground placeholder:text-muted-foreground',
            'font-mono text-sm leading-relaxed',
            'transition-colors duration-fast',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'resize-y min-h-[80px]',
            error ? 'border-destructive' : 'border-input',
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

Textarea.displayName = 'Textarea'
