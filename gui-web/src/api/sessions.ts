/**
 * Sessions API — Query and manage sessions
 *
 * Currently returns empty data. Will be connected to PyWebView bridge.
 */

import type { Session } from './types'

export async function fetchSessions(): Promise<Session[]> {
  return []
}

export async function cleanupSessions(): Promise<number> {
  throw new Error('Not connected to backend')
}
