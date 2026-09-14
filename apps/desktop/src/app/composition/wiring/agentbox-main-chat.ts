import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { wireCapability } from '@/api/wire-v1-client'
import { routeSessionId, sessionRoute } from '@/app/routes'
import { ensureAgentBoxDesktopCatalog } from '@/application/agentbox-desktop-catalog'
import { submitAgentBoxComposer } from '@/application/session/agentbox-composer'
import {
  hydrateAgentBoxHistory,
  ingestAgentBoxEvent,
  refreshAgentBoxQueue,
  requestAgentBoxStop
} from '@/application/session/wire-session-control'
import {
  type AgentBoxWorkspaceSelection,
  openAgentBoxWorkspace,
  type OpenAgentBoxWorkspaceInput,
  resolveAgentBoxWorkspace
} from '@/application/workspace/wire-workspace-catalog'
import { $agentBoxQueues, $agentBoxSessionProjections, $agentBoxStopStates } from '@/store/agentbox-runtime'
import { $pendingAgentBoxSends, pendingAgentBoxSend } from '@/store/agentbox-send-intents'
import {
  $agentBoxCatalogReadiness,
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  $agentBoxWorkspaces,
  agentBoxCapabilitySupported,
  upsertAgentBoxWorkspace
} from '@/store/agentbox-service'
import {
  $draftExecutionContexts,
  composerDraftScopeKey,
  migrateSessionDraft,
  workspaceDraftScope
} from '@/store/composer'
import { $projectTree } from '@/store/projects/scope'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaces } from '@/store/wsl-workspace'
import type { SubmitTextOptions } from '@/types/composer'
import { asWireId, EventFrameSchema, type WorkspacesOpenResult } from '@/types/wire/wire-v1'

const BUSY_EXECUTION_STATES = new Set(['queued', 'dispatched', 'running', 'stopping', 'unknown'])

/** The workspace registration the product asks for: an already-chosen shell
 *  row, expressed in the service's own terms plus the shell row that owns the
 *  draft until the service answers. */
export interface AgentBoxShellWorkspaceTarget {
  environment: OpenAgentBoxWorkspaceInput['environment']
  path: string
  shellId: string
}

export type AgentBoxWorkspaceOpenState =
  { status: 'idle' } | { status: 'opening' } | { status: 'unavailable'; detail: string }

const targetKey = (target: AgentBoxShellWorkspaceTarget): string =>
  JSON.stringify([target.environment.kind, target.environment.host, target.environment.user, target.path])

/** One in-flight registration per exact location. A re-render — or a second
 *  surface on the same row — joins the attempt instead of minting another
 *  requestId; a DIFFERENT location may start its own. */
const workspaceOpenAttempts = new Map<string, Promise<WorkspacesOpenResult>>()

/** The service-side terms of a shell target: WSL carries the host-verified
 *  identity and POSIX path, a local row carries the desktop path as-is. */
function selectionForTarget(target: AgentBoxShellWorkspaceTarget): AgentBoxWorkspaceSelection {
  return target.environment.kind === 'wsl'
    ? {
        wsl: {
          distribution: target.environment.host ?? '',
          rootPath: target.path,
          user: target.environment.user
        }
      }
    : { localPath: target.path }
}

function openShellWorkspaceOnce(
  client: Parameters<typeof openAgentBoxWorkspace>[0],
  target: AgentBoxShellWorkspaceTarget
): Promise<WorkspacesOpenResult> {
  const key = targetKey(target)
  const existing = workspaceOpenAttempts.get(key)

  if (existing) {
    return existing
  }

  const attempt = openAgentBoxWorkspace(client, { environment: target.environment, path: target.path }).finally(() => {
    workspaceOpenAttempts.delete(key)
  })

  workspaceOpenAttempts.set(key, attempt)

  return attempt
}

export function useAgentBoxMainChat() {
  const location = useLocation()
  const navigate = useNavigate()
  const service = useStore($agentBoxService)
  const hello = useStore($agentBoxHello)
  const readiness = useStore($agentBoxCatalogReadiness)
  const sessions = useStore($agentBoxSessions)
  const workspaces = useStore($agentBoxWorkspaces)
  const projections = useStore($agentBoxSessionProjections)
  const queues = useStore($agentBoxQueues)
  const stopStates = useStore($agentBoxStopStates)
  const executionContexts = useStore($draftExecutionContexts)
  const selectedWorkspaceId = useStore($workspaceViewSelectedId)
  const wslWorkspaces = useStore($wslWorkspaces)
  const projectTree = useStore($projectTree)
  const [streamStart, setStreamStart] = useState<{ cursor: string; sessionId: string } | null>(null)

  useEffect(() => {
    if (!readiness.sessions || !readiness.workspaces || service.phase === 'idle') {
      void ensureAgentBoxDesktopCatalog(agentBoxRuntimeClient()).catch(() => undefined)
    }
  }, [readiness.sessions, readiness.workspaces, service.phase])

  const routedId = routeSessionId(location.pathname)
  const session = routedId ? (sessions[routedId] ?? null) : null

  // The shell's own record for the selected row: a WSL row first (it carries
  // the host-verified identity), otherwise the project tree node. The local path
  // is the project's OWN folder — a Home bucket or a project without one has no
  // location to register, and a repo path inside it is not a substitute for the
  // project's path.
  const shellTarget = useMemo<AgentBoxShellWorkspaceTarget | null>(() => {
    if (session || !selectedWorkspaceId) {
      return null
    }

    const selectedWsl = wslWorkspaces.find(workspace => workspace.id === selectedWorkspaceId)

    if (selectedWsl) {
      return selectedWsl.rootPath
        ? {
            environment: { host: selectedWsl.distribution, kind: 'wsl', user: selectedWsl.actualUser },
            path: selectedWsl.rootPath,
            shellId: selectedWsl.id
          }
        : null
    }

    const project = projectTree.find(node => node.id === selectedWorkspaceId)
    const path = project?.path?.trim() ?? ''

    return path ? { environment: { host: null, kind: 'local', user: null }, path, shellId: selectedWorkspaceId } : null
  }, [projectTree, selectedWorkspaceId, session, wslWorkspaces])

  const workspace = useMemo(
    () =>
      session
        ? resolveAgentBoxWorkspace(workspaces, { serviceWorkspaceId: session.workspaceId })
        : resolveAgentBoxWorkspace(workspaces, shellTarget ? selectionForTarget(shellTarget) : {}),
    [session, shellTarget, workspaces]
  )

  const sessionId = session?.id ?? null

  // Until the service answers, the draft belongs to the shell row, so text,
  // attachments, a profile and overrides all survive the registration.
  const draftScopeKey =
    sessionId ??
    (workspace ? workspaceDraftScope(workspace.id) : shellTarget ? workspaceDraftScope(shellTarget.shellId) : null)

  const executionContext = executionContexts[composerDraftScopeKey(draftScopeKey)] ?? {
    overrides: [],
    profileId: null
  }

  const profileId = session?.profileId ?? executionContext.profileId
  const projection = sessionId ? projections[sessionId] : undefined
  const execution = projection?.execution ?? null
  const busy = Boolean(execution && BUSY_EXECUTION_STATES.has(execution.state))
  const catalogReady = service.phase === 'ready' && readiness.sessions && readiness.workspaces

  const [workspaceOpen, setWorkspaceOpen] = useState<AgentBoxWorkspaceOpenState>({ status: 'idle' })

  // Register an already-chosen shell row with the service. Only a location the
  // service does not know yet is opened, an undeclared method is never called,
  // and a failed registration changes nothing the user has: the shell row, the
  // draft and the selection all stay where they are.
  useEffect(() => {
    if (!shellTarget || workspace || !catalogReady) {
      setWorkspaceOpen({ status: 'idle' })

      return
    }

    const capability = hello
      ? wireCapability(hello, 'workspaces.open')
      : { id: 'workspaces.open', reason: 'CAPABILITY_NOT_DECLARED', supported: false }

    if (!capability.supported) {
      setWorkspaceOpen({ detail: capability.reason || 'CAPABILITY_NOT_DECLARED', status: 'unavailable' })

      return
    }

    let cancelled = false

    setWorkspaceOpen({ status: 'opening' })

    void openShellWorkspaceOnce(agentBoxRuntimeClient(), shellTarget).then(
      result => {
        // Re-read where the user is NOW: a late answer for an abandoned row may
        // join the service cache, but it must not drag the interface, the draft
        // or the selection back to that row.
        if ($workspaceViewSelectedId.get() !== shellTarget.shellId) {
          upsertAgentBoxWorkspace(result.workspace)

          return
        }

        // Hand the unsent work over before the components switch scope; an
        // already-used destination keeps its own content.
        migrateSessionDraft(workspaceDraftScope(shellTarget.shellId), workspaceDraftScope(result.workspace.id))

        if (!cancelled) {
          upsertAgentBoxWorkspace(result.workspace)
          setWorkspaceOpen({ status: 'idle' })
        }
      },
      error => {
        if (!cancelled) {
          setWorkspaceOpen({
            detail: error instanceof Error ? error.message : String(error),
            status: 'unavailable'
          })
        }
      }
    )

    return () => {
      cancelled = true
    }
  }, [catalogReady, hello, shellTarget, workspace])

  // Recovering an unresolved send and creating a new one have different
  // requirements. Recovery only needs the service to be callable and its query
  // verb declared — the current draft's profile, workspace or configuration are
  // not part of that request and must not block it.
  // Subscribe for re-render on change; the reader below owns the stored shape
  // and always reads the snapshot this render committed to.
  useStore($pendingAgentBoxSends)
  const pendingSend = draftScopeKey ? pendingAgentBoxSend(draftScopeKey) : null

  // While something is outstanding, settling it is the ONLY submittable action:
  // a new intent may not be created until the scope is clear, so the send verb
  // and the effective-config check are not part of this gate.
  const recoveryAvailable = Boolean(
    pendingSend && draftScopeKey && catalogReady && agentBoxCapabilitySupported(hello, 'sendOutcome.query')
  )

  // A new send still requires the effective-config check and the send verb this
  // route would use. A missing declaration is a missing declaration, not an
  // error string to interpret.
  const sendCapabilityDeclared = agentBoxCapabilitySupported(
    hello,
    session ? 'sessions.send' : 'sessions.createAndSend'
  )

  const newSendAvailable = Boolean(
    catalogReady &&
    workspace &&
    agentBoxCapabilitySupported(hello, 'config.resolve') &&
    sendCapabilityDeclared &&
    (session || profileId)
  )

  const sendAvailable = pendingSend ? recoveryAvailable : newSendAvailable

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
        !draftScopeKey ||
        options?.draftVersion === undefined ||
        options.composerScope !== draftScopeKey
      ) {
        return false
      }

      // A pending recovery uses neither identity, so a Workspace that is not
      // resolvable right now must not keep the old request unanswered.
      if (!pendingSend && !workspace) {
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
          workspaceId: workspace?.id ?? null
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
    [draftScopeKey, executionContext.overrides, navigate, pendingSend, profileId, sendAvailable, sessionId, workspace]
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
    queue: sessionId ? (queues[sessionId] ?? []) : [],
    runtimeAuthority: 'agentbox' as const,
    workspaceOpen,
    sendAvailable,
    service,
    session,
    sessionId,
    stopState: sessionId ? stopStates[sessionId] : undefined,
    workspace
  }
}
