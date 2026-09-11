// Extracted verbatim from group-chat.ts (see docs/desktop-megafile-decomposition.md).

import { host } from '@hermes/plugin-sdk'
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
import { getPluginCtx } from './shared'
import type {
  Attachment,
  GroupChat,
  GroupMessage,
  GroupMessageAuthor,
  RosterRow
} from './types'

export const groupChatSyncPendingByConnection = new Map<string, GroupChatSyncJob>()

export const groupChatSyncInFlightConnections = new Set<string>()

export const groupChatSyncRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const groupChatSyncRetryCounts = new Map<string, number>()

export let groupChatSyncTimer: ReturnType<typeof setTimeout> | null = null

export let groupChatSyncDisposed = false

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

export function groupChatSyncConnectionId() {
  return String(host.state.connectionId?.get?.() || host.activeConnectionId?.() || '')
}

export async function groupChatSyncRequest<T>(
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

export async function groupChatRemoteSnapshot(job: GroupChatSyncJob) {
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

export function groupChatSyncBackoff(connectionId: string) {
  const count = Number(groupChatSyncRetryCounts.get(connectionId) || 0)

  return Math.min(30000, 1000 * 2 ** Math.min(count, 5))
}

export function mergeGroupChatSyncJobs(existing: GroupChatSyncJob | undefined, incoming: GroupChatSyncJob): GroupChatSyncJob {
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

export function groupChatSyncPayloadEqual(
  left: GroupChatSyncSnapshot | null | undefined,
  right: GroupChatSyncSnapshot | null | undefined
) {
  return (
    JSON.stringify(left?.rooms || {}) === JSON.stringify(right?.rooms || {}) &&
    JSON.stringify(left?.deleted || {}) === JSON.stringify(right?.deleted || {})
  )
}

export async function groupChatSyncTargetConnections() {
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

export async function flushGroupChatServerSync(connectionId?: string) {
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

export interface UpdateGroupChatOptions {
  sync?: boolean
}

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

export function setGroupChatSyncDisposed(disposed: boolean) {
  groupChatSyncDisposed = disposed
}
