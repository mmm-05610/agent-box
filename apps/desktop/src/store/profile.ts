/**
 * The Profile STORE's public entry.
 *
 * State only: atoms, their types, pure transforms, synchronous setters, and the
 * rail's local preferences (which own their own persistence). Everything that
 * SENDS a request, AWAITS a socket, creates a session, or invalidates another
 * module's cache now lives in `@/application/profile/**`:
 *
 * - identity              - profile key + display label (pure string work)
 * - catalog-state         - $activeProfile / $profiles (the cached catalog)
 * - appearance-preferences- rail order + per-profile colour, persisted locally
 * - runtime-route-state   - which backend the live gateway is routed to
 * - new-chat-state        - the next draft's profile, route and source
 * - sidebar-scope         - "All profiles" mode + the derived sidebar scope
 * - request-atoms         - the bump counters a global key asks a surface with
 *
 * Nothing above the store may be re-exported from here. A caller that needs
 * `ensureGatewayProfile`, `selectProfile`, `refreshProfiles` or any other
 * use-case imports it from `@/application/profile/<module>` — routing it through
 * this file would put the gateway, the API and the session store back inside the
 * profile store's closure, which is exactly what this split removed.
 */

export { $profileColors, $profileOrder, setProfileColor, setProfileOrder, sortByProfileOrder } from './profile/appearance-preferences'
export { $activeProfile, $profiles, setActiveProfile } from './profile/catalog-state'
export { normalizeProfileKey, profileLabel } from './profile/identity'
export type { AgentProfileRoute } from './profile/new-chat-state'
export { $newChatConnectionId, $newChatProfile, $newChatRoute, setNewChatSource } from './profile/new-chat-state'
export { $freshSessionRequest, $profileCreateRequest, requestFreshSession, requestProfileCreate } from './profile/request-atoms'
export { $activeGatewayProfile, $gatewaySwapTarget, $hydrationSyncProfile } from './profile/runtime-route-state'
export {
  $profileScope,
  $showAllProfiles,
  ALL_PROFILES,
  messagingTotalsKey,
  setShowAllProfiles,
  sidebarProfileForScope,
  toggleShowAllProfiles
} from './profile/sidebar-scope'
