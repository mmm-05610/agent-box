import type * as React from 'react'

import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import type { SessionRecord } from '@/types/wire/wire-v1'

import { SidebarRowBody, SidebarRowLead, SidebarRowLeadGlyph, SidebarRowShell } from '../chrome'

/** The trailing menu's copy. The menu EXISTS only when the service declared
 *  `sessions.update`; the list injects handlers, this row never wires. */
export interface AgentBoxSessionRowLabels {
  menuActions: string
  menuPin: string
  menuRename: string
  menuUnpin: string
  pinned: string
}

export interface AgentBoxSessionRowProps {
  labels: AgentBoxSessionRowLabels
  /** The session's age for the secondary slot — localized by the list. */
  meta?: null | string
  /** The row's ONE primary action: open the session the record stands for. */
  onOpen: () => void
  /** Maintenance affordances. Absent = no affordance and zero wire calls —
   *  the row stays readable and openable either way. */
  onPin?: () => void
  onRename?: () => void
  /** This row's own maintenance is waiting on the service: menu locks. */
  pending?: boolean
  session: SessionRecord
}

/**
 * One AgentBox SessionRecord on the neutral sidebar chrome. Only what the
 * service record itself proves is rendered — displayName, the pinned state
 * and updatedAt as secondary information; a record cannot show a model,
 * cost, tokens, branch, unread count or profile name it does not carry.
 */
export function AgentBoxSessionRow({
  labels,
  meta,
  onOpen,
  onPin,
  onRename,
  pending = false,
  session
}: AgentBoxSessionRowProps) {
  const kebab = onRename || onPin
    ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={labels.menuActions}
              className="grid size-5 shrink-0 place-items-center rounded-md text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
              data-agentbox-session-menu={session.id}
              type="button"
            >
              <Codicon name="kebab-vertical" size="0.75rem" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44" sideOffset={6}>
            {onRename ? (
              <DropdownMenuItem disabled={pending} onSelect={() => onRename()}>
                <Codicon name="edit" size="0.875rem" />
                <span>{labels.menuRename}</span>
              </DropdownMenuItem>
            ) : null}
            {onPin ? (
              <DropdownMenuItem disabled={pending} onSelect={() => onPin()}>
                <Codicon name={session.pinned ? 'pinned' : 'pin'} size="0.875rem" />
                <span>{session.pinned ? labels.menuUnpin : labels.menuPin}</span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    : null

  return (
    <SidebarRowShell actions={kebab} data-agentbox-session-row={session.id}>
      <SidebarRowBody
        className="group/session text-left"
        data-agentbox-session-open={session.id}
        onClick={onOpen}
      >
        <SidebarRowLead>
          <SidebarRowLeadGlyph>
            {session.pinned ? (
              <Tip label={labels.pinned}>
                <Codicon className="text-(--ui-text-secondary)" name="pinned" size="0.75rem" />
              </Tip>
            ) : (
              <span aria-hidden="true" className="size-1 rounded-full bg-(--ui-stroke-quaternary)" />
            )}
          </SidebarRowLeadGlyph>
        </SidebarRowLead>
        <span className="min-w-0 flex-1 truncate text-xs leading-4">{session.displayName}</span>
        {meta ? <span className="text-[0.625rem] leading-none text-(--ui-text-quaternary)">{meta}</span> : null}
      </SidebarRowBody>
    </SidebarRowShell>
  )
}
