/**
 * CodegRustSessionRuntime —— SessionRuntime 的 CodegRust 后端实现（§12）。
 *
 * 包住现有命令面（acp_preflight / acp_connect / acp_prompt / acp_cancel /
 * acp_respond_permission / acp_get_session_snapshot…）与现有事件通道
 * （attach 协议 + legacy firehose），把它们翻译成 §5.3 的 SessionEvent。
 * 纯 TS 类（非 React），单测用 mock transport。
 *
 * 时序与去重语义全部取自 acp-connections-context.tsx 的既有行为（F3 挂接
 * UI 后该 context 删除）：
 * - connect：preflight → connect → waitForReady → attach（§12.2）
 * - 「先快照后增量」：legacy 路径先订 firehose 缓冲、再取快照水合、
 *   最后排空缓冲（acp-connections-context.tsx:5312-5369）
 * - seq 去重：seq <= lastAppliedSeq 的信封直接丢弃（同文件 :4262 与
 *   :4506-4509 的守卫）；游标在事件生效后推进（:4518-4524）
 * - attach onDetached(lagged/server_shutdown) 携当前游标重挂（:4408-4423）
 */
import type {
  ComposerInput,
  SessionRuntime,
  SessionSpec,
} from "@/core/ports/session-runtime"
import type {
  Subscribable,
  Transport,
  UnsubscribeFn,
} from "@/core/ports/transport"
import type {
  AttachDetachReason,
  AttachHandlers,
  EventStream,
  EventStreamSubscription,
} from "@/core/transport/types"
import type {
  ID,
  PermissionAnswer,
  PermissionRequest,
  SessionEvent,
  SessionSnapshot,
} from "@/core/domain"
import type {
  EventEnvelope,
  LiveSessionSnapshot,
  PreflightResult,
  PromptInputBlock,
} from "@/lib/types"
import {
  envelopeToSessionEvent,
  snapshotToHydration,
  snapshotToSessionSnapshot,
} from "./model/normalize"

/**
 * 接口缺口（不改 core 文件，在此扩展）：core/ports 的 Transport 没有
 * attach 协议入口 eventStream()（core/transport/types.ts:151 有）。
 * core 补上后本别名可直接删除。
 */
export type AttachCapableTransport = Transport & {
  eventStream?(): EventStream
}

/** 构造注入项（§12.2：transport + contextKey 解析）。 */
export interface CodegRustSessionRuntimeOptions {
  transport: AttachCapableTransport
  /**
   * 把 SessionSpec 解析为前端侧的 contextKey（acp-connections-context
   * 语境里的 per-surface 路由键）。缺省用 `${harnessId}@${cwd}` 加续接
   * 后缀；runtime 用它做诊断标注（日志 / 错误消息）。
   */
  resolveContextKey?: (spec: SessionSpec) => string
}

/** runtime 侧结构化错误（connect/restore 拒绝原因）。 */
export class SessionRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "SessionRuntimeError"
  }
}

function defaultContextKey(spec: SessionSpec): string {
  const base = `${spec.harnessId}@${spec.cwd}`
  return spec.resumeConversationId
    ? `${base}#${spec.resumeConversationId}`
    : base
}

/**
 * SessionRuntime 的 CodegRust 实现。
 *
 * 一个实例服务一条会话连接（接口是单会话形状：connect/send/cancel 都
 * 作用于当前连接）。事件通道只保证「先快照后增量」的顺序与 seq 单调，
 * 不做状态归约（那是 F3 model 层的事）。
 */
export class CodegRustSessionRuntime implements SessionRuntime {
  private readonly transport: AttachCapableTransport
  private readonly resolveContextKey: (spec: SessionSpec) => string

  /** 连接代数：connect/disconnect 竞态时作废在途流程。 */
  private generation = 0
  private connectionId: string | null = null
  private contextKey: string | null = null
  /** 已应用的最高 seq；undefined = 尚未建立基线（冷启动）。 */
  private lastAppliedSeq: number | undefined
  private attachSub: EventStreamSubscription | null = null
  private firehoseUnsub: UnsubscribeFn | null = null
  private reconnectUnsub: UnsubscribeFn | null = null
  /** legacy firehose 模式下，快照返回前排队的信封（先快照后增量）。 */
  private pendingFirehoseEvents: EventEnvelope[] = []
  private firehoseSnapshotApplied = false

  private readonly eventListeners = new Set<(event: SessionEvent) => void>()
  private readonly permissionListeners = new Set<
    (requests: PermissionRequest[]) => void
  >()
  private pendingPermissions = new Map<ID, PermissionRequest>()

  /** 被丢弃的未知类型信封计数（诊断用，§12.3「丢弃 + 计数」）。 */
  droppedEventCount = 0

  readonly events: Subscribable<SessionEvent> = {
    subscribe: (listener) => {
      this.eventListeners.add(listener)
      return () => {
        this.eventListeners.delete(listener)
      }
    },
  }

  readonly permissions: Subscribable<PermissionRequest[]> = {
    subscribe: (listener) => {
      this.permissionListeners.add(listener)
      listener(this.currentPermissions())
      return () => {
        this.permissionListeners.delete(listener)
      }
    },
  }

  constructor(options: CodegRustSessionRuntimeOptions) {
    this.transport = options.transport
    this.resolveContextKey = options.resolveContextKey ?? defaultContextKey
  }

  /** 当前会话的 contextKey（诊断 / 测试用）。 */
  get activeContextKey(): string | null {
    return this.contextKey
  }

  // ── F3 挂接：adopt 模式（provider 命令路由的过渡缝）──

  /**
   * 绑定一条「外部建立」的后端连接，只承接命令路由（sendPrompt /
   * cancel / respondPermission 直达该 connectionId）。F3 把 provider
   * （features/session/provider.tsx）的连接生命周期整体迁入
   * features/session 时沿用其既有的 connect / viewer 发现 / delegation
   * attach 接线——事件流仍由那条接线供养 UI store；事件消费迁入
   * runtime 是绞杀者的后续切片。幂等：后一次 adopt 覆盖前一次
   * （REKEY_CONNECTION 后 provider 会以新键重新 adopt）。
   */
  adopt(options: { connectionId: string; contextKey: string }): void {
    this.connectionId = options.connectionId
    this.contextKey = options.contextKey
  }

  /**
   * F3 过渡命令面：composer 真实形状的 prompt——结构化 blocks 加
   * DB 链接字段（folder/conversation/clientMessageId），§4.1 的
   * `send(ComposerInput)` 归一化入口保持不变。
   */
  async sendPrompt(
    blocks: PromptInputBlock[],
    opts?: {
      folderId?: number | null
      conversationId?: number | null
      clientMessageId?: string | null
    }
  ): Promise<void> {
    const connectionId = this.requireConnection()
    await this.transport.call("acp_prompt", {
      connectionId,
      blocks,
      folderId: opts?.folderId ?? null,
      conversationId: opts?.conversationId ?? null,
      clientMessageId: opts?.clientMessageId ?? null,
    })
  }

  // ── 生命周期 ──

  async connect(spec: SessionSpec): Promise<void> {
    const generation = ++this.generation
    // 重复 connect：拆掉旧会话的前端订阅与后端连接（后端按
    // (agent, cwd, session) 去重，best-effort 断开即可）
    const previousConnectionId = this.connectionId
    this.teardownSubscriptions()
    this.clearSessionState()
    if (previousConnectionId) {
      void this.transport
        .call("acp_disconnect", { connectionId: previousConnectionId })
        .catch(() => {})
    }
    this.contextKey = this.resolveContextKey(spec)

    // 1. preflight：harness 二进制不可用则快速失败（会话页不触发下载）
    const preflight = await this.transport.call<PreflightResult>(
      "acp_preflight",
      { agentType: spec.harnessId, forceRefresh: null }
    )
    if (!preflight.passed) {
      throw new SessionRuntimeError(
        "PREFLIGHT_FAILED",
        `harness ${spec.harnessId} failed preflight`
      )
    }
    if (generation !== this.generation) return

    // 2. 建立后端连接
    // TODO（接口缺口）：SessionSpec 只有 resumeConversationId（会话行 id），
    // 而 acp_connect 的 sessionId 是 agent 侧外部 session id——保守直通，
    // F3 挂接时经会话详情解析出真实外部 id 再传入。
    const connectionId = await this.transport.call<string>("acp_connect", {
      agentType: spec.harnessId,
      workingDir: spec.cwd,
      sessionId: spec.resumeConversationId ?? null,
      preferredModeId: null,
      // TODO（接口缺口）：SessionSpec.env 语义未定（环境变量 ≠ 配置值），
      // 暂不映射到 preferredConfigValues
      preferredConfigValues: null,
    })
    if (generation !== this.generation) {
      // connect 期间被 disconnect / 新 connect 取代：拆掉本次建立的连接
      void this.transport
        .call("acp_disconnect", { connectionId })
        .catch(() => {})
      return
    }
    this.connectionId = connectionId

    // 3. web 模式时序：等 server 侧广播接收器就绪，避免 connect 后立刻
    //    发出的首批事件落进 receiver_count == 0 的丢弃窗口
    //    （web-transport.ts:209-218 的同一理由）
    await this.transport.waitForReady?.()
    if (generation !== this.generation) return

    // 4. 事件通道：优先 attach 协议（快照/重放/重连全部带内）
    const stream = this.transport.eventStream?.()
    if (stream) {
      this.attachSub = stream.attach(
        connectionId,
        { sinceSeq: undefined },
        this.attachHandlers(stream)
      )
    } else {
      // legacy firehose（Tauri 桌面 / 远程桌面）：订阅 + HTTP 快照，
      // 「先快照后增量」顺序见 connectViaFirehose
      await this.connectViaFirehose(connectionId, generation)
      if (generation !== this.generation) return
    }

    // 5. 断线恢复钩子（§7）：重连后按模式重挂 / 重取快照
    this.reconnectUnsub =
      this.transport.onReconnect?.(() => this.handleReconnect()) ?? null
  }

  async disconnect(): Promise<void> {
    this.generation++
    const connectionId = this.connectionId
    this.teardownSubscriptions()
    this.clearSessionState()
    this.notifyPermissions()
    if (!connectionId) return
    // 幂等：连接已不在后端时吞掉错误
    try {
      await this.transport.call("acp_disconnect", { connectionId })
    } catch (err) {
      console.warn(
        `[session-runtime] acp_disconnect for ${connectionId} failed:`,
        err
      )
    }
  }

  // ── 输入 ──

  async send(input: ComposerInput): Promise<void> {
    const connectionId = this.requireConnection()
    const blocks: PromptInputBlock[] = []
    if (input.command) {
      blocks.push({ type: "text", text: input.command })
    }
    if (input.text) {
      blocks.push({ type: "text", text: input.text })
    }
    for (const attachment of input.attachments ?? []) {
      // TODO（保守映射）：附件以 resource 块（uri 引用）发送；需要内联
      // base64 的 harness 由 F3 composer 决定 image 块的编码方式
      blocks.push({
        type: "resource",
        uri: attachment.path,
        mime_type: attachment.mimeType ?? null,
      })
    }
    // TODO（接口缺口）：conversationId/folderId 链接信息 F3 挂接时补
    await this.transport.call("acp_prompt", {
      connectionId,
      blocks,
      folderId: null,
      conversationId: null,
      clientMessageId: null,
    })
  }

  async cancel(): Promise<void> {
    const connectionId = this.requireConnection()
    await this.transport.call("acp_cancel", { connectionId })
  }

  // ── 中途交互 ──

  async respondPermission(
    requestId: ID,
    answer: PermissionAnswer
  ): Promise<void> {
    const connectionId = this.requireConnection()
    switch (answer.kind) {
      case "option":
        await this.transport.call("acp_respond_permission", {
          connectionId,
          requestId,
          optionId: answer.optionId,
        })
        return
      case "question":
        await this.transport.call("acp_answer_question", {
          connectionId,
          questionId: requestId,
          answer: {
            answers: answer.answers,
            declined: answer.declined ?? false,
          },
        })
        return
      case "plan-approval":
        await this.transport.call("acp_answer_plan_approval", {
          connectionId,
          approvalId: requestId,
          answer: {
            decision: answer.decision,
            feedback: answer.feedback ?? null,
          },
        })
        return
    }
  }

  // ── 恢复 ──

  async restore(conversationId: ID): Promise<SessionSnapshot> {
    // 按会话行取快照（连接侧变体是 acp_get_session_snapshot）
    const snapshot = await this.transport.call<LiveSessionSnapshot | null>(
      "acp_get_session_snapshot_by_conversation",
      { conversationId: Number(conversationId) }
    )
    if (!snapshot) {
      throw new SessionRuntimeError(
        "SESSION_NOT_FOUND",
        `no live session for conversation ${conversationId}`
      )
    }
    // restore 是全新水合：无条件发射并重置去重基线
    // （「一次性替换本地状态」，§5.3）
    const domain = snapshotToSessionSnapshot(snapshot)
    this.lastAppliedSeq = snapshot.event_seq
    this.emitEvent({ type: "snapshot-hydrated", snapshot: domain })
    return domain
  }

  // ── 内部：事件通道 ──

  /**
   * legacy firehose 路径。顺序对齐 acp-connections-context.tsx:5312-5369：
   * ① 先订 `acp://event`（快照请求期间到达的信封入缓冲，不丢）；
   * ② 取 HTTP 快照并水合（建立 seq 基线）；③ 排空缓冲（applyEnvelope
   * 内的 seq 守卫负责去重）；此后信封直接走增量。
   */
  private async connectViaFirehose(
    connectionId: string,
    generation: number
  ): Promise<void> {
    this.pendingFirehoseEvents = []
    this.firehoseSnapshotApplied = false
    this.firehoseUnsub = await this.transport.subscribe<EventEnvelope>(
      "acp://event",
      (envelope) => {
        if (envelope.connection_id !== this.connectionId) return
        if (this.firehoseSnapshotApplied) {
          this.applyEnvelope(envelope)
        } else {
          this.pendingFirehoseEvents.push(envelope)
        }
      }
    )
    if (generation !== this.generation) return

    let snapshot: LiveSessionSnapshot | null = null
    try {
      snapshot = await this.transport.call<LiveSessionSnapshot | null>(
        "acp_get_session_snapshot",
        { connectionId }
      )
    } catch (err) {
      // 快照 best-effort：失败也放行增量（基线保持 undefined，冷启动语义）
      console.warn(
        `[session-runtime] snapshot fetch failed for ${connectionId}:`,
        err
      )
    }
    if (generation !== this.generation) return

    if (snapshot) {
      this.lastAppliedSeq = snapshot.event_seq
      this.emitEvent(snapshotToHydration(snapshot))
    }
    this.firehoseSnapshotApplied = true
    for (const envelope of this.pendingFirehoseEvents) {
      this.applyEnvelope(envelope)
    }
    this.pendingFirehoseEvents = []
  }

  private attachHandlers(stream: EventStream): AttachHandlers {
    return {
      onSnapshot: (snapshot) => {
        // 带内快照：陈旧保护（event_seq <= 已应用 seq）时跳过——
        // 对齐 acp-connections-context.tsx:1463 的外层守卫；该处对
        // latched 字段的合并在 SessionEvent 模型里没有对应物，F3 补
        if (
          this.lastAppliedSeq !== undefined &&
          snapshot.event_seq <= this.lastAppliedSeq
        ) {
          return
        }
        this.lastAppliedSeq = snapshot.event_seq
        this.emitEvent(snapshotToHydration(snapshot))
      },
      onReplay: (events) => {
        for (const envelope of events) {
          this.applyEnvelope(envelope)
        }
      },
      onEvent: (envelope) => {
        this.applyEnvelope(envelope)
      },
      onDetached: (reason) => this.handleDetached(stream, reason),
    }
  }

  /** onDetached 处理对齐 acp-connections-context.tsx:4408-4433。 */
  private handleDetached(stream: EventStream, reason: AttachDetachReason) {
    this.attachSub = null
    const connectionId = this.connectionId
    if (!connectionId) return
    if (reason === "lagged" || reason === "server_shutdown") {
      // 瞬态：携当前游标重挂（server 已按 gap 大小决定 replay / snapshot）
      this.attachSub = stream.attach(
        connectionId,
        { sinceSeq: this.lastAppliedSeq },
        this.attachHandlers(stream)
      )
      return
    }
    // connection_gone：后端已回收连接，终结会话
    this.connectionId = null
    this.emitEvent({
      type: "session-error",
      message: `session connection is gone (${reason})`,
      code: reason,
      fatal: true,
    })
  }

  /**
   * 单信封落地：连接过滤 → seq 去重 → 归一化 → 发射。
   * seq 守卫对齐 acp-connections-context.tsx:4262 / :4506-4509；
   * 游标先于发射推进（emit 内部逐监听器 try/catch，不会抛出，
   * 与 :4518-4524「生效后推进」等价且免重入）。
   */
  private applyEnvelope(envelope: EventEnvelope): void {
    if (envelope.connection_id !== this.connectionId) return
    if (
      this.lastAppliedSeq !== undefined &&
      envelope.seq <= this.lastAppliedSeq
    ) {
      return
    }
    this.lastAppliedSeq = envelope.seq
    const event = envelopeToSessionEvent(envelope)
    if (!event) {
      this.droppedEventCount++
      return
    }
    this.emitEvent(event)
  }

  /** 发射一个领域事件并同步维护权限通道。 */
  private emitEvent(event: SessionEvent): void {
    switch (event.type) {
      case "permission-requested":
        this.pendingPermissions.set(event.request.id, event.request)
        this.notifyPermissions()
        break
      case "permission-resolved":
        if (this.pendingPermissions.delete(event.requestId)) {
          this.notifyPermissions()
        }
        break
      case "snapshot-hydrated":
        this.pendingPermissions = new Map(
          event.snapshot.pendingPermissions.map((request) => [
            request.id,
            request,
          ])
        )
        this.notifyPermissions()
        break
      default:
        break
    }
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (err) {
        // 单个坏订阅者不能杀死其他订阅者（对齐 :4266-4272 的 try/catch）
        console.error("[session-runtime] event subscriber threw:", err)
      }
    }
  }

  private notifyPermissions(): void {
    const current = this.currentPermissions()
    for (const listener of this.permissionListeners) {
      try {
        listener(current)
      } catch (err) {
        console.error("[session-runtime] permission subscriber threw:", err)
      }
    }
  }

  private currentPermissions(): PermissionRequest[] {
    return [...this.pendingPermissions.values()]
  }

  // ── 内部：重连 / 清理 ──

  /**
   * 重连恢复（§7：断线窗口内事件可能丢失）。attach 模式重挂（携
   * lastAppliedSeq 作为 since_seq，服务端据此 replay 或 snapshot）；
   * firehose 模式重取快照。注：WebEventStream 自身也会在 WS 就绪时
   * reattachAll（web-event-stream.ts:84）；先 detach 旧订阅再挂新订阅，
   * 任意时刻只有一个活跃订阅，语义幂等。
   */
  private handleReconnect(): void {
    const connectionId = this.connectionId
    if (!connectionId) return
    const stream = this.transport.eventStream?.()
    if (stream) {
      this.attachSub?.detach()
      this.attachSub = stream.attach(
        connectionId,
        { sinceSeq: this.lastAppliedSeq },
        this.attachHandlers(stream)
      )
      return
    }
    if (this.firehoseUnsub) {
      void this.refetchSnapshot(connectionId)
    }
  }

  /** firehose 模式的重连恢复：重取快照（陈旧保护同 attach onSnapshot）。 */
  private async refetchSnapshot(connectionId: string): Promise<void> {
    try {
      const snapshot = await this.transport.call<LiveSessionSnapshot | null>(
        "acp_get_session_snapshot",
        { connectionId }
      )
      if (!snapshot) return
      if (
        this.lastAppliedSeq !== undefined &&
        snapshot.event_seq <= this.lastAppliedSeq
      ) {
        return
      }
      this.lastAppliedSeq = snapshot.event_seq
      this.emitEvent(snapshotToHydration(snapshot))
    } catch (err) {
      console.warn(
        `[session-runtime] reconnect snapshot refetch failed for ${connectionId}:`,
        err
      )
    }
  }

  private teardownSubscriptions(): void {
    try {
      this.attachSub?.detach()
    } catch (err) {
      console.warn("[session-runtime] attach detach threw:", err)
    }
    this.attachSub = null
    this.firehoseUnsub?.()
    this.firehoseUnsub = null
    this.reconnectUnsub?.()
    this.reconnectUnsub = null
    this.pendingFirehoseEvents = []
    this.firehoseSnapshotApplied = false
  }

  private clearSessionState(): void {
    this.connectionId = null
    this.contextKey = null
    this.lastAppliedSeq = undefined
    this.pendingPermissions.clear()
  }

  private requireConnection(): string {
    if (!this.connectionId) {
      throw new SessionRuntimeError(
        "NOT_CONNECTED",
        "runtime has no active session connection"
      )
    }
    return this.connectionId
  }
}
