import { atom } from 'nanostores'

import type { SessionOwnerRoute } from '@/store/session/types'

// What the NEXT new chat will be owned by: the profile the user picked, the
// exact registry route the draft was created for, and the registry source that
// intent landed on. State only — resolving a route to a live socket is
// `application/profile/{new-session,gateway-routing}`.

/** The draft's exact owner — the same shape every session-scoped surface
 *  routes by (store/session/types SessionOwnerRoute). */
export type AgentProfileRoute = SessionOwnerRoute

// Profile for the NEXT new chat (chosen via the new-chat picker). null = primary
// / default, so single-profile users are unaffected.
export const $newChatProfile = atom<string | null>(null)

// A draft remembers the source it was created for. The active gateway may
// change before the first Send; the draft's owner must not change with it.
export const $newChatRoute = atom<AgentProfileRoute | null>(null)

// The registry source captured TOGETHER with a $newChatProfile intent
// (selectProfile / newSessionInProfile / a connection switch / `/profile`).
// A profile is not a machine-global name: "omar" picked while the remote
// registry source `homelab` is active means homelab::omar — the exact registry
// entry whose WebSocket will mint the runtime. Without this the profile-rail
// path (which deliberately clears $newChatRoute) reduced the owner to the bare
// string "omar", and every follow-up RPC dialed requestGatewayForProfile
// ("omar") — a DIFFERENT socket than the one that created the session —
// and 4001'd "session not found" (#94071). null = the intent dials the legacy
// profile-only path (a v1 primary with no registry identity, or a named
// profile pick on the explicit `local` source — see profilePickConnectionId).
export const $newChatConnectionId = atom<null | string>(null)

/** Record the registry source a new-chat intent landed on. The caller owns the
 *  decision of WHICH source that is (`application/profile` derives it from the
 *  live route, the pick door or the active source). */
export function setNewChatSource(connectionId: null | string): void {
  $newChatConnectionId.set(connectionId)
}
