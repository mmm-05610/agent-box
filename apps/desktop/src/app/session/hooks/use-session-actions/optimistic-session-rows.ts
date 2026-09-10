import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import { $currentCwd, setSessionOwnerHint, setSessions } from '@/store/session'
import type { SessionProfileRoute } from '@/store/session-request-router'
import type { SessionCreateResponse, SessionInfo } from '@/types/hermes'

/** Publish optimistic sidebar session rows and patch their workspace fields. */
export function upsertOptimisticSession(
  created: SessionCreateResponse,
  id: string,
  title: string | null = null,
  preview: string | null = null,
  parentSessionId: string | null = null,
  lastActive?: number,
  owner?: null | SessionProfileRoute
) {
  const now = lastActive ?? Date.now() / 1000
  // Stamp the profile the session was just created on so the scoped sidebar
  // shows the new row immediately instead of filtering it out as "default"
  // until the aggregator re-fetches. An explicitly routed create ($newChatRoute
  // / a tile's route) names its EXACT owner: the backend profile that route
  // serves, on that route's connection. The live gateway's profile is only the
  // owner for an unrouted create — in All-profiles / Bot routing the ambient
  // profile stays on `default` while the session lives on another backend (and
  // a concurrent source switch can move the active gateway before this row is
  // inserted), so a row stamped `default` then misroutes every session-scoped
  // RPC that resolves its owner off the row ("session not found" on turn two).
  const profileKey = normalizeProfileKey(owner ? owner.targetProfile || owner.profile : $activeGatewayProfile.get())
  const connectionId = owner?.connectionId.trim() || ''

  const session: SessionInfo = {
    // Seed cwd so the grouped sidebar can place the new row in its repo/worktree
    // lane immediately (the overlay groups by path); fall back to the workspace
    // the session was just started in when the create response omits it.
    cwd: created.info?.cwd ?? ($currentCwd.get().trim() || null),
    ended_at: null,
    id,
    input_tokens: 0,
    is_active: true,
    is_default_profile: profileKey === 'default',
    last_active: now,
    message_count: created.message_count ?? created.messages?.length ?? 0,
    model: created.info?.model ?? null,
    output_tokens: 0,
    parent_session_id: parentSessionId,
    preview,
    profile: profileKey,
    source: 'tui',
    started_at: now,
    title,
    tool_call_count: 0,
    ...(connectionId ? { connection_id: connectionId } : {})
  }

  if (owner) {
    setSessionOwnerHint(id, owner)
  }

  setSessions(prev => [session, ...prev.filter(s => s.id !== id)])
}

export function patchSessionWorkspace(sessionId: string, cwd: string | undefined) {
  if (!cwd) {
    return
  }

  setSessions(prev => prev.map(session => (session.id === sessionId ? { ...session, cwd } : session)))
}

