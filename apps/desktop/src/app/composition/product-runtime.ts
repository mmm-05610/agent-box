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
import { readResumeLastSession } from '@/application/desktop-preferences/resume-last-session'

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
 * surface, so the decision belongs to this machine: it is the Desktop-local
 * preference (`application/desktop-preferences/resume-last-session`), the same
 * authority the Appearance switch writes and the product composition root
 * hydrates at import (`$resumeLastSession`).
 *
 * Deliberately typed `boolean`, never `boolean | undefined`: the legacy
 * `undefined` ("hold the restore latch open until the config answers")
 * describes a fetch this composition does not make, so the cold-start decision
 * is definite and the restore resolves without waiting for any backend. The
 * default, when nothing was ever stored, is the approved product behaviour:
 * restore the last AgentBox session/draft on cold start.
 */
export function resolveProductResumeLastSession(): boolean {
  return readResumeLastSession()
}
