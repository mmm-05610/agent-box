"use client"

/**
 * ConnectionState 归约器（F3 归约器搬家,设计 §8 / §13-F3）。
 *
 * 从 acp-connections-context.tsx 平移的纯归约层:Action/StreamingAction
 * 联合、per-agentType selectors 缓存与 connectionsReducer。行为零变化
 * ——provider（connection-store.tsx）仍以相同的 Action 喂它,只是物理
 * 位置搬进 features/session/model,为后续「消费归一化 SessionEvent →
 * Turn/parts」的模型让位（下一片:SessionEvent → Action 的适配在
 * provider 侧生成,本归约器逐步退场）。
 */
import {
  dismissSessionFailures,
  mergeSessionFailures,
  settleSessionFailures,
  upsertSessionFailure,
  type SessionFailureSettleScope,
} from "@/lib/session-failures"
import { randomUUID } from "@/lib/utils"
import type {
  AgentType,
  AcpEvent,
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
} from "@/lib/types"
import type {
  ClaudeApiRetryState,
  ConnectionsMap,
  ConnectionState,
  LiveContentBlock,
  LiveMessage,
  PendingPermission,
  PendingQuestion,
  ToolCallImage,
  ToolCallInfo,
  ToolCallMeta,
} from "./connection-types"

// ── Reducer actions ──

export type Action =
  | {
      type: "CONNECTION_CREATED"
      contextKey: string
      connectionId: string
      agentType: AgentType
      workingDir: string | null
      // Set when attaching to a connection another client owns (viewer).
      // Defaults to false (owner) when omitted.
      isViewer?: boolean
    }
  | {
      type: "HYDRATE_FROM_SNAPSHOT"
      contextKey: string
      patch: import("@/lib/snapshot-denormalize").SnapshotPatch
    }
  | { type: "CONNECTION_REMOVED"; contextKey: string }
  | { type: "REMOVE_ALL" }
  | { type: "REKEY_CONNECTION"; fromKey: string; toKey: string }
  | {
      type: "STATUS_CHANGED"
      contextKey: string
      status: ConnectionStatus
    }
  | {
      // One AIR typed session-failure upsert (`session_failure` event).
      // Merged monotonically by id+revision; see `lib/session-failures.ts`.
      type: "SESSION_FAILURE"
      contextKey: string
      record: SessionFailureRecord
    }
  | {
      // Lifecycle settle for the AIR failure table (mirrors
      // `SessionState::apply_event`). `retry_incidents` rides turn PROGRESS —
      // fresh output proves the adapter reconnected. `warnings` is dispatched
      // from the `turn_complete` handler on a CLEAN (`end_turn`) end only: a
      // cancelled/failed exit ended a turn that did NOT recover, so its
      // warnings must stay active.
      type: "SETTLE_SESSION_FAILURES"
      contextKey: string
      scope: SessionFailureSettleScope
    }
  | {
      // The user closed a strip. Client-local, like `DISMISS_CONFIG_STALE`.
      // Takes every id that strip stood for: the collapsed warning bar closes
      // its hidden siblings with it.
      type: "DISMISS_SESSION_FAILURES"
      contextKey: string
      ids: string[]
    }
  | {
      // Mirror of a `background_activity` event's `outstanding` count (the
      // backend transcript watcher's authoritative accounting) onto the
      // connection, where it gates the teardowns. No-op when the count didn't
      // change, so repeat events don't re-render connection consumers.
      type: "SET_BACKGROUND_OUTSTANDING"
      contextKey: string
      outstanding: number
    }
  | StreamingAction
  | { type: "STREAM_BATCH"; actions: StreamingAction[] }
  | {
      type: "TOOL_CALL"
      contextKey: string
      tool_call_id: string
      title: string
      kind: string
      status: string
      content: string | null
      raw_input: string | null
      raw_output: string | null
      locations: unknown
      meta: ToolCallMeta
      /** `null` when the wire event omitted the field (no images). */
      images: ToolCallImage[] | null
    }
  | {
      type: "TOOL_CALL_UPDATE"
      contextKey: string
      tool_call_id: string
      title: string | null
      fallback_title: string
      fallback_kind: string
      status: string | null
      content: string | null
      raw_input: string | null
      raw_output: string | null
      raw_output_append?: boolean
      locations: unknown
      meta: ToolCallMeta
      /**
       * `null` when the wire event omitted the field — preserve prior images.
       * `[]` (empty array) when the agent explicitly cleared images.
       * `[a, b]` to replace.
       */
      images: ToolCallImage[] | null
    }
  | {
      type: "BATCH_TOOL_CALL_UPDATES"
      actions: Array<{
        contextKey: string
        tool_call_id: string
        title: string | null
        fallback_title: string
        fallback_kind: string
        status: string | null
        content: string | null
        raw_input: string | null
        raw_output: string | null
        raw_output_append?: boolean
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        locations: any | null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        meta: any | null
        images: ToolCallImage[] | null
      }>
    }
  | {
      type: "PERMISSION_REQUEST"
      contextKey: string
      request_id: string
      tool_call: unknown
      fallback_title: string
      fallback_kind: string
      options: PermissionOptionInfo[]
      queued?: number
    }
  | {
      type: "PERMISSION_QUEUE_DEPTH"
      contextKey: string
      depth: number
    }
  | {
      type: "PERMISSION_CLEARED"
      contextKey: string
      /**
       * When present, only clear if the current pendingPermission's request_id
       * matches. Guards against a late `permission_resolved` event wiping out a
       * fresh permission that was raised between resolve and dispatch.
       * Omit for unconditional clears (e.g. cancel paths).
       */
      requestId?: string
    }
  | {
      type: "SET_PENDING_QUESTION"
      contextKey: string
      pendingQuestion: PendingQuestion
    }
  | { type: "CLEAR_PENDING_QUESTION"; contextKey: string }
  | {
      type: "SET_ASK_QUESTION"
      contextKey: string
      pendingAskQuestion: PendingQuestionState
    }
  | {
      type: "CLEAR_ASK_QUESTION"
      contextKey: string
      /** When present, only clear if the current question_id matches (guards a
       *  late `question_resolved` from wiping a freshly-raised question). */
      questionId?: string
    }
  | {
      type: "SET_PLAN_APPROVAL"
      contextKey: string
      pendingPlanApproval: PendingPlanApprovalState
    }
  | {
      type: "CLEAR_PLAN_APPROVAL"
      contextKey: string
      /** When present, only clear if the current approval_id matches (guards a
       *  late `plan_approval_resolved` from wiping a freshly-raised approval). */
      approvalId?: string
    }
  | { type: "SESSION_STARTED"; contextKey: string; sessionId: string }
  | {
      type: "SESSION_MODES"
      contextKey: string
      modes: SessionModeStateInfo
    }
  | {
      type: "SESSION_CONFIG_OPTIONS"
      contextKey: string
      configOptions: SessionConfigOptionInfo[]
    }
  | {
      type: "CONFIG_STALE_CHANGED"
      contextKey: string
      stale: boolean
      kind: ConfigStaleKind
    }
  | {
      type: "DISMISS_CONFIG_STALE"
      contextKey: string
    }
  | {
      type: "SELECTORS_READY"
      contextKey: string
    }
  | {
      type: "PROMPT_CAPABILITIES"
      contextKey: string
      promptCapabilities: PromptCapabilitiesInfo
    }
  | {
      type: "FORK_SUPPORTED"
      contextKey: string
      supported: boolean
    }
  | { type: "MODE_CHANGED"; contextKey: string; modeId: string }
  | {
      type: "CONFIG_OPTION_CHANGED"
      contextKey: string
      configId: string
      valueId: string
    }
  | {
      type: "PLAN_UPDATE"
      contextKey: string
      entries: PlanEntryInfo[]
    }
  | {
      type: "CLAUDE_API_RETRY"
      contextKey: string
      retry: ClaudeApiRetryState | null
    }
  | { type: "ERROR"; contextKey: string; message: string }
  | {
      type: "ACP_LOAD_ERROR"
      contextKey: string
      message: string
      /** Runnable recovery for this failure, or null when there is none. */
      command?: string | null
    }
  | { type: "CLEAR_ACP_LOAD_ERROR"; contextKey: string }
  | {
      type: "AVAILABLE_COMMANDS"
      contextKey: string
      commands: AvailableCommandInfo[]
    }
  | {
      type: "USAGE_UPDATE"
      contextKey: string
      usage: SessionUsageUpdateInfo
    }
  | {
      type: "EVENT_APPLIED"
      contextKey: string
      seq: number
    }
  | {
      /**
       * Synthesize a ConnectionState for a delegation-spawned child so
       * its acp://event stream lands in the reducer the same way a
       * user-driven connect() does. contextKey == connectionId for these
       * entries — the child has no user-facing tab to anchor a separate
       * key against.
       */
      type: "DELEGATION_CHILD_ATTACH"
      contextKey: string
      connectionId: string
      agentType: AgentType
      parentConnectionId: string
      parentToolUseId: string
    }
  | {
      /**
       * Remove the synthetic child entry once the delegation has wound
       * down (delegation_completed) and any grace window has elapsed.
       * No-op when the entry is already gone.
       */
      type: "DELEGATION_CHILD_DETACH"
      contextKey: string
    }

export type StreamingAction =
  | {
      type: "CONTENT_DELTA"
      contextKey: string
      text: string
      parentToolUseId?: string
    }
  | {
      type: "THINKING"
      contextKey: string
      text: string
      parentToolUseId?: string
    }

const MAX_LIVE_TOOL_RAW_OUTPUT_CHARS = 200_000

// Per-agentType cache for selectors (modes / configOptions).
// Populated when real data arrives from the backend.
// Used as UI-layer fallback when the connection hasn't received real data yet.
const selectorsCache = new Map<
  string,
  {
    modes: SessionModeStateInfo | null
    configOptions: SessionConfigOptionInfo[] | null
  }
>()

export function getCachedSelectors(agentType: string) {
  return selectorsCache.get(agentType) ?? null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

const PERMISSION_TOOL_INPUT_KEYS = [
  "rawInput",
  "raw_input",
  "input",
  "arguments",
  "params",
  "payload",
] as const

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function parseClaudeApiRetryEvent(
  event: Extract<AcpEvent, { type: "claude_sdk_message" }>
): ClaudeApiRetryState | null {
  const message = asRecord(event.message)
  if (!message) return null
  if (message.type !== "system" || message.subtype !== "api_retry") return null

  return {
    sessionId:
      typeof message.session_id === "string"
        ? message.session_id
        : event.session_id,
    attempt: asFiniteNumber(message.attempt),
    maxRetries: asFiniteNumber(message.max_retries),
    error: typeof message.error === "string" ? message.error : null,
    errorStatus: asFiniteNumber(message.error_status),
    retryDelayMs: asFiniteNumber(message.retry_delay_ms),
    // Claude's api_retry always carries a cause in principle; an absent one is a
    // gap in THIS message, so keep the existing fallback wording for it.
    reportsError: true,
  }
}

function extractPermissionToolCallId(toolCall: unknown): string | null {
  const record = asRecord(toolCall)
  if (!record) return null
  const candidates = [
    record.call_id,
    record.callId,
    record.tool_call_id,
    record.toolCallId,
    record.id,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }
  return null
}

function pickPermissionToolInput(record: Record<string, unknown>): unknown {
  for (const key of PERMISSION_TOOL_INPUT_KEYS) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (typeof value === "string" && value.trim().length === 0) continue
    return value
  }
  return null
}

function serializePermissionInput(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function serializePermissionToolCall(toolCall: unknown): string | null {
  const record = asRecord(toolCall)
  if (!record) return null
  try {
    // Extract the actual tool input rather than serializing the entire
    // permission wrapper (which includes internal fields like kind/status/id).
    const nestedInput = pickPermissionToolInput(record)
    const serializedNestedInput = serializePermissionInput(nestedInput)
    if (serializedNestedInput) return serializedNestedInput

    // Fallback: strip wrapper-only fields to avoid rendering internal
    // permission structure as raw text.
    const wrapperKeys = new Set([
      "content",
      "kind",
      "status",
      "title",
      "toolCallId",
      "tool_call_id",
      "callId",
      "call_id",
      ...PERMISSION_TOOL_INPUT_KEYS,
    ])
    const rest: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(record)) {
      if (!wrapperKeys.has(k)) rest[k] = v
    }
    return Object.keys(rest).length > 0 ? JSON.stringify(rest) : null
  } catch {
    return null
  }
}

function findLiveToolCallInfo(
  content: LiveContentBlock[],
  toolCallId: string | null
): ToolCallInfo | null {
  if (!toolCallId) return null
  const block = content.find(
    (item) => item.type === "tool_call" && item.info.tool_call_id === toolCallId
  )
  return block?.type === "tool_call" ? block.info : null
}

function mergePermissionToolCallWithLiveInfo(
  toolCall: unknown,
  liveInfo: ToolCallInfo | null
): unknown {
  if (!liveInfo) return toolCall

  const rawInput = serializePermissionInput(liveInfo.raw_input)
  const record = asRecord(toolCall)
  if (!record) {
    if (!rawInput) return toolCall
    return {
      toolCallId: liveInfo.tool_call_id,
      title: liveInfo.title,
      kind: liveInfo.kind,
      rawInput,
    }
  }

  const next = { ...record }
  let changed = false
  const existingInput = serializePermissionInput(pickPermissionToolInput(next))
  if (!existingInput && rawInput) {
    next.rawInput = rawInput
    changed = true
  }
  if (typeof next.title !== "string" || next.title.trim().length === 0) {
    next.title = liveInfo.title
    changed = true
  }
  if (typeof next.kind !== "string" || next.kind.trim().length === 0) {
    next.kind = liveInfo.kind
    changed = true
  }
  if (!extractPermissionToolCallId(next)) {
    next.toolCallId = liveInfo.tool_call_id
    changed = true
  }
  return changed ? next : toolCall
}

function mergePendingPermissionWithLiveInfo(
  pendingPermission: PendingPermission | null,
  liveInfo: ToolCallInfo | null
): PendingPermission | null {
  if (!pendingPermission || !liveInfo) return pendingPermission
  const permissionCallId = extractPermissionToolCallId(
    pendingPermission.tool_call
  )
  if (permissionCallId !== liveInfo.tool_call_id) return pendingPermission

  const toolCall = mergePermissionToolCallWithLiveInfo(
    pendingPermission.tool_call,
    liveInfo
  )
  if (toolCall === pendingPermission.tool_call) return pendingPermission
  return {
    ...pendingPermission,
    tool_call: toolCall,
  }
}

function mergePendingPermissionWithLiveMessage(
  pendingPermission: PendingPermission | null,
  liveMessage: LiveMessage | null
): PendingPermission | null {
  const permissionCallId = extractPermissionToolCallId(
    pendingPermission?.tool_call
  )
  const liveInfo = liveMessage
    ? findLiveToolCallInfo(liveMessage.content, permissionCallId)
    : null
  return mergePendingPermissionWithLiveInfo(pendingPermission, liveInfo)
}

function extractPermissionToolTitle(toolCall: unknown): string | null {
  const record = asRecord(toolCall)
  if (!record) return null
  const candidates = [record.title, record.tool_name, record.name, record.type]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }
  return null
}

function extractPermissionToolKind(toolCall: unknown): string | null {
  const record = asRecord(toolCall)
  if (!record) return null
  const candidates = [record.kind, record.tool_name, record.name, record.type]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate
    }
  }
  return null
}

/**
 * Extract the free-text question for the LEGACY `QuestionDialog` from a tool
 * call's raw input — gated on a singular `question` STRING field. Exported so a
 * regression test can prove the new multiple-choice `ask_user_question` tool
 * (whose input is `{ questions: [...] }`, plural array) never trips this legacy
 * path even though tool-name normalization classifies it as "question".
 */
export function extractQuestionText(rawInput: string | null): string | null {
  if (!rawInput) return null
  try {
    const parsed = JSON.parse(rawInput)
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.question === "string"
    ) {
      return parsed.question
    }
  } catch {
    // not JSON, try using rawInput as-is if it looks like a question
  }
  return null
}

function sameModes(
  a: SessionModeStateInfo | null,
  b: SessionModeStateInfo
): boolean {
  if (a === b) return true
  if (!a) return false
  if (a.current_mode_id !== b.current_mode_id) return false
  if (a.available_modes.length !== b.available_modes.length) return false
  for (let i = 0; i < a.available_modes.length; i += 1) {
    const left = a.available_modes[i]
    const right = b.available_modes[i]
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.description !== right.description
    ) {
      return false
    }
  }
  return true
}

function samePromptCapabilities(
  a: PromptCapabilitiesInfo,
  b: PromptCapabilitiesInfo
): boolean {
  return (
    a.image === b.image &&
    a.audio === b.audio &&
    a.embedded_context === b.embedded_context
  )
}

function samePlanEntries(a: PlanEntryInfo[], b: PlanEntryInfo[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].content !== b[i].content ||
      a[i].priority !== b[i].priority ||
      a[i].status !== b[i].status
    ) {
      return false
    }
  }
  return true
}

function sameConfigOptions(
  a: SessionConfigOptionInfo[] | null,
  b: SessionConfigOptionInfo[]
): boolean {
  if (a === b) return true
  if (!a) return false
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.description !== right.description ||
      left.category !== right.category
    ) {
      return false
    }

    const leftKind = left.kind
    const rightKind = right.kind
    if (leftKind.type !== rightKind.type) return false

    if (leftKind.type === "select") {
      if (leftKind.current_value !== rightKind.current_value) return false
      if (leftKind.options.length !== rightKind.options.length) return false
      if (leftKind.groups.length !== rightKind.groups.length) return false

      for (let j = 0; j < leftKind.options.length; j += 1) {
        const lo = leftKind.options[j]
        const ro = rightKind.options[j]
        if (
          lo.value !== ro.value ||
          lo.name !== ro.name ||
          lo.description !== ro.description
        ) {
          return false
        }
      }

      for (let j = 0; j < leftKind.groups.length; j += 1) {
        const lg = leftKind.groups[j]
        const rg = rightKind.groups[j]
        if (lg.group !== rg.group || lg.name !== rg.name) return false
        if (lg.options.length !== rg.options.length) return false
        for (let k = 0; k < lg.options.length; k += 1) {
          const lgo = lg.options[k]
          const rgo = rg.options[k]
          if (
            lgo.value !== rgo.value ||
            lgo.name !== rgo.name ||
            lgo.description !== rgo.description
          ) {
            return false
          }
        }
      }
    }
  }
  return true
}

function sameCommands(
  a: AvailableCommandInfo[] | null,
  b: AvailableCommandInfo[]
): boolean {
  if (a === b) return true
  if (!a) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].name !== b[i].name ||
      a[i].description !== b[i].description ||
      a[i].input_hint !== b[i].input_hint
    ) {
      return false
    }
  }
  return true
}

function dedupeCommandsByName(
  commands: AvailableCommandInfo[]
): AvailableCommandInfo[] {
  const seen = new Set<string>()
  let deduped: AvailableCommandInfo[] | null = null

  for (let i = 0; i < commands.length; i += 1) {
    const command = commands[i]
    if (seen.has(command.name)) {
      deduped ??= commands.slice(0, i)
      continue
    }

    seen.add(command.name)
    deduped?.push(command)
  }

  return deduped ?? commands
}

/**
 * Lazy-create a `LiveMessage` shell mirroring the backend's
 * `ensure_live_message` semantic. Required because the backend only
 * initializes `session_state.live_message` when the first `ContentDelta` /
 * `Thinking` / `ToolCall` / `PlanUpdate` arrives — there's a window between
 * `StatusChanged(Prompting)` and the first content event in which the
 * snapshot reports `live_message: null`. After a browser refresh inside
 * that window, the live `STATUS_CHANGED(prompting)` event won't re-fire
 * (status is already prompting in the snapshot), so without this fallback
 * the reducer would drop every subsequent delta / tool call / plan update.
 */
function ensureLiveMessage(prev: LiveMessage | null): LiveMessage {
  if (prev) return prev
  return {
    id: randomUUID(),
    role: "assistant",
    content: [],
    startedAt: Date.now(),
  }
}

/** Last time an out-of-turn drop was logged — module-level sampling clock. */
let lastOutOfTurnDropLogAt = 0

function applyStreamingAction(
  conn: ConnectionState,
  action: StreamingAction
): ConnectionState | null {
  // OUT-OF-TURN guard: the backend's idle loop forwards session/updates that
  // arrive BETWEEN turns (background sub-agent completions, the agent's
  // continued autonomous work). Appending those here would graft them onto
  // the previous turn's completed liveMessage — the historical "background
  // results render garbled/incomplete" bug. The transcript watcher's
  // `background_activity` overlay is the single render path for out-of-turn
  // content, so wire deltas outside a prompting turn are dropped. Ordering is
  // safe: the backend emits StatusChanged(prompting) before any turn content,
  // and turn_complete flushes queued deltas before flipping status back.
  if (conn.status !== "prompting") {
    // Sampled: an autonomous (cron//loop) turn streams the ENTIRE wire
    // out-of-turn — logging every dropped delta would spam the console and
    // allocate per token for minutes at a time.
    const now = Date.now()
    if (now - lastOutOfTurnDropLogAt > 5_000) {
      lastOutOfTurnDropLogAt = now
      console.debug(
        "[acp] dropping out-of-turn streaming deltas (transcript overlay renders them)",
        { contextKey: conn.contextKey, type: action.type }
      )
    }
    return null
  }
  // CONTENT_DELTA with empty text is a true no-op. THINKING with empty text
  // is allowed to create the initial placeholder block so the UI can show
  // a "Thinking..." indicator immediately (and for newer Claude models that
  // redact thinking text entirely, keeping the empty block as the signal).
  if (action.type === "CONTENT_DELTA" && action.text.length === 0) return null

  // Orphan gate for subagent-attributed chunks: the parent Agent tool_call
  // always precedes its subagent's chunks on the seq-ordered wire (and
  // `tool_call` dispatch flushes the streaming queue first), so a parented
  // delta whose parent is absent from liveMessage is out-of-turn residue —
  // e.g. an async subagent still streaming after its parent turn settled.
  // Dropping it here keeps liveMessage, its runtime-store sinks, and
  // COMPLETE_TURN promotion consistent, and bounds memory (orphan text never
  // accumulates).
  if (action.parentToolUseId) {
    const parentPresent = conn.liveMessage?.content.some(
      (b) =>
        b.type === "tool_call" && b.info.tool_call_id === action.parentToolUseId
    )
    if (!parentPresent) return null
  }

  const prev = ensureLiveMessage(conn.liveMessage)
  const lastBlock = prev.content[prev.content.length - 1]
  let newContent: LiveContentBlock[] | null = null

  // Merge only into a trailing block of the same kind AND the same subagent
  // attribution — main → subagent → main must produce three blocks. Mirrors
  // the backend's `append_text_delta` predicate so a snapshot-hydrated client
  // converges on identical block boundaries.
  if (action.type === "CONTENT_DELTA") {
    if (
      lastBlock?.type === "text" &&
      lastBlock.parentToolUseId === action.parentToolUseId
    ) {
      newContent = [
        ...prev.content.slice(0, -1),
        {
          type: "text",
          text: lastBlock.text + action.text,
          parentToolUseId: action.parentToolUseId,
        },
      ]
    } else {
      newContent = [
        ...prev.content,
        {
          type: "text",
          text: action.text,
          parentToolUseId: action.parentToolUseId,
        },
      ]
    }
  } else {
    if (
      action.text.length === 0 &&
      lastBlock?.type === "thinking" &&
      lastBlock.parentToolUseId === action.parentToolUseId
    ) {
      // Already have a thinking block of this attribution; an empty
      // follow-up event is a no-op. (A parented empty chunk must not
      // suppress the main thread's "Thinking..." placeholder, nor vice
      // versa — hence the attribution check.)
      return null
    }
    if (
      lastBlock?.type === "thinking" &&
      lastBlock.parentToolUseId === action.parentToolUseId
    ) {
      newContent = [
        ...prev.content.slice(0, -1),
        {
          type: "thinking",
          text: lastBlock.text + action.text,
          parentToolUseId: action.parentToolUseId,
        },
      ]
    } else {
      newContent = [
        ...prev.content,
        {
          type: "thinking",
          text: action.text,
          parentToolUseId: action.parentToolUseId,
        },
      ]
    }
  }

  if (!newContent) return null
  return {
    ...conn,
    liveMessage: { ...prev, content: newContent },
    // Streaming content implies the SDK has recovered from any in-flight
    // Claude API retry, so hide the retry banner immediately instead of
    // waiting for the prompt cycle to end.
    claudeApiRetry: null,
  }
}

/** Newest out-of-turn tool-call contexts kept per connection (see
 *  `ConnectionState.outOfTurnToolCalls`). Permission enrichment only ever
 *  needs the last few. */
const OUT_OF_TURN_TOOL_CALL_CAP = 8

/**
 * Overlay-fold refetch: once a conversation's background overlay exceeds this
 * many turns, fold them into persisted turns via a detail refetch (the
 * watermark rule retires covered entries). Keeps a day-long cron//loop
 * session's overlay — which never settles, so nothing else refetches —
 * bounded. Sized so the fold runs every few dozen autonomous turns, not per
 * turn.
 */
export const OVERLAY_FOLD_THRESHOLD = 60
/** Floor between overlay-fold refetches per conversation, so a failing
 *  backend (refetch errors, overlay keeps growing) can't escalate into a
 *  refetch per background event. */
export const OVERLAY_FOLD_MIN_INTERVAL_MS = 30_000
/** conversationId → epoch ms of the last overlay-fold refetch. Module-level:
 *  survives provider re-renders; a few entries only (conversations with
 *  active background overlay). */
export const overlayFoldRefetchAt = new Map<number, number>()

/** Upsert one out-of-turn tool-call info into the bounded registry,
 *  evicting the oldest entry past the cap. Returns a fresh map. */
function recordOutOfTurnToolCall(
  existing: ReadonlyMap<string, ToolCallInfo> | null,
  info: ToolCallInfo
): ReadonlyMap<string, ToolCallInfo> {
  const next = new Map(existing ?? [])
  next.delete(info.tool_call_id)
  next.set(info.tool_call_id, info)
  while (next.size > OUT_OF_TURN_TOOL_CALL_CAP) {
    const oldest = next.keys().next().value
    if (oldest === undefined) break
    next.delete(oldest)
  }
  return next
}

export function connectionsReducer(
  state: ConnectionsMap,
  action: Action
): ConnectionsMap {
  switch (action.type) {
    case "CONNECTION_CREATED": {
      const next = new Map(state)
      next.set(action.contextKey, {
        connectionId: action.connectionId,
        contextKey: action.contextKey,
        agentType: action.agentType,
        workingDir: action.workingDir,
        status: "connecting",
        promptCapabilities: {
          image: false,
          audio: false,
          embedded_context: false,
        },
        supportsFork: false,
        selectorsReady: false,
        sessionId: null,
        modes: null,
        configOptions: null,
        availableCommands: null,
        usage: null,
        liveMessage: null,
        pendingPermission: null,
        pendingUserMessage: null,
        pendingQuestion: null,
        pendingAskQuestion: null,
        pendingPlanApproval: null,
        claudeApiRetry: null,
        sessionFailures: [],
        error: null,
        loadError: null,
        loadErrorCommand: null,
        lastAppliedSeq: 0,
        isDelegationChild: false,
        parentToolUseId: null,
        parentConnectionId: null,
        isViewer: action.isViewer ?? false,
        configStale: false,
        configStaleKind: null,
        configStaleDismissed: false,
        backgroundOutstanding: 0,
        outOfTurnToolCalls: null,
      })
      return next
    }

    case "DELEGATION_CHILD_ATTACH": {
      // Idempotent: if an entry already exists for this key with the
      // same connectionId, leave it untouched so a duplicate
      // delegation_started (e.g. replayed from snapshot hydration after
      // a refresh) doesn't blow away the live stream that has already
      // populated. If the connectionId differs we replace, since a new
      // spawn won the race.
      const existing = state.get(action.contextKey)
      if (existing && existing.connectionId === action.connectionId) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        connectionId: action.connectionId,
        contextKey: action.contextKey,
        agentType: action.agentType,
        workingDir: null,
        // The child is already alive in the backend by the time
        // delegation_started fires; treat it as connected so any UI
        // surface that gates on status reflects reality.
        status: "connected",
        promptCapabilities: {
          image: false,
          audio: false,
          embedded_context: false,
        },
        supportsFork: false,
        selectorsReady: true,
        sessionId: null,
        modes: null,
        configOptions: null,
        availableCommands: null,
        usage: null,
        liveMessage: null,
        pendingPermission: null,
        pendingUserMessage: null,
        pendingQuestion: null,
        pendingAskQuestion: null,
        pendingPlanApproval: null,
        claudeApiRetry: null,
        sessionFailures: [],
        error: null,
        loadError: null,
        loadErrorCommand: null,
        lastAppliedSeq: 0,
        isDelegationChild: true,
        parentToolUseId: action.parentToolUseId,
        parentConnectionId: action.parentConnectionId,
        isViewer: false,
        configStale: false,
        configStaleKind: null,
        configStaleDismissed: false,
        backgroundOutstanding: 0,
        outOfTurnToolCalls: null,
      })
      return next
    }

    case "DELEGATION_CHILD_DETACH": {
      const existing = state.get(action.contextKey)
      if (!existing || !existing.isDelegationChild) return state
      const next = new Map(state)
      next.delete(action.contextKey)
      return next
    }

    case "HYDRATE_FROM_SNAPSHOT": {
      const current = state.get(action.contextKey)
      if (!current) return state
      // Identity guard: the connection at this contextKey may have been
      // disconnected and replaced between the snapshot fetch firing and
      // its async response. eventSeq alone is not enough — a stale snapshot
      // from connection A (high seq) would otherwise overwrite a fresh
      // connection B (lastAppliedSeq=0) at the same contextKey.
      if (current.connectionId !== action.patch.connectionId) return state

      // Latched-once / fill-null fields are always safe to merge, even when
      // the snapshot is stale by event_seq. Their producing events
      // (`selectors_ready`, `fork_supported`, `session_modes`,
      // `session_config_options`, `available_commands`, `prompt_capabilities`)
      // typically fire only once during the initial handshake, so the
      // snapshot is the only recovery path after a refresh that missed the
      // original live event. Without this, a mid-stream browser refresh
      // races the snapshot fetch against new content_delta events: the
      // deltas advance lastAppliedSeq past the snapshot's event_seq, the
      // outer guard rejects the patch, and `selectorsReady` never recovers
      // — leaving the bottom status bar stuck on "正在初始化 xxx 会话".
      const mergedSelectorsReady =
        action.patch.selectorsReady || current.selectorsReady
      const mergedSupportsFork =
        action.patch.supportsFork || current.supportsFork
      const mergedModes = current.modes ?? action.patch.modes
      const mergedConfigOptions =
        current.configOptions ?? action.patch.configOptions
      const mergedAvailableCommands =
        current.availableCommands ?? action.patch.availableCommands
      const mergedPromptCapabilities =
        action.patch.promptCapabilities ?? current.promptCapabilities

      // Race guard: the snapshot may have been generated BEFORE events
      // that have since arrived and been applied to in-memory state.
      // Mutable fields (status, sessionId, liveMessage, pendingPermission,
      // usage, error) are fresher in memory than in the snapshot and must NOT
      // be overwritten — but the latched/fill-null fields above are still
      // applied so the once-per-lifetime bits can recover. `error` in
      // particular is cleared on a new prompt (STATUS_CHANGED → prompting), so
      // folding a stale snapshot's `lastError` back in here would resurrect an
      // error the current turn already cleared; it is recovered on the fresh
      // path below instead.
      // AIR failure records merge on BOTH branches: the per-id monotonic rule
      // is idempotent and can only add or upgrade entries, never clobber a
      // fresher live one — so even a stale-by-eventSeq snapshot may safely
      // contribute records this client attached too late to see live.
      const mergedSessionFailures = mergeSessionFailures(
        current.sessionFailures,
        action.patch.sessionFailures
      )

      if (action.patch.eventSeq <= current.lastAppliedSeq) {
        if (
          mergedSelectorsReady === current.selectorsReady &&
          mergedSupportsFork === current.supportsFork &&
          mergedModes === current.modes &&
          mergedConfigOptions === current.configOptions &&
          mergedAvailableCommands === current.availableCommands &&
          mergedPromptCapabilities === current.promptCapabilities &&
          mergedSessionFailures === current.sessionFailures
        ) {
          return state
        }
        const next = new Map(state)
        next.set(action.contextKey, {
          ...current,
          modes: mergedModes,
          configOptions: mergedConfigOptions,
          availableCommands: mergedAvailableCommands,
          promptCapabilities: mergedPromptCapabilities,
          selectorsReady: mergedSelectorsReady,
          supportsFork: mergedSupportsFork,
          sessionFailures: mergedSessionFailures,
        })
        return next
      }

      const hydratedLiveMessage = action.patch.liveMessage
      const hydratedPendingPermission = mergePendingPermissionWithLiveMessage(
        action.patch.pendingPermission,
        hydratedLiveMessage ?? current.liveMessage
      )
      const next = new Map(state)
      next.set(action.contextKey, {
        ...current,
        status: action.patch.status,
        sessionId: action.patch.sessionId,
        modes: action.patch.modes,
        configOptions: action.patch.configOptions,
        availableCommands: action.patch.availableCommands,
        usage: action.patch.usage,
        liveMessage: hydratedLiveMessage,
        pendingPermission: hydratedPendingPermission,
        pendingAskQuestion: action.patch.pendingAskQuestion,
        pendingPlanApproval: action.patch.pendingPlanApproval,
        pendingUserMessage: action.patch.pendingUserMessage,
        promptCapabilities: mergedPromptCapabilities,
        selectorsReady: mergedSelectorsReady,
        supportsFork: mergedSupportsFork,
        // Staleness is a current-state field (like status): apply the snapshot's
        // value on the fresh path. `configStaleDismissed` is client-local and
        // preserved via `...current`.
        configStale: action.patch.configStale,
        configStaleKind: action.patch.configStaleKind,
        // Current-state field like `status`: a client attaching mid-episode
        // recovers the pending-background count the one-shot events won't
        // replay for it, so its teardown gates hold.
        backgroundOutstanding: action.patch.backgroundOutstanding,
        sessionFailures: mergedSessionFailures,
        error: action.patch.lastError,
        lastAppliedSeq: action.patch.eventSeq,
      })
      return next
    }

    case "EVENT_APPLIED": {
      const current = state.get(action.contextKey)
      if (!current) return state
      // Idempotent: only advances if the new seq is strictly higher.
      if (action.seq <= current.lastAppliedSeq) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...current,
        lastAppliedSeq: action.seq,
      })
      return next
    }

    case "CONNECTION_REMOVED": {
      const next = new Map(state)
      next.delete(action.contextKey)
      return next
    }

    case "REMOVE_ALL":
      return new Map()

    case "REKEY_CONNECTION": {
      const conn = state.get(action.fromKey)
      if (!conn) return state
      // Defensive: if toKey already has an entry, do not clobber it.
      if (state.has(action.toKey)) return state
      const next = new Map(state)
      next.delete(action.fromKey)
      next.set(action.toKey, { ...conn, contextKey: action.toKey })
      return next
    }

    case "STATUS_CHANGED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      const updated = { ...conn, status: action.status }
      if (action.status === "prompting") {
        updated.liveMessage = {
          id: randomUUID(),
          role: "assistant",
          content: [],
          startedAt: Date.now(),
        }
        updated.pendingQuestion = null
        updated.claudeApiRetry = null
        updated.error = null
        // Starting a prompt past an active AIR failure acknowledges it —
        // settle EVERYTHING (watermarks retained). A failure that is still
        // real re-arms via a higher revision on the same id.
        updated.sessionFailures = settleSessionFailures(
          conn.sessionFailures,
          "all"
        )
        // The out-of-turn window ended: its tool-call contexts (kept only for
        // background permission enrichment) are stale for the new turn.
        updated.outOfTurnToolCalls = null
      } else if (conn.status === "prompting") {
        // Prompt cycle ended: clear in-flight Claude API retry banner.
        updated.claudeApiRetry = null
        // AIR failures deliberately NOT settled here: leaving `prompting`
        // covers error/cancel exits too, where the incident did not recover —
        // settling on any exit painted a still-dead connection as a recovered
        // warning. The `turn_complete` handler settles warnings on a clean
        // `end_turn` instead (SETTLE_SESSION_FAILURES), after the response's
        // terminal error escalation (if any) has already landed.
        // A blocked ask_user_question can't outlive its turn. The normal path
        // clears it via `question_resolved`; this is the safety net for a turn
        // that ended without one (agent error / abandoned block).
        updated.pendingAskQuestion = null
        // Likewise a blocked exit_plan_mode approval — cleared via
        // `plan_approval_resolved` normally; this is the turn-end safety net.
        updated.pendingPlanApproval = null
      }
      next.set(action.contextKey, updated)
      return next
    }

    case "SET_BACKGROUND_OUTSTANDING": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (conn.backgroundOutstanding === action.outstanding) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        backgroundOutstanding: action.outstanding,
      })
      return next
    }

    case "CONTENT_DELTA":
    case "THINKING": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const updated = applyStreamingAction(conn, action)
      if (!updated) return state
      const next = new Map(state)
      next.set(action.contextKey, updated)
      return next
    }

    case "STREAM_BATCH": {
      if (action.actions.length === 0) return state
      const grouped = new Map<string, StreamingAction[]>()
      for (const streamAction of action.actions) {
        const list = grouped.get(streamAction.contextKey)
        if (list) {
          list.push(streamAction)
        } else {
          grouped.set(streamAction.contextKey, [streamAction])
        }
      }

      let next: ConnectionsMap | null = null

      for (const [contextKey, streamActions] of grouped) {
        const source = next ?? state
        const conn = source.get(contextKey)
        if (!conn) continue

        let updatedConn = conn
        let hasChange = false
        for (const streamAction of streamActions) {
          const updated = applyStreamingAction(updatedConn, streamAction)
          if (!updated) continue
          updatedConn = updated
          hasChange = true
        }
        if (!hasChange) continue

        if (!next) {
          next = new Map(state)
        }
        next.set(contextKey, updatedConn)
      }

      return next ?? state
    }

    case "TOOL_CALL": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      // Out-of-turn wire tool activity stays OUT of `liveMessage` (the
      // transcript overlay renders that content — grafting it here recreated
      // the garbled-timeline bug), but its context is still recorded so a
      // background permission request can render command/diff details.
      if (conn.status !== "prompting") {
        const next = new Map(state)
        next.set(action.contextKey, {
          ...conn,
          outOfTurnToolCalls: recordOutOfTurnToolCall(conn.outOfTurnToolCalls, {
            tool_call_id: action.tool_call_id,
            title: action.title,
            kind: action.kind,
            status: action.status,
            content: action.content,
            raw_input: action.raw_input,
            raw_output_chunks:
              action.raw_output !== null ? [action.raw_output] : [],
            raw_output_total_bytes: action.raw_output?.length ?? 0,
            locations: action.locations,
            meta: action.meta,
            images: action.images ?? [],
          }),
        })
        return next
      }
      const prev = ensureLiveMessage(conn.liveMessage)
      const existingIndex = prev.content.findIndex(
        (b) =>
          b.type === "tool_call" && b.info.tool_call_id === action.tool_call_id
      )
      let newContent: LiveContentBlock[]
      if (existingIndex !== -1) {
        const block = prev.content[existingIndex]
        if (block.type === "tool_call") {
          newContent = [
            ...prev.content.slice(0, existingIndex),
            {
              type: "tool_call",
              info: {
                ...block.info,
                title: action.title ?? block.info.title,
                kind: action.kind ?? block.info.kind,
                status: action.status ?? block.info.status,
                content: action.content ?? block.info.content,
                raw_input: action.raw_input ?? block.info.raw_input,
                raw_output_chunks:
                  action.raw_output !== null
                    ? [action.raw_output]
                    : block.info.raw_output_chunks,
                raw_output_total_bytes:
                  action.raw_output !== null
                    ? action.raw_output.length
                    : block.info.raw_output_total_bytes,
                images:
                  action.images !== null ? action.images : block.info.images,
              },
            },
            ...prev.content.slice(existingIndex + 1),
          ]
        } else {
          newContent = prev.content
        }
      } else {
        newContent = [
          ...prev.content,
          {
            type: "tool_call",
            info: {
              tool_call_id: action.tool_call_id,
              title: action.title,
              kind: action.kind,
              status: action.status,
              content: action.content,
              raw_input: action.raw_input,
              raw_output_chunks:
                action.raw_output !== null ? [action.raw_output] : [],
              raw_output_total_bytes: action.raw_output?.length ?? 0,
              locations: action.locations ?? null,
              meta: action.meta ?? null,
              images: action.images ?? [],
            },
          },
        ]
      }
      const nextLiveMessage = { ...prev, content: newContent }
      const nextInfo = findLiveToolCallInfo(newContent, action.tool_call_id)
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        liveMessage: nextLiveMessage,
        pendingPermission: mergePendingPermissionWithLiveInfo(
          conn.pendingPermission,
          nextInfo
        ),
        claudeApiRetry: null,
      })
      return next
    }

    case "TOOL_CALL_UPDATE": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      // Out-of-turn: stay out of `liveMessage` (see TOOL_CALL), but merge the
      // registry entry and backfill an open permission dialog waiting for
      // this tool's input — a background permission must still show its
      // command/diff details. In-turn ordering is safe: the panel flushes
      // pending tool-call updates at turn_complete BEFORE status flips back.
      if (conn.status !== "prompting") {
        const existing = conn.outOfTurnToolCalls?.get(action.tool_call_id)
        const merged: ToolCallInfo = existing
          ? {
              ...existing,
              title: action.title ?? existing.title,
              status: action.status ?? existing.status,
              content: action.content ?? existing.content,
              raw_input: action.raw_input ?? existing.raw_input,
              locations: action.locations ?? existing.locations,
              meta: action.meta ?? existing.meta,
              images: action.images !== null ? action.images : existing.images,
            }
          : {
              tool_call_id: action.tool_call_id,
              title: action.title ?? action.fallback_title,
              kind: action.fallback_kind,
              status: action.status ?? "pending",
              content: action.content,
              raw_input: action.raw_input,
              raw_output_chunks: [],
              raw_output_total_bytes: 0,
              locations: action.locations,
              meta: action.meta,
              images: action.images ?? [],
            }
        const next = new Map(state)
        next.set(action.contextKey, {
          ...conn,
          outOfTurnToolCalls: recordOutOfTurnToolCall(
            conn.outOfTurnToolCalls,
            merged
          ),
          pendingPermission: mergePendingPermissionWithLiveInfo(
            conn.pendingPermission,
            merged
          ),
        })
        return next
      }
      const prev = ensureLiveMessage(conn.liveMessage)
      const existingIndex = prev.content.findIndex(
        (b) =>
          b.type === "tool_call" && b.info.tool_call_id === action.tool_call_id
      )
      let newContent: LiveContentBlock[]

      if (existingIndex === -1) {
        const initialChunks =
          action.raw_output !== null ? [action.raw_output] : []
        const initialBytes = action.raw_output?.length ?? 0
        newContent = [
          ...prev.content,
          {
            type: "tool_call",
            info: {
              tool_call_id: action.tool_call_id,
              title: action.title ?? action.fallback_title,
              kind: action.fallback_kind,
              status:
                action.status ??
                (initialChunks.length > 0 ? "in_progress" : "pending"),
              content: action.content,
              raw_input: action.raw_input,
              raw_output_chunks: initialChunks,
              raw_output_total_bytes: initialBytes,
              locations: action.locations ?? null,
              meta: action.meta ?? null,
              images: action.images ?? [],
            },
          },
        ]
      } else {
        const block = prev.content[existingIndex]
        if (block.type !== "tool_call") return state

        let newChunks: string[]
        let newTotalBytes: number

        if (action.raw_output === null) {
          newChunks = block.info.raw_output_chunks
          newTotalBytes = block.info.raw_output_total_bytes
        } else if (action.raw_output_append) {
          newChunks = [...block.info.raw_output_chunks, action.raw_output]
          newTotalBytes =
            block.info.raw_output_total_bytes + action.raw_output.length

          // 超限时从头部批量移除 chunks（单次 slice 替代循环 shift）
          if (
            newTotalBytes > MAX_LIVE_TOOL_RAW_OUTPUT_CHARS &&
            newChunks.length > 1
          ) {
            let evictCount = 0
            let evictedBytes = 0
            while (
              evictCount < newChunks.length - 1 &&
              newTotalBytes - evictedBytes > MAX_LIVE_TOOL_RAW_OUTPUT_CHARS
            ) {
              evictedBytes += newChunks[evictCount].length
              evictCount++
            }
            if (evictCount > 0) {
              newChunks = newChunks.slice(evictCount)
              newTotalBytes -= evictedBytes
            }
          }
        } else {
          // 非 append 模式（替换）
          newChunks = [action.raw_output]
          newTotalBytes = action.raw_output.length
        }

        newContent = [
          ...prev.content.slice(0, existingIndex),
          {
            type: "tool_call" as const,
            info: {
              ...block.info,
              title: action.title ?? block.info.title,
              status: action.status ?? block.info.status,
              content: action.content ?? block.info.content,
              raw_input: action.raw_input ?? block.info.raw_input,
              raw_output_chunks: newChunks,
              locations: action.locations ?? block.info.locations,
              meta: action.meta ?? block.info.meta,
              raw_output_total_bytes: newTotalBytes,
              images:
                action.images !== null ? action.images : block.info.images,
            },
          },
          ...prev.content.slice(existingIndex + 1),
        ]
      }

      const nextLiveMessage = { ...prev, content: newContent }
      const nextInfo = findLiveToolCallInfo(newContent, action.tool_call_id)
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        liveMessage: nextLiveMessage,
        pendingPermission: mergePendingPermissionWithLiveInfo(
          conn.pendingPermission,
          nextInfo
        ),
        claudeApiRetry: null,
      })
      return next
    }

    case "BATCH_TOOL_CALL_UPDATES": {
      let current = state
      for (const sub of action.actions) {
        current = connectionsReducer(current, {
          type: "TOOL_CALL_UPDATE",
          ...sub,
        })
      }
      return current
    }

    case "PERMISSION_REQUEST": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      let updatedLiveMessage = conn.liveMessage
      const permissionCallId = extractPermissionToolCallId(action.tool_call)
      // Live tool context first; for an OUT-OF-TURN permission (background
      // sub-agent work — liveMessage intentionally untouched) fall back to
      // the out-of-turn registry so the dialog still shows command/diff.
      const existingInfo =
        (updatedLiveMessage
          ? findLiveToolCallInfo(updatedLiveMessage.content, permissionCallId)
          : null) ??
        (permissionCallId
          ? (conn.outOfTurnToolCalls?.get(permissionCallId) ?? null)
          : null)
      const permissionToolCall = mergePermissionToolCallWithLiveInfo(
        action.tool_call,
        existingInfo
      )
      const permissionToolInput =
        serializePermissionToolCall(permissionToolCall)
      if (
        updatedLiveMessage &&
        permissionCallId &&
        typeof permissionToolInput === "string"
      ) {
        const existingIndex = updatedLiveMessage.content.findIndex(
          (block) =>
            block.type === "tool_call" &&
            block.info.tool_call_id === permissionCallId
        )
        if (existingIndex !== -1) {
          const block = updatedLiveMessage.content[existingIndex]
          if (block.type === "tool_call") {
            const nextContent: LiveContentBlock[] = [
              ...updatedLiveMessage.content.slice(0, existingIndex),
              {
                type: "tool_call",
                info: {
                  ...block.info,
                  raw_input:
                    block.info.raw_input && block.info.raw_input.length > 0
                      ? block.info.raw_input
                      : permissionToolInput,
                },
              },
              ...updatedLiveMessage.content.slice(existingIndex + 1),
            ]
            updatedLiveMessage = {
              ...updatedLiveMessage,
              content: nextContent,
            }
          }
        } else {
          updatedLiveMessage = {
            ...updatedLiveMessage,
            content: [
              ...updatedLiveMessage.content,
              {
                type: "tool_call",
                info: {
                  tool_call_id: permissionCallId,
                  title:
                    extractPermissionToolTitle(action.tool_call) ??
                    action.fallback_title,
                  kind:
                    extractPermissionToolKind(action.tool_call) ??
                    action.fallback_kind,
                  status: "pending",
                  content: null,
                  raw_input: permissionToolInput,
                  raw_output_chunks: [],
                  raw_output_total_bytes: 0,
                  locations: null,
                  meta: null,
                  images: [],
                },
              },
            ],
          }
        }
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        liveMessage: updatedLiveMessage,
        pendingPermission: {
          request_id: action.request_id,
          tool_call: permissionToolCall,
          options: action.options,
          queued: action.queued,
        },
      })
      return next
    }

    case "PERMISSION_QUEUE_DEPTH": {
      // Depth-only: a request queued up behind the visible card, which emits no
      // PERMISSION_REQUEST of its own. No card up → nothing to annotate (a late
      // depth event after a drain must not resurrect one).
      const conn = state.get(action.contextKey)
      if (!conn?.pendingPermission) return state
      if (conn.pendingPermission.queued === action.depth) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingPermission: {
          ...conn.pendingPermission,
          queued: action.depth,
        },
      })
      return next
    }

    case "PERMISSION_CLEARED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (
        action.requestId !== undefined &&
        conn.pendingPermission?.request_id !== action.requestId
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingPermission: null,
      })
      return next
    }

    case "SET_PENDING_QUESTION": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingQuestion: action.pendingQuestion,
      })
      return next
    }

    case "CLEAR_PENDING_QUESTION": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingQuestion: null,
      })
      return next
    }

    case "SET_ASK_QUESTION": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingAskQuestion: action.pendingAskQuestion,
      })
      return next
    }

    case "CLEAR_ASK_QUESTION": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (
        action.questionId !== undefined &&
        conn.pendingAskQuestion?.question_id !== action.questionId
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingAskQuestion: null,
      })
      return next
    }

    case "SET_PLAN_APPROVAL": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingPlanApproval: action.pendingPlanApproval,
      })
      return next
    }

    case "CLEAR_PLAN_APPROVAL": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (
        action.approvalId !== undefined &&
        conn.pendingPlanApproval?.approval_id !== action.approvalId
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        pendingPlanApproval: null,
      })
      return next
    }

    case "SESSION_STARTED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        sessionId: action.sessionId,
      })
      return next
    }

    case "SESSION_MODES": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (sameModes(conn.modes, action.modes)) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        modes: action.modes,
      })
      return next
    }

    case "SESSION_CONFIG_OPTIONS": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (sameConfigOptions(conn.configOptions, action.configOptions)) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        configOptions: action.configOptions,
      })
      return next
    }

    case "CONFIG_STALE_CHANGED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const kind = action.stale ? action.kind : null
      // A fresh stale=true is a NEW drift → un-dismiss so the banner reappears
      // even if the user had dismissed a previous one. stale=false clears it.
      const dismissed = action.stale ? false : conn.configStaleDismissed
      if (
        conn.configStale === action.stale &&
        conn.configStaleKind === kind &&
        conn.configStaleDismissed === dismissed
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        configStale: action.stale,
        configStaleKind: kind,
        configStaleDismissed: dismissed,
      })
      return next
    }

    case "DISMISS_CONFIG_STALE": {
      const conn = state.get(action.contextKey)
      if (!conn || conn.configStaleDismissed) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        configStaleDismissed: true,
      })
      return next
    }

    case "SELECTORS_READY": {
      const conn = state.get(action.contextKey)
      if (!conn || conn.selectorsReady) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        selectorsReady: true,
      })
      return next
    }

    case "PROMPT_CAPABILITIES": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (
        samePromptCapabilities(
          conn.promptCapabilities,
          action.promptCapabilities
        )
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        promptCapabilities: action.promptCapabilities,
      })
      return next
    }

    case "FORK_SUPPORTED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      if (conn.supportsFork === action.supported) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        supportsFork: action.supported,
      })
      return next
    }

    case "MODE_CHANGED": {
      const conn = state.get(action.contextKey)
      if (!conn?.modes) return state
      if (conn.modes.current_mode_id === action.modeId) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        modes: {
          ...conn.modes,
          current_mode_id: action.modeId,
        },
      })
      return next
    }

    case "CONFIG_OPTION_CHANGED": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const options =
        conn.configOptions ??
        selectorsCache.get(conn.agentType)?.configOptions ??
        null
      if (!options) return state
      const idx = options.findIndex((o) => o.id === action.configId)
      if (idx === -1) return state
      const opt = options[idx]
      if (
        opt.kind.type !== "select" ||
        opt.kind.current_value === action.valueId
      ) {
        return state
      }
      const updated = [...options]
      updated[idx] = {
        ...opt,
        kind: { ...opt.kind, current_value: action.valueId },
      }
      const next = new Map(state)
      next.set(action.contextKey, { ...conn, configOptions: updated })
      return next
    }

    case "PLAN_UPDATE": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      // Same out-of-turn guard as TOOL_CALL / streaming deltas.
      if (conn.status !== "prompting") return state
      const prev = ensureLiveMessage(conn.liveMessage)
      const nonPlanContent = prev.content.filter(
        (block) => block.type !== "plan"
      )
      const currentPlan = [...prev.content]
        .reverse()
        .find((block): block is { type: "plan"; entries: PlanEntryInfo[] } => {
          return block.type === "plan"
        })

      if (
        action.entries.length === 0 &&
        currentPlan === undefined &&
        nonPlanContent.length === prev.content.length
      ) {
        return state
      }

      const isAlreadyCanonicalPlan =
        currentPlan !== undefined &&
        samePlanEntries(currentPlan.entries, action.entries) &&
        prev.content.length === nonPlanContent.length + 1 &&
        prev.content[prev.content.length - 1]?.type === "plan"

      if (isAlreadyCanonicalPlan) return state

      const newContent =
        action.entries.length === 0
          ? nonPlanContent
          : [
              ...nonPlanContent,
              { type: "plan" as const, entries: action.entries },
            ]

      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        liveMessage: { ...prev, content: newContent },
        claudeApiRetry: null,
      })
      return next
    }

    case "CLAUDE_API_RETRY": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        claudeApiRetry: action.retry,
      })
      return next
    }

    case "SESSION_FAILURE": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const merged = upsertSessionFailure(conn.sessionFailures, action.record)
      // Stale/replayed upserts are rejected by reference — no re-render.
      if (merged === conn.sessionFailures) return state
      const next = new Map(state)
      next.set(action.contextKey, { ...conn, sessionFailures: merged })
      return next
    }

    case "SETTLE_SESSION_FAILURES": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const settled = settleSessionFailures(conn.sessionFailures, action.scope)
      // Nothing needed settling — same reference, no re-render.
      if (settled === conn.sessionFailures) return state
      const next = new Map(state)
      next.set(action.contextKey, { ...conn, sessionFailures: settled })
      return next
    }

    case "DISMISS_SESSION_FAILURES": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const dismissed = dismissSessionFailures(conn.sessionFailures, action.ids)
      // Unknown ids / already resolved — same reference, no re-render.
      if (dismissed === conn.sessionFailures) return state
      const next = new Map(state)
      next.set(action.contextKey, { ...conn, sessionFailures: dismissed })
      return next
    }

    case "ERROR": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        claudeApiRetry: null,
        error: action.message,
      })
      return next
    }

    case "ACP_LOAD_ERROR": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        loadError: action.message,
        loadErrorCommand: action.command ?? null,
      })
      return next
    }

    case "CLEAR_ACP_LOAD_ERROR": {
      const conn = state.get(action.contextKey)
      if (!conn || (conn.loadError === null && conn.loadErrorCommand === null))
        return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        loadError: null,
        loadErrorCommand: null,
      })
      return next
    }

    case "AVAILABLE_COMMANDS": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      const commands = dedupeCommandsByName(action.commands)
      if (sameCommands(conn.availableCommands, commands)) return state
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        availableCommands: commands,
      })
      return next
    }

    case "USAGE_UPDATE": {
      const conn = state.get(action.contextKey)
      if (!conn) return state
      // Ignore usage updates that reset used to 0 when we already have
      // valid data — these come from synthetic responses for local commands
      // like /context and would overwrite the real context window usage.
      if (action.usage.used === 0 && conn.usage && conn.usage.used > 0) {
        return state
      }
      if (
        conn.usage?.used === action.usage.used &&
        conn.usage?.size === action.usage.size
      ) {
        return state
      }
      const next = new Map(state)
      next.set(action.contextKey, {
        ...conn,
        usage: action.usage,
      })
      return next
    }

    default:
      return state
  }
}

// ── Selectors cache mutation API（provider 侧写入口） ──
// selectorsCache 仍在模块内私有;provider 经这三个窄函数写缓存,避免
// 把可变 Map 直接暴露出去。

export function cacheSessionModes(
  agentType: string,
  modes: import("@/lib/types").SessionModeStateInfo | null
): void {
  const entry = selectorsCache.get(agentType) ?? {
    modes: null,
    configOptions: null,
  }
  entry.modes = modes
  selectorsCache.set(agentType, entry)
}

export function cacheSessionConfigOptions(
  agentType: string,
  configOptions: import("@/lib/types").SessionConfigOptionInfo[] | null
): void {
  const entry = selectorsCache.get(agentType) ?? {
    modes: null,
    configOptions: null,
  }
  entry.configOptions = configOptions
  selectorsCache.set(agentType, entry)
}

export function cacheSelectorsIfAbsent(
  agentType: string,
  snapshot: {
    modes: import("@/lib/types").SessionModeStateInfo | null
    configOptions: import("@/lib/types").SessionConfigOptionInfo[] | null
  }
): void {
  if (selectorsCache.has(agentType)) return
  selectorsCache.set(agentType, snapshot)
}
