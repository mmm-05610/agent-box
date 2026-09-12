import type { GatewayRequester } from '@/types/gateway'

import { registerRecoveredRuntime, singleFlightSessionResume, takeRecoveredRuntime } from './single-flight-resume'

export function isSessionNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /session not found/i.test(message)
}

/**
 * Thrown when a stale-session recovery resumed successfully but the caller's
 * drift check says the user has since moved on (profile swap, route rebind,
 * a different chat in the foreground). The retry is deliberately NOT attempted:
 * landing it would run the prompt against a session the user is no longer
 * looking at. Callers unwind through their own abort path (#66889).
 */
export class SessionRecoveryAborted extends Error {
  constructor(
    readonly reason: string,
    readonly recoveredSessionId: string
  ) {
    super(`session recovery aborted: ${reason}`)
    this.name = 'SessionRecoveryAborted'
  }
}

export interface SessionRecoveryDeps {
  requestGateway: GatewayRequester
  /**
   * Owning profile for a stored session. A resume without it lands on
   * whichever gateway is active and forks the conversation into the wrong
   * profile's DB (#67603).
   *
   * Injected rather than imported so this module stays free of the session
   * store and the REST layer: the default implementation reaches through
   * `resolveStoredSession` → `getSession()`, a real fetch that makes any unit
   * test of this helper depend on leftover `$sessions` / `$profiles` state.
   */
  resolveProfile?: (storedSessionId: string) => Promise<string | undefined>
  /**
   * Publish the fresh live id. Implementations must update BOTH the hot ref
   * and the `$activeSessionId` atom — a ref-only write leaves the atom
   * pointing at the dead runtime and every atom-reading surface desyncs
   * (#62471).
   */
  onRecovered?: (liveSessionId: string) => void
  /**
   * Non-null reason ⇒ abort instead of retrying. Evaluated AFTER the resume
   * and BEFORE the retry, because the resume is the slow await during which a
   * profile switch or route rebind can land.
   */
  driftReason?: () => null | string
}

async function defaultResolveProfile(storedSessionId: string): Promise<string | undefined> {
  // Lazy so utils.ts has no init-time dependency on the session-registry fetch chain.
  const { resolveSessionProfile } = await import('@/application/session/session-registry-lookup')

  return resolveSessionProfile(storedSessionId)
}

/**
 * Re-register a durable stored session after the gateway dropped its
 * in-memory runtime id (sleep/wake, remote backend restart, long idle).
 * Returns the fresh live id, or null when the resume yields none.
 */
export async function resumeStoredRuntimeSession(
  storedSessionId: string,
  deps: SessionRecoveryDeps
): Promise<null | string> {
  // Single-flight per stored id: after a reconnect many surfaces discover the
  // same dead runtime at once, and each independent session.resume mints a new
  // runtime — every loser is an orphan for the reaper. Sharing one in-flight
  // promise makes concurrent recoveries converge on ONE runtime.
  const resumed = await singleFlightSessionResume(storedSessionId, async () => {
    const resolveProfile = deps.resolveProfile ?? defaultResolveProfile
    const profile = await resolveProfile(storedSessionId)

    return deps.requestGateway<{ session_id: string }>('session.resume', {
      session_id: storedSessionId,
      source: 'desktop',
      omit_messages: true,
      ...(profile ? { profile } : {})
    })
  })

  return resumed?.session_id ?? null
}

/**
 * Single resolver for "the runtime session id I hold is dead."
 *
 * Every session-scoped RPC needs this, not just `prompt.submit`. Attach,
 * `/compress`, checkpoint restore, and interrupt all run against the same
 * runtime id and all used to surface a raw "session not found" after sleep —
 * while plain text silently recovered, which is why the bug reads as "text
 * works, images don't."
 *
 * Runs `call(sessionId)`. On a stale-session error it resumes the stored
 * session ONCE, republishes the fresh id, and retries. Bounded to a single
 * retry: a second failure is a real error, not a stale binding.
 *
 * A resume that itself 404s (a never-persisted first-submit draft has no DB
 * row until its first successful submit) rethrows the ORIGINAL error rather
 * than the confusing secondary one (#67539).
 */
export async function withSessionNotFoundResume<T>(
  sessionId: string,
  storedSessionId: null | string | undefined,
  call: (liveSessionId: string) => Promise<T>,
  deps: SessionRecoveryDeps,
  options?: { alsoTimeout?: boolean }
): Promise<{ recovered: boolean; result: T; sessionId: string }> {
  try {
    return { recovered: false, result: await call(sessionId), sessionId }
  } catch (err) {
    // A starved backend loop rejects with a timeout that is indistinguishable
    // from a dead runtime on the client side (#55578). Opt-in per caller:
    // submit recovers from it, a compress/attach retry should not mask a
    // genuinely slow LLM-bound call.
    const recoverable = isSessionNotFoundError(err) || (Boolean(options?.alsoTimeout) && isGatewayTimeoutError(err))

    if (!recoverable || !storedSessionId) {
      throw err
    }

    // A previous recovery for this stored session already minted a runtime
    // that its caller drift-aborted away from. Reuse it before resuming
    // again — re-minting would strand yet another runtime for the reaper.
    const cachedRecoveredId = takeRecoveredRuntime(storedSessionId, sessionId)

    if (cachedRecoveredId) {
      const cachedDrift = deps.driftReason?.()

      if (cachedDrift) {
        // Still drifted: keep the runtime findable for whoever acts next.
        registerRecoveredRuntime(storedSessionId, cachedRecoveredId)
        throw new SessionRecoveryAborted(cachedDrift, cachedRecoveredId)
      }

      try {
        deps.onRecovered?.(cachedRecoveredId)

        return { recovered: true, result: await call(cachedRecoveredId), sessionId: cachedRecoveredId }
      } catch (cachedErr) {
        // The cached runtime died in the meantime; fall through to a fresh
        // resume only for the same stale-session class, otherwise surface it.
        if (!isSessionNotFoundError(cachedErr)) {
          throw cachedErr
        }
      }
    }

    let recoveredId: null | string

    try {
      recoveredId = await resumeStoredRuntimeSession(storedSessionId, deps)
    } catch {
      throw err
    }

    if (!recoveredId) {
      throw err
    }

    const drift = deps.driftReason?.()

    if (drift) {
      // Do NOT abandon the freshly-minted runtime: adoption is wrong here
      // (the user moved on), so record it in the stored->runtime recovery
      // cache. The next action targeting this stored session reuses it
      // instead of minting another orphan (#91276).
      registerRecoveredRuntime(storedSessionId, recoveredId)
      throw new SessionRecoveryAborted(drift, recoveredId)
    }

    deps.onRecovered?.(recoveredId)

    return { recovered: true, result: await call(recoveredId), sessionId: recoveredId }
  }
}

// Gateway JSON-RPC calls reject with "request timed out: <method>" when the
// backend event loop is starved (e.g. a poller spin or a heavy async-injected
// turn). For prompt.submit this is indistinguishable from a dead runtime
// session on the client side — recovery must treat it like one (#55578):
// resume the SELECTED stored session and retry, instead of surfacing an error
// that leads to a null activeSessionId and a silently minted new session.
export function isGatewayTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return /request timed out/i.test(message)
}
