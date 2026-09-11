import type { ChatMessage } from '@/lib/chat-messages/types'
import type { UsageStats } from '@/types/hermes'

/**
 * The ONE authoritative exact owner of a session: the registry connection whose
 * socket minted (or resumed) the runtime, plus the Desktop profile that selects
 * that route. `targetProfile` is the backend profile the route serves when it
 * differs from the Desktop-side name (remote overrides); `mode` is informative.
 *
 * Captured ONCE at the new-chat intent / send linearization point
 * (store/profile resolveNewChatOwnerRoute) and carried through session.create,
 * the owner hint, the optimistic row, the runtime binding, the foreground hold
 * and every later session-scoped RPC. Never re-derived from ambient state after
 * an asynchronous activation: connection/profile EQUALITY is not enough — the
 * runtime lives on one concrete WebSocket, and only this route names the
 * registry entry that holds it.
 */
export interface SessionOwnerRoute {
  connectionId: string
  mode?: 'local' | 'remote'
  profile: string
  targetProfile?: string
}

export interface PersistedDisplayTranscriptProvenance {
  source: 'persisted-display'
  connectionId: string
  profile: string
  storedSessionId: string
  lineageRootId: string | null
  coverage: 'latest-page'
}

export interface ClientSessionState {
  storedSessionId: string | null
  transcriptAuthorityEpoch?: number
  transcriptProvenance?: PersistedDisplayTranscriptProvenance
  messages: ChatMessage[]
  branch: string
  cwd: string
  model: string
  provider: string
  reasoningEffort: string
  serviceTier: string
  fast: boolean
  yolo: boolean
  personality: string
  busy: boolean
  awaitingResponse: boolean
  streamId: string | null
  sawAssistantPayload: boolean
  /** This window picked up a turn it did not start — it resumed onto a session
   *  that was already running somewhere else (leaving HUD mode, opening a
   *  pop-out mid-turn). It therefore holds the reply but never received the
   *  prompt, so the usual "I streamed it, my transcript is complete" shortcut
   *  is false and the turn must hydrate from stored history when it settles. */
  adoptedRunningTurn: boolean
  pendingBranchGroup: string | null
  interrupted: boolean
  /** True after message.interim finalized a bubble in the still-running turn. */
  interimBoundaryPending: boolean
  /** A blocking clarify prompt is waiting on the user for this session. Drives
   *  the sidebar "needs input" indicator; cleared when the turn resumes/ends. */
  needsInput: boolean
  /** Epoch ms the current turn started, or null when idle. Per-session so a
   *  background turn's elapsed timer keeps counting while another session is
   *  focused, and switching sessions doesn't zero a still-running turn's clock.
   *  Seeded optimistically at submit (before the backend accepts), so it is a
   *  CLOCK, not proof the turn is live — gate on turnLive for that.
   *  The global $turnStartedAt mirrors whichever session is currently viewed. */
  turnStartedAt: number | null
  /** The backend has confirmed this turn is running (message.start, a
   *  running=true session.info edge, or resuming onto an in-flight turn).
   *  False while a submit is only optimistically armed — the discriminator the
   *  no-payload settle gate needs now that turnStartedAt is seeded at send. */
  turnLive: boolean
  /** Cumulative token usage, updated per completed turn. Per-session twin of
   *  the primary-only $currentUsage — the statusbar reads it for a focused
   *  tile's context count. Null until the first turn reports. */
  usage: null | UsageStats
}
