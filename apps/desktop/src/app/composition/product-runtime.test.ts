import { afterEach, describe, expect, it, vi } from 'vitest'

import { getHermesConfigRecord } from '@/api/config'
import { isLegacyRestAllowed, LEGACY_REST_DISABLED_FOR_PRODUCT, setLegacyRestAllowed } from '@/api/legacy-rest'
import {
  RESUME_LAST_SESSION_DEFAULT,
  setResumeLastSession
} from '@/application/desktop-preferences/resume-last-session'

import { applyProductRuntimePolicy, DESKTOP_PRODUCT_RUNTIME, resolveProductResumeLastSession } from './product-runtime'

// The main process gates itself on DESKTOP_PRODUCT_RUNTIME. The renderer has to
// make the same decision on the requests it issues, or the product still asks
// for the legacy Hermes surface — and the P06 acceptance requires that the
// product has no reachable legacy call, refused or not.

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
  setLegacyRestAllowed(true)
  // Desktop preferences are read from real localStorage now; leave none behind
  // for the next test in this file.
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('applyProductRuntimePolicy', () => {
  it('closes the renderer legacy REST door', () => {
    expect(isLegacyRestAllowed()).toBe(true)

    applyProductRuntimePolicy()

    expect(isLegacyRestAllowed()).toBe(false)
  })

  it('is idempotent, so a second call cannot reopen it', () => {
    applyProductRuntimePolicy()
    applyProductRuntimePolicy()

    expect(isLegacyRestAllowed()).toBe(false)
  })

  it('names the same runtime the main process gates on', () => {
    expect(DESKTOP_PRODUCT_RUNTIME).toBe('agentbox')
  })

  it('leaves the preload bridge untouched when a legacy config-record fetch arrives', async () => {
    const bridge = stubBridge()

    try {
      applyProductRuntimePolicy()

      // The exact request the composition root used to make for its cold-start
      // gate (`useHermesConfigRecord` → GET /api/config). Under the product
      // policy it is refused at the door, and the point of the gate is that no
      // IPC request is spent on the surface the product does not serve.
      await expect(getHermesConfigRecord()).rejects.toMatchObject({
        code: LEGACY_REST_DISABLED_FOR_PRODUCT
      })
      expect(bridge.api).not.toHaveBeenCalled()
    } finally {
      bridge.restore()
    }
  })
})

describe('resolveProductResumeLastSession', () => {
  it('is a definite decision: the product restores the last session/draft', () => {
    // Typed `boolean` on purpose — an `undefined` ("hold the latch until the
    // config answers") cannot exist in a runtime that never reads the config.
    const decision: boolean = resolveProductResumeLastSession()

    expect(decision).toBe(true)
    expect(RESUME_LAST_SESSION_DEFAULT).toBe(true)
  })

  it('never resolves undefined, so the restore latch cannot be held open by a fetch', () => {
    expect(resolveProductResumeLastSession()).not.toBeUndefined()
    expect(typeof resolveProductResumeLastSession()).toBe('boolean')
  })

  it('follows the Desktop-local preference the Appearance switch writes', () => {
    setResumeLastSession(false)

    expect(resolveProductResumeLastSession()).toBe(false)

    setResumeLastSession(true)

    expect(resolveProductResumeLastSession()).toBe(true)
  })
})
