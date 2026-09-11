import { normalizeProfileKey } from '@/lib/profile-identity'
import { activeGatewayConnectionId } from '@/store/gateway'
import { notifyError } from '@/store/notifications'
import { notifyRemoteOverrideAuthFailure } from '@/store/profile-remote-override'
import type { AgentProfileRoute } from '@/store/profile/new-chat-state'
import { $newChatConnectionId, $newChatProfile, $newChatRoute, setNewChatSource } from '@/store/profile/new-chat-state'
import { requestFreshSession } from '@/store/profile/request-atoms'
import { $activeGatewayProfile } from '@/store/profile/runtime-route-state'

import { activateOnCurrentSource, ensureGatewayAgent, profilePickConnectionId } from './gateway-routing'

// Starting a new chat in a profile or registry agent: pin the draft's owner,
// ask the chat controller for a fresh draft, and open the backend the first
// message must land on. The owner is captured HERE and never re-derived after
// an asynchronous activation — connection/profile equality is not enough, the
// runtime lives on one concrete socket.

/** Capture the registry source a new-chat profile intent lands on — by
 *  default the active one; callers that dial a different door (a profile
 *  pick, see profilePickConnectionId) pass the source that door uses. */
export function captureNewChatSource(connectionId: null | string = activeGatewayConnectionId()): void {
  setNewChatSource(connectionId)
}

/**
 * The EXACT owner route the next new chat is created on, or null for the
 * legacy ambient path. An explicit agent route ($newChatRoute) wins; else,
 * whenever a registry source is live, the (connection, profile) pair is
 * derived from the source captured with the profile intent — falling back to
 * the source a profile pick would dial (an uncaptured intent), or to the
 * active source when there is no profile intent at all — so session.create,
 * the owner hint, the optimistic row and every later session-scoped RPC name
 * the same registry entry. A legacy profile-only activation yields null.
 */
export function resolveNewChatOwnerRoute(forProfile?: string): AgentProfileRoute | null {
  const explicit = $newChatRoute.get()

  if (explicit && (!forProfile || normalizeProfileKey(explicit.profile) === normalizeProfileKey(forProfile))) {
    return explicit
  }

  const intentProfile = forProfile ? normalizeProfileKey(forProfile) : $newChatProfile.get()

  const connectionId = (
    (intentProfile
      ? ($newChatConnectionId.get() ?? profilePickConnectionId(intentProfile))
      : activeGatewayConnectionId()) ?? ''
  ).trim()

  if (!connectionId) {
    return null
  }

  return {
    connectionId,
    profile: normalizeProfileKey(intentProfile || $activeGatewayProfile.get())
  }
}

// Pin the next new chat to `name` (legacy profile-only door) so session.create
// reads the profile the user clicked "+" under, not whatever
// $activeGatewayProfile holds once an in-flight profile swap settles (#79005).
export function pinNewChatProfile(name: string): string {
  const target = normalizeProfileKey(name)
  $newChatProfile.set(target)
  $newChatRoute.set(null)
  captureNewChatSource(profilePickConnectionId(target))

  return target
}

// Start a fresh session in `name` WITHOUT collapsing the "All profiles" browse
// view. Unlike selectProfile, it leaves $showAllProfiles untouched, so the
// unified sidebar stays put — used by the per-profile "+" in the all-profiles
// session list, where switching scope would throw away the browse state the user
// is in. Points new chats at the profile and opens its backend so the next
// message lands in the right place.
export function newSessionInProfile(name: string): void {
  const target = pinNewChatProfile(name)
  requestFreshSession()
  // #81094: surface the failed dial instead of failing silently.
  void activateOnCurrentSource(target).catch((error: unknown) => {
    if (!notifyRemoteOverrideAuthFailure(target, error)) {
      notifyError(error, `Failed to open profile "${target}"`)
    }
  })
}

/** Start a draft owned by a specific registry agent. Foreground activation is
 *  only a presentation step; the route stays attached to the draft for the
 *  eventual session.create request. */
export function newSessionInAgent(route: AgentProfileRoute): void {
  const captured = {
    ...route,
    connectionId: route.connectionId.trim(),
    profile: normalizeProfileKey(route.profile),
    ...(route.targetProfile ? { targetProfile: normalizeProfileKey(route.targetProfile) } : {})
  }

  if (!captured.connectionId) {
    throw new Error('Agent profile route is missing connectionId')
  }

  $newChatProfile.set(captured.profile)
  $newChatRoute.set(captured)
  setNewChatSource(captured.connectionId)
  requestFreshSession()
  // #81094: surface the failed dial instead of failing silently.
  void ensureGatewayAgent(captured.connectionId, captured.profile).catch((error: unknown) => {
    notifyError(error, `Failed to open profile "${captured.profile}"`)
  })
}
