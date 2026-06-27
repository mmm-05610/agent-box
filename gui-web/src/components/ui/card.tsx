/**
 * Card — Elevated surface with three depth tiers
 *
 * Elevation tiers (visually distinct — not just border + shadow-sm everywhere):
 * - "flat"     — borderless embedded rows (Sessions table rows, in-list cards)
 * - "default"  — content cards (Help, Settings) with subtle shadow
 * - "elevated" — hero cards (ProfileCard, ProviderCard, Home stat tiles) with
 *                stronger shadow + hover lift. Primary surface type.
 *
 * Depth is communicated primarily through SHADOW, not borders. Borders
 * are kept very subtle so cards feel like floating surfaces, not
 * wireframe outlines.
 *
 * @example
 *   <Card elevation="flat">       list row
 *   <Card elevation="default">    settings card
 *   <Card elevation="elevated">   primary profile card
 */

import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Card ───────────────────────────────────────────────────────────────

export type CardElevation = 'flat' | 'default' | 'elevated'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hoverable?: boolean
  elevation?: CardElevation
}

const elevationStyles: Record<CardElevation, string> = {
  flat: 'rounded-lg bg-card/80',
  default:
    'rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.06)]',
  elevated:
    'rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.08),0_12px_28px_-8px_rgba(0,0,0,0.12)]',
}

const elevationHoverStyles: Record<CardElevation, string> = {
  flat: 'hover:bg-card',
  default:
    'hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_4px_16px_rgba(0,0,0,0.10)]',
  elevated:
    'hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.12),0_20px_40px_-12px_rgba(0,0,0,0.16)]',
}

export function Card({
  children,
  hoverable = false,
  elevation = 'default',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        elevationStyles[elevation],
        'text-card-foreground',
        // Default transitions (color + shadow) — transform added per elevation
        'transition-[color,background-color,box-shadow,transform] duration-normal',
        'motion-safe:transition-transform',
        hoverable &&
          cn(
            elevationHoverStyles[elevation],
            // Add lift + scale on elevated cards
            elevation === 'elevated' &&
              'hover:-translate-y-1 motion-safe:hover:scale-[1.005]',
            elevation === 'default' && 'hover:-translate-y-0.5',
          ),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ── Card parts ────────────────────────────────────────────────────────

export function CardHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 p-5 pb-3', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }) {
  return (
    <h3
      className={cn('text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export function CardDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }) {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export function CardContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={cn('p-5 pt-0', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={cn('flex items-center gap-2 p-5 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  )
}