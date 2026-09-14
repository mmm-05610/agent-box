import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useRef } from 'react'

import { reconnectWslWorkspaceProjection } from '@/application/workspace/wsl-workspace-usecases'
import { Pill } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tip } from '@/components/ui/tooltip'
import { type NewSessionSplitHandler, startNewSessionDrag } from '@/features/chat/new-session-drag'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $workspaceViewSelectedId, selectWorkspaceView } from '@/store/workspace-view'
import { openWslWorkspaceInfo, type WslWorkspaceValidationState } from '@/store/wsl-workspace'
import type { WorkspaceListItem, WslWorkspaceRecord } from '@/types/workspace'

import {
  SidebarGroupRow,
  type SidebarGroupTotals,
  SidebarRowGrab,
  SidebarRowLead,
  SidebarRowLink,
  SidebarRowNest
} from '../chrome'
import { useWorkspaceNodeOpen } from '../projects/model'
import { projectIcon } from '../projects/overview-row'
import { ProjectContextMenu, ProjectMenu } from '../projects/project-menu'
import { WorkspaceAddButton } from '../projects/workspace-header'

import { WorkspaceContent } from './workspace-content'

/**
 * The shared workspace-row skeleton (36R): ONE row language for local folders
 * and WSL workspaces — name first, a lead glyph, the same select convention
 * (the main row is the select surface), the same disclosure caret for expand,
 * and the same action cluster on the trailing edge. Backend-specific bits
 * (badges, menus, status marks) arrive as slots; nothing here knows which
 * authority produced the row.
 */
export function WorkspaceRowShell({
  actions,
  className,
  expanded = false,
  expandedContent,
  label,
  lead,
  rowId,
  selected,
  toggle,
  totals,
  ...props
}: React.ComponentProps<'div'> & {
  actions?: React.ReactNode
  expanded?: boolean
  expandedContent?: React.ReactNode
  label: React.ReactNode
  lead: React.ReactNode
  rowId: string
  selected: boolean
  toggle?: { ariaLabel: string; data?: Record<string, string>; onToggle: () => void; open: boolean }
  totals?: SidebarGroupTotals
}) {
  return (
    <div
      className={cn('relative', className)}
      data-workspace-row={rowId}
      data-workspace-row-selected={selected ? rowId : undefined}
      {...props}
    >
      <SidebarGroupRow
        // The workspace list's hidden actions must not squeeze the name: the
        // overlay keeps the trailing controls out of flow while idle.
        actions={actions}
        actionsOverlay
        label={label}
        lead={lead}
        toggle={toggle}
        totals={totals}
      />
      {expanded && expandedContent ? <SidebarRowNest>{expandedContent}</SidebarRowNest> : null}
    </div>
  )
}

export interface LocalWorkspaceRowProps {
  project: SidebarProjectTree
  item: WorkspaceListItem
  activeProjectId?: null | string
  /** The workspace's session rows (the existing session-tree renderer, passed
   *  through as props — the local tree rendering is reused, not rewritten). */
  content?: React.ReactNode
  /** True when there is something to reveal (previews) — gates the caret. */
  expandable: boolean
  onEnter?: (id: string) => void
  onNewSession?: (path: null | string) => void
  onNewSessionSplit?: NewSessionSplitHandler
  reorderable?: boolean
  dragging?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  ref?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
}

/**
 * A local folder's workspace row: the project-overview row, rebuilt on the
 * shared skeleton. The main row's click ACTIVATES the workspace — it sets the
 * one neutral selection (the same atom the WSL rows read) and enters the
 * project; expansion reveals the session previews through WorkspaceContent.
 */
export function LocalWorkspaceRow({
  project,
  item,
  activeProjectId,
  content,
  expandable,
  onEnter,
  onNewSession,
  onNewSessionSplit,
  reorderable = false,
  dragging = false,
  dragHandleProps,
  ref,
  style
}: LocalWorkspaceRowProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const isActive = project.id === activeProjectId
  // The row highlight reads the ONE neutral selection, exactly like the WSL
  // rows — entering the project through any path writes the same atom (the
  // navigation coordinator), so "local A → WSL B → local A" always leaves a
  // single current selection instead of two half-truths.
  const selected = useStore($workspaceViewSelectedId) === project.id
  const [open, toggleOpen] = useWorkspaceNodeOpen(project.id)
  // The appearance popover anchors here (the full row) so it opens flush with
  // the sidebar's content edge regardless of which side the sidebar is on.
  const rowRef = useRef<HTMLDivElement>(null)

  const lead = reorderable ? (
    <SidebarRowGrab
      ariaLabel={s.projects.reorder(project.label)}
      dragging={dragging}
      dragHandleProps={dragHandleProps}
      leadClassName="overflow-visible"
    >
      {projectIcon(project)}
    </SidebarRowGrab>
  ) : (
    <SidebarRowLead>{projectIcon(project)}</SidebarRowLead>
  )

  const labelLink = (
    <SidebarRowLink
      // The glyph is aria-hidden and the tooltip only speaks on hover, so the
      // link's own name carries the auto cue — screen readers get it too.
      aria-label={
        project.isAuto ? `${s.projects.enter(project.label)} (${s.projects.autoDiscovered})` : s.projects.enter(project.label)
      }
      labelClassName={cn('hover:text-foreground hover:underline', isActive && 'text-foreground')}
      onClick={() => onEnter?.(project.id)}
    >
      {project.label}
    </SidebarRowLink>
  )

  const shell = (
    <WorkspaceRowShell
      actions={
        <>
          {/* Home is a bucket, not a record, so there's nothing to rename or
              delete — but it still starts sessions: a null path is the "no
              folder" chat. New session sits outermost: it's the one you reach
              for. */}
          {!project.isNoProject && <ProjectMenu anchorRef={rowRef} isActive={isActive} project={project} />}
          {onNewSession && (
            <WorkspaceAddButton
              label={s.newSessionIn(project.label)}
              onClick={() => onNewSession(project.path)}
              onPointerDown={
                onNewSessionSplit
                  ? event => {
                      // Drag the "+" onto a chat zone: create the session
                      // pinned to this project's cwd, exactly where it's
                      // dropped. A sub-threshold release falls through to the
                      // onClick above (ordinary new session in main).
                      startNewSessionDrag(
                        placement => {
                          onNewSessionSplit(placement.dir, {
                            anchor: placement.anchor,
                            before: placement.before,
                            cwd: project.path
                          })
                        },
                        event,
                        { cwd: project.path, label: s.newSessionIn(project.label) }
                      )
                    }
                  : undefined
              }
            />
          )}
        </>
      }
      className={cn(dragging && 'cursor-grabbing bg-(--ui-sidebar-surface-background)')}
      data-glass-opaque={dragging ? '' : undefined}
      expanded={Boolean(open && expandable)}
      expandedContent={<WorkspaceContent item={item} sessionContent={content} />}
      label={project.isAuto ? <Tip label={s.projects.autoDiscovered}>{labelLink}</Tip> : labelLink}
      lead={lead}
      ref={rowRef}
      rowId={project.id}
      selected={selected}
      // The label is grab surface too, not just the lead's grabber — same
      // listeners, minus the controls that keep their own gestures. A project
      // row has no rival drag (its title navigates on CLICK), so the sortable
      // owns the press outright.
      {...dragHandleProps}
      onPointerDown={event => {
        if ((event.target as HTMLElement).closest('[data-reorder-handle], [data-row-actions]')) {
          return
        }

        dragHandleProps?.onPointerDown?.(event)
      }}
      style={style}
      toggle={
        expandable ? { ariaLabel: s.projects.toggle(project.label, !open), onToggle: toggleOpen, open } : undefined
      }
      totals={{ costUsd: project.totalCostUsd ?? 0, tokens: project.totalTokens ?? 0 }}
    />
  )

  return (
    // Tag each project sibling with its id so a custom skin can target one
    // project in the list — the parallel to the entered-project wrapper's
    // `data-sessions-project`, which only fires once you've drilled in.
    <div className={cn(dragging && 'relative z-10')} data-sessions-project={project.id} ref={ref} style={style}>
      {/* Home has no per-project actions, so it gets no right-click menu. */}
      {project.isNoProject ? (
        shell
      ) : (
        <ProjectContextMenu isActive={isActive} project={project}>
          {shell}
        </ProjectContextMenu>
      )}
    </div>
  )
}

export interface WslWorkspaceRowProps {
  infoOpen: boolean
  item: WorkspaceListItem
  onEnter?: (workspace: WslWorkspaceRecord) => void
  onRemove: (target: { id: string; name: string }) => void
  onRename: (target: { id: string; name: string }) => void
  state: WslWorkspaceValidationState | undefined
  workspace: WslWorkspaceRecord
}

/**
 * A WSL workspace row on the SAME skeleton as the local rows: name first, the
 * small WSL badge as the only marking, the shared disclosure caret (expand =
 * the honest no-sessions prompt via WorkspaceContent), and the kebab menu
 * (rename / remove / connection info) plus reconnect. The main row's click
 * SELECTS the workspace — connection info stays on its dedicated button and
 * menu entry, never on the main row.
 */
export function WslWorkspaceRow({ infoOpen, item, onEnter, onRemove, onRename, state, workspace }: WslWorkspaceRowProps) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const validating = state?.status === 'validating'
  const selected = useStore($workspaceViewSelectedId) === workspace.id
  // WSL rows start collapsed — unlike local projects (whose previews read
  // better expanded), the no-sessions prompt is a detail the user opens.
  const [open, toggleOpen] = useWorkspaceNodeOpen(workspace.id, false)

  const labelNode = (
    <button
      aria-label={workspace.name}
      className={cn(
        // `shrink`, not `flex-1`: the label sizes to its content and only gives
        // width up when the row overflows — the shared sidebar convention
        // (SidebarRowLink). With `flex-1` the label's zero basis split the
        // cluster with the disclosure caret, and the shrink-0 WSL badge inside
        // left the name four pixels wide at every window size (measured).
        'flex min-w-0 shrink items-center gap-2 rounded-md bg-transparent p-0 text-left',
        selected && 'text-foreground'
      )}
      onClick={() => {
        selectWorkspaceView(workspace.id)
        onEnter?.(workspace)
      }}
      type="button"
    >
      {/* Two stacked lines, name first: the name must stay readable even
          when the badges squeeze the row — a name collapsed to zero width
          reads as a distribution, not a project. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs leading-4">{workspace.name}</span>
        <span className="block truncate text-[0.625rem] leading-3.5 text-(--ui-text-quaternary)">
          {workspace.distribution} · {workspace.rootPath}
        </span>
      </span>
      {/* No standing Verified/Not-verified badges (round 36): an unverified
          reopen is not a fault. Validation shows a spinner only while it runs,
          and a real failure shows one quiet actionable marker — never a faked
          online state. */}
      <Pill tone="muted">{w.wslBadge}</Pill>
      {validating && (
        <span className="grid shrink-0 place-items-center text-(--ui-text-tertiary)">
          <Codicon name="loading" size="0.75rem" spinning />
        </span>
      )}
      {state?.status === 'failed' && (
        <Tip label={state.message}>
          <span className="grid shrink-0 place-items-center text-(--ui-red)">
            <Codicon name="error" size="0.75rem" />
          </span>
        </Tip>
      )}
    </button>
  )

  return (
    <WorkspaceRowShell
      actions={
        <>
          <Tip label={w.reconnect}>
            <Button
              aria-label={w.reconnect}
              className="text-(--ui-text-quaternary) hover:text-foreground"
              disabled={validating}
              onClick={() => void reconnectWslWorkspaceProjection(workspace.id)}
              size="icon-xs"
              variant="ghost"
            >
              <Codicon name="refresh" size="0.75rem" />
            </Button>
          </Tip>
          <Tip label={w.connectionInfo}>
            <Button
              aria-label={w.connectionInfo}
              className="text-(--ui-text-quaternary) hover:text-foreground"
              onClick={() => openWslWorkspaceInfo(workspace.id)}
              size="icon-xs"
              variant="ghost"
            >
              <Codicon name="info" size="0.75rem" />
            </Button>
          </Tip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={w.moreActions}
                className="text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                size="icon-xs"
                variant="ghost"
              >
                <Codicon name="kebab-vertical" size="0.75rem" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" sideOffset={6}>
              <DropdownMenuItem onSelect={() => onRename({ id: workspace.id, name: workspace.name })}>
                <Codicon name="edit" size="0.875rem" />
                <span>{w.menuRename}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onRemove({ id: workspace.id, name: workspace.name })}
              >
                <Codicon name="trash" size="0.875rem" />
                <span>{w.menuRemove}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openWslWorkspaceInfo(workspace.id)}>
                <Codicon name="info" size="0.875rem" />
                <span>{w.connectionInfo}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      className={cn(infoOpen && 'bg-(--ui-control-hover-background)')}
      data-wsl-workspace-row={workspace.id}
      expanded={open}
      expandedContent={<WorkspaceContent item={item} />}
      label={labelNode}
      lead={
        <span className="grid size-4 shrink-0 place-items-center text-(--ui-text-tertiary)">
          <Codicon name="vm-connect" size="0.875rem" />
        </span>
      }
      rowId={workspace.id}
      selected={selected}
      toggle={{
        ariaLabel: w.toggleExpand(workspace.name, open),
        data: { 'data-wsl-workspace-expand': workspace.id },
        onToggle: toggleOpen,
        open
      }}
    />
  )
}
