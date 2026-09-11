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
 * shape lives on the `@/types/session` leaf; the shape predicate therefore
 * lives here, on nothing, and the router lives above in
 * `application/session/**`.
 */

import type { SessionOwnerRoute } from '@/types/session'

export type { SessionOwnerRoute }

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
