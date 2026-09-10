export interface GroupHoldStamp extends GroupHold {
  byMessageId?: null | string
  thread?: null | string
}
export interface GroupChatRoom extends GroupChat {
  holds?: Record<string, GroupHoldStamp>
  turn?: null | string
}
import { atom, host } from '@hermes/plugin-sdk'

import { $botMeta, $lastRoster, botRosterKey } from './data'
import { groupMemberReferencesConnection, markOrphanedGroupMemberDescriptor } from './hygiene'
import { getPluginCtx } from './shared'
import type {
  Attachment,
  GroupChat,
  GroupHold,
  GroupMember,
  GroupMessage,
  GroupMessageAuthor,
  GroupPrompt,
  RosterRow
} from './types'

/** Group chat shared state: the room/workspace/clarify atoms and sync types. */

/** Group chat shared state: the room/workspace/clarify atoms and sync types. */

export const $groupChats = atom<Record<string, GroupChatRoom>>({})
/** Group whose room view is open in the Bots pane (secondary navigation
 *  inside the pane; a normal row click returns to the roster). */
export const $groupChatWorkspace = atom<null | string>(null)
/** Groups whose latest room activity mentions @user — the needs-you badge. */
export const $groupNeedsYou = atom<Record<string, boolean>>({})
// Pending prompts (clarify questions AND command approvals) raised inside
// hidden group-member sessions, keyed `${group}::${memberKey}` (#90694).
// Members run in invisible plumbing sessions, so a member's blocking prompt
// used to park server-side with no surface to answer it — the user saw
// "is thinking…" until the prompt timeout. The turn poll mirrors each
// member's `pending_clarify` / `pending_approval` resume fields in here;
// the room renders answer cards from it.
export const $groupClarify = atom<Record<string, GroupPrompt>>({})

export const GROUP_CHAT_SYNC_META_KEY = 'hermes-bots-groups'
// Gateway ui_meta is capped after Python JSON serialization. Keep a healthy
// margin below that limit because Python escapes Unicode while JS does not.
export const GROUP_CHAT_SYNC_MAX_BYTES = 48000
export const GROUP_CHAT_SYNC_MESSAGES = 16
export const GROUP_CHAT_SYNC_TEXT_CHARS = 1200
export const GROUP_CHAT_SYNC_IMAGE_CHARS = 24000

/** One room inside the bounded ui_meta projection: a compacted log plus the
 *  identity fields, without any of `GroupChat`'s runtime/orchestration state. */
export interface GroupChatSyncRoom {
  image?: null | string
  log: GroupMessage[]
  members?: GroupMember[]
  name?: string
  revision?: number
  roomId?: string
}

/** The v3 envelope stored under the default profile's `hermes-bots-groups`
 *  ui_meta key. `deleted` maps a room key to its tombstone revision. */
export interface GroupChatSyncSnapshot {
  deleted?: Record<string, number>
  rooms: Record<string, GroupChatSyncRoom>
  updatedAt?: number
  version: number
}

/** A queued publish for one gateway, coalesced while the debounce runs. */
export interface GroupChatSyncJob {
  allowEmpty?: boolean
  changedRooms?: string[]
  connectionId: string
  deletedRooms?: string[]
}
// Fan-out scheduler state, keyed by gateway connectionId ('' = active/local).
// Every connected gateway carries the full projection so a room survives any
// single gateway being removed and surfaces on every remote backend.

/** Conservative byte count for the gateway's ensure_ascii JSON encoding.
 *  Python also inserts separator spaces, so reserve one extra byte per JS
 *  structural separator on top of escaped Unicode code-point widths. */
