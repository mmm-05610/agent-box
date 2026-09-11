import type { WorkspaceMode } from '@/types/contributions'
/**
 * The host's "open this session" verb, published downward.
 *
 * `app/open-session.ts` owns the DECISION (mark viewed, then window / tab /
 * main / in-place) — it is routing vocabulary, so it stays in `app/`. But two
 * callers stand below `app/` and may not name it: the plugin ABI's
 * `host.openSession` (the SDK is the same layer as components, not above the
 * routes) and transcript components rendering a `@session:` ref. This seam is
 * how the desktop-fs connection source works: the host registers its
 * implementation once — at `app/open-session.ts` module scope, so the verb is
 * answerable the moment the module is imported — and everyone below calls
 * `requestOpenSession` without an upward edge.
 *
 * The seam is named for the HOST, not for plugins: `host.openSession` is one
 * caller of this verb, not its definition.
 *
 * A missing registration throws. It is a programming error — the app graph
 * always imports `app/open-session.ts`, and a caller reaching for the verb
 * before that import has evaluated would otherwise fail silently as "the
 * click did nothing".
 */
import type { SessionOwnerRoute } from '@/types/session'

export type OpenSessionIntent = 'in-place' | 'main' | 'stack' | 'tab' | 'window'

export interface OpenSessionScope {
  ownerRoute?: SessionOwnerRoute
  workspaceMode: WorkspaceMode
  workspaceOwnerKey?: string
  workspaceTabTitle?: string
}

export type OpenSessionHandler = (
  storedSessionId: string,
  navigate: (to: string, options?: { replace?: boolean }) => void,
  intent: OpenSessionIntent,
  scope?: OpenSessionScope
) => void

let handler: OpenSessionHandler | null = null

/** Publish the host implementation. Called once, at `app/open-session.ts`
 *  module scope. */
export function setOpenSessionHandler(next: OpenSessionHandler): void {
  handler = next
}

/** Ask the host to open a stored session. Throws when no handler is
 *  registered — a clear failure, never a silent no-op. */
export function requestOpenSession(
  storedSessionId: string,
  navigate: (to: string, options?: { replace?: boolean }) => void,
  intent: OpenSessionIntent,
  scope?: OpenSessionScope
): void {
  if (!handler) {
    throw new Error('openSession is not registered: nothing has imported @/app/open-session yet.')
  }

  handler(storedSessionId, navigate, intent, scope)
}
