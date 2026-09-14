import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $agentBoxHello,
  $agentBoxProfiles,
  $agentBoxService,
  $agentBoxSessions,
  $draftConfigStates,
  setDraftConfigState
} from '@/store/agentbox-service'
import { clearSessionDraft, composerDraftScopeKey, setSessionDraftExecutionContext } from '@/store/composer'
import { $workspaceProfilePreferences } from '@/store/workspace-profile-preference'
import {
  asWireId,
  type ConfigDescriptor,
  type ConfigOverride,
  type ConfigResolveResult,
  type ProfileRecord,
  WIRE_PROTOCOL_VERSION
} from '@/types/wire/wire-v1'

import { useComposerProfile } from './use-composer-profile'

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({ id: 'client' }) }))
vi.mock('@/application/profile/wire-composer-profile', () => ({
  ensureAgentBoxProfileCatalog: vi.fn(async () => []),
  resolveComposerConfig: (...args: unknown[]) => mocks.resolve(...args),
  selectComposerProfile: vi.fn(async () => true),
  setComposerTemporaryOverrides: vi.fn()
}))
vi.mock('@/application/provider-model/wire-provider-model-catalog', () => ({
  ensureAgentBoxProviderModelCatalog: vi.fn(async () => [])
}))

const WORKSPACE = 'workspace-a'
const DRAFT_SCOPE = WORKSPACE

function deferred<T>() {
  let resolve!: (value: T) => void

  const promise = new Promise<T>(done => {
    resolve = done
  })

  return { promise, resolve }
}

const hello = (capabilities: Array<{ id: string; reason?: string; supported: boolean }>) => ({
  auth: { required: false as const },
  capabilities,
  protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-test')
})

const profile = (id: string, displayName: string): ProfileRecord => ({
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName,
  harness: 'opaque-alpha',
  id: asWireId(id),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1
})

const descriptor = (profileId: string): ConfigDescriptor => ({
  controls: [
    { controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast', 'balanced'] }
  ],
  effectTiming: 'next_send',
  profileId: asWireId(profileId),
  securityLockedIds: [],
  workspaceId: asWireId(WORKSPACE)
})

const resolved = (effective: Array<{ controlId: string; value: unknown }> = []): ConfigResolveResult => ({
  effective,
  outcome: 'resolved'
})

const overrides = (mode: string): ConfigOverride[] => [{ controlId: 'mode', value: mode }]

function mount(profileId = 'profile-a') {
  return renderHook(() => useComposerProfile({ draftScope: DRAFT_SCOPE, sessionId: null, workspaceId: WORKSPACE }))
}

const scope = composerDraftScopeKey(DRAFT_SCOPE)

function selectScope(profileId: string, runtimeOverrides: ConfigOverride[]) {
  setDraftConfigState(scope, {
    descriptor: descriptor(profileId),
    detail: null,
    profileId,
    status: 'ready'
  })
  setSessionDraftExecutionContext(scope, { overrides: runtimeOverrides, profileId })
}

beforeEach(() => {
  mocks.resolve.mockReset()
  mocks.resolve.mockResolvedValue(resolved())
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxHello.set(hello([{ id: 'config.resolve', supported: true }]))
  $agentBoxProfiles.set([profile('profile-a', 'Alpha'), profile('profile-b', 'Beta')])
  $agentBoxSessions.set({})
  $draftConfigStates.set({})
  $workspaceProfilePreferences.set({})
  setSessionDraftExecutionContext(scope, { overrides: [], profileId: null })
})

afterEach(() => {
  cleanup()
  clearSessionDraft(scope)
  vi.restoreAllMocks()
})

describe('useComposerProfile config resolution', () => {
  it('asks the service for the exact scope and adopts the effective values it returned', async () => {
    mocks.resolve.mockResolvedValue(resolved([{ controlId: 'mode', value: 'fast' }]))

    const { result } = mount()

    act(() => selectScope('profile-a', overrides('fast')))

    await waitFor(() => expect(result.current.configResolution?.status).toBe('resolved'))
    expect(mocks.resolve).toHaveBeenCalledWith(
      { id: 'client' },
      {
        overrides: overrides('fast'),
        profileId: 'profile-a',
        workspaceId: WORKSPACE
      }
    )
    expect(result.current.configResolution).toEqual({
      effective: [{ controlId: 'mode', value: 'fast' }],
      status: 'resolved'
    })
  })

  it('keeps the descriptor and the overrides when the service cannot confirm the configuration', async () => {
    mocks.resolve.mockRejectedValue(new Error('UNAVAILABLE'))

    const { result } = mount()

    act(() => selectScope('profile-a', overrides('fast')))

    await waitFor(() => expect(result.current.configResolution?.status).toBe('unavailable'))
    expect(result.current.configResolution).toEqual({ detail: 'UNAVAILABLE', status: 'unavailable' })
    expect(result.current.overrides).toEqual(overrides('fast'))
    expect(result.current.configDescriptor?.profileId).toBe('profile-a')
  })

  it('does not ask the service when hello has not declared config.resolve, and keeps the reason', async () => {
    $agentBoxHello.set(hello([{ id: 'config.resolve', reason: 'NOT_IMPLEMENTED', supported: false }]))

    const { result } = mount()

    act(() => selectScope('profile-a', []))

    await waitFor(() => expect(result.current.configResolution?.status).toBe('unavailable'))
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(result.current.configResolution).toEqual({ detail: 'NOT_IMPLEMENTED', status: 'unavailable' })
  })

  it('never lets an older override answer overwrite the newer one', async () => {
    const first = deferred<ConfigResolveResult>()
    const second = deferred<ConfigResolveResult>()

    mocks.resolve.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = mount()

    act(() => selectScope('profile-a', overrides('fast')))
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1))

    act(() => setSessionDraftExecutionContext(scope, { overrides: overrides('balanced'), profileId: 'profile-a' }))
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve(resolved([{ controlId: 'mode', value: 'balanced' }]))
    })
    expect(result.current.configResolution).toEqual({
      effective: [{ controlId: 'mode', value: 'balanced' }],
      status: 'resolved'
    })

    await act(async () => {
      first.resolve(resolved([{ controlId: 'mode', value: 'fast' }]))
    })
    expect(result.current.configResolution).toEqual({
      effective: [{ controlId: 'mode', value: 'balanced' }],
      status: 'resolved'
    })
  })

  it('never paints the previous profile answer onto the newly selected profile', async () => {
    const first = deferred<ConfigResolveResult>()
    const second = deferred<ConfigResolveResult>()

    mocks.resolve.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const { result } = mount()

    act(() => selectScope('profile-a', []))
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1))

    act(() => selectScope('profile-b', []))
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(2))
    expect(mocks.resolve.mock.calls[1]?.[1]).toMatchObject({ profileId: 'profile-b' })

    await act(async () => {
      second.resolve(resolved([{ controlId: 'mode', value: 'beta' }]))
    })
    expect(result.current.configResolution).toEqual({
      effective: [{ controlId: 'mode', value: 'beta' }],
      status: 'resolved'
    })

    await act(async () => {
      first.resolve({
        invalidControls: [{ controlId: 'mode', reason: 'UNSUPPORTED_VALUE' }],
        outcome: 'rejected'
      })
    })
    expect(result.current.configResolution).toEqual({
      effective: [{ controlId: 'mode', value: 'beta' }],
      status: 'resolved'
    })
  })

  it('does no further work once the surface is gone', async () => {
    const pending = deferred<ConfigResolveResult>()
    const failure = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    mocks.resolve.mockReturnValueOnce(pending.promise)

    const { unmount } = mount()

    act(() => selectScope('profile-a', []))
    await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(1))

    unmount()

    await act(async () => {
      pending.resolve(resolved([{ controlId: 'mode', value: 'fast' }]))
    })

    expect(failure).not.toHaveBeenCalled()
    expect(mocks.resolve).toHaveBeenCalledTimes(1)
  })
})
