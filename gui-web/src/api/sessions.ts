/**
 * Sessions API — Query and manage sessions
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async)
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Session } from './types'

/** Convert snake_case session from CLI to camelCase */
function toSession(raw: Record<string, unknown>): Session {
  return {
    id: raw.id as number,
    profile: raw.profile as string,
    agentType: raw.agent_type as AgentType,
    cwd: raw.cwd as string,
    mode: raw.mode as string | undefined,
    pid: raw.pid as number | undefined,
    launchedAt: new Date(raw.launched_at as string).getTime(),
    exitedAt: raw.exited_at ? new Date(raw.exited_at as string).getTime() : undefined,
    exitCode: raw.exit_code as number | undefined,
  }
}

export async function fetchSessions(): Promise<Session[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_sessions(), [])
  return raw.map(toSession)
}

export async function cleanupSessions(): Promise<number> {
  return call<number>((api) => api.cleanup_sessions(), 0)
}
