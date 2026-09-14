import { afterEach, describe, expect, it } from 'vitest'

import { isLegacyRestAllowed, setLegacyRestAllowed } from '@/api/legacy-rest'

import { applyProductRuntimePolicy, DESKTOP_PRODUCT_RUNTIME } from './product-runtime'

// The main process gates itself on DESKTOP_PRODUCT_RUNTIME. The renderer has to
// make the same decision on the requests it issues, or the product still asks
// for the legacy Hermes surface — and the P06 acceptance requires that the
// product has no reachable legacy call, refused or not.

afterEach(() => {
  setLegacyRestAllowed(true)
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
})
