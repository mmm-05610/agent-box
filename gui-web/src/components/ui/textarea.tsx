/**
 * Textarea — Multi-line text input
 *
 * @example
 *   <Textarea placeholder="Enter JSON..." rows={6} />
 *   <Textarea error="Invalid JSON" />
 */

import type { TextareaHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  label?: ReactNode
}

// ── Component ──────────────────────────────────────────────────────────

export function Textarea({ error, label, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
      )}
      <textarea
        className={cn(
          'w-full rounded-md bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground',
          'font-mono text-sm leading-relaxed',
          'transition-all duration-fast',
          'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:shadow-md',
          'hover:shadow-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-y min-h-[80px]',
          error ? 'ring-1 ring-destructive' : 'shadow-sm',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}