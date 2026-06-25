/**
 * Sessions API — Query and manage sessions
 *
 * Calls PyWebView bridge functions via window.pywebview.api
 */

import { call } from '@/lib/bridge'
import type { Session } from './types'

export async function fetchSessions(): Promise<Session[]> {
  return call<Session[]>((api) => api.list_sessions(), [])
}

export async function cleanupSessions(): Promise<number> {
  return call<number>((api) => api.cleanup_sessions(), 0)
}
