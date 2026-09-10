// Multi-session view state, decomposed (this file stays the stable import
// path with the unchanged public surface):
// - session-state-registry — the state mirror + tile registry machine
// - state-projections     — working/attention/draft derivations
// - owner-holds           — create→foreground socket pins
// - bot-chat-scope        — persisted bot-chat scope ledger
// - tile-delegate         — the wiring-layer inversion seam
// - tile-rebinding        — reconnect/reclaim runtime unbinding
// - tile-operations       — open/focus/close/restore tiles in the tree

export {
  $focusedRuntimeId,
  $focusedSessionIsTile,
  $focusedSessionState,
  $focusedStoredSessionId,
  $openStoredSessionIds,
  $sessionStates,
  $sessionTiles,
  clearAllSessionStates,
  dropSessionState,
  forgetProfileOnlyRuntimeOwners,
  isSessionRemote,
  knownOwnerForSession,
  liveSessionScopes,
  openTileGatewayScopes,
  patchSessionTile,
  publishSessionState,
  recordSessionEventScope,
  reconcileBusyStatesOnReconnect,
  releaseSessionTranscript,
  requestForOwnedSession,
  sessionTileOwnerRoute,
  setSessionStalled,
  $stalledSessionIds,
  SESSION_WATCHDOG_TIMEOUT_MS,
  getRecentlySettledSessionIds,
  storedSessionIdForRuntimeId,
  type SessionTile,
  type SessionTileWorkspaceScope,
  type SplitDir,
  type TileDock
} from './session-states/session-state-registry'
export {
  $attentionSessionIds,
  $draftSessionIds,
  $workingSessionIds
} from './session-states/state-projections'
export {
  $sessionOwnerHoldRevision,
  foregroundSessionScopes,
  holdSessionOwnerUntilForeground,
  releaseSessionOwnerHold,
  _resetSessionOwnerHoldsForTests
} from './session-states/owner-holds'
export {
  $botChatScopes,
  $botChatSessionIds,
  isBotChatSession,
  setSessionTileWorkspaceScope
} from './session-states/bot-chat-scope'
export {
  $sessionTileDelegateRevision,
  sessionTileDelegate,
  setSessionTileDelegate,
  type SessionTileDelegate
} from './session-states/tile-delegate'
export {
  resetTileRuntimeBindings,
  unbindTileRuntime,
  type RuntimeReconnectScope,
  type UnknownRuntimeReconnectScope
} from './session-states/tile-rebinding'
export {
  blankDraftTile,
  closeAllOpenSessionTiles,
  closeSessionTile,
  discardSessionTile,
  dropTilesForProfile,
  focusOpenSession,
  focusedSessionNeedsRoute,
  focusWorkspaceOwnerSessionTile,
  markSelectionRestore,
  nextSessionTileForWorkspace,
  openSessionTile,
  orderTilesByTree,
  reopenLastClosedTile,
  reuseBlankDraftTile,
  selectionHomesToWorkspace
} from './session-states/tile-operations'
