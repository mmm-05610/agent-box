"use client"

/**
 * Connection-state model types（F3 归约器搬家,设计 §8 迁移映射第 4 行）。
 *
 * 从 acp-connections-context.tsx 抽出的共享类型:工具调用卡、pending
 * 权限/问询/审批、流式 LiveMessage 与 ConnectionState。UI 数据形状保持
 * 不变——它们是过渡适配层,等 features/session/model 的 SessionEvent
 * 归约器逐步接管后由 domain 类型（core/domain）替换。
 *
 * 本文件属于 features/session（src/contexts/acp-connections-context.tsx
 * 对外仍 re-export 这些符号,消费方无需改动）。
 */
import type {
  AgentType,
  AvailableCommandInfo,
  ConfigStaleKind,
  ConnectionStatus,
  PlanEntryInfo,
  PermissionOptionInfo,
  PendingPlanApprovalState,
  PendingQuestionState,
  PromptCapabilitiesInfo,
  SessionConfigOptionInfo,
  SessionFailureRecord,
  SessionModeStateInfo,
  SessionUsageUpdateInfo,
  ToolCallImageWire,
  UserMessageBlock,
} from "@/lib/types"

// ── Shared types (re-exported for consumers) ──

/** ACP extensibility metadata attached to tool calls. */
export type ToolCallMeta = Record<string, unknown> | null

/**
 * An image attached to a tool call (e.g. codex-acp v0.14+ image generation).
 * Re-exports the wire-level `ToolCallImageWire` from `@/lib/types` so that
 * snapshot, live `tool_call(_update)` events, and `ToolCallInfo` share one
 * shape. `data` is base64 (potentially multi-MB), `mime_type` defaults to
 * `image/png` when the agent omits it, `uri` is the on-disk path when the
 * agent persisted the asset (e.g. codex's `~/.codex/generated_images/...`).
 */
export type ToolCallImage = ToolCallImageWire

export interface ToolCallInfo {
  tool_call_id: string
  title: string
  kind: string
  status: string
  content: string | null
  raw_input: string | null
  raw_output_chunks: string[]
  raw_output_total_bytes: number
  locations: unknown
  meta: ToolCallMeta
  /**
   * Replace-on-update: a fresh ToolCallUpdate carrying images replaces this
   * vec; an absent images field preserves the prior value. Empty array
   * means "no images on this tool call". Persisted via snapshot so a
   * frontend reconnecting mid-turn or after refresh sees the same image.
   */
  images: ToolCallImage[]
}

export interface PendingPermission {
  request_id: string
  tool_call: unknown
  options: PermissionOptionInfo[]
  /** Requests queued behind this card (only one shows at a time). */
  queued?: number
}

/** In-flight user prompt carried on a connection (from a `user_message` event
 *  or a snapshot's `pending_user_message`). Mirrored into the runtime as a
 *  synthesized user turn for cross-client VIEWERS so they see the sender's
 *  message (the sender renders its own optimistic turn and ignores it). */
export interface PendingUserMessage {
  messageId: string
  blocks: UserMessageBlock[]
}

export interface PendingQuestion {
  tool_call_id: string
  question: string
}

export interface ClaudeApiRetryState {
  sessionId: string
  attempt: number | null
  maxRetries: number | null
  error: string | null
  errorStatus: number | null
  retryDelayMs: number | null
  /**
   * Whether the SOURCE reports error text for a retry at all — not whether this
   * particular record carries it.
   *
   * Claude's `api_retry` and codex's `_meta.codex.error` both do, and a missing
   * `error` there means "we didn't catch the cause this time", which is what
   * `claudeApiRetry.fallbackError` covers. pi (#525) reports no cause at any
   * time — only the counters — so the fallback would assert an authentication
   * failure that never happened. False makes the banner render from the
   * counters alone instead of inventing a reason.
   */
  reportsError: boolean
}

export type LiveContentBlock =
  /**
   * `parentToolUseId`: subagent attribution (claude-agent-acp ≥0.63,
   * `_meta.claudeCode.parentToolUseId`). Parented text/thinking belongs to
   * the live Agent capsule of that tool call — the runtime store routes it
   * out of the main thread. `undefined` = main-thread content.
   */
  | { type: "text"; text: string; parentToolUseId?: string }
  | { type: "thinking"; text: string; parentToolUseId?: string }
  | { type: "plan"; entries: PlanEntryInfo[] }
  | { type: "tool_call"; info: ToolCallInfo }

export interface LiveMessage {
  id: string
  role: "assistant" | "tool"
  content: LiveContentBlock[]
  startedAt: number
}

// ── Per-connection state ──

export interface ConnectionState {
  connectionId: string
  contextKey: string
  agentType: AgentType
  workingDir: string | null
  status: ConnectionStatus
  promptCapabilities: PromptCapabilitiesInfo
  supportsFork: boolean
  selectorsReady: boolean
  sessionId: string | null
  modes: SessionModeStateInfo | null
  configOptions: SessionConfigOptionInfo[] | null
  availableCommands: AvailableCommandInfo[] | null
  usage: SessionUsageUpdateInfo | null
  liveMessage: LiveMessage | null
  pendingPermission: PendingPermission | null
  /** In-flight user prompt for the current turn — set from a `user_message`
   *  event or a snapshot's `pending_user_message`. A VIEWER mirrors this into
   *  the runtime as a synthesized user turn; `null` outside an active turn. */
  pendingUserMessage: PendingUserMessage | null
  pendingQuestion: PendingQuestion | null
  /** Awaiting-answer multiple-choice `ask_user_question` (the codeg-mcp blocking
   *  tool). Set from a `question_request` event or a snapshot's
   *  `pending_question`; cleared on `question_resolved` or turn end. Distinct
   *  from the free-text `pendingQuestion` above. */
  pendingAskQuestion: PendingQuestionState | null
  /** Awaiting-decision Grok `exit_plan_mode` approval (the plan the agent is
   *  blocked on). Set from a `plan_approval_request` event or a snapshot's
   *  `pending_plan_approval`; cleared on `plan_approval_resolved` or turn end. */
  pendingPlanApproval: PendingPlanApprovalState | null
  claudeApiRetry: ClaudeApiRetryState | null
  /** AIR typed session failure table (see `lib/session-failures.ts` for the
   *  merge/settle contract). Retained resolved — entries double as per-id
   *  revision watermarks; the banner splits active from resolved itself. */
  sessionFailures: SessionFailureRecord[]
  error: string | null
  /**
   * Set when the agent rejected `session/load` in a way codeg cannot paper
   * over: no record of the session, the session/process died, or it is
   * archived. Distinct from `error` because the UI surfaces it inline in the
   * message list with reload / new-conversation actions, instead of as a
   * toast. Cleared on the next CONNECTION_CREATED for the same key, or by
   * CLEAR_ACP_LOAD_ERROR (Reload button).
   */
  loadError: string | null
  /**
   * A shell command that undoes the failure in `loadError`, when one exists
   * (today: `codex unarchive <id>` for an archived rollout). Kept beside the
   * localized message rather than only inside it so the banner can offer a
   * copy action — the message renders in a single-line ellipsized strip, and
   * a 36-char session id is exactly what gets truncated away. `null` whenever
   * there is nothing runnable to hand the user. Cleared with `loadError`.
   */
  loadErrorCommand: string | null
  /**
   * Highest envelope.seq applied to this connection. Used to dedup the
   * live `acp://event` stream against the snapshot endpoint: a
   * HYDRATE_FROM_SNAPSHOT sets this to snapshot.event_seq, and incoming
   * envelopes with seq <= lastAppliedSeq are dropped as duplicates.
   * Phase 3b initialises to 0 on CONNECTION_CREATED.
   */
  lastAppliedSeq: number
  /**
   * True when this entry was synthesized for a backend connection that
   * was spawned by the delegation broker (not via a user-driven
   * `connect()`). Such entries piggy-back on the same reducer pipeline
   * as real connections so the child's live message, tool calls, and
   * permission requests reach the UI, but they MUST be hidden from any
   * user-facing connection list / picker, and they MUST NOT be reaped
   * by the idle sweep — their lifetime is governed by the parent's
   * delegation_started / delegation_completed events.
   */
  isDelegationChild: boolean
  /**
   * For delegation-child entries: the parent's `tool_use_id` that owns
   * this child. The DelegatedSubThread component uses this to resolve
   * the child connection state from its parent-side identifier. Null
   * for non-delegation connections.
   */
  parentToolUseId: string | null
  /**
   * For delegation-child entries: the parent connection that spawned
   * this child. Carried for diagnostic / cascade-cancel purposes; not
   * required for the rendering path. Null for non-delegation
   * connections.
   */
  parentConnectionId: string | null
  /**
   * True when this client did NOT spawn the backend connection but attached to
   * one another client already owns (cross-client live streaming, discovered
   * via `acp_find_connection_for_conversation`). A viewer is a NON-OWNING,
   * co-controlling client: it streams the same turn and MAY drive the shared
   * agent (sendPrompt/cancel target the owner's connection, serialized
   * server-side by its prompt_lock; turn-level concurrency rejection is a
   * tracked follow-up). The one hard invariant: on teardown a viewer MUST
   * detach (drop its attach subscription / reverse-map entry) and MUST NOT
   * `acpDisconnect` — that would kill the agent for the owner. Like
   * `isDelegationChild`, viewers are skipped by the idle sweep's disconnect
   * path. Distinct from `isDelegationChild` (broker-owned child bookkeeping);
   * a plain viewer is the lighter cousin with no delegation state.
   */
  isViewer: boolean
  /**
   * True when the agent's effective settings changed after this session was
   * spawned, so the running process is still on its launch-time config (env
   * vars / model provider / native config). Set from a `session_config_stale`
   * event or a hydrated snapshot; cleared when the user reverts the setting or
   * restarts the session via `reapplyConfig`. Drives the per-conversation
   * "restart to apply" banner.
   */
  configStale: boolean
  /** Which settings surface drifted, for the banner's wording. `null` when not stale. */
  configStaleKind: ConfigStaleKind | null
  /**
   * Launched-but-unresolved background tasks (async sub-agents / background
   * shells) on this connection, mirrored from `background_activity` events
   * (authoritative accounting lives in the backend transcript watcher).
   * The count itself is never rendered — it is a busy signal. Non-zero exempts
   * the connection from the frontend idle sweep and the unmount/preview
   * teardowns (killing the connection kills the agent CLI and the background
   * work with it), and marks a manual reconnect destructive so the status
   * popover warns before interrupting that work.
   */
  backgroundOutstanding: number
  /**
   * Tool-call context observed OUT-OF-TURN (status !== "prompting"), kept
   * ONLY so a background permission request can still render its command/
   * diff details. Out-of-turn wire tool events are barred from `liveMessage`
   * (the transcript overlay renders that content), but the permission dialog
   * enriches from the live tool registry — this small bounded map
   * (`OUT_OF_TURN_TOOL_CALL_CAP` newest entries) is that registry's
   * out-of-turn stand-in. Cleared when the next prompting turn starts.
   * `null` when empty (the common case allocates nothing).
   */
  outOfTurnToolCalls: ReadonlyMap<string, ToolCallInfo> | null
  /**
   * Client-local: the user dismissed (X) the stale banner for the CURRENT
   * drift. Hides the banner without touching the underlying `configStale`
   * state. Reset to `false` whenever a fresh `session_config_stale` arrives (a
   * new change re-shows the banner) and on a new connection. Never sourced from
   * the snapshot — dismissal is per-client UI state.
   */
  configStaleDismissed: boolean
}

export type ConnectionsMap = Map<string, ConnectionState>
