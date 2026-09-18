import type { IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({ handle: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: host.handle } }))

import { LEGACY_RUNTIME_DISABLED_FOR_PRODUCT, registerApiProxyIpc } from './api-proxy-ipc'

type InvokeHandler = (event: IpcMainInvokeEvent, value: unknown) => Promise<unknown>

interface Harness {
  handler: InvokeHandler
  acquire: ReturnType<typeof vi.fn>
  dispatchRegistryApiRequest: ReturnType<typeof vi.fn>
  ensureBackend: ReturnType<typeof vi.fn>
  handleHermesApiRequest: ReturnType<typeof vi.fn>
  prepareProfileDeleteRequest: ReturnType<typeof vi.fn>
  registryConnectionKind: ReturnType<typeof vi.fn>
  teardownConnectionScopedProfileBackend: ReturnType<typeof vi.fn>
  releaseProfileDeletion: ReturnType<typeof vi.fn>
}

/** Register the REAL handler with scripted dependencies, exactly as main.ts
 *  composes it — only the runtime decision differs between the two cases. */
function registerHarness(legacyApiAllowed: boolean): Harness {
  const releaseProfileDeletion = vi.fn()
  const acquire = vi.fn(() => releaseProfileDeletion)
  const dispatchRegistryApiRequest = vi.fn(async () => ({ routed: 'registry' }))
  const ensureBackend = vi.fn(async () => ({ baseUrl: 'http://127.0.0.1:0' }))
  const handleHermesApiRequest = vi.fn(async () => ({ routed: 'profile' }))
  const prepareProfileDeleteRequest = vi.fn(async () => undefined)
  const registryConnectionKind = vi.fn(() => 'local')
  const teardownConnectionScopedProfileBackend = vi.fn(async () => undefined)

  registerApiProxyIpc({
    HERMES_HOME: '/tmp/hermes-home',
    PROFILE_NAME_RE: /^[a-z0-9_-]+$/,
    profileDeletionGate: { acquire },
    ensureBackend,
    prepareProfileDeleteRequest,
    dispatchRegistryApiRequest,
    registryConnectionKind,
    teardownConnectionScopedProfileBackend,
    handleHermesApiRequest,
    getDataUrlReadMaxMb: () => 20,
    persistDataUrlReadMaxMb: (maxMb: number) => maxMb,
    legacyApiAllowed
  })

  const handler = host.handle.mock.calls.find(([channel]) => channel === 'hermes:api')?.[1] as InvokeHandler

  return {
    handler,
    acquire,
    dispatchRegistryApiRequest,
    ensureBackend,
    handleHermesApiRequest,
    prepareProfileDeleteRequest,
    registryConnectionKind,
    releaseProfileDeletion,
    teardownConnectionScopedProfileBackend
  }
}

const plainRequest = { method: 'GET', path: '/api/status' }
const registryRequest = { connectionId: 'conn-1', method: 'GET', path: '/api/cron/jobs' }
const deleteRequest = { connectionId: 'conn-1', method: 'DELETE', path: '/api/profiles/work' }
const renameRequest = { body: { new_name: 'other' }, method: 'PATCH', path: '/api/profiles/work' }

describe('hermes:api IPC runtime gate', () => {
  beforeEach(() => {
    host.handle.mockReset()
  })

  it('serves the legacy routes when the legacy runtime is the product runtime', async () => {
    const harness = registerHarness(true)

    await expect(harness.handler({} as IpcMainInvokeEvent, plainRequest)).resolves.toEqual({ routed: 'profile' })
    expect(harness.handleHermesApiRequest).toHaveBeenCalledWith(plainRequest)

    await expect(harness.handler({} as IpcMainInvokeEvent, registryRequest)).resolves.toEqual({ routed: 'profile' })
    expect(harness.handleHermesApiRequest).toHaveBeenCalledTimes(2)
  })

  it('keeps connection-scoped profile deletes and rename gating on the legacy path', async () => {
    const harness = registerHarness(true)

    await expect(harness.handler({} as IpcMainInvokeEvent, deleteRequest)).resolves.toEqual({ routed: 'registry' })
    expect(harness.dispatchRegistryApiRequest).toHaveBeenCalledTimes(1)
    expect(harness.prepareProfileDeleteRequest).toHaveBeenCalledTimes(1)
    expect(harness.handleHermesApiRequest).not.toHaveBeenCalled()
    expect(harness.acquire).toHaveBeenCalledWith('work')
    expect(harness.releaseProfileDeletion).toHaveBeenCalledTimes(1)

    await expect(harness.handler({} as IpcMainInvokeEvent, renameRequest)).resolves.toEqual({ routed: 'profile' })
    expect(harness.acquire).toHaveBeenCalledWith('work')
    expect(harness.releaseProfileDeletion).toHaveBeenCalledTimes(2)
  })

  it('refuses every hermes:api request in the AgentBox product runtime before any routing', async () => {
    const harness = registerHarness(false)

    for (const request of [plainRequest, registryRequest, deleteRequest, renameRequest, undefined]) {
      await expect(harness.handler({} as IpcMainInvokeEvent, request)).rejects.toThrow(
        LEGACY_RUNTIME_DISABLED_FOR_PRODUCT
      )
    }

    expect(harness.handleHermesApiRequest).not.toHaveBeenCalled()
    expect(harness.dispatchRegistryApiRequest).not.toHaveBeenCalled()
    expect(harness.ensureBackend).not.toHaveBeenCalled()
    expect(harness.acquire).not.toHaveBeenCalled()
    expect(harness.prepareProfileDeleteRequest).not.toHaveBeenCalled()
    expect(harness.registryConnectionKind).not.toHaveBeenCalled()
    expect(harness.teardownConnectionScopedProfileBackend).not.toHaveBeenCalled()
  })

  it('carries the refusal code on the error itself, not only in prose', async () => {
    const harness = registerHarness(false)

    await expect(harness.handler({} as IpcMainInvokeEvent, plainRequest)).rejects.toMatchObject({
      code: LEGACY_RUNTIME_DISABLED_FOR_PRODUCT
    })
  })

  it('leaves the data-url configuration IPC available in the AgentBox product runtime', async () => {
    registerHarness(false)

    const getHandler = host.handle.mock.calls.find(([channel]) => channel === 'hermes:data-url-read-max:get')?.[1] as
      | (() => { maxMb: number })
      | undefined

    const setHandler = host.handle.mock.calls.find(([channel]) => channel === 'hermes:data-url-read-max:set')?.[1] as
      | ((event: IpcMainInvokeEvent, maxMb: number) => { maxMb: number })
      | undefined

    expect(getHandler?.().maxMb).toBe(20)
    expect(setHandler?.({} as IpcMainInvokeEvent, 7).maxMb).toBe(7)
  })
})
