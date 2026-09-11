// Multi-session view state, decomposed (this file stays the stable import
// path with the unchanged public surface):
// - session-state-registry — the state mirror + tile registry machine
// - state-projections     — working/attention/draft derivations
// - owner-holds           — create→foreground socket pins
// - bot-chat-scope        — persisted bot-chat scope ledger
// - tile-delegate         — the wiring-layer inversion seam
// - tile-rebinding        — reconnect/reclaim runtime unbinding
// - tile-operations       — open/focus/close/restore tiles in the tree
//
// STATE ONLY. This store answers what a session's state is and who owns it;
// REQUESTING something from that owner is the `application/session/**` routing
// use-case, which reads these atoms and talks to `store/gateway`. Re-exporting
// a use-case from here would hand every consumer of session state the whole
// transport closure back.

export {
  $botChatScopes,
  $botChatSessionIds,
  isBotChatSession,
  setSessionTileWorkspaceScope
} from './session-states/bot-chat-scope'
export {
  $sessionOwnerHoldRevision,
  _resetSessionOwnerHoldsForTests,
  foregroundSessionScopes,
  holdSessionOwnerUntilForeground,
  releaseSessionOwnerHold
} from './session-states/owner-holds'
export {
  $focusedRuntimeId,
  $focusedSessionIsTile,
  $focusedSessionState,
  $focusedStoredSessionId,
  $openStoredSessionIds,
  $sessionStates,
  $sessionTiles,
  $stalledSessionIds,
  clearAllSessionStates,
  dropSessionState,
  forgetProfileOnlyRuntimeOwners,
  getRecentlySettledSessionIds,
  isSessionRemote,
  knownOwnerForSession,
  liveSessionScopes,
  openTileGatewayScopes,
  patchSessionTile,
  publishSessionState,
  reconcileBusyStatesOnReconnect,
  recordSessionEventScope,
  releaseSessionTranscript,
  SESSION_WATCHDOG_TIMEOUT_MS,
  type SessionTile,
  sessionTileOwnerRoute,
  type SessionTileWorkspaceScope,
  setSessionStalled,
  type SplitDir,
  storedSessionIdForRuntimeId,
  type TileDock
} from './session-states/session-state-registry'
export {
  $attentionSessionIds,
  $draftSessionIds,
  $workingSessionIds
} from './session-states/state-projections'
export {
  $sessionTileDelegateRevision,
  sessionTileDelegate,
  type SessionTileDelegate,
  setSessionTileDelegate
} from './session-states/tile-delegate'
export {
  blankDraftTile,
  closeAllOpenSessionTiles,
  closeSessionTile,
  discardSessionTile,
  dropTilesForProfile,
  focusedSessionNeedsRoute,
  focusOpenSession,
  focusWorkspaceOwnerSessionTile,
  markSelectionRestore,
  nextSessionTileForWorkspace,
  openSessionTile,
  orderTilesByTree,
  reopenLastClosedTile,
  reuseBlankDraftTile,
  selectionHomesToWorkspace
} from './session-states/tile-operations'
export {
  resetTileRuntimeBindings,
  type RuntimeReconnectScope,
  unbindTileRuntime,
  type UnknownRuntimeReconnectScope
} from './session-states/tile-rebinding'
