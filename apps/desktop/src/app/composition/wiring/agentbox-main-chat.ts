import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { routeSessionId, sessionRoute } from '@/app/routes'
import { ensureAgentBoxDesktopCatalog } from '@/application/agentbox-desktop-catalog'
import { submitAgentBoxComposer } from '@/application/session/agentbox-composer'
import {
  hydrateAgentBoxHistory,
  ingestAgentBoxEvent,
  refreshAgentBoxQueue,
  requestAgentBoxStop
} from '@/application/session/wire-session-control'
import { resolveAgentBoxWorkspace } from '@/application/workspace/wire-workspace-catalog'
import { $agentBoxQueues, $agentBoxSessionProjections, $agentBoxStopStates } from '@/store/agentbox-runtime'
import {
  $agentBoxCatalogReadiness,
  $agentBoxService,
  $agentBoxSessions,
  $agentBoxWorkspaces
} from '@/store/agentbox-service'
import { $draftExecutionContexts, composerDraftScopeKey, workspaceDraftScope } from '@/store/composer'
import { $currentCwd } from '@/store/session'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaces } from '@/store/wsl-workspace'
import type { SubmitTextOptions } from '@/types/composer'
import { asWireId, EventFrameSchema } from '@/types/wire/wire-v1'

const BUSY_EXECUTION_STATES = new Set(['queued', 'dispatched', 'running', 'stopping', 'unknown'])

export function useAgentBoxMainChat() {
  const location = useLocation()
  const navigate = useNavigate()
  const service = useStore($agentBoxService)
  const readiness = useStore($agentBoxCatalogReadiness)
  const sessions = useStore($agentBoxSessions)
  const workspaces = useStore($agentBoxWorkspaces)
  const projections = useStore($agentBoxSessionProjections)
  const queues = useStore($agentBoxQueues)
  const stopStates = useStore($agentBoxStopStates)
  const executionContexts = useStore($draftExecutionContexts)
  const selectedWorkspaceId = useStore($workspaceViewSelectedId)
  const currentCwd = useStore($currentCwd)
  const wslWorkspaces = useStore($wslWorkspaces)
  const [streamStart, setStreamStart] = useState<{ cursor: string; sessionId: string } | null>(null)

  useEffect(() => {
    if (!readiness.sessions || !readiness.workspaces || service.phase === 'idle') {
      void ensureAgentBoxDesktopCatalog(agentBoxRuntimeClient()).catch(() => undefined)
    }
  }, [readiness.sessions, readiness.workspaces, service.phase])

  const routedId = routeSessionId(location.pathname)
  const session = routedId ? sessions[routedId] ?? null : null

  const selectedWsl = selectedWorkspaceId
    ? wslWorkspaces.find(workspace => workspace.id === selectedWorkspaceId)
    : undefined

  const workspace = useMemo(
    () =>
      session
        ? workspaces.find(candidate => candidate.id === session.workspaceId) ?? null
        : resolveAgentBoxWorkspace(workspaces, {
            currentPath: selectedWorkspaceId ? currentCwd || null : null,
            selectedId: selectedWorkspaceId,
            ...(selectedWsl
              ? { wsl: { distribution: selectedWsl.distribution, rootPath: selectedWsl.rootPath } }
              : {})
          }),
    [currentCwd, selectedWorkspaceId, selectedWsl, session, workspaces]
  )

  const sessionId = session?.id ?? null
  const draftScopeKey = sessionId ?? (workspace ? workspaceDraftScope(workspace.id) : null)

  const executionContext = executionContexts[composerDraftScopeKey(draftScopeKey)] ?? {
    overrides: [],
    profileId: null
  }

  const profileId = session?.profileId ?? executionContext.profileId
  const projection = sessionId ? projections[sessionId] : undefined
  const execution = projection?.execution ?? null
  const busy = Boolean(execution && BUSY_EXECUTION_STATES.has(execution.state))
  const catalogReady = service.phase === 'ready' && readiness.sessions && readiness.workspaces
  const sendAvailable = Boolean(catalogReady && workspace && (session || profileId))

  useEffect(() => {
    if (!catalogReady || !sessionId) {
      setStreamStart(null)
      return
    }

    setStreamStart(null)
    const client = agentBoxRuntimeClient()
    let cancelled = false

    void Promise.all([hydrateAgentBoxHistory(client, sessionId), refreshAgentBoxQueue(client, sessionId)])
      .then(([history]) => {
        if (!cancelled && history.outcome === 'snapshot' && history.projection.resumeCursor) {
          setStreamStart({ cursor: history.projection.resumeCursor, sessionId })
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [catalogReady, sessionId])

  useEffect(() => {
    const subscribeEvents = window.agentBoxDesktop?.wire.subscribeEvents

    if (
      !subscribeEvents ||
      !sessionId ||
      !streamStart ||
      streamStart.sessionId !== sessionId ||
      projection?.needsResync
    ) {
      return
    }

    let subscribed = true
    let alive = true
    let sourceStopped = false
    let unsubscribeSource: () => void = () => {}
    const unsubscribe = () => {
      if (sourceStopped) {
        return
      }

      sourceStopped = true
      try {
        unsubscribeSource()
      } catch {
        // Bridge cleanup is best-effort during unmount and route changes.
      }
    }
    const sourceCleanup = subscribeEvents({ cursor: streamStart.cursor, sessionId }, value => {
      if (!subscribed) {
        return
      }
      const parsed = EventFrameSchema.safeParse(value)

      if (!parsed.success) {
        return
      }

      if (parsed.data.sessionId !== sessionId) {
        return
      }

      const result = ingestAgentBoxEvent(parsed.data)

      if (result.outcome === 'gap') {
        subscribed = false
        unsubscribe()
        setStreamStart(null)
        void hydrateAgentBoxHistory(agentBoxRuntimeClient(), parsed.data.sessionId)
          .then(history => {
            if (alive && history.outcome === 'snapshot' && history.projection.resumeCursor) {
              setStreamStart({ cursor: history.projection.resumeCursor, sessionId })
            }
          })
          .catch(() => undefined)
      }
    })
    unsubscribeSource = sourceCleanup

    if (sourceStopped) {
      try {
        sourceCleanup()
      } catch {
        // Effect cleanup remains best-effort when a source closes during setup.
      }
    }

    return () => {
      alive = false
      subscribed = false
      unsubscribe()
    }
  }, [projection?.needsResync, sessionId, streamStart])

  const onSubmit = useCallback(
    async (text: string, options?: SubmitTextOptions) => {
      if (
        !sendAvailable ||
        !workspace ||
        !draftScopeKey ||
        options?.draftVersion === undefined ||
        options.composerScope !== draftScopeKey
      ) {
        return false
      }

      try {
        const result = await submitAgentBoxComposer(agentBoxRuntimeClient(), {
          attachments: options.attachments ?? [],
          draftVersion: options.draftVersion,
          overrides: executionContext.overrides,
          profileId,
          scopeKey: draftScopeKey,
          sessionId,
          text,
          workspaceId: workspace.id
        })

        if (result.outcome === 'sent' && result.acceptedForDraft) {
          const acceptedSessionId = result.decision.outcome === 'accepted' ? result.decision.sessionId : null

          if (!sessionId && acceptedSessionId) {
            navigate(sessionRoute(acceptedSessionId))
          }

          if (acceptedSessionId) {
            void hydrateAgentBoxHistory(agentBoxRuntimeClient(), acceptedSessionId).catch(() => undefined)
          }
        }

        return result.acceptedForDraft
      } catch {
        return false
      }
    },
    [draftScopeKey, executionContext.overrides, navigate, profileId, sendAvailable, sessionId, workspace]
  )

  const onCancel = useCallback(async () => {
    if (!sessionId || !execution || !busy) {
      return
    }

    await requestAgentBoxStop(agentBoxRuntimeClient(), {
      executionId: asWireId(execution.executionId),
      sessionId: asWireId(sessionId)
    })
  }, [busy, execution, sessionId])

  return {
    busy,
    catalogReady,
    draftScopeKey,
    onCancel,
    onSubmit,
    profileId,
    projection,
    queue: sessionId ? queues[sessionId] ?? [] : [],
    runtimeAuthority: 'agentbox' as const,
    sendAvailable,
    service,
    session,
    sessionId,
    stopState: sessionId ? stopStates[sessionId] : undefined,
    workspace
  }
}
