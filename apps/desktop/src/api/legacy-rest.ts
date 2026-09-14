/**
 * Which authority the renderer's REST bridge serves.
 *
 * The main process already refuses the legacy Hermes REST surface in the
 * AgentBox product runtime (`electron/ipc/api-proxy-ipc.ts`, gate first). This
 * is the same decision at the renderer's ONE door to that bridge
 * (`api/client.ts`): the product must not spend an IPC round-trip asking for a
 * surface it does not serve, and "no AgentBox-reachable legacy call" has to be
 * true of the requests the renderer ISSUES, not only of the answers it gets.
 *
 * Defaults to allowed so the legacy shell and the existing tests keep their
 * behaviour untouched; the product composition root turns it off, exactly as
 * `main.ts` derives `legacyApiAllowed` from the product runtime.
 */

import type { HermesApiRequest } from '@/global'

/** The same stable code the main-process gate carries, so a caller that was
 *  already handling the refused IPC error keeps working unchanged. */
export const LEGACY_REST_DISABLED_FOR_PRODUCT = 'LEGACY_RUNTIME_DISABLED_FOR_PRODUCT'

let legacyRestAllowed = true

/** Request paths already reported, so a polling caller is visible in the log
 *  once instead of every tick. */
const reportedPaths = new Set<string>()

export function isLegacyRestAllowed(): boolean {
  return legacyRestAllowed
}

export function setLegacyRestAllowed(allowed: boolean): void {
  legacyRestAllowed = allowed
  reportedPaths.clear()
}

export function legacyRestDisabledError(request: HermesApiRequest): Error & { code: string } {
  const path = String(request?.path ?? '')

  const error = new Error(
    `${LEGACY_REST_DISABLED_FOR_PRODUCT}: the AgentBox product runtime does not serve the legacy Hermes REST API`
  ) as Error & { code: string }

  error.code = LEGACY_REST_DISABLED_FOR_PRODUCT

  // The residual legacy callers stay observable: which path was asked for is
  // exactly what a future migration needs, and silence would hide it.
  if (path && !reportedPaths.has(path)) {
    reportedPaths.add(path)
    console.warn(`[legacy-rest] refused ${path}: ${LEGACY_REST_DISABLED_FOR_PRODUCT}`)
  }

  return error
}
