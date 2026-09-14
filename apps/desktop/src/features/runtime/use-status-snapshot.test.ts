import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deferred } from '@/dev/test/deferred'
import type { GatewayRequester } from '@/types/gateway'
import type { StatusResponse } from '@/types/hermes'

import { type StatusSnapshotSource, useStatusSnapshot } from './use-status-snapshot'

const getStatusStub = () => vi.fn(async () => ({}) as StatusResponse)

const requestGatewayStub = () => vi.fn(async () => ({})) as unknown as GatewayRequester

async function flushAsync() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useStatusSnapshot — injected source', () => {
  it('pauses status RPCs while visible but unfocused, then catches up on focus', async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const getStatus = getStatusStub()
    const requestGateway = requestGatewayStub()

    renderHook(() => useStatusSnapshot({ getStatus, requestGateway }, 'open'))
    await flushAsync()

    expect(getStatus).not.toHaveBeenCalled()
    expect(requestGateway).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(getStatus).not.toHaveBeenCalled()
    expect(requestGateway).not.toHaveBeenCalled()

    vi.mocked(document.hasFocus).mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    await flushAsync()

    expect(getStatus).toHaveBeenCalledOnce()
    expect(requestGateway).toHaveBeenCalledTimes(2)
  })

  it('keeps the last authoritative readiness through a transient RPC failure', async () => {
    let refresh = 0

    const requestGatewayMock = vi.fn(async (method: string) => {
      const cycle = Math.floor(refresh / 2)
      refresh += 1

      if (cycle > 0) {
        throw new Error(`${method} timed out`)
      }

      return (method === 'setup.runtime_check' ? { ok: true } : { provider_configured: true }) as never
    })

    const source: StatusSnapshotSource = {
      getStatus: getStatusStub(),
      requestGateway: requestGatewayMock as unknown as GatewayRequester
    }

    const { result } = renderHook(() => useStatusSnapshot(source, 'open'))

    await flushAsync()
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })
  })

  it('does not present an initial transport failure as inference not ready', async () => {
    const requestGatewayMock = vi.fn(async (method: string) => {
      throw new Error(`${method} connection closed`)
    })

    const source: StatusSnapshotSource = {
      getStatus: getStatusStub(),
      requestGateway: requestGatewayMock as unknown as GatewayRequester
    }

    const { result } = renderHook(() => useStatusSnapshot(source, 'open'))

    await flushAsync()

    expect(result.current.inferenceStatus).toBeNull()
  })

  it('still publishes an authoritative runtime failure', async () => {
    const requestGatewayMock = vi.fn(
      async (method: string) =>
        (method === 'setup.runtime_check'
          ? { error: 'No usable credentials found for nous.', ok: false }
          : { provider_configured: true }) as never
    )

    const source: StatusSnapshotSource = {
      getStatus: getStatusStub(),
      requestGateway: requestGatewayMock as unknown as GatewayRequester
    }

    const { result } = renderHook(() => useStatusSnapshot(source, 'open'))

    await flushAsync()

    expect(result.current.inferenceStatus).toMatchObject({
      ready: false,
      reason: expect.stringContaining('No usable credentials found for nous.'),
      source: 'runtime_check'
    })
  })

  it('clears readiness immediately when the gateway disconnects', async () => {
    const pendingStatus = deferred<StatusResponse>()

    const getStatus = vi.fn()
      .mockResolvedValueOnce({} as StatusResponse)
      .mockReturnValueOnce(pendingStatus.promise)

    const requestGateway = vi.fn(
      async (method: string) =>
        (method === 'setup.runtime_check' ? { ok: true } : { provider_configured: true }) as never
    ) as unknown as GatewayRequester

    const source: StatusSnapshotSource = { getStatus, requestGateway }

    const { rerender, result } = renderHook(({ gatewayState }) => useStatusSnapshot(source, gatewayState), {
      initialProps: { gatewayState: 'open' }
    })

    await flushAsync()
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })

    rerender({ gatewayState: 'connecting' })

    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(result.current.inferenceStatus).toBeNull()
  })

  it('refreshes readiness by source and ignores the previous backend response', async () => {
    const workRuntime = deferred<unknown>()
    const workSetup = deferred<unknown>()
    const homeRuntime = deferred<unknown>()
    const homeSetup = deferred<unknown>()
    let source = 'work'

    const requestGatewayMock = vi.fn((method: string) => {
      if (source === 'work') {
        return method === 'setup.runtime_check' ? workRuntime.promise : workSetup.promise
      }

      return method === 'setup.runtime_check' ? homeRuntime.promise : homeSetup.promise
    })

    const snapshotSource: StatusSnapshotSource = {
      getStatus: getStatusStub(),
      requestGateway: requestGatewayMock as unknown as GatewayRequester
    }

    const { rerender, result } = renderHook(
      ({ scope }) => useStatusSnapshot(snapshotSource, 'open', scope),
      { initialProps: { scope: 'work\0default' } }
    )

    await flushAsync()
    source = 'home'
    rerender({ scope: 'home\0default' })
    await flushAsync()

    expect(result.current.inferenceStatus).toBeNull()

    await act(async () => {
      homeRuntime.resolve({ ok: true })
      homeSetup.resolve({ provider_configured: true })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })

    await act(async () => {
      workRuntime.resolve({ error: 'stale backend', ok: false })
      workSetup.resolve({ provider_configured: false })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })
  })

  it('waits for a slow refresh to settle before scheduling another one', async () => {
    const setup = deferred<unknown>()
    const runtime = deferred<unknown>()

    const requestGatewayMock = vi.fn(
      (method: string) => (method === 'setup.runtime_check' ? runtime.promise : setup.promise) as never
    )

    const source: StatusSnapshotSource = {
      getStatus: getStatusStub(),
      requestGateway: requestGatewayMock as unknown as GatewayRequester
    }

    renderHook(() => useStatusSnapshot(source, 'open'))
    await flushAsync()

    expect(requestGatewayMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(requestGatewayMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      setup.resolve({ provider_configured: true })
      runtime.resolve({ ok: true })
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999)
    })
    expect(requestGatewayMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(requestGatewayMock).toHaveBeenCalledTimes(4)
  })
})

describe('useStatusSnapshot — no source', () => {
  it('is inert: no legacy call on mount, focus, visibility or the 60s timer, and stays neutral', async () => {
    // The spies stand in for the legacy callables a hidden import path would
    // reach for. Under a product runtime there is no source to hand them to,
    // and every trigger below must leave both counters at zero.
    const legacyGetStatus = getStatusStub()
    const legacyRequestGateway = requestGatewayStub()

    const { result } = renderHook(() => useStatusSnapshot(null, 'open'))

    await flushAsync()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flushAsync()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
    })

    expect(legacyGetStatus).not.toHaveBeenCalled()
    expect(legacyRequestGateway).not.toHaveBeenCalled()
    expect(result.current.statusSnapshot).toBeNull()
    expect(result.current.inferenceStatus).toBeNull()
  })

  it('does not register a refresh timer at all', async () => {
    renderHook(() => useStatusSnapshot(null, 'open'))
    await flushAsync()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops the previous source snapshot and its timer when the source goes away', async () => {
    const getStatus = getStatusStub()

    const requestGatewayMock = vi.fn(
      async (method: string) =>
        (method === 'setup.runtime_check' ? { ok: true } : { provider_configured: true }) as never
    )

    const requestGateway = requestGatewayMock as unknown as GatewayRequester

    const { rerender, result } = renderHook(
      ({ hasSource }: { hasSource: boolean }) =>
        useStatusSnapshot(hasSource ? { getStatus, requestGateway } : null, 'open'),
      { initialProps: { hasSource: true } }
    )

    await flushAsync()
    expect(result.current.statusSnapshot).toEqual({})
    expect(result.current.inferenceStatus).toMatchObject({ ready: true, source: 'runtime_check' })

    const statusCalls = getStatus.mock.calls.length
    const gatewayCalls = requestGatewayMock.mock.calls.length

    rerender({ hasSource: false })

    // The previous source's snapshot and readiness are gone in the same commit
    // that loses the source.
    expect(result.current.statusSnapshot).toBeNull()
    expect(result.current.inferenceStatus).toBeNull()

    // The old 60s timer and the focus/visibility listeners were torn down with
    // the effect: none of them can fire a stale call at the retired source.
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
    })

    expect(getStatus.mock.calls.length).toBe(statusCalls)
    expect(requestGatewayMock.mock.calls.length).toBe(gatewayCalls)
    expect(vi.getTimerCount()).toBe(0)
  })
})
