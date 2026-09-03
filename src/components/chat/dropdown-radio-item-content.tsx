"use client"

import type { ReactNode } from "react"

interface DropdownRadioItemContentProps {
  label: string
  description?: string | null
  /**
   * Optional leading mark (e.g. the harness icon on the agent dropdown's
   * rows). Rendered before the label, sized by the caller.
   */
  icon?: ReactNode
}

export function DropdownRadioItemContent({
  label,
  description,
  icon,
}: DropdownRadioItemContentProps) {
  const normalizedDescription = description?.trim()

  return (
    <div className="flex w-full min-w-0 items-start gap-2 pr-2" title={label}>
      {icon ? <span className="mt-0.5 flex shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate">{label}</p>
        {normalizedDescription ? (
          <p className="text-muted-foreground mt-0.5 text-xs leading-snug whitespace-pre-wrap wrap-break-word">
            {normalizedDescription}
          </p>
        ) : null}
      </div>
    </div>
  )
}
