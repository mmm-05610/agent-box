import { act, cleanup, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyWireSessionProjection } from '@/application/session/wire-session-projection'
import {
  $agentBoxQueues,
  $agentBoxSessionProjections,
  $agentBoxStopStates,
  setAgentBoxSessionProjection
} from '@/store/agentbox-runtime'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'
import {
  $agentBoxCatalogReadiness,
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  $agentBoxWorkspaces
} from '@/store/agentbox-service'
import {
  $draftExecutionContexts,
  clearSessionDraft,
  sessionDraftExecutionContext,
  setSessionDraftExecutionContext,
  stashSessionDraft,
  takeSessionDraft,
  workspaceDraftScope
} from '@/store/composer'
import { $projectTree } from '@/store/projects/scope'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaces } from '@/store/wsl-workspace'
import {
  asRequestId,
  asWireId,
  type SessionRecord,
  WIRE_PROTOCOL_VERSION,
  type WorkspaceRecord,
  type WorkspacesOpenResult
} from '@/types/wire/wire-v1'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { useAgentBoxMainChat } from './agentbox-main-chat'

const mocks = vi.hoisted(() => ({
  ensureCatalog: vi.fn(async () => undefined),
  openWorkspace: vi.fn(),
  hydrateHistory: vi.fn(async (_client: unknown, _sessionId: unknown) => undefined),
  ingestEvent: vi.fn((_frame: unknown) => ({ outcome: 'applied' })),
  refreshQueue: vi.fn(async (_client: unknown, _sessionId: unknown) => undefined),
  requestStop: vi.fn(async (_client: unknown, _input: unknown) => ({
    executionId: 'execution-1',
    outcome: 'stop_requested'
  })),
  submit: vi.fn()
}))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({ id: 'client' }) }))
vi.mock('@/application/agentbox-desktop-catalog', () => ({
  ensureAgentBoxDesktopCatalog: () => mocks.ensureCatalog()
}))
vi.mock('@/application/workspace/wire-workspace-catalog', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openAgentBoxWorkspace: (...args: unknown[]) => mocks.openWorkspace(...args)
}))
vi.mock('@/application/session/agentbox-composer', () => ({
  submitAgentBoxComposer: (...args: unknown[]) => mocks.submit(...args)
}))
vi.mock('@/application/session/wire-session-control', () => ({
  hydrateAgentBoxHistory: (client: unknown, sessionId: unknown) => mocks.hydrateHistory(client, sessionId),
  ingestAgentBoxEvent: (frame: unknown) => mocks.ingestEvent(frame),
  refreshAgentBoxQueue: (client: unknown, sessionId: unknown) => mocks.refreshQueue(client, sessionId),
  requestAgentBoxStop: (client: unknown, input: unknown) => mocks.requestStop(client, input)
}))

/** Only the capabilities the product path actually needs are declared; a test
 *  that wants a missing one builds its own hello. */
const hello = (ids: string[] = ['config.resolve', 'sessions.createAndSend', 'sessions.send', 'workspaces.open']) => ({
  auth: { required: false as const },
  capabilities: ids.map(id => ({ id, supported: true })),
  protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-test')
})

const projectTreeNode = (id: string, path: string) => ({
  id,
  label: id,
  path,
  repos: [],
  sessionCount: 0
})

const workspace: WorkspaceRecord = {
  accessibility: { executableForRole: true, readable: true, reasons: [], writable: true },
  archivedAt: null,
  connection: { state: 'connected' },
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'App',
  environment: { host: null, kind: 'local', user: null },
  id: asWireId('workspace-1'),
  normalizedPath: 'C:/work/app',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1
}

const session: SessionRecord = {
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Session',
  id: asWireId('session-1'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: workspace.id
}

function wrapper(path: string) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  }
}

beforeEach(() => {
  mocks.openWorkspace.mockReset()
  mocks.openWorkspace.mockResolvedValue({ created: true, workspace } as WorkspacesOpenResult)
  mocks.submit.mockReset()
  mocks.ingestEvent.mockReset()
  mocks.ingestEvent.mockReturnValue({ outcome: 'applied' })
  mocks.submit.mockResolvedValue({
    acceptedForDraft: true,
    decision: {
      executionId: asWireId('execution-1'),
      intentKey: '4',
      outcome: 'accepted',
      queueItemId: null,
      requestId: asRequestId('request-1'),
      sessionId: session.id
    },
    outcome: 'sent'
  })
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxHello.set(hello())
  $agentBoxCatalogReadiness.set({ sessions: true, workspaces: true })
  $agentBoxWorkspaces.set([workspace])
  $agentBoxSessions.set({})
  $agentBoxSessionProjections.set({})
  $agentBoxQueues.set({})
  $agentBoxStopStates.set({})
  $draftExecutionContexts.set({})
  $workspaceViewSelectedId.set('legacy-project-id')
  // The sidebar's own record for the selected row: a local project whose
  // working root is the folder the service catalog lists.
  $projectTree.set([projectTreeNode('legacy-project-id', 'c:\\work\\app')])
  $wslWorkspaces.set([])
  setSessionDraftExecutionContext(workspaceDraftScope(workspace.id), { overrides: [], profileId: 'profile-1' })
  delete window.agentBoxDesktop
})

afterEach(() => cleanup())

describe('primary AgentBox chat production binding', () => {
  it('does not subscribe before a non-empty resume cursor is hydrated', () => {
    const subscribeEvents = vi.fn(() => vi.fn())
    window.agentBoxDesktop = { wire: { subscribeEvents, request: vi.fn() } }
    $agentBoxSessions.set({ [session.id]: session })

    renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    expect(subscribeEvents).not.toHaveBeenCalled()
  })

  it('does not publish a stream start when hydration resolves after unmount', async () => {
    const subscribeEvents = vi.fn(() => vi.fn())
    let resolveHistory: ((value: unknown) => void) | undefined
    mocks.hydrateHistory.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveHistory = resolve
        }) as never
    )
    window.agentBoxDesktop = { wire: { subscribeEvents, request: vi.fn() } }
    $agentBoxSessions.set({ [session.id]: session })

    const { unmount } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })
    unmount()

    await act(async () => {
      resolveHistory?.({
        outcome: 'snapshot',
        projection: { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-late' as never }
      })
      await Promise.resolve()
    })

    expect(subscribeEvents).not.toHaveBeenCalled()
  })

  it('maps the selected shell project to a server Workspace before first send', async () => {
    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    let accepted = false

    await act(async () => {
      accepted = await result.current.onSubmit('ship it', {
        attachments: [],
        composerScope: workspaceDraftScope(workspace.id),
        draftVersion: 4
      })
    })

    expect(accepted).toBe(true)
    expect(mocks.submit).toHaveBeenCalledWith(
      { id: 'client' },
      expect.objectContaining({
        draftVersion: 4,
        profileId: 'profile-1',
        sessionId: null,
        workspaceId: 'workspace-1'
      })
    )
  })

  it('fails closed when the composer scope does not match the resolved target', async () => {
    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await expect(
      result.current.onSubmit('wrong target', { composerScope: 'workspace:other', draftVersion: 2 })
    ).resolves.toBe(false)
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('stops only the current server execution on an existing Session route', async () => {
    $agentBoxSessions.set({ [session.id]: session })
    $agentBoxSessionProjections.set({
      [session.id]: {
        ...emptyWireSessionProjection(session.id),
        execution: { executionId: asWireId('execution-1'), reason: null, state: 'running' }
      }
    })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    expect(result.current.busy).toBe(true)

    await act(async () => result.current.onCancel())

    expect(mocks.requestStop).toHaveBeenCalledWith(
      { id: 'client' },
      { executionId: 'execution-1', sessionId: 'session-1' }
    )
  })

  it('subscribes only from a hydrated cursor, validates frames, and unsubscribes with the route surface', async () => {
    const unsubscribe = vi.fn()
    let listener: ((frame: unknown) => void) | undefined

    window.agentBoxDesktop = {
      wire: {
        subscribeEvents(_input, callback) {
          listener = callback

          return unsubscribe
        },
        request: vi.fn()
      }
    }

    $agentBoxSessions.set({ [session.id]: session })
    setAgentBoxSessionProjection(session.id, {
      ...emptyWireSessionProjection(session.id),
      resumeCursor: 'cursor-0' as never
    })
    mocks.hydrateHistory.mockResolvedValue({
      outcome: 'snapshot',
      projection: { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-0' as never }
    } as never)

    const { result, unmount } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })
    await act(async () => await Promise.resolve())

    expect(result.current.sessionId).toBe('session-1')
    expect(listener).toBeTypeOf('function')

    act(() => listener?.({ not: 'a frame' }))
    expect(mocks.ingestEvent).not.toHaveBeenCalled()

    act(() =>
      listener?.({
        cursor: 'cursor-1',
        emittedAt: '2026-09-14T00:00:00.000Z',
        event: {
          displayKind: 'visible',
          kind: 'message.final',
          messageId: 'message-1',
          role: 'assistant',
          sessionId: 'session-1',
          text: 'hello'
        },
        eventId: 'event-1',
        seq: 1,
        sessionId: 'session-1'
      })
    )

    expect(mocks.ingestEvent).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('records history hydration before the stream subscription and subscribes from the hydrated cursor', async () => {
    const order: string[] = []

    const subscribeEvents = vi.fn((input: { cursor: string; sessionId: string }) => {
      order.push(`subscribe:${input.cursor}`)

      return vi.fn()
    })

    window.agentBoxDesktop = { wire: { subscribeEvents, request: vi.fn() } }
    $agentBoxSessions.set({ [session.id]: session })

    mocks.hydrateHistory.mockImplementation(
      (() => {
        order.push('history.snapshot')

        return Promise.resolve({
          outcome: 'snapshot',
          projection: { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-resume' as never }
        })
      }) as never
    )
    mocks.refreshQueue.mockImplementation(async () => {
      order.push('queue.get')

      return undefined
    })

    renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // The reconnect order is causal: the snapshot must resolve before the
    // event stream is subscribed, and the subscription starts at the cursor
    // the snapshot returned.
    expect(order).toEqual(['history.snapshot', 'queue.get', 'subscribe:cursor-resume'])
    expect(subscribeEvents).toHaveBeenCalledWith(
      { cursor: 'cursor-resume', sessionId: 'session-1' },
      expect.any(Function)
    )
  })

  it('stops the old subscription before hydrating after a sequence gap', async () => {
    const unsubscribe = vi.fn()
    let listener: ((frame: unknown) => void) | undefined
    window.agentBoxDesktop = {
      wire: {
        subscribeEvents(_input, callback) {
          listener = callback

          return unsubscribe
        },
        request: vi.fn()
      }
    }
    $agentBoxSessions.set({ [session.id]: session })
    setAgentBoxSessionProjection(session.id, { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-0' as never })
    mocks.hydrateHistory.mockResolvedValue({
      outcome: 'snapshot',
      projection: { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-0' as never }
    } as never)
    mocks.ingestEvent.mockReturnValue({ outcome: 'gap' })

    renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })
    await act(async () => await Promise.resolve())
    mocks.hydrateHistory.mockClear()
    unsubscribe.mockClear()

    await act(async () => {
      listener?.({
        cursor: 'cursor-2',
        emittedAt: '2026-09-14T00:00:00.000Z',
        event: { displayKind: 'visible', kind: 'message.final', messageId: 'message-1', role: 'assistant', sessionId: 'session-1', text: 'hello' },
        eventId: 'event-2',
        seq: 2,
        sessionId: 'session-1'
      })
    })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(mocks.hydrateHistory).toHaveBeenCalledWith({ id: 'client' }, 'session-1')
  })

  it('releases a synchronously gapped source after subscribe returns its cleanup', async () => {
    const unsubscribe = vi.fn()
    window.agentBoxDesktop = {
      wire: {
        subscribeEvents(_input, callback) {
          callback({
            cursor: 'cursor-2',
            emittedAt: '2026-09-14T00:00:00.000Z',
            event: {
              displayKind: 'visible',
              kind: 'message.final',
              messageId: 'message-1',
              role: 'assistant',
              sessionId: 'session-1',
              text: 'hello'
            },
            eventId: 'event-2',
            seq: 2,
            sessionId: 'session-1'
          })

          return unsubscribe
        },
        request: vi.fn()
      }
    }
    $agentBoxSessions.set({ [session.id]: session })
    setAgentBoxSessionProjection(session.id, { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-0' as never })
    mocks.hydrateHistory.mockResolvedValue({
      outcome: 'snapshot',
      projection: { ...emptyWireSessionProjection(session.id), resumeCursor: 'cursor-0' as never }
    } as never)
    mocks.ingestEvent.mockReturnValue({ outcome: 'gap' })

    const { unmount } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })
    await act(async () => await Promise.resolve())

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('primary AgentBox chat capability gates', () => {
  it('offers no send at all when the effective-config check is undeclared', async () => {
    $agentBoxHello.set(hello(['sessions.createAndSend', 'sessions.send']))

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    expect(result.current.sendAvailable).toBe(false)

    await act(async () => {
      await expect(
        result.current.onSubmit('ship it', {
          attachments: [],
          composerScope: workspaceDraftScope(workspace.id),
          draftVersion: 4
        })
      ).resolves.toBe(false)
    })

    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('offers no send on an existing Session when that Session verb is undeclared', async () => {
    $agentBoxHello.set(hello(['config.resolve', 'sessions.createAndSend']))
    $agentBoxSessions.set({ [session.id]: session })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    expect(result.current.sendAvailable).toBe(false)

    await act(async () => {
      await expect(
        result.current.onSubmit('continue', {
          attachments: [],
          composerScope: 'session-1',
          draftVersion: 5
        })
      ).resolves.toBe(false)
    })

    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('keeps sending available when both required verbs are declared', async () => {
    $agentBoxSessions.set({ [session.id]: session })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    expect(result.current.sendAvailable).toBe(true)
  })
})

describe('primary AgentBox chat pending-send recovery gate', () => {
  const draftScope = workspaceDraftScope(workspace.id)

  const withPending = (scopeKey: string) =>
    $pendingAgentBoxSends.set({
      items: { [scopeKey]: { intentKey: '4', requestId: asRequestId('request-old-0001') } },
      version: 1
    })

  it('offers recovery with only the query verb declared, without needing the service Profile', async () => {
    $agentBoxHello.set(hello(['sendOutcome.query']))
    $draftExecutionContexts.set({})
    withPending(draftScope)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    expect(result.current.sendAvailable).toBe(true)

    await act(async () => {
      await result.current.onSubmit('recover it', {
        attachments: [],
        composerScope: draftScope,
        draftVersion: 5
      })
    })

    expect(mocks.submit).toHaveBeenCalledWith(
      { id: 'client' },
      expect.objectContaining({ profileId: null, sessionId: null, workspaceId: 'workspace-1' })
    )
  })

  it('offers recovery on an existing Session route whose Workspace no longer resolves', async () => {
    $agentBoxHello.set(hello(['sendOutcome.query']))
    $agentBoxSessions.set({ [session.id]: session })
    $agentBoxWorkspaces.set([])
    withPending(session.id)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    expect(result.current.workspace).toBeNull()
    expect(result.current.sendAvailable).toBe(true)

    await act(async () => {
      await result.current.onSubmit('recover it', {
        attachments: [],
        composerScope: session.id,
        draftVersion: 5
      })
    })

    expect(mocks.submit).toHaveBeenCalledWith(
      { id: 'client' },
      expect.objectContaining({ sessionId: 'session-1', workspaceId: null })
    )
  })

  it('still refuses a NEW send with that same minimal hello', async () => {
    $agentBoxHello.set(hello(['sendOutcome.query']))

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    expect(result.current.sendAvailable).toBe(false)

    await act(async () => {
      await expect(
        result.current.onSubmit('new intent', {
          attachments: [],
          composerScope: draftScope,
          draftVersion: 5
        })
      ).resolves.toBe(false)
    })

    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('refuses recovery when the query verb itself is undeclared', async () => {
    $agentBoxHello.set(hello(['config.resolve', 'sessions.createAndSend']))
    withPending(draftScope)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    expect(result.current.sendAvailable).toBe(false)
  })
})

describe('primary AgentBox chat Workspace registration', () => {
  const localEnvironment = { host: null, kind: 'local' as const, user: null }

  afterEach(() => {
    ;['legacy-project-id', 'proj-a', 'proj-b', 'workspace-a', 'workspace-b'].forEach(scope =>
      clearSessionDraft(workspaceDraftScope(scope))
    )
  })

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  const deferredOpen = () => {
    let settle!: (value: WorkspacesOpenResult) => void

    const promise = new Promise<WorkspacesOpenResult>(resolve => {
      settle = resolve
    })

    return { promise, settle }
  }

  const wslRecord = (overrides: Partial<WslWorkspaceRecord> = {}): WslWorkspaceRecord => ({
    actualUser: 'me',
    archivedAt: null,
    configuredUser: null,
    createdAt: 0,
    distribution: 'Ubuntu',
    id: 'wsl-row-1',
    kind: 'wsl',
    name: 'App (WSL)',
    rootPath: '/home/me/app',
    updatedAt: 0,
    ...overrides
  })

  it('registers a selected local project once across re-renders and adopts what the service returned', async () => {
    $agentBoxWorkspaces.set([])
    const pending = deferredOpen()

    mocks.openWorkspace.mockReturnValueOnce(pending.promise)

    const { result, rerender } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(result.current.workspaceOpen).toEqual({ status: 'opening' })
    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)
    expect(mocks.openWorkspace).toHaveBeenCalledWith(
      { id: 'client' },
      { environment: localEnvironment, path: 'c:\\work\\app' }
    )

    rerender()
    await flush()
    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.settle({ created: true, workspace })
    })

    expect(result.current.workspace?.id).toBe('workspace-1')
    expect(result.current.workspaceOpen).toEqual({ status: 'idle' })
    expect(result.current.draftScopeKey).toBe(workspaceDraftScope('workspace-1'))
  })

  it('registers a WSL row with the verified identity and the POSIX root exactly as saved', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('wsl-row-1')
    $wslWorkspaces.set([wslRecord()])

    const wslWorkspace: WorkspaceRecord = {
      ...workspace,
      environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' },
      id: asWireId('workspace-wsl'),
      normalizedPath: '/home/me/app'
    }

    mocks.openWorkspace.mockResolvedValue({ created: true, workspace: wslWorkspace })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).toHaveBeenCalledWith(
      { id: 'client' },
      { environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' }, path: '/home/me/app' }
    )
    expect(result.current.workspace?.id).toBe('workspace-wsl')
    // The path the chat now uses is the one the SERVICE returned.
    expect(result.current.workspace?.normalizedPath).toBe('/home/me/app')
    expect($agentBoxSessions.get()).toEqual({})
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('never treats an equal path string in another environment as the same location', async () => {
    $agentBoxWorkspaces.set([{ ...workspace, environment: localEnvironment, normalizedPath: '/work/app' }])
    $workspaceViewSelectedId.set('wsl-row-1')
    $wslWorkspaces.set([wslRecord({ rootPath: '/work/app' })])

    mocks.openWorkspace.mockResolvedValue({
      created: true,
      workspace: {
        ...workspace,
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' },
        id: asWireId('workspace-wsl'),
        normalizedPath: '/work/app'
      }
    })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).toHaveBeenCalledWith(
      { id: 'client' },
      { environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' }, path: '/work/app' }
    )
    expect(result.current.workspace?.id).toBe('workspace-wsl')
  })

  it('reuses a registered location instead of opening it again', async () => {
    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(result.current.workspace?.id).toBe('workspace-1')
    expect(result.current.workspaceOpen).toEqual({ status: 'idle' })
  })

  it('does not let a shell row id that equals an unrelated Wire id stand in for a location', async () => {
    // The shell row is literally named 'workspace-1' — the same string as an
    // unrelated service id — but its LOCATION is what decides.
    $workspaceViewSelectedId.set('workspace-1')
    $projectTree.set([projectTreeNode('workspace-1', 'c:\\work\\app')])
    $agentBoxWorkspaces.set([
      { ...workspace, id: asWireId('workspace-1'), normalizedPath: '/somewhere/else', version: 9 }
    ])

    mocks.openWorkspace.mockResolvedValue({
      created: true,
      workspace: { ...workspace, id: asWireId('workspace-registered'), version: 1 }
    })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)
    expect(result.current.workspace?.id).toBe('workspace-registered')
    expect(result.current.workspace?.normalizedPath).toBe('C:/work/app')
  })

  it('adopts the service id when the location was already registered server-side', async () => {
    $agentBoxWorkspaces.set([])

    mocks.openWorkspace.mockResolvedValue({
      created: false,
      workspace: { ...workspace, id: asWireId('workspace-existing'), version: 3 }
    })

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(result.current.workspace?.id).toBe('workspace-existing')
    expect(result.current.workspace?.version).toBe(3)
    expect(result.current.draftScopeKey).toBe(workspaceDraftScope('workspace-existing'))
    expect($agentBoxSessions.get()).toEqual({})
  })

  it('moves an unsent draft from the shell scope to the service scope without touching sessions', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('proj-a')
    $projectTree.set([projectTreeNode('proj-a', 'C:/a')])

    const provisionalScope = workspaceDraftScope('proj-a')

    stashSessionDraft(provisionalScope, 'unsent text', [
      { id: 'a1', kind: 'file', label: 'notes.txt', refText: '@file:staged/notes.txt' }
    ])
    setSessionDraftExecutionContext(provisionalScope, {
      overrides: [{ controlId: 'mode', value: 'fast' }],
      profileId: 'profile-1'
    })

    const pending = deferredOpen()

    mocks.openWorkspace.mockReturnValueOnce(pending.promise)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()
    expect(result.current.draftScopeKey).toBe(provisionalScope)

    await act(async () => {
      pending.settle({
        created: true,
        workspace: { ...workspace, id: asWireId('workspace-a'), normalizedPath: 'C:/a' }
      })
    })

    const authoritativeScope = workspaceDraftScope('workspace-a')

    expect(takeSessionDraft(authoritativeScope).text).toBe('unsent text')
    expect(takeSessionDraft(authoritativeScope).attachments).toHaveLength(1)
    expect(sessionDraftExecutionContext(authoritativeScope)).toMatchObject({
      overrides: [{ controlId: 'mode', value: 'fast' }],
      profileId: 'profile-1'
    })
    expect(takeSessionDraft(provisionalScope).text).toBe('')
    expect(result.current.draftScopeKey).toBe(authoritativeScope)
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('never overwrites a draft that already belongs to the service scope', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('proj-a')
    $projectTree.set([projectTreeNode('proj-a', 'C:/a')])

    const provisionalScope = workspaceDraftScope('proj-a')
    const authoritativeScope = workspaceDraftScope('workspace-a')

    stashSessionDraft(provisionalScope, 'unsent shell text', [])
    stashSessionDraft(authoritativeScope, 'already here', [])

    const pending = deferredOpen()

    mocks.openWorkspace.mockReturnValueOnce(pending.promise)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    await act(async () => {
      pending.settle({
        created: true,
        workspace: { ...workspace, id: asWireId('workspace-a'), normalizedPath: 'C:/a' }
      })
    })

    expect(takeSessionDraft(authoritativeScope).text).toBe('already here')
    expect(takeSessionDraft(provisionalScope).text).toBe('unsent shell text')
    expect(result.current.draftScopeKey).toBe(authoritativeScope)
  })

  it('caches a late answer for an abandoned row without switching the selection back to it', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('proj-a')
    $projectTree.set([projectTreeNode('proj-a', 'C:/a'), projectTreeNode('proj-b', 'C:/b')])

    const first = deferredOpen()
    const second = deferredOpen()

    mocks.openWorkspace.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()
    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)

    act(() => $workspaceViewSelectedId.set('proj-b'))
    await flush()
    expect(mocks.openWorkspace).toHaveBeenCalledTimes(2)
    expect(mocks.openWorkspace.mock.calls[1]?.[1]).toMatchObject({ path: 'C:/b' })

    await act(async () => {
      second.settle({
        created: true,
        workspace: { ...workspace, id: asWireId('workspace-b'), normalizedPath: 'C:/b' }
      })
    })

    expect(result.current.workspace?.id).toBe('workspace-b')

    // B's draft is the current one and stays untouched when A answers late.
    stashSessionDraft(workspaceDraftScope('proj-b'), 'b draft', [])

    await act(async () => {
      first.settle({
        created: true,
        workspace: { ...workspace, id: asWireId('workspace-a'), normalizedPath: 'C:/a' }
      })
    })

    expect(result.current.workspace?.id).toBe('workspace-b')
    expect(result.current.draftScopeKey).toBe(workspaceDraftScope('workspace-b'))
    expect(takeSessionDraft(workspaceDraftScope('proj-b')).text).toBe('b draft')
    // The abandoned row still reached the service projection.
    expect($agentBoxWorkspaces.get().map(record => record.id)).toContain('workspace-a')
  })

  it('reports an undeclared method without calling it and without retrying', async () => {
    $agentBoxWorkspaces.set([])
    $agentBoxHello.set(hello(['config.resolve', 'sessions.createAndSend', 'sessions.send']))

    const { result, rerender } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()
    rerender()
    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(result.current.workspaceOpen).toEqual({ detail: 'CAPABILITY_NOT_DECLARED', status: 'unavailable' })
    expect(result.current.sendAvailable).toBe(false)
    expect(result.current.draftScopeKey).toBe(workspaceDraftScope('legacy-project-id'))
  })

  it('keeps the shell selection and the draft when the registration fails, and does not retry on its own', async () => {
    $agentBoxWorkspaces.set([])

    const provisionalScope = workspaceDraftScope('legacy-project-id')

    stashSessionDraft(provisionalScope, 'still mine', [])
    mocks.openWorkspace.mockRejectedValue(new Error('OUTCOME_UNKNOWN'))

    const { result, rerender } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()
    rerender()
    await flush()

    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)
    expect(result.current.workspaceOpen).toEqual({ detail: 'OUTCOME_UNKNOWN', status: 'unavailable' })
    expect(result.current.workspace).toBeNull()
    expect(result.current.sendAvailable).toBe(false)
    expect(result.current.draftScopeKey).toBe(provisionalScope)
    expect(takeSessionDraft(provisionalScope).text).toBe('still mine')
  })

  it('uses the Session Workspace on a Session route and never registers anything', async () => {
    $agentBoxSessions.set({ [session.id]: session })
    $agentBoxWorkspaces.set([{ ...workspace, normalizedPath: '/wherever/the/session/lives' }])

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/session-1') })

    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(result.current.workspace?.id).toBe('workspace-1')
    expect(result.current.draftScopeKey).toBe('session-1')
  })

  it('never adopts another user of the same distro and path, and registers as the verified user', async () => {
    $workspaceViewSelectedId.set('wsl-row-1')
    $wslWorkspaces.set([wslRecord({ actualUser: 'alice' })])
    // The cache only holds this distro + path under a DIFFERENT user.
    $agentBoxWorkspaces.set([
      {
        ...workspace,
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'bob' },
        id: asWireId('workspace-bob'),
        normalizedPath: '/home/me/app'
      }
    ])

    const pending = deferredOpen()

    mocks.openWorkspace.mockReturnValueOnce(pending.promise)

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).toHaveBeenCalledTimes(1)
    expect(mocks.openWorkspace).toHaveBeenCalledWith(
      { id: 'client' },
      { environment: { host: 'Ubuntu', kind: 'wsl', user: 'alice' }, path: '/home/me/app' }
    )
    // Bob's Workspace is not this row's Workspace.
    expect(result.current.workspace).toBeNull()
    expect(result.current.sendAvailable).toBe(false)
    expect(result.current.workspaceOpen).toEqual({ status: 'opening' })
    expect(result.current.draftScopeKey).toBe(workspaceDraftScope('wsl-row-1'))
  })

  it('adopts the record when the whole identity and the path already match', async () => {
    $workspaceViewSelectedId.set('wsl-row-1')
    $wslWorkspaces.set([wslRecord({ actualUser: 'alice' })])
    $agentBoxWorkspaces.set([
      {
        ...workspace,
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'alice' },
        id: asWireId('workspace-alice'),
        normalizedPath: '/home/me/app'
      }
    ])

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(result.current.workspace?.id).toBe('workspace-alice')
    expect(result.current.workspaceOpen).toEqual({ status: 'idle' })
  })
})

describe('primary AgentBox chat local open target', () => {
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('registers nothing for a project that has no folder of its own', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('pathless-project')
    $projectTree.set([
      {
        id: 'pathless-project',
        label: 'Pathless',
        path: null,
        // A repo folder inside the project is not the project's own path.
        repos: [{ groups: [], id: 'repo-1', label: 'repo', path: 'C:/somewhere/repo', sessionCount: 0 }],
        sessionCount: 0
      }
    ])

    const { result } = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(result.current.workspaceOpen).toEqual({ status: 'idle' })
    expect(result.current.workspace).toBeNull()
    expect(result.current.sendAvailable).toBe(false)
    // No location means no location-scoped draft: the composer keeps its
    // generic draft scope, and nothing is registered on the user's behalf.
    expect(result.current.draftScopeKey).toBeNull()
  })

  it('registers nothing for the Home bucket or an empty path', async () => {
    $agentBoxWorkspaces.set([])
    $workspaceViewSelectedId.set('home-bucket')
    $projectTree.set([
      { id: 'home-bucket', isNoProject: true, label: 'Home', path: null, repos: [], sessionCount: 0 },
      { id: 'empty-path', label: 'Empty', path: '   ', repos: [], sessionCount: 0 }
    ])

    const home = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()
    expect(home.result.current.workspaceOpen).toEqual({ status: 'idle' })
    home.unmount()

    act(() => $workspaceViewSelectedId.set('empty-path'))

    const empty = renderHook(useAgentBoxMainChat, { wrapper: wrapper('/new') })

    await flush()

    expect(mocks.openWorkspace).not.toHaveBeenCalled()
    expect(empty.result.current.workspaceOpen).toEqual({ status: 'idle' })
    expect(empty.result.current.draftScopeKey).toBeNull()
  })
})
