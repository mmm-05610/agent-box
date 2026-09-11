/**
 * The pooled secondary socket's lifecycle port.
 *
 * A secondary socket's reopen is the boundary at which a backend generation
 * ends: a respawned backend re-mints runtime ids, so every stored→runtime
 * binding a surface recorded against the old process is stale the moment a
 * REOPENING socket dials, and every busy claim minted on the old socket can
 * never receive its terminal publish. What to DO about that is session-state
 * policy and lives above the transport, in
 * `application/gateway/reconnect-session-effects.ts`. This module only
 * PUBLISHES the fact, which is what keeps `store/gateway/**` a transport that
 * never knows session state exists.
 *
 * Same inversion as `store/gateway-reconnect.ts`: one typed observer slot, an
 * explicit installer, and a disposer that clears only the installation it owns.
 * There is deliberately no event-bus topic string and no global slot — the
 * observer is one object with two named methods, so a missing wiring is a
 * compile-time-visible absence rather than a silently dropped message.
 */

/** The lifecycle identity of one pooled socket. */
export interface SecondaryOpenScope {
  /** Registry connection that owns the socket; `local` for the legacy profile pool. */
  connectionId: string
  /** Desktop profile the socket serves. */
  profile: string
  /** The pool key: registryBackendScopeKey(connectionId, profile). */
  scope: string
}

export interface SecondaryLifecycleObserver {
  /**
   * Fires synchronously BEFORE a reopening socket dials, and therefore before
   * it can publish `open`. A routed action racing the new socket must not find
   * a runtime id the previous generation minted. A scope opening for the first
   * time in this renderer generation replaced no backend and does not fire.
   */
  beforeSecondaryReopen(scope: SecondaryOpenScope): void
  /**
   * Fires AFTER a reopening socket actually reached `open` — never for a failed
   * dial, and never before the socket can serve a request.
   */
  afterSecondaryReopen(scope: SecondaryOpenScope): void
}

let observer: SecondaryLifecycleObserver | null = null
let reportedMissingObserver = false

/**
 * Install the observer. Returns the disposer for THIS installation: disposing a
 * superseded observer must not unregister the current one (a stale cleanup from
 * a previous mount cannot tear the live wiring down).
 */
export function registerSecondaryLifecycleObserver(next: SecondaryLifecycleObserver): () => void {
  observer = next
  reportedMissingObserver = false

  return () => {
    if (observer === next) {
      observer = null
    }
  }
}

export function secondaryLifecycleObserver(): SecondaryLifecycleObserver | null {
  return observer
}

/**
 * Hand `fact` to the installed observer.
 *
 * A missing observer is a WIRING DEFECT, not a normal state — nothing would
 * invalidate the previous generation's runtime bindings or busy claims — so it
 * is reported rather than swallowed. It must not abort the socket either: an
 * unusable transport turns a recoverable UI inconsistency into an unreachable
 * session. An observer that throws is contained for the same reason the
 * pre-inversion dynamic import was wrapped: the reconnect already succeeded.
 */
function publish(fact: (observer: SecondaryLifecycleObserver) => void): void {
  const installed = observer

  if (!installed) {
    if (!reportedMissingObserver) {
      reportedMissingObserver = true
      console.error(
        '[gateway] no secondary lifecycle observer is installed: runtime bindings and busy claims from the previous socket generation will not be reconciled'
      )
    }

    return
  }

  try {
    fact(installed)
  } catch (error) {
    console.error('[gateway] secondary lifecycle observer failed:', error)
  }
}

export function publishSecondaryReopen(scope: SecondaryOpenScope): void {
  publish(installed => installed.beforeSecondaryReopen(scope))
}

export function publishSecondaryReopened(scope: SecondaryOpenScope): void {
  publish(installed => installed.afterSecondaryReopen(scope))
}
