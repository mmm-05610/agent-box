import type { ReactNode } from 'react'

import { Codicon } from '@/components/ui/codicon'

interface PanelEmptyProps {
  action?: ReactNode
  description?: ReactNode
  // Codicon glyph name (e.g. 'hubot', 'warning', 'loading~spin').
  icon?: string
  title?: ReactNode
}

export function PanelEmpty({ action, description, icon = 'inbox', title }: PanelEmptyProps) {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <Codicon className="text-muted-foreground/50" name={icon} size="1.25rem" />
        {title ? <p className="text-sm font-medium text-foreground/90">{title}</p> : null}
        {description ? (
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/70">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}
