import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { sessionRoute } from '@/app/routes'
import { projectAgentBoxSessionsForWorkspace } from '@/application/session/agentbox-session-projection'
import { archiveAgentBoxSession, updateAgentBoxSession } from '@/application/session/wire-session-catalog'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { formatAgo } from '@/lib/time'
import {
  $agentBoxCatalogReadiness,
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  agentBoxCapabilitySupported
} from '@/store/agentbox-service'
import { notifyError, readableError } from '@/store/notifications'
import { selectWorkspaceView } from '@/store/workspace-view'
import type { SessionRecord, WorkspaceRecord } from '@/types/wire/wire-v1'

import { AgentBoxSessionRow } from './agentbox-session-row'

interface RenameTarget {
  displayName: string
  sessionId: string
  version: number
}

/** The CAS basis archive captures when the menu item fires: the record the row
 *  was showing at that moment, never a later re-read. */
interface ArchiveTarget {
  displayName: string
  sessionId: string
  version: number
}

/**
 * The AgentBox SessionRecords of ONE service Workspace, in the shell row that
 * matched it. Ownership is by the service's own record — the shell row handed
 * us a matched WorkspaceRecord, so this list shows service truth or nothing:
 * the records already cached stay on screen through a loading or unavailable
 * service (with an honest, localized status line and the service's own
 * reason), a catalog that has not arrived is a loading state, and it NEVER
 * falls back to the legacy Hermes session rows.
 *
 * Rename and pin ride `sessions.update`, archive rides `sessions.archive` —
 * each behind its own declared capability — with the version CAS the sidebar
 * row showed at intent time; nothing is optimistic — only the service's
 * returned record enters the projection, and the projection's own
 * `archivedAt !== null` filter is what removes an archived row.
 */
export function AgentBoxSessionList({ shellId, workspace }: { shellId: string; workspace: WorkspaceRecord }) {
  const { t } = useI18n()
  const copy = t.sidebar.agentBoxSession
  const navigate = useNavigate()
  const service = useStore($agentBoxService)
  const readiness = useStore($agentBoxCatalogReadiness)
  const sessions = useStore($agentBoxSessions)
  const hello = useStore($agentBoxHello)

  // Rename/pin exist only when the service is ready AND hello explicitly
  // declares `sessions.update`; archive needs `sessions.archive`. The two
  // gates are independent — an old hello that declares one still offers only
  // that one, and the rows stay readable and openable either way, with zero
  // wire calls when neither is declared.
  const maintenanceAvailable = service.phase === 'ready' && agentBoxCapabilitySupported(hello, 'sessions.update')
  const archiveAvailable = service.phase === 'ready' && agentBoxCapabilitySupported(hello, 'sessions.archive')

  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamePending, setRenamePending] = useState(false)
  const [renameError, setRenameError] = useState<null | string>(null)
  const [pinPendingId, setPinPendingId] = useState<null | string>(null)

  // The cache is the projection; the service phase only says what it can do
  // next. Records we already hold keep rendering in EVERY phase — a service
  // that is loading or unavailable never hides its own sessions and never
  // hands the row back to the legacy Hermes session list.
  const records = projectAgentBoxSessionsForWorkspace(sessions, workspace.id)
  const catalogReady = service.phase === 'ready' && readiness.sessions
  const status = service.phase === 'unavailable' ? 'unavailable' : catalogReady ? 'ready' : 'loading'

  const openSession = (session: SessionRecord) => {
    // Opening an existing session: select the shell row it lives in, then
    // navigate to its route. Registration (workspaces.open), sends and
    // harness starts are not part of opening a record.
    selectWorkspaceView(shellId)
    navigate(sessionRoute(session.id))
  }

  const rename = (session: SessionRecord) => {
    // Capture exactly what the row showed at the moment of intent — id,
    // version, name. The CAS basis is the displayed record, not a later
    // re-read that a landing response could have changed.
    setRenameError(null)
    setRenameDraft(session.displayName)
    setRenameTarget({ displayName: session.displayName, sessionId: session.id, version: session.version })
  }

  const submitRename = async () => {
    // The service must still be able to answer when Save is pressed: an intent
    // opened while ready and submitted after the service went away is not sent
    // on faith. The dialog and the draft stay, nothing is written.
    if (!renameTarget || renamePending || !maintenanceAvailable) {
      return
    }

    const trimmed = renameDraft.trim()

    if (!trimmed || trimmed === renameTarget.displayName) {
      setRenameTarget(null)

      return
    }

    setRenamePending(true)
    setRenameError(null)

    try {
      // Not optimistic: only the service's answer enters the projection, so
      // the row keeps its old name until the service confirms — and shows
      // the service's normalization when it rewrites ours.
      await updateAgentBoxSession(agentBoxRuntimeClient(), {
        displayName: trimmed,
        expectedVersion: renameTarget.version,
        sessionId: renameTarget.sessionId
      })

      setRenameTarget(null)
    } catch (error) {
      // CONFLICT_VERSION and typed failures keep the dialog open with the
      // draft and the service projection intact, the reason visible — no
      // retry, no silent version bump.
      setRenameError(readableError(error, copy.renameFailed).message)
    } finally {
      setRenamePending(false)
    }
  }

  const togglePin = async (session: SessionRecord) => {
    if (!maintenanceAvailable || pinPendingId === session.id) {
      return
    }

    setPinPendingId(session.id)

    try {
      await updateAgentBoxSession(agentBoxRuntimeClient(), {
        expectedVersion: session.version,
        pinned: !session.pinned,
        sessionId: session.id
      })
    } catch (error) {
      // Nothing was written locally, so the old pinned state stands; the
      // service's reason surfaces as a toast.
      notifyError(error, session.pinned ? copy.unpinFailed : copy.pinFailed)
    } finally {
      setPinPendingId(null)
    }
  }

  const archive = (session: SessionRecord) => {
    // Capture exactly what the row showed at the moment of intent — id,
    // version, name. The service's answer, not this snapshot, updates the
    // projection; an archived record leaves by its own `archivedAt`, never by
    // a local hide.
    setArchiveTarget({ displayName: session.displayName, sessionId: session.id, version: session.version })
  }

  const confirmArchive = async () => {
    if (!archiveTarget) {
      return
    }

    // The service must still be callable AND still declare the capability at
    // confirm time: a dialog that outlived the service it was opened on is
    // not sent on faith. The dialog stays open and names the failure — never
    // a pretend success. Read live, not from render closure.
    if (
      $agentBoxService.get().phase !== 'ready' ||
      !agentBoxCapabilitySupported($agentBoxHello.get(), 'sessions.archive')
    ) {
      throw new Error(copy.archiveFailed)
    }

    try {
      // Not optimistic: only the service's returned record enters the cache,
      // and its `archivedAt` (not a local hide) is what leaves the
      // projection. Nothing else happens — no navigation, no selection, no
      // stop, no deletion.
      await archiveAgentBoxSession(agentBoxRuntimeClient(), {
        expectedVersion: archiveTarget.version,
        sessionId: archiveTarget.sessionId
      })
    } catch (error) {
      // CONFLICT_VERSION and typed failures keep the dialog open with the
      // service's reason visible — no retry, no silent version bump, no
      // legacy archive fallback.
      throw new Error(readableError(error, copy.archiveFailed).message)
    }
  }

  // The honest service status that accompanies the records instead of
  // replacing them: `unavailable` names the state and carries the service's
  // own reason (or the localized fallback when it gave none), `loading` is the
  // catalog that has not arrived. Rendering the reason as text is the whole
  // point — it is a sentence from another process, not markup.
  const statusLine =
    status === 'unavailable' ? (
      <div className="px-2 pb-1.5" data-agentbox-sessions-unavailable={workspace.id}>
        <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <span className="flex items-center gap-2">
            <Codicon name="error" size="0.75rem" />
            {copy.unavailable}
          </span>
          <span className="mt-0.5 block text-(--ui-text-quaternary)" data-agentbox-service-detail>
            {service.detail?.trim() ? service.detail : copy.unavailableReasonFallback}
          </span>
        </div>
      </div>
    ) : status === 'loading' ? (
      <div className="px-2 pb-1.5" data-agentbox-sessions-loading={workspace.id}>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <Codicon name="loading" size="0.75rem" spinning />
          {copy.loading}
        </div>
      </div>
    ) : null

  const ageLabels = {
    ageDays: t.agents.ageDays,
    ageHours: t.agents.ageHours,
    ageMinutes: t.agents.ageMinutes,
    ageNow: t.agents.ageNow,
    ageSeconds: t.agents.ageSeconds
  }

  // No cached record to stand on: the service state IS the whole answer —
  // unavailable is not a spinner, a not-yet-arrived catalog is not empty.
  const body =
    records.length === 0
      ? statusLine ?? (
          <div className="px-2 pb-1.5" data-agentbox-sessions-empty={workspace.id}>
            <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
              {copy.empty}
            </div>
          </div>
        )
      : (
          <div className="flex flex-col gap-px pb-1.5" data-agentbox-sessions={workspace.id}>
            {/* The cached rows are already the truth; the status line only adds
                what the service can currently do, above them, never instead of
                them. */}
            {statusLine}
            {records.map(session => (
              <AgentBoxSessionRow
                key={session.id}
                labels={{
                  menuActions: copy.menuActions,
                  menuArchive: copy.menuArchive,
                  menuPin: copy.menuPin,
                  menuRename: copy.menuRename,
                  menuUnpin: copy.menuUnpin,
                  pinned: copy.pinned
                }}
                meta={formatAgo(Date.parse(session.updatedAt), ageLabels)}
                onArchive={archiveAvailable ? () => archive(session) : undefined}
                onOpen={() => openSession(session)}
                onPin={maintenanceAvailable ? () => void togglePin(session) : undefined}
                onRename={maintenanceAvailable ? () => rename(session) : undefined}
                pending={pinPendingId === session.id}
                session={session}
              />
            ))}

            {renameTarget && (
              <AgentBoxSessionRenameDialog
                draft={renameDraft}
                error={renameError}
                name={renameTarget.displayName}
                onClose={() => setRenameTarget(null)}
                onDraftChange={setRenameDraft}
                onSubmit={() => void submitRename()}
                pending={renamePending}
              />
            )}
          </div>
        )

  return (
    <>
      {body}

      {/* The list owns the ONLY archive dialog and target. It stays mounted
          while the done beat closes it, even when the archived record was the
          last row and the body is already back to its empty state. */}
      {archiveTarget && (
        <ConfirmDialog
          confirmLabel={copy.menuArchive}
          description={copy.archiveDesc}
          onClose={() => setArchiveTarget(null)}
          onConfirm={confirmArchive}
          open
          title={copy.archiveTitle(archiveTarget.displayName)}
        />
      )}
    </>
  )
}

// The rename dialog locks its own inputs while the CAS is in flight — a
// second save, a cancel and further typing cannot produce an intent the
// in-flight request cannot carry.
function AgentBoxSessionRenameDialog({
  draft,
  error,
  name,
  onClose,
  onDraftChange,
  onSubmit,
  pending
}: {
  draft: string
  error: null | string
  name: string
  onClose: () => void
  onDraftChange: (value: string) => void
  onSubmit: () => void
  pending: boolean
}) {
  const { t } = useI18n()
  const copy = t.sidebar.agentBoxSession
  const trimmed = draft.trim()

  return (
    <Dialog onOpenChange={next => !next && !pending && onClose()} open>
      <DialogContent className="max-w-sm" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{copy.renameTitle(name)}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          disabled={pending}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          value={draft}
        />
        {error && (
          <p className="text-[0.6875rem] leading-4 text-(--ui-red)" data-agentbox-rename-error>
            {error}
          </p>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={pending || !trimmed} onClick={onSubmit} type="button">
            {pending ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
