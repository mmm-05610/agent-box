/**
 * Sessions API — Query and manage sessions
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async)
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Session } from './types'

/**
 * Parse a SQLite `datetime('now')` string as UTC.
 *
 * The backend stores timestamps via SQLite's `datetime('now')`, which is
 * UTC with no timezone suffix. `new Date("2026-08-03 11:14:50")` would
 * parse it as *local* time and skew by the machine's UTC offset — append
 * `Z` so the browser converts to local correctly.
 */
function parseUtcDateTime(value: string | null | undefined): number {
  if (!value) return 0
  const normalized = value.replace(' ', 'T')
  const withTz = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`
  const ms = Date.parse(withTz)
  return Number.isNaN(ms) ? 0 : ms
}

/** Convert snake_case session from CLI to camelCase */
function toSession(raw: Record<string, unknown>): Session {
  return {
    id: raw.id as number,
    profile: raw.profile as string,
    agentType: raw.agent_type as AgentType,
    cwd: raw.cwd as string,
    mode: raw.mode as string | undefined,
    pid: raw.pid as number | undefined,
    launchedAt: parseUtcDateTime(raw.launched_at as string | null),
    exitedAt: raw.exited_at ? parseUtcDateTime(raw.exited_at as string) : undefined,
    exitCode: raw.exit_code as number | undefined,
  }
}

export async function fetchSessions(): Promise<Session[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_sessions!(), [])
  return raw.map(toSession)
}

export async function cleanupSessions(): Promise<number> {
  return call<number>((api) => api.cleanup_sessions!(), 0)
}
