import { type useSensors } from '@dnd-kit/core'
import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { archiveAgentBoxWorkspace, resolveAgentBoxWorkspace } from '@/application/workspace/wire-workspace-catalog'
import { projectWorkspaceList } from '@/application/workspace/workspace-projection'
import {
  archiveWslWorkspaceProjection,
  renameWslWorkspaceProjection
} from '@/application/workspace/wsl-workspace-usecases'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SidebarGroup } from '@/components/ui/sidebar'
import { type NewSessionSplitHandler } from '@/features/chat/new-session-drag'
import { AgentBoxSessionList } from '@/features/chat/sidebar/agentbox-sessions/agentbox-session-list'
import { useI18n } from '@/i18n'
import {
  $agentBoxHello,
  $agentBoxService,
  $agentBoxWorkspaces,
  agentBoxCapabilitySupported,
  upsertAgentBoxWorkspace
} from '@/store/agentbox-service'
import { notifyError } from '@/store/notifications'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $workspaceViewSelectedId, clearWorkspaceViewSelection } from '@/store/workspace-view'
import { $wslWorkspaceInfoId, $wslWorkspaces, $wslWorkspaceValidation } from '@/store/wsl-workspace'
import type { SessionInfo } from '@/types/hermes'
import type { WorkspaceRecord } from '@/types/wire/wire-v1'

import { latestProjectSessions, PROJECT_PREVIEW_COUNT } from '../projects/model'
import { ReorderableList, useSortableBindings } from '../reorderable-list'
import { SidebarSectionHeader } from '../sessions-section'
import { type SessionAuthority } from '../sidebar-constants'

import { LocalWorkspaceRow, WslWorkspaceRow } from './workspace-row'

/**
 * THE workspace root list (36R). Local folders and WSL workspaces render here
 * as peers, on one row language — independent of session count and of the
 * date/status/flat view preferences (those shape the sessions INSIDE a
 * workspace, never this list). The old "append remote rows after the session
 * content" seam is retired: this component owns the whole workspace body.
 *
 * Session rendering itself is reused, not rewritten: the local rows' preview
 * content arrives through props from the existing session-tree renderer. The
 * WSL projection is refreshed by the composing sidebar on ITS mount (one
 * owner, one fetch) — this list only reads the store.
 */
export function WorkspaceList({
  activeProjectId,
  dndSensors,
  emptyState,
  headerAction,
  label,
  labelMeta,
  onEnterProject,
  onNewSessionInWorkspace,
  onNewSessionSplit,
  onReorderProjects,
  projectRows,
  projectPreviews,
  renderPreviewRows,
  renderRows,
  rootClassName,
  sessionAuthority = 'hermes',
  showAllSessions
}: {
  activeProjectId?: null | string
  dndSensors?: ReturnType<typeof useSensors>
  emptyState?: React.ReactNode
  headerAction?: React.ReactNode
  label: string
  labelMeta?: React.ReactNode
  onEnterProject?: (id: string) => void
  onNewSessionInWorkspace?: (path: null | string) => void
  onNewSessionSplit?: NewSessionSplitHandler
  onReorderProjects?: (ids: string[]) => void
  projectRows: SidebarProjectTree[]
  projectPreviews?: Record<string, SessionInfo[]>
  renderPreviewRows?: (items: SessionInfo[], projectId: string) => React.ReactNode
  renderRows?: (items: SessionInfo[]) => React.ReactNode
  rootClassName?: string
  /** The session authority behind this list. ChatSidebar always passes its own
   *  explicitly; the default keeps direct mounts of this component (tests and
   *  future shells that predate the product runtime) on the legacy contract. */
  sessionAuthority?: SessionAuthority
  showAllSessions: boolean
}) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const copy = t.sidebar.agentBoxArchive
  const wslWorkspaces = useStore($wslWorkspaces)
  const validation = useStore($wslWorkspaceValidation)
  const infoId = useStore($wslWorkspaceInfoId)
  const agentBoxWorkspaces = useStore($agentBoxWorkspaces)
  const agentBoxHello = useStore($agentBoxHello)
  const agentBoxService = useStore($agentBoxService)
  // One rename dialog + one remove confirm for the whole list, aimed at the
  // row whose menu action fired.
  const [renameTarget, setRenameTarget] = useState<null | { id: string; name: string }>(null)
  const [removeTarget, setRemoveTarget] = useState<null | { id: string; name: string }>(null)
  // The list owns the ONLY AgentBox archive dialog and target: rows and menus
  // receive a callback, never the wire client.
  const [archiveTarget, setArchiveTarget] = useState<null | { shellId: string; workspace: WorkspaceRecord }>(null)

  // The service-side twin of a shell row, by the same complete identity the
  // registration uses. Ownership reads the CACHE alone: a matched record keeps
  // its shell row while the service is loading or unavailable, so the row
  // never falls back to the legacy Hermes preview behind the user's back. The
  // service phase decides what a matched row can DO (archive), never what it
  // shows.
  const agentBoxWorkspaceFor = (target: {
    localPath?: string
    wsl?: { distribution: string; rootPath: string; user: null | string }
  }) => resolveAgentBoxWorkspace(agentBoxWorkspaces, target) ?? undefined

  // The archive ACTION additionally needs a service that can answer AND the
  // declared capability: an old hello outliving an unavailable service must
  // not keep offering an entry whose request cannot be executed.
  const agentBoxArchiveFor = (target: Parameters<typeof agentBoxWorkspaceFor>[0]) => {
    if (agentBoxService.phase !== 'ready' || !agentBoxCapabilitySupported(agentBoxHello, 'workspaces.archive')) {
      return undefined
    }

    return agentBoxWorkspaceFor(target)
  }

  const items = projectWorkspaceList({ projects: projectRows, wslWorkspaces })
  const itemsById = new Map(items.map(item => [item.id, item]))

  const hasRows = projectRows.length > 0 || wslWorkspaces.length > 0

  // Product runtime's neutral answer for a local row the service has no
  // Workspace for: the row says so instead of rendering legacy Hermes session
  // previews. It invents no rows, and a Home bucket (not a record, never a
  // service workspace) simply stays unexpandable.
  const notProvided = (projectId: string) => (
    <div className="px-1 pb-1.5" data-agentbox-workspace-unavailable={projectId}>
      <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
        {t.sidebar.agentBoxSession.workspaceNotProvided}
      </div>
    </div>
  )

  const localRow = (
    project: SidebarProjectTree,
    dragging = false,
    dragHandleProps?: React.HTMLAttributes<HTMLElement>,
    ref?: React.Ref<HTMLDivElement>,
    style?: React.CSSProperties
  ) => {
    // The overview rows carry their activity stamp from the backend
    // (previewSessions), falling back to loaded session times when present —
    // the same rule the old overview branch applied.
    const limit = showAllSessions ? Infinity : PROJECT_PREVIEW_COUNT
    const fetched = (projectPreviews?.[project.id] ?? []).slice(0, limit)

    const preview =
      renderRows || renderPreviewRows ? (fetched.length ? fetched : latestProjectSessions(project, limit)) : []

    // Home is a bucket, not a record, and a row without its own folder has no
    // location — neither can carry a service Workspace.
    const serviceWorkspace =
      !project.isNoProject && project.path ? agentBoxWorkspaceFor({ localPath: project.path }) : undefined

    // A matched service Workspace OWNS the expanded content: its AgentBox
    // Sessions render here (loading/unavailable/empty included) and the legacy
    // preview rows never bleed back in. The archive action separately needs a
    // callable service and the declared capability.
    const archiveWorkspace =
      !project.isNoProject && project.path ? agentBoxArchiveFor({ localPath: project.path }) : undefined

    const content = serviceWorkspace ? (
      <AgentBoxSessionList key={serviceWorkspace.id} shellId={project.id} workspace={serviceWorkspace} />
    ) : sessionAuthority === 'agentbox' ? (
      // Product runtime: no matched service Workspace means no service
      // sessions to show — the legacy preview rows are never rendered here.
      project.isNoProject ? undefined : notProvided(project.id)
    ) : preview.length
      ? showAllSessions && renderPreviewRows
        ? renderPreviewRows(preview, project.id)
        : renderRows?.(preview)
      : undefined

    return (
      <LocalWorkspaceRow
        activeProjectId={activeProjectId}
        content={content}
        dragging={dragging}
        dragHandleProps={dragHandleProps}
        expandable={Boolean(content)}
        item={
          itemsById.get(project.id) ?? {
            id: project.id,
            backend: 'local',
            name: project.label,
            path: project.path,
            detail: null,
            sessionCount: project.sessionCount
          }
        }
        onArchiveInAgentBox={
          archiveWorkspace ? () => setArchiveTarget({ shellId: project.id, workspace: archiveWorkspace }) : undefined
        }
        onEnter={onEnterProject}
        onNewSession={onNewSessionInWorkspace}
        onNewSessionSplit={onNewSessionSplit}
        project={project}
        ref={ref}
        style={style}
      />
    )
  }

  // Home leads and stays outside the sortable list (a fixture, not a record).
  const home = projectRows[0]?.isNoProject ? projectRows[0] : undefined
  const sortableProjects = home ? projectRows.slice(1) : projectRows
  const projectsDraggable = sortableProjects.length > 1 && !!onReorderProjects

  const body = !hasRows ? (
    emptyState
  ) : (
    <div className="flex flex-col gap-px" data-workspace-list>
      {home && localRow(home)}
      {projectsDraggable && onReorderProjects ? (
        <SortableLocalRows
          dndSensors={dndSensors}
          onReorder={onReorderProjects}
          projects={sortableProjects}
          renderRow={localRow}
        />
      ) : (
        sortableProjects.map(project => localRow(project))
      )}
      {wslWorkspaces.map(workspace => {
        const identity = {
          wsl: {
            distribution: workspace.distribution,
            rootPath: workspace.rootPath,
            user: workspace.actualUser
          }
        }
        // The matched service Workspace owns the expansion exactly like the
        // local rows — its AgentBox Sessions replace the honest "unavailable"
        // prompt, and a WSL row the service never registered keeps it.

        const serviceWorkspace = agentBoxWorkspaceFor(identity)

        return (
          <WslWorkspaceRow
            agentBoxContent={
              serviceWorkspace ? (
                <AgentBoxSessionList key={serviceWorkspace.id} shellId={workspace.id} workspace={serviceWorkspace} />
              ) : undefined
            }
            infoOpen={infoId === workspace.id}
            item={
              itemsById.get(workspace.id) ?? {
                id: workspace.id,
                backend: 'wsl',
                name: workspace.name,
                path: workspace.rootPath,
                detail: `${workspace.distribution} · ${workspace.rootPath}`,
                sessionCount: 0
              }
            }
            key={workspace.id}
            // The selected workspace id is the draft identity. Passing its Linux
            // path through the legacy local-workspace callback would make
            // Electron probe it as a host path, so WSL enters a detached draft
            // until the neutral wire client resolves the workspace by id.
            onArchiveInAgentBox={(() => {
              const archiveWorkspace = agentBoxArchiveFor(identity)

              return archiveWorkspace
                ? () => setArchiveTarget({ shellId: workspace.id, workspace: archiveWorkspace })
                : undefined
            })()}
            onEnter={() => onNewSessionInWorkspace?.(null)}
            onRemove={setRemoveTarget}
            onRename={setRenameTarget}
            state={validation[workspace.id]}
            workspace={workspace}
          />
        )
      })}
    </div>
  )

  return (
    <SidebarGroup className={rootClassName}>
      <SidebarSectionHeader action={headerAction} label={label} meta={labelMeta} onToggle={() => undefined} open />
      {body}

      {renameTarget && (
        <WslWorkspaceRenameDialog
          name={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          workspaceId={renameTarget.id}
        />
      )}

      <ConfirmDialog
        confirmLabel={w.menuRemove}
        description={w.removeDesc}
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) {
            return
          }

          const outcome = await archiveWslWorkspaceProjection(removeTarget.id)

          if (!outcome.ok) {
            notifyError(outcome, w.removeFailed)
          }
        }}
        open={removeTarget !== null}
        title={w.removeTitle(removeTarget?.name ?? '')}
      />

      {/* Archiving the SERVICE record. Local hides and the WSL host's own
          remove stay separate actions; this one edits nothing on disk and
          stops nothing that is running. Mounted only once a row matched a
          service Workspace, so no copy is read for a row that has none. */}
      {archiveTarget && (
        <ConfirmDialog
          confirmLabel={copy.action}
          description={copy.desc}
          onClose={() => setArchiveTarget(null)}
          onConfirm={async () => {
            const returned = await archiveAgentBoxWorkspace(agentBoxRuntimeClient(), {
              expectedVersion: archiveTarget.workspace.version,
              workspaceId: archiveTarget.workspace.id
            })

            // Selection first, service projection second: the main chat must
            // never observe "the row is still selected but its service
            // Workspace is gone", which would re-register the workspace just
            // archived.
            if (returned.archivedAt !== null && $workspaceViewSelectedId.get() === archiveTarget.shellId) {
              clearWorkspaceViewSelection()
            }

            upsertAgentBoxWorkspace(returned)
          }}
          open
          title={copy.title(archiveTarget.workspace.displayName)}
        />
      )}
    </SidebarGroup>
  )
}

/** dnd-kit must see exactly the ids it renders, in render order — the sortable
 *  set comes from the rows, not from the model. */
function SortableLocalRows({
  dndSensors,
  onReorder,
  projects,
  renderRow
}: {
  dndSensors?: ReturnType<typeof useSensors>
  onReorder: (ids: string[]) => void
  projects: SidebarProjectTree[]
  renderRow: (
    project: SidebarProjectTree,
    dragging?: boolean,
    dragHandleProps?: React.HTMLAttributes<HTMLElement>,
    ref?: React.Ref<HTMLDivElement>,
    style?: React.CSSProperties
  ) => React.ReactNode
}) {
  return (
    <ReorderableList ids={projects.map(project => project.id)} onReorder={onReorder} sensors={dndSensors}>
      {projects.map(project => (
        <SortableLocalRow key={project.id} project={project} renderRow={renderRow} />
      ))}
    </ReorderableList>
  )
}

function SortableLocalRow({
  project,
  renderRow
}: {
  project: SidebarProjectTree
  renderRow: (
    project: SidebarProjectTree,
    dragging?: boolean,
    dragHandleProps?: React.HTMLAttributes<HTMLElement>,
    ref?: React.Ref<HTMLDivElement>,
    style?: React.CSSProperties
  ) => React.ReactNode
}) {
  const { dragging, dragHandleProps, ref, style } = useSortableBindings(project.id)

  return <>{renderRow(project, dragging, dragHandleProps, ref, style)}</>
}

// Record-only rename: the host persists the new display name; the projection
// updates from its answer. A typed failure surfaces as a toast and keeps the
// dialog open for retry.
function WslWorkspaceRenameDialog({
  name,
  onClose,
  workspaceId
}: {
  name: string
  onClose: () => void
  workspaceId: string
}) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const trimmed = value.trim()

  const submit = async () => {
    if (busy || !trimmed || trimmed === name) {
      onClose()

      return
    }

    setBusy(true)

    const outcome = await renameWslWorkspaceProjection(workspaceId, trimmed)

    setBusy(false)

    if (!outcome.ok) {
      notifyError(outcome, w.renameFailed)

      return
    }

    onClose()
  }

  return (
    <Dialog onOpenChange={next => !next && !busy && onClose()} open>
      <DialogContent className="max-w-sm" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{w.renameTitle(name)}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          disabled={busy}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          value={value}
        />
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={busy || !trimmed} onClick={() => void submit()} type="button">
            {busy ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
