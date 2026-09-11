/**
 * legacy-hermes/first-run-continuation.ts
 *
 * The two user choices the first-run setup gate can resolve into: continue with
 * a local install, or abandon the chained wait because a remote connection was
 * applied instead.
 *
 * Moved verbatim out of `main.ts` (E5c). A separate module from
 * `first-run-setup-gate.ts` on purpose: the gate itself is pure and unit-tested
 * without Electron, and importing the composition root here would drag Electron
 * into that test.
 */

import { broadcastBootstrapEvent, getFirstRunSetupGate } from '../composition/bootstrap-env-composition'

export function continueFirstRunLocalBootstrap() {
  getFirstRunSetupGate().continueLocal()
}

export function abandonFirstRunSetupChoiceForRemoteApply() {
  const gate = getFirstRunSetupGate()

  if (!gate.hasWaiter()) {
    return false
  }

  const resumedGatedConnection = gate.abandonForRemoteApply()

  if (resumedGatedConnection) {
    broadcastBootstrapEvent({ type: 'dismissed' })
  }

  return resumedGatedConnection
}
