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

/**
 * The product's cold-start restore decision.
 *
 * The legacy shell gates this on `display.resume_last_session` read from the
 * Hermes config record (`GET /api/config`). The product serves no legacy REST
 * surface, so the decision is stated here instead of derived from a fetch this
 * shell must never issue — and it states the behaviour that fetch already
 * produced: when the record failed to load, `resumeLastSession` evaluated
 * `true` (the absent setting is not `false`). The approved product behaviour is
 * exactly that: restore the last AgentBox session/draft on cold start.
 *
 * Deliberately typed `boolean`, never `boolean | undefined`: the legacy
 * `undefined` ("hold the restore latch open until the config answers")
 * describes a fetch this composition does not make, so the cold-start decision
 * is definite and the restore resolves without waiting for any backend.
 */
export const PRODUCT_RESUME_LAST_SESSION: boolean = true

/** The product's definite cold-start restore decision (see above). */
export function resolveProductResumeLastSession(): boolean {
  return PRODUCT_RESUME_LAST_SESSION
}
