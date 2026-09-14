import { afterEach, describe, expect, it, vi } from 'vitest'

import { hermesApi, requestHermesApi } from './client'
import {
  isLegacyRestAllowed,
  LEGACY_REST_DISABLED_FOR_PRODUCT,
  setLegacyRestAllowed
} from './legacy-rest'

// The renderer's ONE door to the preload REST bridge. The main process refuses
// the legacy surface in the product runtime, but a refusal on the far side of
// the IPC still means the renderer ISSUED a legacy Hermes call — and the P06
// acceptance says the product must not have reachable legacy calls at all.

function stubBridge() {
  const api = vi.fn(async () => ({ ok: true }))
  const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')

  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api } })

  return {
    api,
    restore: () => {
      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  }
}

afterEach(() => {
  // The policy is process-wide; every case leaves it as it found it.
  setLegacyRestAllowed(true)
})

describe('the renderer legacy REST door', () => {
  it('reaches the bridge when the authority allows it', async () => {
    const bridge = stubBridge()

    try {
      await requestHermesApi({ path: '/api/config' })

      expect(bridge.api).toHaveBeenCalledTimes(1)
    } finally {
      bridge.restore()
    }
  })

  it('refuses with the stable code and never touches the bridge under the product runtime', async () => {
    const bridge = stubBridge()

    try {
      setLegacyRestAllowed(false)

      await expect(hermesApi({ path: '/api/profiles' })).rejects.toMatchObject({
        code: LEGACY_REST_DISABLED_FOR_PRODUCT
      })
      // The point of the gate: no IPC request is spent on a surface the
      // product does not serve.
      expect(bridge.api).not.toHaveBeenCalled()
    } finally {
      bridge.restore()
    }
  })

  it('reports each refused path once, so a residual caller stays visible without spamming the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      setLegacyRestAllowed(false)

      await Promise.all([
        hermesApi({ path: '/api/config' }).catch(() => undefined),
        hermesApi({ path: '/api/config' }).catch(() => undefined),
        hermesApi({ path: '/api/status' }).catch(() => undefined)
      ])

      const reported = warn.mock.calls.map(call => String(call[0]))

      expect(reported.filter(line => line.includes('/api/config'))).toHaveLength(1)
      expect(reported.filter(line => line.includes('/api/status'))).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('is allowed by default, so the legacy shell keeps its transport', () => {
    expect(isLegacyRestAllowed()).toBe(true)
  })
})
