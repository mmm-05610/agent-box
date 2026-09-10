import { describe, expect, it } from 'vitest'

import { RELAY_DELIVER_BUDGET } from './relay'
import { CURRENT_RELAY_BUDGET_PROTOCOL } from './relay-protocol-budget'

// #93911 review follow-up: the Desktop deadline for bot_relay.deliver has to
// clear the runtime's own worst case, or the client gives up before a valid
// typed settlement arrives.
//
// The runtime's numbers belong to the Hermes runtime, which this repository does
// not contain — so they are asserted against the versioned fixture in
// relay-protocol-budget.ts rather than read out of runtime source. Nothing in
// the type system links a TS constant to a runtime default, so this file stays
// the seam: it fails when the mirrors drift from the recorded protocol, or when
// the settlement margin stops being positive.

const protocol = CURRENT_RELAY_BUDGET_PROTOCOL

describe('bot_relay.deliver budget mirrors', () => {
  it('mirrors the runtime turn-lock default', () => {
    expect(RELAY_DELIVER_BUDGET.turnLockWaitMs).toBe(protocol.turnLockWaitSeconds * 1000)
  })

  it('mirrors the runtime per-attempt turn timeout and attempt count', () => {
    expect(RELAY_DELIVER_BUDGET.turnAttemptMs).toBe(protocol.turnAttemptTimeoutSeconds * 1000)
    expect(RELAY_DELIVER_BUDGET.turnMaxAttempts).toBe(protocol.turnMaxAttempts)
  })

  it('derives the backend ceiling from the mirrored parts, not a second literal', () => {
    expect(RELAY_DELIVER_BUDGET.backendCeilingMs).toBe(
      protocol.turnLockWaitSeconds * 1000 + protocol.turnAttemptTimeoutSeconds * 1000 * protocol.turnMaxAttempts
    )
  })

  it('keeps the client deadline strictly greater than the runtime ceiling', () => {
    // Strictly greater, not equal: a backend that answers at its own limit
    // still has to serialize and transport that answer.
    expect(RELAY_DELIVER_BUDGET.settlementMarginMs).toBeGreaterThan(0)
    expect(RELAY_DELIVER_BUDGET.timeoutMs).toBeGreaterThan(RELAY_DELIVER_BUDGET.backendCeilingMs)
    expect(RELAY_DELIVER_BUDGET.timeoutMs).toBe(
      RELAY_DELIVER_BUDGET.backendCeilingMs + RELAY_DELIVER_BUDGET.settlementMarginMs
    )
  })

  it('records the runtime revision the budget was validated against', () => {
    // A guard on the fixture itself: an entry with no provenance cannot be
    // re-validated later, which is the whole point of versioning it.
    expect(protocol.sourceRuntimeVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(protocol.protocolVersion).toBeGreaterThan(0)
  })
})
