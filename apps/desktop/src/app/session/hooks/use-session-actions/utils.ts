// Responsibilities live in the sibling modules below; this file stays the
// stable import path (and unchanged public surface) for every caller.

export { type BranchMessage, selectBranchMessages, toBranchMessages } from '@/application/session/branch-messages'

export { goneSessionVerdict, isSessionGoneError } from '@/application/session/gone-session-verdict'
export {
  appendLiveSessionProjection,
  dedupeInflightUserAgainstTranscript,
  overlayConcurrentMessageChanges,
  removeRepresentedLocalLiveProjection
} from './live-projection-merge'
export {
  chatMessageArraysEquivalent,
  chatMessagesEquivalent,
  chatPartsEquivalent,
  chatReactionsEquivalent,
  isStrictAnswerTextExtension,
  preserveEquivalentTranscript
} from '@/application/session/message-equivalence'
export { patchSessionWorkspace, upsertOptimisticSession } from '@/application/session/optimistic-session-rows'
export {
  preserveLocalPendingTurnMessages,
  reconcileResumeMessages,
  resolveResumedBusy
} from './resume-reconciliation'
export { applyRuntimeInfo, applyStoredSessionPreviewRuntimeInfo } from '@/application/session/runtime-info-mirror'
export {
  cachedSessionRow,
  dropListedSession,
  findListedSession,
  type ListedSessionSlice,
  resolveSessionOwner,
  resolveSessionProfile,
  resolveStoredSession,
  restoreListedSession,
  sessionShouldHaveTranscript
} from '@/application/session/session-registry-lookup'
// Re-exported for the many session-actions/tile call sites that already import
// it from here; the canonical definition lives in @/store/session.
export { sessionMatchesStoredId } from '@/store/session'
