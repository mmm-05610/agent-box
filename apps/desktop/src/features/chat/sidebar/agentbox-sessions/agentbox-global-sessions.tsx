import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { openSession } from '@/application/session/open-session'
import { refreshAgentBoxSessions } from '@/application/session/wire-session-catalog'
import { Codicon } from '@/components/ui/codicon'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { useI18n } from '@/i18n'
import { formatAgo } from '@/lib/time'
import {
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  agentBoxCapabilitySupported
} from '@/store/agentbox-service'
import { readableError } from '@/store/notifications'
import type { SessionRecord } from '@/types/wire/wire-v1'

import { SidebarSectionHeader } from '../sessions-section'

import { AgentBoxSessionRow } from './agentbox-session-row'

export type AgentBoxGlobalMode = 'archived' | 'search'

/** Pinned first, newest `updatedAt` first, session id as the stable tie-break —
 *  the same order `agentbox-session-projection.ts` applies inside a workspace,
 *  so a record cannot sort differently by which surface shows it. */
export function sortAgentBoxSessions(records: SessionRecord[]): SessionRecord[] {
  const pinned: SessionRecord[] = []
  const recent: SessionRecord[] = []

  for (const session of records) {
    ;(session.pinned ? pinned : recent).push(session)
  }

  const newestFirst = (a: SessionRecord, b: SessionRecord) => {
    const byUpdatedAt = b.updatedAt.localeCompare(a.updatedAt)

    return byUpdatedAt !== 0 ? byUpdatedAt : a.id.localeCompare(b.id)
  }

  pinned.sort(newestFirst)
  recent.sort(newestFirst)

  return [...pinned, ...recent]
}

/**
 * The global projection of the service's SessionRecords. Search filters the
 * cache by `displayName` or service `id`, case-insensitively, over LIVE
 * records only (`archivedAt === null`); Archived is the complementary set
 * (`archivedAt !== null`). Pure over the cache: it invents nothing and never
 * reads, converts or falls back to a legacy Hermes row.
 */
export function projectAgentBoxGlobalSessions(
  sessions: Readonly<Record<string, SessionRecord>>,
  mode: AgentBoxGlobalMode,
  query = ''
): SessionRecord[] {
  const needle = query.trim().toLowerCase()
  const matched: SessionRecord[] = []

  for (const session of Object.values(sessions)) {
    if (mode === 'archived') {
      if (session.archivedAt === null) {
        continue
      }
    } else {
      if (session.archivedAt !== null || !needle) {
        continue
      }

      if (!session.displayName.toLowerCase().includes(needle) && !session.id.toLowerCase().includes(needle)) {
        continue
      }
    }

    matched.push(session)
  }

  return sortAgentBoxSessions(matched)
}

/**
 * The AgentBox authority's whole-list session surfaces: search results and the
 * Archived view. Both read `$agentBoxSessions` — the service cache — and only
 * the Archived view asks the service for more (one `sessions.list` with
 * `includeArchived: true`, once, and ONLY while the service is ready and its
 * hello explicitly declares the capability).
 *
 * A service that cannot answer is never disguised as "no results": the cached
 * rows stay, the service's own state (or the typed failure) is shown as text
 * above them, and nothing here ever calls the legacy Hermes endpoints — no
 * `searchSessions`, no `loadArchivedSessions`, and no pin/archive/delete/branch
 * action on the rows.
 */
export function AgentBoxGlobalSessions({ mode, query }: { mode: AgentBoxGlobalMode; query?: string }) {
  const { t } = useI18n()
  const copy = t.sidebar.agentBoxSession
  const navigate = useNavigate()
  const service = useStore($agentBoxService)
  const hello = useStore($agentBoxHello)
  const sessions = useStore($agentBoxSessions)
  const [loadFailure, setLoadFailure] = useState<null | { detail?: string; message: string }>(null)
  // At most ONE archived fetch per mount: entering Archived asks the service
  // once, when it can answer — never on every render, and never as a delayed
  // fallback to the legacy archive endpoint.
  const [archivedRequestStarted, setArchivedRequestStarted] = useState(false)

  const listDeclared = agentBoxCapabilitySupported(hello, 'sessions.list')
  const archivedLoadable = mode === 'archived' && service.phase === 'ready' && listDeclared

  useEffect(() => {
    if (!archivedLoadable || archivedRequestStarted) {
      return
    }

    setArchivedRequestStarted(true)

    void refreshAgentBoxSessions(agentBoxRuntimeClient(), { includeArchived: true }).catch(error => {
      setLoadFailure(readableError(error, copy.loadFailed))
    })
  }, [archivedLoadable, archivedRequestStarted, copy.loadFailed])

  const records = projectAgentBoxGlobalSessions(sessions, mode, query ?? '')
  const unavailable = service.phase === 'unavailable'
  const unsupported = mode === 'archived' && !unavailable && service.phase === 'ready' && !listDeclared

  const unavailableLine = unavailable ? (
    <div className="px-2 pb-1.5" data-agentbox-global-unavailable={mode}>
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
  ) : null

  // A typed failure is the service's own reason, rendered as text — never
  // swallowed into an "empty" state.
  const failureLine =
    mode === 'archived' && loadFailure ? (
      <div className="px-2 pb-1.5" data-agentbox-global-error={mode}>
        <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <span className="flex items-center gap-2">
            <Codicon name="error" size="0.75rem" />
            {copy.loadFailed}
          </span>
          <span className="mt-0.5 block text-(--ui-text-quaternary)" data-agentbox-global-error-message>
            {loadFailure.message}
          </span>
        </div>
      </div>
    ) : null

  // An old protocol that cannot list sessions is a state to name, not a fetch
  // to fake and not an empty list to imply.
  const unsupportedLine = unsupported ? (
    <div className="px-2 pb-1.5" data-agentbox-global-unsupported={mode}>
      <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
        {copy.listUnsupported}
      </div>
    </div>
  ) : null

  const loadingLine =
    !unavailable && !unsupported && service.phase !== 'ready' && records.length === 0 ? (
      <div className="px-2 pb-1.5" data-agentbox-global-loading={mode}>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          <Codicon name="loading" size="0.75rem" spinning />
          {copy.loading}
        </div>
      </div>
    ) : null

  // The rows we already hold stay on screen in every service phase; the status
  // line only adds what the service can currently do, above them — never
  // instead of them.
  const statusLine = unavailableLine ?? failureLine ?? unsupportedLine ?? loadingLine

  const ageLabels = {
    ageDays: t.agents.ageDays,
    ageHours: t.agents.ageHours,
    ageMinutes: t.agents.ageMinutes,
    ageNow: t.agents.ageNow,
    ageSeconds: t.agents.ageSeconds
  }

  const body =
    records.length > 0 ? (
      <div className="flex flex-col gap-px pb-1.5" data-agentbox-global={mode}>
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
            // Opening is the row's only action: the service session id goes
            // through the one "open this session" door, and no legacy
            // pin/archive/delete/branch handler is ever injected here.
            onOpen={() => openSession(session.id, navigate, 'in-place')}
            session={session}
          />
        ))}
      </div>
    ) : statusLine ? (
      <div data-agentbox-global={mode}>{statusLine}</div>
    ) : (
      <div className="px-2 pb-1.5" data-agentbox-global-empty={mode}>
        <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
          {mode === 'archived' ? copy.archivedEmpty : t.sidebar.noMatch(query ?? '')}
        </div>
      </div>
    )

  return (
    <SidebarGroup
      className="min-h-32 flex-1 overflow-hidden p-0"
      data-agentbox-global-sessions={mode}
    >
      <SidebarSectionHeader
        label={mode === 'archived' ? t.sidebar.sessions : t.sidebar.results}
        onToggle={() => undefined}
        open
      />
      <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-px pb-1.75">{body}</SidebarGroupContent>
    </SidebarGroup>
  )
}
