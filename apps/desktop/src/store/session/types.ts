/**
 * The session store's own domain types, kept in a module that stands on
 * `@/types/**` alone.
 *
 * The owner route is the ONE authoritative exact owner of a session, and its
 * shape is what the store carries (`$sessionResumeRequest`, a tile's
 * `ownerRoute`, `sessionOwnerByRuntimeId`). Defining it beside the code that
 * USES it — the routing use-case that hands it to `store/gateway` — made every
 * consumer of the type inherit that use-case's whole closure, transport
 * included, and closed the cycle that put the session store inside SCC-B. The
 * shape and the shape predicate therefore live here, on nothing, and the router
 * lives above in `application/session/**`.
 */

/**
 * The ONE authoritative exact owner of a session: the registry connection whose
 * socket minted (or resumed) the runtime, plus the Desktop profile that selects
 * that route. `targetProfile` is the backend profile the route serves when it
 * differs from the Desktop-side name (remote overrides); `mode` is informative.
 *
 * Captured ONCE at the new-chat intent / send linearization point
 * (store/profile resolveNewChatOwnerRoute) and carried through session.create,
 * the owner hint, the optimistic row, the runtime binding, the foreground hold
 * and every later session-scoped RPC. Never re-derived from ambient state after
 * an asynchronous activation: connection/profile EQUALITY is not enough — the
 * runtime lives on one concrete WebSocket, and only this route names the
 * registry entry that holds it.
 */
export interface SessionOwnerRoute {
  connectionId: string
  mode?: 'local' | 'remote'
  profile: string
  targetProfile?: string
}

/** @deprecated Alias kept for existing imports; new code names SessionOwnerRoute. */
export type SessionProfileRoute = SessionOwnerRoute

export type SessionOwnerScope = undefined | null | string | SessionOwnerRoute

/**
 * Narrow a scope to an exact route. A pure shape test — no imports, no state —
 * so both sides can use it: the store's fail-closed resolution reads it to
 * decide whether an owner is known at all, and the application router reads it
 * to decide which door an RPC takes. The application router may not be the
 * home of a predicate the store needs, or the store inherits the transport.
 */
export const isSessionOwnerRoute = (owner: SessionOwnerScope): owner is SessionOwnerRoute =>
  Boolean(owner && typeof owner === 'object' && 'connectionId' in owner)
