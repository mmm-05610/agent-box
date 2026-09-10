export const GROUP_CHAT_HISTORY_LIMIT = 24
export const GROUP_THREAD_GAP_MS = 15 * 60000
export const GROUP_CHAT_MAX_MEMBERS = 6

export function assignLegacyThreads(log: GroupMessage[]): GroupMessage[] {
  let current: null | string = null
  let n = 0

  return (log || []).map((entry, i) => {
    if (entry?.thread) {
      current = null

      return entry
    }

    const prev = log[i - 1]
    const lull = !prev || (entry.at || 0) - (prev.at || 0) > GROUP_THREAD_GAP_MS

    if (!current || (entry.from?.kind === 'user' && lull)) {
      current = `legacy-${n++}`
    }

    return {
      ...entry,
      thread: current
    }
  })
}

import { botRosterKey } from './data'
import {
  $groupChats,
  GROUP_CHAT_SYNC_IMAGE_CHARS,
  GROUP_CHAT_SYNC_MAX_BYTES,
  GROUP_CHAT_SYNC_MESSAGES,
  GROUP_CHAT_SYNC_TEXT_CHARS,
  type GroupChatSyncRoom,
  type GroupChatSyncSnapshot
} from './group-chat-state'
import type {
  GroupChat,
  GroupMember,
  GroupMessage
} from './types'

/** Pure group-chat sync snapshot algebra: normalization, merge, envelopes. */

export function groupChatGatewayJsonSize(value: unknown) {
  const json = JSON.stringify(value)
  let bytes = 0

  for (const character of json) {
    // Non-null: string iteration yields whole code points, never an empty string.
    const codePoint = character.codePointAt(0)!

    if (codePoint <= 0x7f) {
      bytes += 1

      if (character === ',' || character === ':') {
        bytes += 1
      }
    } else {
      bytes += codePoint <= 0xffff ? 6 : 12
    }
  }

  return bytes
}

/** Durable room identity for the sync projection. Rooms minted on current
 *  builds carry an immutable roomId; the projection keys rooms by
 *  `id:<roomId>` so rename is a display-name edit, not a distributed
 *  delete+create, and disband tombstones follow the room itself. Legacy
 *  rooms (no roomId) fall back to `name:<name>` keys with the older
 *  revision-gated tombstone semantics. */
export function groupChatRoomKey(name: string, room: GroupChat) {
  return typeof room?.roomId === 'string' && room.roomId ? `id:${room.roomId}` : `name:${String(name)}`
}

/** Lift any historical projection shape (v1 wall-clock, v2 name-keyed) to
 *  the v3 room-key shape so one merge path serves mixed-version fleets. */
function normalizeGroupChatSyncSnapshot(snapshot: GroupChatSyncSnapshot | null | undefined): GroupChatSyncSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      version: 3,
      rooms: {},
      deleted: {}
    }
  }

  if (Number(snapshot.version || 0) >= 3) {
    return {
      version: 3,
      updatedAt: Number(snapshot.updatedAt || 0),
      rooms: snapshot.rooms && typeof snapshot.rooms === 'object' ? snapshot.rooms : {},
      deleted: snapshot.deleted && typeof snapshot.deleted === 'object' ? snapshot.deleted : {}
    }
  }

  const rooms: Record<string, GroupChatSyncRoom> = {}

  for (const [name, room] of Object.entries(snapshot.rooms || {})) {
    if (!room || !Array.isArray(room.log)) {
      continue
    }

    rooms[`name:${name}`] = {
      ...room,
      name
    }
  }

  const deleted: Record<string, number> = {}

  for (const [name, at] of Object.entries(snapshot.deleted || {})) {
    // v1 tombstones carried wall-clock ms, not gateway revisions — they must
    // not outrank real revisions.
    deleted[`name:${name}`] = Number(snapshot.version || 0) >= 2 ? Math.max(0, Number(at || 0)) : 0
  }

  return {
    version: 3,
    updatedAt: Number(snapshot.updatedAt || 0),
    rooms,
    deleted
  }
}

/** Compact, display-oriented copy of Desktop's room log for gateway clients.
 *  The live orchestration state stays in plugin storage; this bounded mirror
 *  rides the default profile's ui_meta so mobile can show the same messages.
 *  Newest rooms/messages win when the profile metadata size cap is reached. */
export function groupChatSyncSnapshot(
  // `revision` is the pre-`syncRevision` field name, still read below as a
  // fallback for rooms hydrated from an older plugin-storage record.
  all: Record<string, GroupChat & { revision?: number }> = $groupChats.get(),
  deleted: Record<string, number> = {}
): GroupChatSyncSnapshot {
  const ranked = Object.entries(all || {})
    // Empty runtime tombstones are used to stop an in-flight room after
    // disband. They are not real rooms and must never reappear on mobile.
    .filter(([, room]) => room && Array.isArray(room.log) && room.log.length > 0)
    .sort(([, left], [, right]) => {
      const leftAt = Number(left.log[left.log.length - 1]?.at || 0)
      const rightAt = Number(right.log[right.log.length - 1]?.at || 0)

      return rightAt - leftAt
    })

  const rooms: Record<string, GroupChatSyncRoom> = {}

  const boundedDeleted = Object.fromEntries(
    Object.entries(deleted)
      .sort(([, left], [, right]) => Number(right || 0) - Number(left || 0))
      .slice(0, 64)
  )

  const envelope: GroupChatSyncSnapshot = {
    version: 3,
    updatedAt: Date.now(),
    rooms,
    ...(Object.keys(boundedDeleted).length
      ? {
          deleted: boundedDeleted
        }
      : {})
  }

  for (const [name, room] of ranked) {
    const log: GroupMessage[] = room.log.slice(-GROUP_CHAT_SYNC_MESSAGES).map(entry => ({
      ...(entry?.id
        ? {
            id: String(entry.id).slice(0, 160)
          }
        : {}),
      from: {
        kind: entry?.from?.kind === 'member' ? 'member' : 'user',
        name: String(entry?.from?.name || (entry?.from?.kind === 'member' ? 'Bot' : 'You')).slice(0, 128),
        ...(entry?.from?.source
          ? {
              source: String(entry.from.source).slice(0, 128)
            }
          : {})
      },
      text: String(entry?.text || '').slice(0, GROUP_CHAT_SYNC_TEXT_CHARS),
      at: Number(entry?.at || 0),
      ...(entry?.thread
        ? {
            thread: String(entry.thread).slice(0, 128)
          }
        : {})
    }))

    const compact: GroupChatSyncRoom = {
      name: String(name).slice(0, 64),
      ...(typeof room?.roomId === 'string' && room.roomId
        ? {
            roomId: String(room.roomId).slice(0, 128)
          }
        : {}),
      log,
      revision: Math.max(0, Number(room?.syncRevision ?? room?.revision ?? 0)),
      members: (Array.isArray(room.members) ? room.members : []).slice(0, GROUP_CHAT_MAX_MEMBERS).map(member => ({
        name: String(member?.name || '').slice(0, 128),
        ...(member?.handle
          ? {
              handle: String(member.handle).slice(0, 128)
            }
          : {}),
        ...(member?.connectionId
          ? {
              connectionId: String(member.connectionId).slice(0, 128)
            }
          : {}),
        ...(member?.connectionKind
          ? {
              connectionKind: String(member.connectionKind).slice(0, 64)
            }
          : {}),
        ...(member?.connectionLabel
          ? {
              connectionLabel: String(member.connectionLabel).slice(0, 128)
            }
          : {}),
        ...(member?.sourceScoped
          ? {
              sourceScoped: true
            }
          : {})
      })),
      ...(typeof room?.image === 'string' && room.image.length <= GROUP_CHAT_SYNC_IMAGE_CHARS
        ? {
            image: room.image
          }
        : {})
    }

    const key = groupChatRoomKey(name, room)
    rooms[key] = compact

    while (compact.log.length > 1 && groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      compact.log.shift()
    }

    if (compact.image && groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      delete compact.image
    }

    if (groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      delete rooms[key]
    }
  }

  return envelope
}

function groupChatSyncEntryKey(entry: GroupMessage) {
  if (entry?.id) {
    return `id:${String(entry.id)}`
  }

  return JSON.stringify([
    Number(entry?.at || 0),
    String(entry?.from?.kind || ''),
    String(entry?.from?.name || ''),
    String(entry?.from?.source || ''),
    // Threadless entries (pre-thread rooms, older Desktop builds) get
    // SYNTHETIC `legacy-N` ids from assignLegacyThreads. Those ids are
    // position-derived — not stable across a gateway round-trip (the
    // projection copy may be threadless or numbered differently). Collapse
    // the whole synthetic family to one bucket, or the merge duplicates
    // every id-less entry — shifting watermarks and manufacturing phantom
    // member turns that re-submit into busy sessions.
    String(entry?.thread || 'legacy').replace(/^legacy-\d+$/, 'legacy'),
    String(entry?.text || '')
  ])
}

/** Members dedupe on durable identity — the same (connectionId, name) pair
 *  botRosterKey seats them by everywhere else. `connectionLabel` and `handle`
 *  are display strings each machine re-derives (a connection rename, an older
 *  build with no handle), so keying on them seats one bot twice; both copies
 *  then answer to a single groupMemberKey in watermarks/sessions/stranded and
 *  the round engine gives that bot two turns. Deliberately unconditional,
 *  unlike groupMemberKey: the projection stamps `remoteSource` onto members it
 *  merges in, so a scoped/unscoped branch would fork a member from its own
 *  previously-merged copy. */
function groupChatSyncMemberKey(member: GroupMember) {
  return botRosterKey(member)
}

/** Merge two bounded projections without treating an absent room/message as
 *  deletion. Rooms are identified by durable room keys (id:<roomId> when the
 *  room carries one), so a rename is a same-key field update — never a
 *  distributed delete+create — and a disband tombstone follows the room
 *  itself. Gateway revisions order identity/membership/picture and
 *  tombstones; stable message ids make concurrent log union idempotent.
 *  `changedRooms`/`deletedRooms` accept display names or room keys. */
export function mergeGroupChatSyncSnapshots(
  remote: GroupChatSyncSnapshot | null | undefined,
  local: GroupChatSyncSnapshot | null | undefined,
  {
    changedRooms = [],
    deletedRooms = [],
    writeRevision = 0
  }: { changedRooms?: string[]; deletedRooms?: string[]; writeRevision?: number } = {}
) {
  const remoteNorm = normalizeGroupChatSyncSnapshot(remote)
  const localNorm = normalizeGroupChatSyncSnapshot(local)

  const keysFor = (label: string, norm: GroupChatSyncSnapshot) => {
    const keys = new Set<string>()

    for (const [key, room] of Object.entries(norm.rooms || {})) {
      if (key === label || String(room?.name || '') === label || key === `name:${label}`) {
        keys.add(key)
      }
    }

    if (String(label).startsWith('id:') || String(label).startsWith('name:')) {
      keys.add(label)
    } else if (!keys.size) {
      keys.add(`name:${label}`)
    }

    return keys
  }

  const changed = new Set<string>()

  for (const label of changedRooms) {
    for (const key of keysFor(label, localNorm)) {
      changed.add(key)
    }
  }

  const deleted: Record<string, number> = {}

  for (const source of [remoteNorm, localNorm]) {
    for (const [key, at] of Object.entries(source.deleted || {})) {
      deleted[key] = Math.max(Number(deleted[key] || 0), Math.max(0, Number(at || 0)))
    }
  }

  for (const label of deletedRooms) {
    for (const key of new Set([...keysFor(label, remoteNorm), ...keysFor(label, localNorm)])) {
      // Rename passes changedRooms:[newName] + deletedRooms:[oldName]. For an
      // id-keyed room both labels resolve to the SAME durable key (the remote
      // copy still carries the old display name), and id tombstones are
      // final — so tombstoning here would kill the room being renamed. A key
      // that is being written this cycle is a rename target, not a disband.
      if (changed.has(key)) {
        continue
      }

      deleted[key] = Math.max(Number(deleted[key] || 0), Number(writeRevision || 0))
    }
  }

  const rooms: Record<string, GroupChatSyncRoom> = {}
  const roomKeys = new Set([...Object.keys(remoteNorm.rooms || {}), ...Object.keys(localNorm.rooms || {})])

  for (const key of roomKeys) {
    const remoteRoom = remoteNorm.rooms?.[key]
    const localRoom = localNorm.rooms?.[key]

    if ((!remoteRoom || !Array.isArray(remoteRoom.log)) && (!localRoom || !Array.isArray(localRoom.log))) {
      continue
    }

    const remoteRevision = Math.max(0, Number(remoteRoom?.revision || 0))

    const localRevision = changed.has(key)
      ? Math.max(0, Number(writeRevision || 0))
      : Math.max(0, Number(localRoom?.revision || 0))

    const entries = new Map<string, GroupMessage>()

    for (const entry of [...(remoteRoom?.log || []), ...(localRoom?.log || [])]) {
      entries.set(groupChatSyncEntryKey(entry), entry)
    }

    // Identity fields (display name, membership, picture) follow the higher
    // revision; a tie unions members and prefers the local writer's fields.
    let identity: GroupChatSyncRoom | undefined
    let members: GroupMember[]
    let image: null | string | undefined

    if (localRevision > remoteRevision) {
      identity = localRoom
      members = [...(localRoom?.members || [])]
      image = localRoom?.image
    } else if (remoteRevision > localRevision) {
      identity = remoteRoom
      members = [...(remoteRoom?.members || [])]
      image = remoteRoom?.image
    } else {
      identity = localRoom || remoteRoom
      const byId = new Map<string, GroupMember>()

      for (const member of [...(remoteRoom?.members || []), ...(localRoom?.members || [])]) {
        byId.set(groupChatSyncMemberKey(member), member)
      }

      members = [...byId.values()]
      image = Object.prototype.hasOwnProperty.call(localRoom || {}, 'image') ? localRoom.image : remoteRoom?.image
    }

    rooms[key] = {
      ...(identity?.name
        ? {
            name: identity.name
          }
        : {}),
      ...(identity?.roomId || (key.startsWith('id:') ? key.slice(3) : '')
        ? {
            roomId: identity?.roomId || key.slice(3)
          }
        : {}),
      log: [...entries.values()].sort((left, right) => {
        const byTime = Number(left?.at || 0) - Number(right?.at || 0)

        return byTime || groupChatSyncEntryKey(left).localeCompare(groupChatSyncEntryKey(right))
      }),
      members,
      revision: Math.max(remoteRevision, localRevision),
      ...(typeof image === 'string' && image
        ? {
            image
          }
        : {})
    }
  }

  for (const [key, deletedRevision] of Object.entries(deleted)) {
    if (key.startsWith('id:')) {
      // Tombstones for id-keyed rooms are FINAL: the roomId is minted once
      // and never reused (same-name recreation mints a fresh id), so a
      // resurrect-by-revision race is structurally impossible. Keep the
      // tombstone even when a lagging gateway's copy carries a higher
      // revision — that copy is the resurrection this exists to prevent.
      delete rooms[key]
    } else if (Number(deletedRevision || 0) >= Number(rooms[key]?.revision || 0)) {
      delete rooms[key]
    } else {
      delete deleted[key]
    }
  }

  return groupChatSyncEnvelope(rooms, deleted)
}

/** Assemble + size-bound a v3 envelope from already-compacted rooms. */
function groupChatSyncEnvelope(
  rooms: Record<string, GroupChatSyncRoom>,
  deleted: Record<string, number> = {}
): GroupChatSyncSnapshot {
  const boundedDeleted = Object.fromEntries(
    Object.entries(deleted)
      .sort(([, left], [, right]) => Number(right || 0) - Number(left || 0))
      .slice(0, 64)
  )

  const envelope: GroupChatSyncSnapshot = {
    version: 3,
    updatedAt: Date.now(),
    rooms,
    ...(Object.keys(boundedDeleted).length
      ? {
          deleted: boundedDeleted
        }
      : {})
  }

  const ranked = Object.entries(rooms).sort(([, left], [, right]) => {
    const leftAt = Number(left?.log?.[left.log.length - 1]?.at || 0)
    const rightAt = Number(right?.log?.[right.log.length - 1]?.at || 0)

    return leftAt - rightAt
  })

  for (const [key, room] of ranked) {
    while ((room.log?.length || 0) > 1 && groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      room.log.shift()
    }

    if (room.image && groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      delete room.image
    }

    if (groupChatGatewayJsonSize(envelope) > GROUP_CHAT_SYNC_MAX_BYTES) {
      delete rooms[key]
    }
  }

  return envelope
}

/** Merge the gateway's bounded display projection into Desktop's richer room
 *  state without discarding local session/watermark/runtime fields. Missing
 *  remote rooms/messages are not deletions; only explicit tombstones remove a
 *  room, and a genuinely newer local message wins over a stale tombstone. */
export function mergeRemoteGroupChatSnapshotIntoRooms(
  remote: GroupChatSyncSnapshot | null | undefined,
  current: Record<string, GroupChat> = $groupChats.get(),
  { preserveRooms = [], deletedRooms = [] }: { deletedRooms?: string[]; preserveRooms?: string[] } = {}
) {
  const remoteNorm = normalizeGroupChatSyncSnapshot(remote)

  const rooms: Record<string, GroupChat> = {
    ...(current || {})
  }

  const preserved = new Set(preserveRooms)
  const locallyDeleted = new Set(deletedRooms)

  // Local rooms indexed by durable identity so an id-keyed projection room
  // finds its local twin even when the display name changed remotely.
  const localByRoomId = new Map<string, string>()

  for (const [name, room] of Object.entries(rooms)) {
    if (typeof room?.roomId === 'string' && room.roomId) {
      localByRoomId.set(room.roomId, name)
    }
  }

  for (const [key, projected] of Object.entries(remoteNorm.rooms || {})) {
    if (!projected || !Array.isArray(projected.log)) {
      continue
    }

    const projectedRoomId = projected.roomId || (key.startsWith('id:') ? key.slice(3) : null)

    const localName =
      projectedRoomId && localByRoomId.has(projectedRoomId)
        ? localByRoomId.get(projectedRoomId)
        : projected.name && rooms[projected.name]
          ? projected.name
          : null

    const displayName = String(projected.name || localName || (key.startsWith('name:') ? key.slice(5) : key))

    if (locallyDeleted.has(displayName) || (localName && locallyDeleted.has(localName))) {
      // Mid-rename guard: the remote copy may still be under the OLD display
      // name while the local record was already re-keyed (same roomId, new
      // name). That old name sits in deletedRooms, but the local record is
      // the rename in flight — deleting it here would kill the renamed room.
      if (localName && localName !== displayName && !locallyDeleted.has(localName)) {
        continue
      }

      delete rooms[displayName]

      if (localName) {
        delete rooms[localName]
      }

      continue
    }

    const existing = (localName ? rooms[localName] : rooms[displayName]) || {}
    const remoteRevision = Math.max(0, Number(projected.revision || 0))
    const localRevision = Math.max(0, Number(existing.syncRevision || 0))

    const entries = new Map<string, GroupMessage>(
      (Array.isArray(existing.log) ? existing.log : []).map(entry => [groupChatSyncEntryKey(entry), entry])
    )

    const members = new Map<string, GroupMember>(
      (Array.isArray(existing.members) ? existing.members : []).map(member => [groupChatSyncMemberKey(member), member])
    )

    for (const entry of projected.log) {
      const entryKey = groupChatSyncEntryKey(entry)

      // The projection is COMPACT (truncated text, no images). When the same
      // entry exists locally, the local rich copy is authoritative — merging
      // the compact twin over it would strip attachments and retrigger
      // watermark deltas for members that already saw it (phantom rounds).
      if (!entries.has(entryKey)) {
        entries.set(entryKey, entry)
      }
    }

    const isPreserved = preserved.has(displayName) || (localName && preserved.has(localName))

    if (!isPreserved) {
      if (remoteRevision > localRevision) {
        members.clear()
      }

      for (const member of Array.isArray(projected.members) ? projected.members : []) {
        members.set(groupChatSyncMemberKey(member), {
          ...member,
          remoteSource: true
        })
      }
    }

    const log = assignLegacyThreads(
      [...entries.values()].sort((left, right) => {
        const byTime = Number(left?.at || 0) - Number(right?.at || 0)

        return byTime || groupChatSyncEntryKey(left).localeCompare(groupChatSyncEntryKey(right))
      })
    )

    const bounded = trimGroupChatLog(log, existing.watermarks || {})

    // A remote rename with a higher revision moves the local record to the
    // new display name; local views keyed by the old name follow on the
    // next repaint (roster derives from $groupChats keys).
    const targetName = !isPreserved && remoteRevision > localRevision ? displayName : localName || displayName

    if (localName && targetName !== localName) {
      delete rooms[localName]
    }

    rooms[targetName] = {
      ...existing,
      log: bounded.log,
      watermarks: bounded.watermarks,
      sessions: existing.sessions && typeof existing.sessions === 'object' ? existing.sessions : {},
      stranded: existing.stranded && typeof existing.stranded === 'object' ? existing.stranded : {},
      members: [...members.values()],
      ...(projectedRoomId || existing.roomId
        ? {
            roomId: existing.roomId || projectedRoomId
          }
        : {}),
      image: isPreserved
        ? existing.image || null
        : remoteRevision >= localRevision && Object.prototype.hasOwnProperty.call(projected, 'image')
          ? projected.image || null
          : existing.image || null,
      syncRevision: isPreserved ? localRevision : Math.max(remoteRevision, localRevision),
      epoch: Number(existing.epoch || 0),
      running: Boolean(existing.running)
    }
  }

  for (const [key, deletedAt] of Object.entries(remoteNorm.deleted || {})) {
    const deletedRoomId = key.startsWith('id:') ? key.slice(3) : null

    const targetName =
      deletedRoomId && localByRoomId.has(deletedRoomId)
        ? localByRoomId.get(deletedRoomId)
        : key.startsWith('name:')
          ? key.slice(5)
          : null

    if (!targetName || preserved.has(targetName)) {
      continue
    }

    if (deletedRoomId) {
      // Id tombstones are final — the id is never reused, so there is no
      // legitimate higher-revision recreation to protect.
      delete rooms[targetName]
    } else {
      const deletedRevision = Math.max(0, Number(deletedAt || 0))

      if (deletedRevision >= Number(rooms[targetName]?.syncRevision || 0)) {
        delete rooms[targetName]
      }
    }
  }

  for (const name of locallyDeleted) {
    delete rooms[name]
  }

  return rooms
}

export function trimGroupChatLog(
  log: GroupMessage[],
  watermarks: Record<string, number>,
  limit = GROUP_CHAT_HISTORY_LIMIT * 4
) {
  if (log.length <= limit) {
    return {
      log,
      watermarks
    }
  }

  const drop = log.length - limit
  const trimmed: Record<string, number> = {}

  for (const [name, index] of Object.entries(watermarks || {})) {
    trimmed[name] = Math.max(0, index - drop)
  }

  return {
    log: log.slice(drop),
    watermarks: trimmed
  }
}
