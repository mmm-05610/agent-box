/**
 * The session store's own domain types, kept in a module that stands on
 * `@/types/**` alone.
 *
 * `store/session-request-router.ts` is where the owner route is USED (it hands
 * it to `store/gateway`), so defining it there made every consumer of the type
 * carry the router's whole closure — `@/store/gateway` → `@/hermes` — with it.
 * The session store only ever needs the SHAPE (`$sessionResumeRequest` carries
 * one), and a store may not reach the API layer, so the shape lives here and
 * the router re-exports it for its own callers.
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
