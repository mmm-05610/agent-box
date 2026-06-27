/**
 * PageHeader — Lightweight, data-first section header
 *
 * Deliberately NOT a marketing-style hero. No "01" number, no uppercase
 * eyebrow, no accent underbar — those are Linear-clones and read as
 * AI-generated. Real apps show real info, not motivational copy.
 *
 * Layout:
 *   Row 1: title (compact) + action (single line, right-aligned)
 *   Row 2: stats line (comma-separated, mono numbers, muted)
 *
 * The stats line is the "not-AI-template" element — it's actual state
 * of the app, not a tagline.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Page name. */
  title: ReactNode
  /** Optional one-line subtitle (use for the product tagline on Home
   *  page; leaves other pages minimal). */
  subtitle?: ReactNode
  /** Live stats line below. Plain text, comma-separated. May include
   *  inline `<StatusDot />` for a "live" indicator. */
  stats?: ReactNode
  /** Optional small "you are here" indicator (e.g. "Home" breadcrumb
   *  on the right of the title row). */
  breadcrumb?: ReactNode
  /** Optional action area on the right of the title row. */
  action?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  stats,
  breadcrumb,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('relative -mx-8 px-8 pt-7 pb-5', className)}>
      {/* Row 1: breadcrumb + title + action */}
      <div className="flex items-center justify-between gap-4 mb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {breadcrumb && (
            <span className="shrink-0 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70">
              {breadcrumb}
            </span>
          )}
          <h1 className="text-[32px] font-bold tracking-[-0.025em] leading-[1.1] text-foreground">
            {title}
          </h1>
        </div>
        {action && (
          <div className="shrink-0 flex items-center gap-2">{action}</div>
        )}
      </div>

      {/* Row 2 (optional): one-line subtitle — use for the product
          tagline on Home so the page has a "branded facade" feel. */}
      {subtitle && (
        <p className="text-[14px] text-muted-foreground leading-relaxed mb-2.5">
          {subtitle}
        </p>
      )}

      {/* Row 3: live data, not a tagline. Mono numbers feel like a
          dashboard, not a brochure. */}
      {stats && (
        <p className="text-[12.5px] text-muted-foreground tabular-nums tracking-tight">
          {stats}
        </p>
      )}
    </header>
  )
}