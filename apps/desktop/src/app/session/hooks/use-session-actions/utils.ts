// Responsibilities live in the sibling modules below; this file stays the
// stable import path (and unchanged public surface) for every caller.

// Re-exported for the many session-actions/tile call sites that already import
// it from here; the canonical definition lives in @/store/session.
export { sessionMatchesStoredId } from '@/store/session'

export {
  chatMessageArraysEquivalent,
  chatMessagesEquivalent,
  chatPartsEquivalent,
  chatReactionsEquivalent,
  isStrictAnswerTextExtension,
  preserveEquivalentTranscript
} from './message-equivalence'
export {
  preserveLocalPendingTurnMessages,
  reconcileResumeMessages,
  resolveResumedBusy
} from './resume-reconciliation'
export {
  appendLiveSessionProjection,
  dedupeInflightUserAgainstTranscript,
  overlayConcurrentMessageChanges,
  removeRepresentedLocalLiveProjection
} from './live-projection-merge'
export { type BranchMessage, selectBranchMessages, toBranchMessages } from './branch-messages'
export { patchSessionWorkspace, upsertOptimisticSession } from './optimistic-session-rows'
export {
  cachedSessionRow,
  dropListedSession,
  findListedSession,
  resolveSessionOwner,
  resolveSessionProfile,
  resolveStoredSession,
  restoreListedSession,
  sessionShouldHaveTranscript,
  type ListedSessionSlice
} from './session-registry-lookup'
export { applyRuntimeInfo, applyStoredSessionPreviewRuntimeInfo } from './runtime-info-mirror'
export { goneSessionVerdict, isSessionGoneError } from './gone-session-verdict'
