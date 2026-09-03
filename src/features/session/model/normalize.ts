/**
 * 归一化映射表（设计 §12.3）——唯一允许知道源事件方言的地方。
 *
 * 纯函数：EventEnvelope（src/lib/types.ts 的 wire 形状）→ 领域
 * SessionEvent（core/domain/session-event.ts）。未知事件返回 null
 * （丢弃 + 由调用方计数，绝不崩）。新 harness 只需再写一张表。
 *
 * 本文件实现的映射表（§12.3 原表 → 真实 wire 词表）：
 *
 * | 源事件（EventEnvelope.type）                | SessionEvent            |
 * |---------------------------------------------|-------------------------|
 * | status_changed(status="prompting")          | turn-started            |
 * | user_message                                | part-appended(text,user)|
 * | content_delta                               | part-appended(text)     |
 * | thinking                                    | part-appended(reasoning)|
 * | tool_call                                   | part-appended(tool-call)|
 * | tool_call_update                            | part-updated(tool-call) |
 * | plan_update / usage_update / available_commands / session_modes / | part-appended(custom) |
 * | session_config_options / mode_changed / prompt_capabilities /     |                       |
 * | fork_supported / selectors_ready            |                         |
 * | permission_request                          | permission-requested(tool) |
 * | question_request                            | permission-requested(question) |
 * | plan_approval_request                       | permission-requested(plan-approval) |
 * | permission_resolved / question_resolved /   | permission-resolved     |
 * | plan_approval_resolved                      |                         |
 * | conversation_status_changed                 | status-changed          |
 * | turn_complete                               | turn-completed          |
 * | error / turn_retrying / session_load_failed | session-error           |
 * | LiveSessionSnapshot（attach 帧）            | snapshot-hydrated       |
 * | 其余（见 envelopeToSessionEvent default）    | null（丢弃）            |
 *
 * 与 §12.3 原表的两处落地偏差（wire 词表里没有对应事件）：
 * 1. 「session_request/chat started（turn 开始类）」：wire 里轮次开始的
 *    真实信号是 status_changed → "prompting"（新一轮 prompt 生效），
 *    据此发 turn-started；session_started 是会话级事实（只带 session_id），
 *    归 null。
 * 2. 「process_exit」：进程退出在 wire 上走 error 事件的
 *    code="process_exited"，并入 session-error 行。
 */
import type {
  ConversationStatus,
  ID,
  ISOString,
  MessagePart,
  PermissionOption,
  PermissionRequest,
  SessionEvent,
  SessionSnapshot,
  ToolCallPart,
  ToolCallState,
  Turn,
  TurnRole,
} from "@/core/domain"
import type {
  EventEnvelope,
  LiveContentBlock,
  LiveSessionSnapshot,
  MessageRole,
  PermissionOptionInfo,
  ToolCallOutput,
  ToolCallState as WireToolCallState,
  UserMessageBlock,
} from "@/lib/types"

// ─── 扩展类型（core 接口缺口，按任务约束在新文件里补，不改 core） ───

/**
 * 接口缺口 1：core 的 part-appended 不带 role（§5.3），而 §12.3 第 2 行
 * 要求 user_message 回显落在「role=user」的轮上。user 轮与 assistant 轮
 * 的 turnId 锚不同（见 userTurnId），reducer 可直接按 turnId 分流；本扩展
 * 字段给需要显式判别的消费方用（`event.role === "user"`）。
 */
export interface UserPartAppendedEvent extends Extract<
  SessionEvent,
  { type: "part-appended" }
> {
  role: "user"
}

// ─── 基础工具 ───

/**
 * TODO（wire 缺口）：EventEnvelope 不携带时间戳（只有 seq），而领域
 * Turn.startedAt / turn-completed.completedAt / 权限 createdAt 都是必填。
 * 保守映射为归一化时刻的时钟读数；后端补上 envelope 时间戳后替换。
 */
function nowIso(): ISOString {
  return new Date().toISOString()
}

/** 保守解析：raw_input/raw_output 可能是 JSON 串也可能是纯文本。 */
function parseMaybeJson(raw: string | null | undefined): unknown {
  if (raw == null || raw === "") return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/** 从 permission_request 的 raw tool_call（unknown）里保守取展示标题。 */
function permissionTitle(toolCall: unknown): string {
  if (!toolCall || typeof toolCall !== "object") return ""
  const record = toolCall as Record<string, unknown>
  for (const key of ["title", "tool_name", "toolName", "name"]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return ""
}

// ─── turnId 归属（保守映射） ───

/**
 * TODO（领域缺口）：wire 事件不携带 turn id（ACP 只有 connection 粒度的
 * live message）。保守锚定：assistant 轮 = 每连接一个「live 轮」，
 * turn-started（prompting）重置它、turn-completed 结束它。跨轮的持久
 * transcript 轮 id 由 F3 reducer 在 turn-completed 时重键（如追加 seq）。
 */
function liveTurnId(env: EventEnvelope): ID {
  return `live:${env.connection_id}`
}

/** user_message 回显的 user 轮锚（message_id 天然唯一）。 */
function userTurnId(env: EventEnvelope, messageId: string): ID {
  return `user:${env.connection_id}:${messageId}`
}

// ─── 状态映射 ───

/** wire ToolCallStatus（事件与快照共用，事件侧宽类型为 string）→ 领域状态。 */
function wireToolStatusToState(status: string): ToolCallState {
  switch (status) {
    case "completed":
      return "result"
    case "failed":
      return "error"
    default:
      // pending / in_progress —— §12.3 首次 tool_call 即 running
      return "running"
  }
}

/**
 * wire ConnectionStatus（连接级）→ 领域 ConversationStatus（会话级）。
 * TODO（保守）：快照只带连接状态。prompting/connecting/connected 一律
 * 视为进行中；断开视作已完成、连接错误视作已取消——两者在 wire 上
 * 无法与「用户取消」区分，后端补会话级状态后替换。
 */
function connectionStatusToConversation(status: string): ConversationStatus {
  switch (status) {
    case "disconnected":
      return "completed"
    case "error":
      return "cancelled"
    default:
      return "in_progress"
  }
}

/** wire MessageRole → 领域 TurnRole（"tool" 无对应，保守归 assistant）。 */
function roleToTurnRole(role: MessageRole): TurnRole {
  if (role === "user" || role === "system") return role
  return "assistant"
}

/**
 * 连接级 error code → fatal 归类。连接级家族（进程退出 / 启动失败等）
 * 会话不可继续，fatal=true；turn_failed_* 只终止当轮，fatal=false。
 * code 为 null（旧后端）时保守视为非致命。
 */
const FATAL_ERROR_CODES = new Set([
  "initialize_timeout",
  "mcp_rejected_by_agent",
  "sdk_not_installed",
  "platform_not_supported",
  "process_exited",
  "spawn_failed",
  "download_failed",
  "grok_model_switch_incompatible_agent",
])

// ─── 权限载荷映射 ───

function toPermissionOptions(
  options: PermissionOptionInfo[]
): PermissionOption[] {
  return options.map((option) => ({
    optionId: option.option_id,
    name: option.name,
    kind: option.kind,
    meta: option.meta ?? null,
  }))
}

/**
 * TODO（领域缺口）：wire 事件不带 conversation_id（快照才有），而领域
 * PermissionRequest.conversationId 必填。保守以 connection_id 充当，
 * F3 挂接 UI 时用快照 / conversation_linked 校正。
 */
function permissionConversationId(env: EventEnvelope): ID {
  return env.connection_id
}

// ─── 消息块映射 ───

/**
 * TODO（领域缺口）：MessagePart 联合没有 image 变体（§5.2）。文本块
 * 优先合并为一个 text part；纯图片消息把首图降级为 custom part，
 * 其余图片丢弃，待 part 联合扩展后恢复。
 */
function userMessagePart(blocks: UserMessageBlock[]): MessagePart | null {
  const texts = blocks
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
  if (texts.length > 0) {
    return { type: "text", text: texts.join("\n") }
  }
  const image = blocks.find(
    (block): block is Extract<UserMessageBlock, { type: "image" }> =>
      block.type === "image"
  )
  if (image) {
    return {
      type: "custom",
      partType: "image",
      data: { data: image.data, mimeType: image.mime_type },
    }
  }
  return null
}

function wireOutputToDomain(output: ToolCallOutput | null): unknown {
  if (!output) return undefined
  switch (output.kind) {
    case "text":
      return output.content
    case "json":
      return output.value
    case "error":
      // error 文本走 ToolCallPart.error，不占 output
      return undefined
  }
}

/** 快照侧 ToolCallState → 领域 ToolCallPart。 */
function wireToolCallToPart(state: WireToolCallState): ToolCallPart {
  const partState = wireToolStatusToState(state.status)
  return {
    type: "tool-call",
    toolName: state.label || state.kind,
    state: partState,
    toolCallId: state.id,
    input: state.input ?? undefined,
    output: wireOutputToDomain(state.output),
    error:
      partState === "error"
        ? state.output?.kind === "error"
          ? state.output.message
          : (state.content ?? undefined)
        : undefined,
  }
}

/** 快照侧 LiveContentBlock → 领域 MessagePart。 */
function liveBlockToPart(
  block: LiveContentBlock,
  toolCalls: WireToolCallState[]
): MessagePart | null {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text }
    case "thinking":
      return { type: "reasoning", text: block.text, collapsed: true }
    case "tool_call_ref": {
      const toolCall = toolCalls.find((tc) => tc.id === block.tool_call_id)
      // 快照里的引用理论上必命中 active_tool_calls；防御性兜底走 custom
      return toolCall
        ? wireToolCallToPart(toolCall)
        : {
            type: "custom",
            partType: "tool_call_ref",
            data: { tool_call_id: block.tool_call_id },
          }
    }
    case "plan":
      return { type: "custom", partType: "plan", data: block.entries }
  }
}

// ─── 核心：envelope → SessionEvent ───

/**
 * §12.3 映射表的实现入口。纯函数、无副作用；未知（或本表明确丢弃的）
 * 事件返回 null，由调用方计数丢弃。
 */
export function envelopeToSessionEvent(
  env: EventEnvelope
): SessionEvent | null {
  switch (env.type) {
    // ── 轮次 ──
    case "status_changed":
      // wire 没有 session_request；turn 开始类信号 = prompting 生效
      // （非 prompting 的连接状态是传输级事实，快照 .status 已覆盖）
      if (env.status !== "prompting") return null
      return {
        type: "turn-started",
        turn: {
          id: liveTurnId(env),
          role: "assistant",
          parts: [],
          startedAt: nowIso(),
        },
      }

    case "user_message": {
      const part = userMessagePart(env.blocks)
      if (!part) return null
      const event: UserPartAppendedEvent = {
        type: "part-appended",
        turnId: userTurnId(env, env.message_id),
        part,
        role: "user",
      }
      return event
    }

    case "content_delta":
      // 流式增量按追加处理（§12.3：appended / updated 二选一取 appended）
      return {
        type: "part-appended",
        turnId: liveTurnId(env),
        part: { type: "text", text: env.text },
      }

    case "thinking":
      return {
        type: "part-appended",
        turnId: liveTurnId(env),
        part: { type: "reasoning", text: env.text, collapsed: true },
      }

    case "tool_call": {
      const state = wireToolStatusToState(env.status)
      return {
        type: "part-appended",
        turnId: liveTurnId(env),
        part: {
          type: "tool-call",
          toolName: env.title || env.kind,
          state,
          toolCallId: env.tool_call_id,
          input: parseMaybeJson(env.raw_input),
          output: parseMaybeJson(env.raw_output),
          error:
            state === "error"
              ? (env.content ?? env.raw_output ?? undefined)
              : undefined,
        },
      }
    }

    case "tool_call_update": {
      // TODO（wire 缺口）：wire 的 null 字段语义是「保留原值」，
      // part-updated 却是整段替换——F3 reducer 需按 toolCallId 与旧 part
      // 合并（raw_output_append 也在那边拼接）。
      const state = env.status ? wireToolStatusToState(env.status) : "running"
      const output =
        env.raw_output != null
          ? parseMaybeJson(env.raw_output)
          : (env.content ?? undefined)
      return {
        type: "part-updated",
        turnId: liveTurnId(env),
        part: {
          type: "tool-call",
          // title 为 null 时由 reducer 沿用旧值；此处无法取旧值
          toolName: env.title ?? "",
          state,
          toolCallId: env.tool_call_id,
          input: parseMaybeJson(env.raw_input),
          output,
          error:
            state === "error"
              ? (env.content ?? env.raw_output ?? undefined)
              : undefined,
        },
      }
    }

    // ── UI 级透传（§12.3「plan/available_update 等 UI 级」，原样载荷） ──
    case "plan_update":
      return customPartEvent(env, "plan_update", env.entries)
    case "usage_update":
      return customPartEvent(env, "usage_update", {
        used: env.used,
        size: env.size,
      })
    case "available_commands":
      return customPartEvent(env, "available_commands", env.commands)
    case "session_modes":
      return customPartEvent(env, "session_modes", env.modes)
    case "session_config_options":
      return customPartEvent(env, "session_config_options", env.config_options)
    case "mode_changed":
      return customPartEvent(env, "mode_changed", { mode_id: env.mode_id })
    case "prompt_capabilities":
      return customPartEvent(
        env,
        "prompt_capabilities",
        env.prompt_capabilities
      )
    case "fork_supported":
      return customPartEvent(env, "fork_supported", {
        supported: env.supported,
      })
    case "selectors_ready":
      return customPartEvent(env, "selectors_ready", null)

    // ── 中途交互（权限 / 问询 / 计划审批） ──
    case "permission_request":
      return {
        type: "permission-requested",
        request: {
          type: "tool",
          id: env.request_id,
          conversationId: permissionConversationId(env),
          title: permissionTitle(env.tool_call),
          options: toPermissionOptions(env.options),
          queuedCount: env.queued,
          // TODO（wire 缺口）：事件不带 created_at（快照的
          // PendingPermissionState 才有），保守取归一化时刻
          createdAt: nowIso(),
        },
      }

    case "question_request":
      return {
        type: "permission-requested",
        request: {
          type: "question",
          id: env.question_id,
          conversationId: permissionConversationId(env),
          questions: env.questions.map((question) => ({
            questionId: question.id,
            question: question.question,
            header: question.header,
            multiSelect: question.multi_select,
            options: question.options.map((option) => ({
              label: option.label,
              description: option.description ?? null,
            })),
            isSecret: question.is_secret,
          })),
          createdAt: nowIso(),
        },
      }

    case "plan_approval_request":
      return {
        type: "permission-requested",
        request: {
          type: "plan-approval",
          id: env.approval_id,
          conversationId: permissionConversationId(env),
          planMarkdown: env.plan_markdown,
          createdAt: nowIso(),
        },
      }

    case "permission_resolved":
    case "question_resolved":
    case "plan_approval_resolved":
      // TODO（wire 缺口）：三个 resolution 事件都不广播结果（outcome），
      // 领域 permission-resolved 也只有 requestId——两侧一致，无法补。
      // 三个变体的 id 字段名不同（request_id/question_id/approval_id），
      // 统一收敛到 requestId。
      return {
        type: "permission-resolved",
        requestId:
          env.type === "permission_resolved"
            ? env.request_id
            : env.type === "question_resolved"
              ? env.question_id
              : env.approval_id,
      }

    // ── 状态 / 收尾 / 错误 ──
    case "conversation_status_changed":
      // wire 的 ConversationStatus 与领域四值联合一一对应
      return {
        type: "status-changed",
        conversationId: String(env.conversation_id),
        status: env.status,
      }

    case "turn_complete":
      // TODO（wire 缺口）：turn_complete 只带 stop_reason，不带用量 /
      // 时长；usage 保守置 null（usage_update 是上下文窗用量，≠ 轮用量）
      return {
        type: "turn-completed",
        turnId: liveTurnId(env),
        completedAt: nowIso(),
        usage: null,
      }

    case "error":
      return {
        type: "session-error",
        message: env.message,
        code: env.code ?? undefined,
        fatal: env.code != null && FATAL_ERROR_CODES.has(env.code),
      }

    case "turn_retrying":
      // 可重试的轮内瞬态错误（见 lib/types.ts turn_retrying 注释），
      // 不是 turn 失败——fatal=false，UI 渲染为重试指示
      return {
        type: "session-error",
        message: env.message,
        fatal: false,
      }

    case "session_load_failed":
      // 会话加载失败（不存在 / 进程已死 / 已归档）：会话不可继续
      return {
        type: "session-error",
        message: env.message,
        code: env.code,
        fatal: true,
      }

    default:
      // 丢弃清单（§12.3「未知事件」行 + 有明确理由的已知事件）：
      // - claude_sdk_message / background_activity / delegation_* /
      //   feedback_*：子代理与后台归约，F3 reducer 的事
      // - permission_queue_depth：只更新排队深度，纯函数无法回填
      //   当前请求的 queuedCount（runtime 的 permissions 通道在 F3 补）
      // - session_started：会话级事实（session_id 就位），非轮次开始
      // - conversation_linked / native_session_title / user_prompt_sent：
      //   产品级 / 后端侧事实，走 EventChannel（§4.1）
      // - session_failure / config_option_rejected / session_config_stale：
      //   UI 横幅态，快照可恢复
      // - 防御：未来新增的 wire 事件类型同样落入此处，绝不崩
      return null
  }
}

function customPartEvent(
  env: EventEnvelope,
  partType: string,
  data: unknown
): SessionEvent {
  return {
    type: "part-appended",
    turnId: liveTurnId(env),
    part: { type: "custom", partType, data },
  }
}

// ─── 快照水合 ───

/** LiveSessionSnapshot → 领域 SessionSnapshot（§5.3 snapshot-hydrated 载荷）。 */
export function snapshotToSessionSnapshot(
  snapshot: LiveSessionSnapshot
): SessionSnapshot {
  const connectionId = snapshot.connection_id
  const turns: Turn[] = []

  if (snapshot.pending_user_message) {
    const parts: MessagePart[] = snapshot.pending_user_message.blocks.map(
      (block) =>
        block.type === "text"
          ? { type: "text", text: block.text }
          : {
              type: "custom",
              partType: "image",
              data: { data: block.data, mimeType: block.mime_type },
            }
    )
    turns.push({
      id: `user:${connectionId}:${snapshot.pending_user_message.message_id}`,
      role: "user",
      parts,
      // TODO（wire 缺口）：pending_user_message 无 created_at
      startedAt: nowIso(),
    })
  }

  if (snapshot.live_message) {
    turns.push({
      id: `live:${connectionId}`,
      role: roleToTurnRole(snapshot.live_message.role),
      parts: snapshot.live_message.content
        .map((block) => liveBlockToPart(block, snapshot.active_tool_calls))
        .filter((part): part is MessagePart => part !== null),
      startedAt: snapshot.live_message.started_at,
    })
  }

  const pendingPermissions: PermissionRequest[] = []
  if (snapshot.pending_permission) {
    const pending = snapshot.pending_permission
    pendingPermissions.push({
      type: "tool",
      id: pending.request_id,
      // TODO（同 envelope 侧缺口）：快照里 conversation_id 可能为 null
      // （连接尚未链接到会话行），保守退回 connection_id
      conversationId:
        snapshot.conversation_id != null
          ? String(snapshot.conversation_id)
          : connectionId,
      title: permissionTitle(pending.tool_call),
      options: toPermissionOptions(pending.options),
      queuedCount: pending.queued,
      createdAt: pending.created_at,
    })
  }
  if (snapshot.pending_question) {
    const pending = snapshot.pending_question
    pendingPermissions.push({
      type: "question",
      id: pending.question_id,
      conversationId:
        snapshot.conversation_id != null
          ? String(snapshot.conversation_id)
          : connectionId,
      questions: pending.questions.map((question) => ({
        questionId: question.id,
        question: question.question,
        header: question.header,
        multiSelect: question.multi_select,
        options: question.options.map((option) => ({
          label: option.label,
          description: option.description ?? null,
        })),
        isSecret: question.is_secret,
      })),
      createdAt: pending.created_at,
    })
  }
  if (snapshot.pending_plan_approval) {
    const pending = snapshot.pending_plan_approval
    pendingPermissions.push({
      type: "plan-approval",
      id: pending.approval_id,
      conversationId:
        snapshot.conversation_id != null
          ? String(snapshot.conversation_id)
          : connectionId,
      planMarkdown: pending.plan_markdown,
      createdAt: pending.created_at,
    })
  }

  return {
    // TODO（wire 缺口）：conversation_id 为 null（未链接）时退回
    // connection_id，F3 挂接时用 conversation_linked 校正
    conversationId:
      snapshot.conversation_id != null
        ? String(snapshot.conversation_id)
        : connectionId,
    status: connectionStatusToConversation(snapshot.status),
    turns,
    pendingPermissions,
    lastEventSeq: snapshot.event_seq,
  }
}

/** 快照帧 → snapshot-hydrated 事件（§12.3 最后一行）。 */
export function snapshotToHydration(
  snapshot: LiveSessionSnapshot
): SessionEvent {
  return {
    type: "snapshot-hydrated",
    snapshot: snapshotToSessionSnapshot(snapshot),
  }
}
