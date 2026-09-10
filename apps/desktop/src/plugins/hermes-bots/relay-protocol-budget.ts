/**
 * The external runtime's `bot_relay.deliver` budget, recorded as a versioned
 * protocol fixture.
 *
 * These numbers belong to the Hermes runtime, not to this client, and this
 * repository ships no runtime source to read them from. They are recorded here
 * — pinned to the runtime version they were taken from — so the Desktop can
 * still prove its own timeout clears the backend's ceiling. That check is the
 * seam that caught #93911 (the client giving up before a valid typed settlement
 * arrived); dropping it entirely would let the backend raise a timeout while the
 * client silently kept the old one.
 *
 * UPDATING: when the runtime changes one of these numbers, add a new entry (do
 * not edit the old one — it documents what older runtimes do, and a client that
 * supports a range of runtime versions needs the range) and bump
 * `RELAY_BUDGET_PROTOCOL_VERSION`. `relay-deliver-budget.test.ts` fails until the
 * Desktop's own constants follow.
 */

export interface RelayBudgetProtocol {
  /**
   * Bump when any number below changes. Mirrors nothing on the wire today — it
   * exists so a reviewer can see at a glance which revision the client was
   * validated against.
   */
  protocolVersion: number
  /** The Hermes runtime version these values were read from. */
  sourceRuntimeVersion: string
  /** `bot_mode.turn_wait_seconds` default — the backend's turn-lock wait. */
  turnLockWaitSeconds: number
  /** `TURN_ATTEMPT_TIMEOUT_SECONDS` — one `bot_relay.deliver` attempt. */
  turnAttemptTimeoutSeconds: number
  /** `TURN_MAX_ATTEMPTS` — first attempt plus the policy-gated re-run. */
  turnMaxAttempts: number
}

export const RELAY_BUDGET_PROTOCOL_VERSION = 1

export const RELAY_BUDGET_PROTOCOLS: readonly RelayBudgetProtocol[] = [
  {
    protocolVersion: 1,
    // The last in-repo Hermes runtime this client was validated against, before
    // the runtime moved out of this repository.
    sourceRuntimeVersion: '0.21.1',
    turnLockWaitSeconds: 120,
    turnAttemptTimeoutSeconds: 600,
    turnMaxAttempts: 2
  }
]

/** The newest recorded revision — what the current client asserts against. */
export const CURRENT_RELAY_BUDGET_PROTOCOL: RelayBudgetProtocol = RELAY_BUDGET_PROTOCOLS.reduce(
  (newest, candidate) => (candidate.protocolVersion > newest.protocolVersion ? candidate : newest)
)
