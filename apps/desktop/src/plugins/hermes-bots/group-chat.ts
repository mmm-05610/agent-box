import { host } from '@hermes/plugin-sdk'
import { $botMeta, $lastRoster } from './data'
import {
  $groupChats,
  $groupNeedsYou,
  GROUP_CHAT_SYNC_META_KEY,
  type GroupChatRoom,
  type GroupChatSyncJob,
  type GroupChatSyncSnapshot,
} from './group-chat-state'
import {
  groupChatSyncSnapshot,
  mergeGroupChatSyncSnapshots,
  mergeRemoteGroupChatSnapshotIntoRooms,
  trimGroupChatLog,
} from './group-chat-sync-snapshot'
import { groupMemberReferencesConnection, markOrphanedGroupMemberDescriptor } from './hygiene'
import { getPluginCtx } from './shared'
import type {
  Attachment,
  GroupChat,
  GroupMessage,
  GroupMessageAuthor,
  RosterRow
} from './types'

import {
  groupChatSyncPendingByConnection,
  groupChatSyncInFlightConnections,
  groupChatSyncRetryTimers,
  groupChatSyncRetryCounts,
  groupChatSyncTimer,
  groupChatSyncDisposed,
  durableGroupChatRooms,
  persistGroupChatRooms,
  groupChatSyncConnectionId,
  groupChatSyncRequest,
  groupChatRemoteSnapshot,
  groupChatSyncBackoff,
  mergeGroupChatSyncJobs,
  groupChatSyncPayloadEqual,
  groupChatSyncTargetConnections,
  flushGroupChatServerSync,
  scheduleGroupChatServerSync,
  UpdateGroupChatOptions,
  updateGroupChat,
} from './group-chat-sync'
export function sweepGroupChatMembersForRemovedConnection(connectionId: string) {
  const id = String(connectionId || '').trim()

  if (!id) {
    return false
  }

  let changed = false

  for (const [name, room] of Object.entries($groupChats.get())) {
    const members = Array.isArray(room?.members) ? room.members : []

    if (!members.some(member => groupMemberReferencesConnection(member, id) && !member?.sourceMissing)) {
      continue
    }

    changed = true
    updateGroupChat(name, (current: GroupChat) => ({
      ...current,
      members: (Array.isArray(current.members) ? current.members : []).map(member =>
        groupMemberReferencesConnection(member, id) ? markOrphanedGroupMemberDescriptor(member) : member
      )
    }))
  }

  return changed
}
export async function pullGroupChatServerState(connectionId: string = groupChatSyncConnectionId()) {
  const { snapshot: remote } = await groupChatRemoteSnapshot({
    connectionId
  })

  if (!remote) {
    return false
  }

  const pending = groupChatSyncPendingByConnection.get(String(connectionId || ''))

  const merged = mergeRemoteGroupChatSnapshotIntoRooms(remote, $groupChats.get(), {
    preserveRooms: pending?.changedRooms || [],
    deletedRooms: pending?.deletedRooms || []
  })

  $groupChats.set(merged)
  await persistGroupChatRooms(merged)

  return true
}

export function handleSessionsGatewayTransition() {
  // A gateway swap invalidates any in-flight room drive: bump every room's
  // epoch so running loops bail at their next member boundary.
  const rooms = {
    ...$groupChats.get()
  }

  for (const name of Object.keys(rooms)) {
    rooms[name] = {
      ...rooms[name],
      epoch: (rooms[name].epoch || 0) + 1,
      running: false
    }
  }

  $groupChats.set(rooms)
  // Pull before re-publishing so a reconnect or source swap never lets this
  // client's stale cache hide a room written by another Desktop/mobile client.
  void pullGroupChatServerState()
    .catch(() => false)
    .then(() => scheduleGroupChatServerSync($groupChats.get()))
}

export const GROUP_CHAT_MAX_ROUNDS = 3
export const GROUP_CHAT_MAX_MESSAGES = 10
export const GROUP_CHAT_MAX_CONTINUATIONS = 2
export function groupSpeakerLabel(name?: null | string) {
  const trimmed = (name || '').trim()

  if (!trimmed) {
    return trimmed
  }

  // Bot Mode title (edit dialog) — same first rung as displayName().
  const title = String($botMeta.get()?.[trimmed]?.title || '').trim()

  if (title) {
    return title
  }

  // Core profile display_name (`hermes profile rename …` / dashboard) from
  // the ACTIVE gateway's roster row. Source-scoped remote speakers carry
  // their device suffix separately and keep their raw name here.
  const roster = $lastRoster.get()

  const row = Array.isArray(roster)
    ? roster.find(bot => bot?.name === trimmed && !bot?.remoteSource && !bot?.sourceScoped)
    : null

  const renamed = typeof row?.display_name === 'string' ? row.display_name.trim() : ''

  if (renamed) {
    return renamed
  }

  return trimmed.toLowerCase() === 'default' ? 'Hermes' : trimmed
}
export function setGroupChatImage(group: string, image: null | string | undefined) {
  updateGroupChat(group, (room: GroupChatRoom) => {
    room.image = image || null

    return room
  })
}
function groupChatEntryId(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
const GROUP_EMPTY_SENTINEL = '(empty)'
const GROUP_EMPTY_FRIENDLY =
  '⚠️ The model returned no response after processing tool results. ' +
  'This can happen with some models — try again or rephrase your question.'
function normalizeGroupChatText(text: string): string {
  const trimmed = String(text || '').trim()

  return trimmed === GROUP_EMPTY_SENTINEL ? GROUP_EMPTY_FRIENDLY : trimmed
}
export function appendGroupChatEntry(
  group: string,
  from: GroupMessageAuthor,
  text: string,
  thread?: null | string,
  images?: Attachment[]
): GroupMessage {
  const entry: GroupMessage = {
    id: groupChatEntryId(),
    at: Date.now(),
    from,
    text: normalizeGroupChatText(text),
    thread: thread || 'legacy'
  }

  if (Array.isArray(images) && images.length) {
    // [{ name, data }] — data URLs. Persisted with the room log so reloads
    // keep showing what the members were shown.
    entry.images = images
  }

  // #93127 insurance: a residual double-append path (stale loop + fresh
  // loop both committing the same member reply) lands back-to-back and
  // byte-identical. Drop the echo instead of flooding the room. User
  // entries and non-adjacent repeats are never touched.
  const priorLog = ($groupChats.get()[group] || {}).log || []
  const lastEntry = priorLog[priorLog.length - 1]

  if (isDuplicateGroupAppend(lastEntry, from, entry.text, entry.thread)) {
    return lastEntry
  }

  updateGroupChat(group, (room: GroupChatRoom) => {
    room.log.push(entry)

    return room
  })

  // Needs-you: a member addressing @user badges the group header.
  if (from.kind === 'member' && /@user\b/i.test(entry.text)) {
    $groupNeedsYou.set({
      ...$groupNeedsYou.get(),
      [group]: true
    })
  }

  return entry
}
export function mintGroupRoomId(): string {
  return `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
export function uniqueGroupChatName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base
  }

  for (let n = 2; n < 100; n++) {
    const suffix = ` ${n}`
    const candidate = base.slice(0, 64 - suffix.length) + suffix

    if (!taken.has(candidate)) {
      return candidate
    }
  }

  throw new Error('No free name for the group.')
}
export function shouldCommitMemberTurn(epochAtDispatch: number, currentEpoch: number, newerUserEntryInThread = true) {
  if (epochAtDispatch === currentEpoch) {
    return true
  }

  return !newerUserEntryInThread
}
const GROUP_DUPLICATE_APPEND_WINDOW_MS = 10 * 60 * 1000
function isDuplicateGroupAppend(
  lastEntry: GroupMessage | undefined,
  from: GroupMessageAuthor,
  text: string,
  thread: null | string | undefined,
  now = Date.now()
): boolean {
  if (!lastEntry || !from || from.kind !== 'member' || lastEntry.from?.kind !== 'member') {
    return false
  }

  if (String(lastEntry.from?.name || '') !== String(from.name || '')) {
    return false
  }

  if (String(lastEntry.from?.source || '') !== String(from.source || '')) {
    return false
  }

  if (String(lastEntry.thread || 'legacy') !== String(thread || 'legacy')) {
    return false
  }

  if (now - (lastEntry.at || 0) > GROUP_DUPLICATE_APPEND_WINDOW_MS) {
    return false
  }

  return String(lastEntry.text || '') === String(text || '').trim()
}
export function groupThreadOf(entry: GroupMessage): string {
  return entry?.thread || 'legacy'
}
export function mintGroupThreadId(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
export * from './group-chat-state'
export * from './group-chat-sync-snapshot'
export { GROUP_CHAT_HISTORY_LIMIT, GROUP_CHAT_MAX_MEMBERS } from './group-chat-sync-snapshot'

export {
  durableGroupChatRooms,
  flushGroupChatServerSync,
  groupChatRemoteSnapshot,
  groupChatSyncBackoff,
  groupChatSyncConnectionId,
  groupChatSyncDisposed,
  groupChatSyncInFlightConnections,
  groupChatSyncPayloadEqual,
  groupChatSyncPendingByConnection,
  groupChatSyncRequest,
  groupChatSyncRetryCounts,
  groupChatSyncRetryTimers,
  groupChatSyncTargetConnections,
  groupChatSyncTimer,
  mergeGroupChatSyncJobs,
  persistGroupChatRooms,
  scheduleGroupChatServerSync,
  setGroupChatSyncDisposed,
  stopGroupChatServerSync,
  updateGroupChat,
} from './group-chat-sync'
export type {
  UpdateGroupChatOptions,
} from './group-chat-sync'
