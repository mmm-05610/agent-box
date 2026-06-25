/**
 * Sessions API — Query and manage sessions
 *
 * Calls PyWebView bridge functions.
 */

import { call } from '@/lib/bridge'
import type { Session } from './types'

export async function fetchSessions(): Promise<Session[]> {
  // @ts-expect-error
  return call<Session[]>(() => window.api.list_sessions(), [])
}

export async function cleanupSessions(): Promise<number> {
  // @ts-expect-error
  return call<number>(() => window.api.cleanup_sessions(), 0)
}
