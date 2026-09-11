import { normalizePersonalityValue } from '@/lib/chat-runtime'
import { reconcileApprovalModeForProfile } from '@/store/approval-mode'
import { requestDesktopOnboardingForCredentialWarning } from '@/store/onboarding'
import { $activeGatewayProfile } from '@/store/profile'
import {
  commitWorkspaceCwdForSelectedSession,
  releaseWorkspaceCwdOwner,
  setCurrentBranch,
  setCurrentCwdTransient,
  setCurrentFastMode,
  setCurrentModel,
  setCurrentPersonality,
  setCurrentProvider,
  setCurrentReasoningEffort,
  setCurrentServiceTier,
  setCurrentUsage,
  setWorkspaceCwdOwner,
  setYoloActive
} from '@/store/session'
import { reportBackendContract, reportInstallMethodWarning } from '@/store/updates'
import type { SessionRuntimeInfo } from '@/types/hermes'
import type { ClientSessionState } from '@/types/session'

/** Mirror a session's runtime info into the main-pane composer atoms and the
 *  per-session state patch. */
type SessionRuntimeStatePatch = Partial<
  Pick<
    ClientSessionState,
    'branch' | 'cwd' | 'fast' | 'model' | 'personality' | 'provider' | 'reasoningEffort' | 'serviceTier' | 'yolo'
  >
>

interface ApplyRuntimeInfoOptions {
  /**
   * Whether this runtime belongs to the session the MAIN pane is showing.
   * Foreground (the default) mirrors into the composer atoms every main-pane
   * surface reads.
   *
   * A tile or a background branch must pass `false`: it owns a different
   * worktree, and writing its cwd into `$currentCwd` re-pointed the main
   * composer's coding rail (and the persisted workspace cwd) at the tile's
   * repo — the main rail painted a branch from a tree its session was never
   * in. The returned patch still carries every field, so the caller's own
   * per-session state is unaffected.
   */
  foreground?: boolean
}

/** Mirror a session's runtime state into the composer atoms the MAIN pane
 *  renders from. Foreground sessions only — see ApplyRuntimeInfoOptions. */
function publishRuntimeToComposer(state: SessionRuntimeStatePatch): void {
  if (state.model !== undefined) {
    setCurrentModel(state.model)
  }

  if (state.provider !== undefined) {
    setCurrentProvider(state.provider)
  }

  if (state.cwd !== undefined) {
    if (state.cwd) {
      // The runtime named a real folder for the session in the main pane, so
      // that conversation owns the path.
      commitWorkspaceCwdForSelectedSession(state.cwd)
    } else {
      // A detached session: the path on screen is provably still the previous
      // conversation's. Release rather than write `''` — clearing it collapses
      // the workspace/review panes on every switch.
      releaseWorkspaceCwdOwner()
    }
  }

  if (state.branch !== undefined) {
    setCurrentBranch(state.branch)
  }

  if (state.personality !== undefined) {
    setCurrentPersonality(state.personality)
  }

  if (state.reasoningEffort !== undefined) {
    setCurrentReasoningEffort(state.reasoningEffort)
  }

  if (state.serviceTier !== undefined) {
    setCurrentServiceTier(state.serviceTier)
  }

  if (state.fast !== undefined) {
    setCurrentFastMode(state.fast)
  }

  if (state.yolo !== undefined) {
    setYoloActive(state.yolo)
  }
}

export function applyRuntimeInfo(
  info: SessionRuntimeInfo | undefined,
  { foreground = true }: ApplyRuntimeInfoOptions = {}
): SessionRuntimeStatePatch | null {
  if (!info) {
    return null
  }

  // App/profile-level reporting is session-independent — a tile's runtime
  // reports backend skew and credential warnings just as usefully.
  reportBackendContract(info.desktop_contract)

  if (info.approval_mode !== undefined) {
    reconcileApprovalModeForProfile($activeGatewayProfile.get(), info.approval_mode)
  }

  requestDesktopOnboardingForCredentialWarning(info.credential_warning)

  reportInstallMethodWarning(info.install_warning)

  const sessionState: SessionRuntimeStatePatch = {}

  if (typeof info.model === 'string') {
    sessionState.model = info.model
  }

  if (typeof info.provider === 'string') {
    sessionState.provider = info.provider
  }

  // Empty string is authoritative, not "no opinion": a detached/bare session
  // reports `cwd: ''`, and the truthy-only test left `$currentCwd` — and so the
  // Files pane — pinned to the PREVIOUS project for the rest of the session
  // (#71254). Empty is routed through ownership release below rather than
  // persisted, so the pane hides a path it no longer owns instead of blanking.
  if (typeof info.cwd === 'string') {
    sessionState.cwd = info.cwd
  }

  if (info.branch !== undefined) {
    sessionState.branch = info.branch || ''
  }

  if (typeof info.personality === 'string') {
    sessionState.personality = normalizePersonalityValue(info.personality)
  }

  if (typeof info.reasoning_effort === 'string') {
    sessionState.reasoningEffort = info.reasoning_effort
  }

  if (typeof info.service_tier === 'string') {
    sessionState.serviceTier = info.service_tier
  }

  if (typeof info.fast === 'boolean') {
    sessionState.fast = info.fast
  }

  if (typeof info.yolo === 'boolean') {
    sessionState.yolo = info.yolo
  }

  if (foreground) {
    publishRuntimeToComposer(sessionState)

    if (info.usage) {
      setCurrentUsage(current => ({ ...current, ...info.usage }))
    }
  }

  return sessionState
}

export function applyStoredSessionPreviewRuntimeInfo(
  stored: { cwd?: null | string; model?: null | string } | undefined,
  storedSessionId: null | string
) {
  setCurrentModel(stored?.model || '')
  setCurrentProvider('')
  setCurrentReasoningEffort('')
  setCurrentServiceTier('')
  setCurrentFastMode(false)
  setYoloActive(false)
  setCurrentPersonality('')

  // Cold resume paints the transcript before `session.resume` returns, so
  // without this the Files pane shows the PREVIOUS project's tree for the whole
  // round-trip (#71254 / #76696). The sidebar row already knows this
  // conversation's workspace — `cwd` is part of the compact row projection — so
  // mirror it on the same tick the selection changes.
  //
  // Only `cwd` is consulted. `git_repo_root` is documented as null for non-git
  // workspaces and not-yet-backfilled history rows, so falling back to it would
  // read as "no workspace" for those sessions and blank a pane that was correct.
  const storedCwd = stored?.cwd?.trim() || ''

  if (storedCwd) {
    setCurrentCwdTransient(storedCwd)
    setWorkspaceCwdOwner(storedSessionId)
  } else {
    // Either a genuinely detached session, or a row outside the loaded sidebar
    // page (`stored` is undefined) — neither says anything about the workspace,
    // while `$currentCwd` still holds the previous conversation's folder.
    // Release so workspace-derived surfaces stop trusting it; `applyRuntimeInfo`
    // publishes the truth a moment later. The path is deliberately left in place
    // — clearing it collapses the workspace/review panes and drops file-tree
    // state on every switch.
    releaseWorkspaceCwdOwner()
  }

  // Same window, same reasoning: the branch is derived from the workspace, so
  // carrying the previous conversation's label across a switch is never right.
  setCurrentBranch('')
}
