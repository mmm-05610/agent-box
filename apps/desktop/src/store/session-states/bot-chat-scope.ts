import { atom } from 'nanostores'

import { readJson, writeJson } from '@/lib/storage'
import {
  $sessionTiles,
  patchSessionTile,
  storedSessionIdForRuntimeId,
  type SessionTileWorkspaceScope
} from './session-state-registry'

/** The persisted bot-chat scope ledger for main-pane chats, and the writer
 *  that records a stored session's workspace scope onto tile or ledger. */
const BOT_CHAT_SCOPE_KEY = 'hermes.desktop.botChatSessions.v1'

/** Stored ids last opened as a bot's chat. A tile carries `workspaceMode`, but
 *  a bot chat normally lands in MAIN — `in-place` mints no tile when there is
 *  none to front — and main has no tile to carry the scope on. Kept here so a
 *  surface can still tell a companion chat from a working session, persisted
 *  so that survives a relaunch the way tile scope does. */
export const $botChatSessionIds = atom<ReadonlySet<string>>(
  new Set((readJson<unknown>(BOT_CHAT_SCOPE_KEY) as unknown[] | null)?.filter(id => typeof id === 'string') ?? [])
)

/** The bot-mode scope each stored id was last opened under, for the main tab
 *  (which has no tile to carry one). Window-local: the caption falls back to
 *  the stored title until the chat is opened again. */
export const $botChatScopes = atom<Readonly<Record<string, SessionTileWorkspaceScope>>>({})

function rememberBotChatScope(storedSessionId: string, scope: SessionTileWorkspaceScope): void {
  const isBotChat = scope.workspaceMode === 'bots'
  const current = $botChatSessionIds.get()
  const { [storedSessionId]: previous, ...rest } = $botChatScopes.get()

  const changed = isBotChat
    ? previous?.workspaceOwnerKey !== scope.workspaceOwnerKey || previous?.workspaceTabTitle !== scope.workspaceTabTitle
    : Boolean(previous)

  if (changed) {
    $botChatScopes.set(isBotChat ? { ...rest, [storedSessionId]: scope } : rest)
  }

  if (current.has(storedSessionId) === isBotChat) {
    return
  }

  const next = new Set(current)

  if (isBotChat) {
    next.add(storedSessionId)
  } else {
    next.delete(storedSessionId)
  }

  $botChatSessionIds.set(next)
  writeJson(BOT_CHAT_SCOPE_KEY, next.size ? [...next] : null)
}

/** True while this live session is a bot's chat rather than a working session.
 *  Surfaces read it to drop coding chrome that means nothing in a companion
 *  conversation — the composer's branch/worktree rail. */
export function isBotChatSession(sessionId: null | string | undefined): boolean {
  const stored = sessionId ? storedSessionIdForRuntimeId(sessionId) : null

  return Boolean(stored && $botChatSessionIds.get().has(stored))
}

export function setSessionTileWorkspaceScope(storedSessionId: string, scope: SessionTileWorkspaceScope): boolean {
  // Before the tile lookup: openSession routes every open through here, and a
  // bot chat usually has no tile to record the scope on.
  rememberBotChatScope(storedSessionId, scope)

  const tile = $sessionTiles.get().find(candidate => candidate.storedSessionId === storedSessionId)
  const workspaceOwnerKey = scope.workspaceMode === 'bots' ? scope.workspaceOwnerKey : undefined
  // Sessions-mode re-opens (sidebar click on an already-tiled session) pass no
  // route; that is absence of information, not a revocation — keep the exact
  // owner the tile was opened with (a branch child's parent connection) so a
  // plain re-open can't unpin the owning socket. Bot scopes stay authoritative
  // both ways: they always name their route explicitly.
  const ownerRoute = scope.workspaceMode === 'bots' ? scope.ownerRoute : (scope.ownerRoute ?? tile?.ownerRoute)
  const workspaceTabTitle = scope.workspaceMode === 'bots' ? scope.workspaceTabTitle : undefined

  if (
    !tile ||
    ((tile.workspaceMode ?? 'sessions') === scope.workspaceMode &&
      tile.workspaceOwnerKey === workspaceOwnerKey &&
      tile.ownerRoute?.connectionId === ownerRoute?.connectionId &&
      tile.ownerRoute?.profile === ownerRoute?.profile &&
      tile.ownerRoute?.targetProfile === ownerRoute?.targetProfile &&
      tile.workspaceTabTitle === workspaceTabTitle)
  ) {
    return false
  }

  patchSessionTile(storedSessionId, {
    ownerRoute,
    workspaceMode: scope.workspaceMode,
    workspaceOwnerKey,
    workspaceTabTitle
  })

  return true
}
