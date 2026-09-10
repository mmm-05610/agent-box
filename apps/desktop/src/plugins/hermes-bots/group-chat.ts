/**
 * The group-chat room store: the room atoms, the durable record in plugin
 * storage, the bounded cross-client projection that rides the default
 * profile's ui_meta, and the small pure helpers every room surface shares
 * (identity, thread ids, entry append, the #93127 decision predicates).
 *
 * The sync projection lives here rather than in its own module because
 * updateGroupChat schedules it and the scheduler reads the same atom — one
 * store, one writer.
 */

import { host } from '@hermes/plugin-sdk'

import { $botMeta, $lastRoster } from './data'
/** Group-chat rooms: { [group]: { log: [{from:{kind,name},text,at}], watermarks:{[member]:idx}, epoch, running } }.
 *  Log + watermarks persist via plugin storage; epoch/running are runtime-only. */
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
/** Optional secondary navigation inside the Bots pane (group-chat rooms). */
import { getPluginCtx } from './shared'
import type {
  Attachment,
  GroupChat,
  GroupMessage,
  GroupMessageAuthor,
  RosterRow
} from './types'

const groupChatSyncPendingByConnection = new Map<string, GroupChatSyncJob>()
const groupChatSyncInFlightConnections = new Set<string>()
const groupChatSyncRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const groupChatSyncRetryCounts = new Map<string, number>()
let groupChatSyncTimer: ReturnType<typeof setTimeout> | null = null
let groupChatSyncDisposed = false


export function durableGroupChatRooms(all: Record<string, GroupChat> = $groupChats.get()) {
  const durable: Record<string, GroupChat> = {}

  for (const [name, room] of Object.entries(all || {})) {
    if (!room || !Array.isArray(room.log)) {
      continue
    }

    // Disband tombstones are runtime-only coordination state (they hold the
    // epoch bump for an in-flight drive). Persisting one would resurrect the
    // room as an empty record on the next load AND keep its name "taken" for
    // same-name recreates. Mirrors updateGroupChat's inline durable map.
    if (room.tombstone) {
      continue
    }

    durable[name] = {
      log: room.log,
      watermarks: room.watermarks || {},
      sessions: room.sessions || {},
      stranded: room.stranded || {},
      members: Array.isArray(room.members) ? room.members : [],
      // Immutable room identity: without this, a room merged in via the
      // remote-sync path (the only caller of this function) loses its
      // roomId on the next cold hydrate and falls back to legacy
      // name-keyed identity — same field updateGroupChat's inline map
      // already carries.
      roomId: typeof room.roomId === 'string' && room.roomId ? room.roomId : null,
      image: room.image || null,
      rosterOrder: room.rosterOrder,
      pinned: room.pinned,
      syncRevision: Math.max(0, Number(room.syncRevision || 0))
    }
  }

  return durable
}

export function persistGroupChatRooms(all: Record<string, GroupChat> = $groupChats.get()) {
  try {
    return Promise.resolve(getPluginCtx()?.storage?.set?.('group-chats', durableGroupChatRooms(all))).catch(
      () => undefined
    )
  } catch {
    return Promise.resolve()
  }
}

/** Register-removed sweep: annotate (not delete) every persisted group-chat
 *  member owned by the deleted connection, in the atom AND plugin storage.
 *  Writes ride updateGroupChat so the durable record keeps its full shape
 *  (sessionOwners, holds — durableGroupChatRooms would drop them).
 *  Returns whether anything changed. */
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

function groupChatSyncConnectionId() {
  return String(host.state.connectionId?.get?.() || host.activeConnectionId?.() || '')
}

/** Route a sync job back to the gateway that was active when it was queued.
 *  A foreground switch during debounce must not write the old snapshot into
 *  the newly active gateway. */
async function groupChatSyncRequest<T>(
  job: GroupChatSyncJob,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  if (job.connectionId && typeof host.profileRoutes === 'function' && typeof host.requestProfile === 'function') {
    const routes = await host.profileRoutes()

    const route = (Array.isArray(routes) ? routes : []).find(candidate => {
      const profile = String(candidate?.targetProfile || candidate?.profile || '')

      return String(candidate?.connectionId || '') === job.connectionId && profile === 'default'
    })

    if (route) {
      return host.requestProfile(route, method, params)
    }
  }

  const currentConnectionId = groupChatSyncConnectionId()

  if (job.connectionId && currentConnectionId && job.connectionId !== currentConnectionId) {
    throw new Error('Group chat gateway changed before sync')
  }

  return host.request(method, params)
}

async function groupChatRemoteSnapshot(job: GroupChatSyncJob) {
  const result = await groupChatSyncRequest<{ profiles?: RosterRow[] }>(job, 'profiles.list', {
    include_sessions: false
  })

  const profile = (Array.isArray(result?.profiles) ? result.profiles : []).find(row => row?.name === 'default')
  const snapshot = profile?.ui_meta?.[GROUP_CHAT_SYNC_META_KEY] as GroupChatSyncSnapshot | undefined
  const supportsCas = Boolean(profile && Object.prototype.hasOwnProperty.call(profile, 'ui_meta_revisions'))

  return {
    snapshot: snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null,
    revision: Math.max(0, Number(profile?.ui_meta_revisions?.[GROUP_CHAT_SYNC_META_KEY] || 0)),
    supportsCas
  }
}

/** Pull the shared room projection into this Desktop before it publishes any
 *  local state. This is the receive half of the client-only sync contract. */
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

function groupChatSyncBackoff(connectionId: string) {
  const count = Number(groupChatSyncRetryCounts.get(connectionId) || 0)

  return Math.min(30000, 1000 * 2 ** Math.min(count, 5))
}

function mergeGroupChatSyncJobs(existing: GroupChatSyncJob | undefined, incoming: GroupChatSyncJob): GroupChatSyncJob {
  if (!existing || existing.connectionId !== incoming.connectionId) {
    return incoming
  }

  return {
    connectionId: incoming.connectionId,
    allowEmpty: Boolean(existing.allowEmpty || incoming.allowEmpty),
    changedRooms: [...new Set([...(existing.changedRooms || []), ...(incoming.changedRooms || [])])],
    deletedRooms: [...new Set([...(existing.deletedRooms || []), ...(incoming.deletedRooms || [])])]
  }
}

function groupChatSyncPayloadEqual(
  left: GroupChatSyncSnapshot | null | undefined,
  right: GroupChatSyncSnapshot | null | undefined
) {
  return (
    JSON.stringify(left?.rooms || {}) === JSON.stringify(right?.rooms || {}) &&
    JSON.stringify(left?.deleted || {}) === JSON.stringify(right?.deleted || {})
  )
}

/** Every default-profile gateway route this Desktop can currently reach.
 *  The projection fans out to ALL of them, so any single gateway can die or
 *  be removed without losing the shared room state, and gateway-only
 *  clients (Hermes Go, headless backends) see rooms regardless of which
 *  gateway a Desktop was foregrounding when the room was used. */
async function groupChatSyncTargetConnections() {
  const targets = new Set<string>()
  const active = groupChatSyncConnectionId()
  targets.add(String(active || ''))

  if (typeof host.profileRoutes === 'function' && typeof host.requestProfile === 'function') {
    try {
      const routes = await host.profileRoutes()

      for (const route of Array.isArray(routes) ? routes : []) {
        const profile = String(route?.targetProfile || route?.profile || '')
        const connectionId = String(route?.connectionId || '')

        if (profile === 'default' && connectionId) {
          targets.add(connectionId)
        }
      }
    } catch {
      // Route inventory unavailable — the active gateway alone still syncs.
    }
  }

  return [...targets]
}

async function flushGroupChatServerSync(connectionId?: string) {
  if (connectionId === undefined) {
    // Drain every connection with pending work.
    for (const pendingId of [...groupChatSyncPendingByConnection.keys()]) {
      void flushGroupChatServerSync(pendingId)
    }

    return
  }

  const id = String(connectionId || '')

  if (groupChatSyncDisposed || groupChatSyncInFlightConnections.has(id) || !groupChatSyncPendingByConnection.has(id)) {
    return
  }

  // Non-null: the `has(id)` guard directly above is the entry condition.
  const job = groupChatSyncPendingByConnection.get(id)!
  groupChatSyncPendingByConnection.delete(id)
  groupChatSyncInFlightConnections.add(id)

  try {
    const remoteState = await groupChatRemoteSnapshot(job)
    const local = groupChatSyncSnapshot($groupChats.get())
    const writeRevision = remoteState.revision + 1

    const snapshot = mergeGroupChatSyncSnapshots(remoteState.snapshot, local, {
      changedRooms: job.changedRooms,
      deletedRooms: job.deletedRooms,
      writeRevision
    })

    // Reconnect/startup reconciliation often discovers that the gateway
    // already holds the exact merged projection. Avoid advancing a revision
    // merely because a view reopened.
    if (
      !(job.changedRooms || []).length &&
      !(job.deletedRooms || []).length &&
      groupChatSyncPayloadEqual(snapshot, remoteState.snapshot)
    ) {
      if (remoteState.snapshot) {
        const pending = groupChatSyncPendingByConnection.get(id)

        const mergedRooms = mergeRemoteGroupChatSnapshotIntoRooms(remoteState.snapshot, $groupChats.get(), {
          preserveRooms: pending?.changedRooms || [],
          deletedRooms: pending?.deletedRooms || []
        })

        $groupChats.set(mergedRooms)
        await persistGroupChatRooms(mergedRooms)
      }

      groupChatSyncRetryCounts.delete(id)

      return
    }

    const configureParams: {
      name: string
      ui_meta: Record<string, GroupChatSyncSnapshot>
      ui_meta_expected_revisions?: Record<string, number>
    } = {
      name: 'default',
      ui_meta: {
        [GROUP_CHAT_SYNC_META_KEY]: snapshot
      }
    }

    if (remoteState.supportsCas) {
      configureParams.ui_meta_expected_revisions = {
        [GROUP_CHAT_SYNC_META_KEY]: remoteState.revision
      }
    }

    const result = await groupChatSyncRequest<{
      applied?: { ui_meta?: boolean; ui_meta_revisions?: Record<string, number> }
    }>(job, 'profiles.configure', configureParams)

    if (result?.applied?.ui_meta !== true) {
      throw new Error('Gateway rejected group chat ui_meta')
    }

    if (
      remoteState.supportsCas &&
      Number(result?.applied?.ui_meta_revisions?.[GROUP_CHAT_SYNC_META_KEY] || 0) !== writeRevision
    ) {
      throw new Error('Gateway did not advance group chat ui_meta revision')
    }

    const confirmedState = await groupChatRemoteSnapshot(job)

    if (remoteState.supportsCas && confirmedState.revision < writeRevision) {
      throw new Error('Group chat ui_meta revision missing after read-back')
    }

    if (confirmedState.snapshot) {
      const pending = groupChatSyncPendingByConnection.get(id)

      const mergedRooms = mergeRemoteGroupChatSnapshotIntoRooms(confirmedState.snapshot, $groupChats.get(), {
        preserveRooms: pending?.changedRooms || [],
        deletedRooms: pending?.deletedRooms || []
      })

      $groupChats.set(mergedRooms)
      await persistGroupChatRooms(mergedRooms)
    }

    groupChatSyncRetryCounts.delete(id)
  } catch {
    if (!groupChatSyncDisposed) {
      const retries = Number(groupChatSyncRetryCounts.get(id) || 0) + 1

      // A gateway that was REMOVED (not just flaky) has no route anymore and
      // would otherwise retry forever. Give up after the backoff ladder tops
      // out; local storage remains authoritative and a future reconnect of
      // that gateway re-seeds it via the gateway-transition pull/publish.
      if (retries > 8) {
        groupChatSyncRetryCounts.delete(id)

        return
      }

      groupChatSyncPendingByConnection.set(id, mergeGroupChatSyncJobs(groupChatSyncPendingByConnection.get(id), job))
      groupChatSyncRetryCounts.set(id, retries)

      if (typeof setTimeout === 'function' && !groupChatSyncRetryTimers.has(id)) {
        groupChatSyncRetryTimers.set(
          id,
          setTimeout(() => {
            groupChatSyncRetryTimers.delete(id)
            void flushGroupChatServerSync(id)
          }, groupChatSyncBackoff(id))
        )
      }
    }
  } finally {
    groupChatSyncInFlightConnections.delete(id)

    if (groupChatSyncPendingByConnection.has(id) && !groupChatSyncRetryTimers.has(id) && !groupChatSyncDisposed) {
      void flushGroupChatServerSync(id)
    }
  }
}

export function stopGroupChatServerSync() {
  groupChatSyncDisposed = true
  groupChatSyncPendingByConnection.clear()

  if (groupChatSyncTimer !== null) {
    clearTimeout(groupChatSyncTimer)
    groupChatSyncTimer = null
  }

  for (const timer of groupChatSyncRetryTimers.values()) {
    clearTimeout(timer)
  }

  groupChatSyncRetryTimers.clear()
  groupChatSyncRetryCounts.clear()
}

/** Debounced, pull-merge-write server mirror, fanned out to every reachable
 *  default-profile gateway. Local storage keeps the complete orchestration
 *  log; ui_meta is a bounded cross-client projection per gateway, each with
 *  its own CAS revision stream. */
export function scheduleGroupChatServerSync(
  all: Record<string, GroupChat> = $groupChats.get(),
  {
    allowEmpty = false,
    changedRooms = [],
    deletedRooms = []
  }: { allowEmpty?: boolean; changedRooms?: string[]; deletedRooms?: string[] } = {}
) {
  // Browser shells provide timers; source-level VM tests and older embedded
  // hosts may not. Room persistence must never break the surrounding gateway
  // lifecycle when the optional mirror cannot be scheduled.
  if (typeof setTimeout !== 'function') {
    return
  }

  const snapshot = groupChatSyncSnapshot(all)

  // A newly installed Desktop has no local room cache. Publishing that empty
  // state on hydrate/reconnect would erase a valid mirror produced elsewhere.
  // Only an explicit final-room disband is allowed to clear the projection.
  if (Object.keys(snapshot.rooms).length === 0 && !allowEmpty) {
    return
  }

  if (groupChatSyncTimer !== null) {
    clearTimeout(groupChatSyncTimer)
  }

  // Queue on the ACTIVE gateway synchronously (tests and older hosts have no
  // async route inventory), then widen to every reachable gateway before the
  // debounce fires.
  const activeId = String(groupChatSyncConnectionId() || '')

  const queueFor = (connectionId: string) => {
    const id = String(connectionId || '')
    const retryTimer = groupChatSyncRetryTimers.get(id)

    if (retryTimer !== undefined) {
      clearTimeout(retryTimer)
      groupChatSyncRetryTimers.delete(id)
    }

    groupChatSyncPendingByConnection.set(
      id,
      mergeGroupChatSyncJobs(groupChatSyncPendingByConnection.get(id), {
        connectionId: id,
        allowEmpty,
        changedRooms,
        deletedRooms
      })
    )
  }

  queueFor(activeId)
  groupChatSyncTimer = setTimeout(() => {
    groupChatSyncTimer = null
    void groupChatSyncTargetConnections()
      .then(targets => {
        for (const target of targets) {
          if (String(target || '') !== activeId) {
            queueFor(target)
          }
        }
      })
      .catch(() => undefined)
      .then(() => flushGroupChatServerSync())
  }, 350)
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

/** Re-arm the mirror after a dispose. `register()` owns this door: an
 *  imported binding cannot be assigned, so the flag's reset crosses the
 *  module edge as an accessor (same pattern as shared.ts's plugin context). */
export function setGroupChatSyncDisposed(disposed: boolean) {
  groupChatSyncDisposed = disposed
}

// ── one room's budget ────────────────────────────────────────────────────────
// Every ceiling a single user send can spend, in one block on purpose: making
// them configurable (per room, or model-aware from config.yaml) is live
// contributor work — #92213 (per-room limits) and #96842 (config + token
// budget) — and both need exactly one seam to hook. Carried over at the same
// values the old plugin.js shipped so neither rebase inherits a behavior
// change on top of a rewrite; deciding the shape of the override belongs to
// those PRs, not to a design-system pass.
export const GROUP_CHAT_MAX_ROUNDS = 3

// #94478 review: continuation rounds are bounded independently of the message cap so a pathological mention chain can't consume the room's whole budget on handoffs.
export const GROUP_CHAT_MAX_MESSAGES = 10
export const GROUP_CHAT_MAX_CONTINUATIONS = 2

/** Transcript form of a room speaker's profile name. Friendly identity wins:
 *  a Bot Mode title or a core profile display_name (e.g. default renamed to
 *  "Lucy") labels the speaker everywhere this helper feeds — the "X is
 *  thinking…" working line, the activity feed, and transcript lines — so a
 *  renamed bot never shows up as its raw profile id or a stale "Hermes"
 *  (community report, Aug 21 2026: renamed default still read "Hermes is
 *  thinking…" in group rooms). The untitled primary profile is literally
 *  named "default" — render it as Hermes (matching displayName and the
 *  @hermes handle) so the main agent never loses its name in rooms. */
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

/** Trim a room log + its watermarks to the retained window, keeping
 *  watermark indices consistent with the trimmed array. */

interface UpdateGroupChatOptions {
  sync?: boolean
}

/** Mutate one group's room state through the atom + persist the durable part. */
export function updateGroupChat(
  group: string,
  mutate: (room: GroupChat) => GroupChat,
  { sync = true }: UpdateGroupChatOptions = {}
) {
  const all = {
    ...$groupChats.get()
  }

  const current = all[group] || {
    log: [],
    watermarks: {},
    epoch: 0,
    running: false
  }

  const next = mutate({
    ...current,
    log: [...current.log],
    watermarks: {
      ...current.watermarks
    }
  })

  const bounded = trimGroupChatLog(next.log, next.watermarks)
  next.log = bounded.log
  next.watermarks = bounded.watermarks
  all[group] = next
  $groupChats.set(all)

  try {
    const durable: Record<string, GroupChat> = {}

    for (const [name, room] of Object.entries(all)) {
      // Disband tombstones are runtime-only coordination state (they hold the
      // epoch bump for an in-flight drive). Persisting one would resurrect
      // the room as an empty record on the next load AND keep its name
      // "taken" for same-name recreates.
      if (room.tombstone) {
        continue
      }

      durable[name] = {
        log: room.log,
        watermarks: room.watermarks,
        sessions: room.sessions || {},
        sessionOwners: room.sessionOwners || {},
        // Timed-out turns awaiting a late reply — keyed by member, valued
        // with the pre-turn message baseline. Survives reloads so finished
        // work is still harvested after a window restart.
        stranded: room.stranded || {},
        // #93129: sticky per-member stop holds. Watermarks persist, so holds
        // must too — otherwise a window restart silently releases a bot the
        // user explicitly stopped.
        holds: room.holds || {},
        // Source-qualified member descriptors keep the room whole when the
        // active connection changes and today's local members become remote.
        members: Array.isArray(room.members) ? room.members : [],
        // Immutable room identity: the member-session title for new rooms.
        roomId: typeof room.roomId === 'string' && room.roomId ? room.roomId : null,
        // Room picture (small data URL, same normalization as bot avatars).
        image: room.image || null,
        rosterOrder: room.rosterOrder,
        pinned: room.pinned,
        syncRevision: Math.max(0, Number(room.syncRevision || 0))
      }
    }

    Promise.resolve(getPluginCtx()?.storage?.set?.('group-chats', durable)).catch(() => undefined)
  } catch {
    /* storage unavailable — room survives for this window only */
  }

  if (sync) {
    scheduleGroupChatServerSync(all, {
      changedRooms: [group]
    })
  }

  return next
}

/** A #93129 member hold as this file mints it. `GroupHold` models only the
 *  two fields that survive a reload; the live stamp also records WHICH user
 *  message, in which thread, put the member on hold. */


/** The room record as the coordination engine handles it: `GroupChat` plus
 *  `turn`, the runtime-only name of the member currently mid-turn. Like
 *  `running`/`epoch` it never persists, so it has no place in the durable
 *  shape. Holds carry the fuller live stamp. */


/** Set or clear a group chat's room picture (small data URL, normalized by
 *  the same pipeline as bot avatars). Persists with the room record. */
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

/** The agent loop's "(empty)" terminal sentinel (empty_response_exhausted) is
 *  a FAILURE marker, never bot text. Mirror gateway/run.py's user-friendly
 *  substitution so the room log never shows the raw sentinel. */
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

/** Fresh room identity for a group. Independent of the editable display
 *  name: a disbanded-and-recreated group mints a new roomId even when the
 *  display name is identical, so member sessions never resume by title. */
export function mintGroupRoomId(): string {
  return `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Unique display name for a NEW group. Collisions get a " 2", " 3", …
 *  suffix; the BASE is truncated (never the joined string), so a 64-char
 *  base keeps its suffix instead of colliding with the original. */
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

// --- room-turn decision helpers (#93127) — pure, unit-tested ---

/** #93127: whether a finished member turn may still commit (append its reply
 *  and advance its watermark). A turn dispatched under an older epoch was
 *  superseded mid-flight by a newer user send — its late result must be
 *  dropped, because the new send's own loop re-drives this member with the
 *  full delta and committing both is exactly the double-delivery bug.
 *
 *  The re-drive premise is only true for a send in the SAME thread (delta
 *  filters are thread-scoped): a cross-thread epoch bump must NOT discard
 *  finished work no fresh loop will regenerate. Callers pass whether a newer
 *  USER entry landed in this thread since dispatch; the default (true)
 *  preserves the conservative drop when the caller can't tell. */
export function shouldCommitMemberTurn(epochAtDispatch: number, currentEpoch: number, newerUserEntryInThread = true) {
  if (epochAtDispatch === currentEpoch) {
    return true
  }

  return !newerUserEntryInThread
}

/** #93127 insurance: byte-identical member echo detection. TRUE only when
 *  the immediately-preceding log entry has the same author (kind + name +
 *  source), same thread, and identical text, within a short recency window —
 *  a residual double-append fires back-to-back; two legitimately identical
 *  replies hours apart (or with anything in between) are never dropped. */
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

// --- end room-turn decision helpers ---

export function groupThreadOf(entry: GroupMessage): string {
  return entry?.thread || 'legacy'
}

export function mintGroupThreadId(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// Pre-thread logs (hydrated from storage) get synthetic thread ids: a user
// entry after a real lull starts one, so multi-turn tasks stay whole instead
// of splitting on every follow-up.


export * from './group-chat-state'
export * from './group-chat-sync-snapshot'

export { GROUP_CHAT_HISTORY_LIMIT, GROUP_CHAT_MAX_MEMBERS } from './group-chat-sync-snapshot'
