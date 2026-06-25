/**
 * Card — Elevated surface with border and optional hover effect
 *
 * @example
 *   <Card>
 *     <Card.Header>
 *       <Card.Title>Title</Card.Title>
 *     </Card.Header>
 *     <Card.Content>Content</Card.Content>
 *     <Card.Footer>Actions</Card.Footer>
 *   </Card>
 */

import { type HTMLAttributes, type ReactNode, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// ── Card ───────────────────────────────────────────────────────────────

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hoverable?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hoverable = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-card-border bg-card text-card-foreground',
          'transition-all duration-fast',
          hoverable && 'hover:bg-card-hover hover:shadow-sm cursor-pointer',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'

// ── Card.Header ────────────────────────────────────────────────────────

function CardHeader({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 p-4 pb-2', className)}
      {...props}
    >
      {children}
    </div>
  )
}

// ── Card.Title ─────────────────────────────────────────────────────────

function CardTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return (
    <h3
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

// ── Card.Description ───────────────────────────────────────────────────

function CardDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    >
      {children}
    </p>
  )
}

// ── Card.Content ───────────────────────────────────────────────────────

function CardContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('p-4 pt-0', className)} {...props}>
      {children}
    </div>
  )
}

// ── Card.Footer ────────────────────────────────────────────────────────

function CardFooter({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn('flex items-center p-4 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  )
}

// ── Compound export ────────────────────────────────────────────────────

Card.Header = CardHeader
Card.Title = CardTitle
Card.Description = CardDescription
Card.Content = CardContent
Card.Footer = CardFooter
