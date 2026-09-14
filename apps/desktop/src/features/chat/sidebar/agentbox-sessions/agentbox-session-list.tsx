import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { sessionRoute } from '@/app/routes'
import { projectAgentBoxSessionsForWorkspace } from '@/application/session/agentbox-session-projection'
import { updateAgentBoxSession } from '@/application/session/wire-session-catalog'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
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

/**
 * The AgentBox SessionRecords of ONE service Workspace, in the shell row that
 * matched it. Ownership is by the service's own record — the shell row handed
 * us a matched WorkspaceRecord, so this list shows service truth or nothing:
 * an honest loading while the catalog has not arrived, a neutral empty state
 * for a workspace without sessions, and it NEVER falls back to the legacy
 * Hermes session rows.
 *
 * Rename and pin ride `sessions.update` with the version CAS the sidebar row
 * showed at intent time; nothing is optimistic — only the service's returned
 * record enters the projection.
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
  // declares `sessions.update` — otherwise the rows stay readable and
  // openable with no affordance and zero wire calls.
  const maintenanceAvailable = service.phase === 'ready' && agentBoxCapabilitySupported(hello, 'sessions.update')

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamePending, setRenamePending] = useState(false)
  const [renameError, setRenameError] = useState<null | string>(null)
  const [pinPendingId, setPinPendingId] = useState<null | string>(null)

  const records = projectAgentBoxSessionsForWorkspace(sessions, workspace.id)

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
    if (!renameTarget || renamePending) {
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

  if (service.phase !== 'ready' || !readiness.sessions) {
    return (
      <div className="px-2 pb-1.5" data-agentbox-sessions-loading={workspace.id}>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <Codicon name="loading" size="0.75rem" spinning />
          {copy.loading}
        </div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="px-2 pb-1.5" data-agentbox-sessions-empty={workspace.id}>
        <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          {copy.empty}
        </div>
      </div>
    )
  }

  const ageLabels = {
    ageDays: t.agents.ageDays,
    ageHours: t.agents.ageHours,
    ageMinutes: t.agents.ageMinutes,
    ageNow: t.agents.ageNow,
    ageSeconds: t.agents.ageSeconds
  }

  return (
    <div className="flex flex-col gap-px pb-1.5" data-agentbox-sessions={workspace.id}>
      {records.map(session => (
        <AgentBoxSessionRow
          key={session.id}
          labels={{
            menuActions: copy.menuActions,
            menuPin: copy.menuPin,
            menuRename: copy.menuRename,
            menuUnpin: copy.menuUnpin,
            pinned: copy.pinned
          }}
          meta={formatAgo(Date.parse(session.updatedAt), ageLabels)}
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
