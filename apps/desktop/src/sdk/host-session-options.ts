import type { OpenSessionIntent } from '@/app/open-session'
import type { WorkspaceMode } from '@/contrib/types'

import type { PluginProfileRoute } from './host-routing'

/** Ordinary session opens fail fast when their gateway or socket is dead. */
export const DEFAULT_SESSION_HYDRATION_TIMEOUT_MS = 20_000
/** Cold Bot profiles get a larger per-attempt budget to start their backend
 *  and paint durable history. Bot Mode opts into one retry, so its effective
 *  ceiling is two bounded attempts rather than an unbounded wait. */
export const BOT_CHAT_SESSION_HYDRATION_TIMEOUT_MS = 60_000


export interface PluginOpenSessionOptions {
  awaitHydration?: boolean
  expectHistory?: boolean
  /** Always request a sequenced session.resume after the open, even when the
   *  surface already looks healthy. The healthy check trusts any non-empty
   *  cached transcript, so an explicit bot-switch re-open can paint a STALE
   *  snapshot kept by the session-states cache and skip the refresh entirely
   *  (#93604 — Bot Chat shows old messages until app restart). Resume is
   *  cheap and idempotent (the route-resume effect consumes redundant
   *  requests as no-ops), so callers who know the user explicitly navigated
   *  here set this to guarantee freshness. Only honored with awaitHydration. */
  forceResume?: boolean
  hydrationTimeoutMs?: number
  intent?: OpenSessionIntent
  keepAllProfilesScope?: boolean
  profile?: null | string
  route?: PluginProfileRoute
  workspaceMode?: WorkspaceMode
  workspaceOwnerKey?: string
  /** A cold profile backend can lose the hydration-timeout race once and still
   *  be fine on a second try. When set, a hydration timeout is retried
   *  internally before it reaches the caller or arms the core stranded-session
   *  overlay ($resumeExhaustedSessionId) — a caller-side retry can't do this
   *  itself because only this SDK layer sees $resumeExhaustedSessionId. */
  retryHydrationTimeoutOnce?: boolean
  tabTitle?: string
}

export interface PluginNewChatOptions {
  workspaceMode?: WorkspaceMode
  workspaceOwnerKey?: string
}
