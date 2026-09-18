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

/** The trailing menu's copy. The menu EXISTS only when at least one handler
 *  was injected (`sessions.update` for rename/pin, `sessions.archive` for
 *  archive); the list injects handlers, this row never wires. */
export interface AgentBoxSessionRowLabels {
  menuActions: string
  menuArchive: string
  menuPin: string
  menuRename: string
  menuUnpin: string
  pinned: string
  /** The service has an execution in flight for this row. */
  running: string
  /** Local visibility, not service truth — the label says so. */
  unreadLocal: string
}

export interface AgentBoxSessionRowProps {
  labels: AgentBoxSessionRowLabels
  /** The session's age for the secondary slot — localized by the list. */
  meta?: null | string
  /** Archive this record on the service. Receives the row's own record at
   *  intent time; the confirm dialog and the CAS belong to the list. */
  onArchive?: () => void
  /** The row's ONE primary action: open the session the record stands for. */
  onOpen: () => void
  /** Maintenance affordances. Absent = no affordance and zero wire calls —
   *  the row stays readable and openable either way. */
  onPin?: () => void
  onRename?: () => void
  /** This row's own maintenance is waiting on the service: menu locks. */
  pending?: boolean
  /** The service projection says this session has work in flight. */
  running?: boolean
  session: SessionRecord
  /** This window has not opened this record since it last changed. */
  unread?: boolean
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
  onArchive,
  onOpen,
  onPin,
  onRename,
  pending = false,
  running = false,
  session,
  unread = false
}: AgentBoxSessionRowProps) {
  const kebab = onRename || onPin || onArchive
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
            {onArchive ? (
              <DropdownMenuItem disabled={pending} onSelect={() => onArchive()}>
                <Codicon name="archive" size="0.875rem" />
                <span>{labels.menuArchive}</span>
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
            {running ? (
              // The service's execution state, painted where the row's leading
              // glyph lives. Not a spinner: it says "this session has work in
              // flight", the same fact the composer's busy gate reads.
              <Tip label={labels.running}>
                <span
                  aria-label={labels.running}
                  className="block size-1.5 rounded-full bg-(--ui-accent)"
                  data-agentbox-session-running=""
                  role="img"
                />
              </Tip>
            ) : session.pinned ? (
              <Tip label={labels.pinned}>
                <Codicon className="text-(--ui-text-secondary)" name="pinned" size="0.75rem" />
              </Tip>
            ) : (
              <span aria-hidden="true" className="size-1 rounded-full bg-(--ui-stroke-quaternary)" />
            )}
          </SidebarRowLeadGlyph>
        </SidebarRowLead>
        <span className="min-w-0 flex-1 truncate text-xs leading-4">{session.displayName}</span>
        {unread ? (
          // This window has not opened the record since it last changed. The
          // label says "this window" because the wire has no read fact: the
          // dot is local visibility, never a claim about the service.
          <span
            aria-label={labels.unreadLocal}
            className="size-1.5 shrink-0 rounded-full bg-(--ui-accent)"
            data-agentbox-session-unread=""
            role="img"
          />
        ) : null}
        {meta ? <span className="text-[0.625rem] leading-none text-(--ui-text-quaternary)">{meta}</span> : null}
      </SidebarRowBody>
    </SidebarRowShell>
  )
}
