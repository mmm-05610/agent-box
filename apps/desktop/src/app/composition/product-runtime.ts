/**
 * The renderer's product authority, in one place.
 *
 * `main.ts` derives the main-process gate from `DESKTOP_PRODUCT_RUNTIME`
 * (`electron/app/product-runtime-policy.ts`). The renderer needs the same fact
 * for the requests it *issues*: the product shell must not ask for the legacy
 * Hermes REST surface, and it must not mount the surfaces that only exist to
 * talk to a legacy gateway.
 *
 * Applied at the composition root, not inferred from gateway state, cache
 * contents or whether a call would happen to succeed.
 */

import { setLegacyRestAllowed } from '@/api/legacy-rest'

export const DESKTOP_PRODUCT_RUNTIME = 'agentbox' as const

/** Turn off the legacy REST door for the whole renderer session. Idempotent. */
export function applyProductRuntimePolicy(): void {
  setLegacyRestAllowed(false)
}
