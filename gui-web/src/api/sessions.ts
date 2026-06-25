/**
 * Sessions API — Query and manage sessions
 */

import type { Session } from './types'
import { MOCK_SESSIONS } from './mock-data'

export async function fetchSessions(): Promise<Session[]> {
  await delay(300)
  return [...MOCK_SESSIONS]
}

export async function cleanupSessions(): Promise<number> {
  await delay(500)
  return 2 // number of cleaned up sessions
}

// ── Helpers ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
