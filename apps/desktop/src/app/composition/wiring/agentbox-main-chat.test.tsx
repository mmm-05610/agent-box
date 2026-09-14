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
import {
  $agentBoxCatalogReadiness,
  $agentBoxService,
  $agentBoxSessions,
  $agentBoxWorkspaces
} from '@/store/agentbox-service'
import { $draftExecutionContexts, setSessionDraftExecutionContext, workspaceDraftScope } from '@/store/composer'
import { $currentCwd } from '@/store/session'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaces } from '@/store/wsl-workspace'
import { asRequestId, asWireId, type SessionRecord, type WorkspaceRecord } from '@/types/wire/wire-v1'

import { useAgentBoxMainChat } from './agentbox-main-chat'

const mocks = vi.hoisted(() => ({
  ensureCatalog: vi.fn(async () => undefined),
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
vi.mock('@/application/session/agentbox-composer', () => ({
  submitAgentBoxComposer: (...args: unknown[]) => mocks.submit(...args)
}))
vi.mock('@/application/session/wire-session-control', () => ({
  hydrateAgentBoxHistory: (client: unknown, sessionId: unknown) => mocks.hydrateHistory(client, sessionId),
  ingestAgentBoxEvent: (frame: unknown) => mocks.ingestEvent(frame),
  refreshAgentBoxQueue: (client: unknown, sessionId: unknown) => mocks.refreshQueue(client, sessionId),
  requestAgentBoxStop: (client: unknown, input: unknown) => mocks.requestStop(client, input)
}))

const workspace: WorkspaceRecord = {
  accessibility: { executableForRole: true, readable: true, reasons: [], writable: true },
  archivedAt: null,
  connection: { state: 'connected' },
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'App',
  environment: { host: null, kind: 'local', user: 'alice' },
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
  $agentBoxCatalogReadiness.set({ sessions: true, workspaces: true })
  $agentBoxWorkspaces.set([workspace])
  $agentBoxSessions.set({})
  $agentBoxSessionProjections.set({})
  $agentBoxQueues.set({})
  $agentBoxStopStates.set({})
  $draftExecutionContexts.set({})
  $workspaceViewSelectedId.set('legacy-project-id')
  $currentCwd.set('c:\\work\\app')
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
