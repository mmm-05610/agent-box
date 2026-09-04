/**
 * AgentBox 后端绑定（设计 §4.2 换绑插槽的第二个实现）。
 *
 * 把 agent-box-studio 的 wire 契约（/api/v1，见
 * ~/projects/agent-box/plugins/agent-box-studio）翻译成 core ports：
 * - SessionRuntime：open=POST /sessions；send=POST /sessions/{id}/turns（202
 *   异步编排）；events=每会话 WS 频道（消息即归一化 SessionEvent JSON，
 *   透传为主，兼容服务端现行 dot 形式的归约事件）；permissions=暂空流
 *   （wire 尚无中途交互端点）；restore=GET transcript → snapshot-hydrated
 * - ProjectsPort：GET /sessions 按 project_path 去重映射为 Project[]
 * - EventChannel：本地发布订阅 + transport 重连钩子透传
 * - profiles：GET/POST/PUT/DELETE /api/v1/profiles/{harness} 透传
 *   （G6 设置页数据源；BackendPorts 正式收编该端口留待彼时）
 */
import type { AgentBoxCallOptions } from "@/core/transport/agentbox-transport"
import { AgentBoxTransport } from "@/core/transport/agentbox-transport"
import type {
  ConversationStatus,
  ID,
  MessagePart,
  PermissionAnswer,
  PermissionRequest,
  Project,
  SessionEvent,
  SessionSnapshot,
  Turn,
  TurnUsage,
} from "@/core/domain"
import type {
  ComposerInput,
  SessionRuntime,
  SessionSpec,
} from "@/core/ports/session-runtime"
import type { ProjectChange, ProjectsPort } from "@/core/ports/projects"
import type { EventChannel } from "@/core/ports/event-channel"
import type { BackendPorts } from "@/core/ports/backend"
import type { Subscribable, UnsubscribeFn } from "@/core/ports/transport"

/** createAgentBoxBackend 构造配置（token 同 transport：串或惰性解析） */
export interface AgentBoxBackendConfig {
  baseUrl: string
  token?: string | (() => string | null | undefined)
}

// ── wire 形状（仅声明前端依赖的子集） ──

/** POST/DELETE /sessions 返回的 session 行 */
interface StudioSessionDto {
  id: string
  project_path: string
  title: string
  default_profile_id?: string | null
  created_at?: string
}

/** GET /sessions/{id}/transcript 的合成轮次记录 */
interface StudioTurnDto {
  turn_id: string
  session_id?: string
  harness_type?: string
  input?: string
  status?: string
  assistant_text?: string | null
  usage?: Record<string, unknown>
  started_at?: string
  completed_at?: string | null
}

interface TranscriptDto {
  session_id?: string
  turns?: StudioTurnDto[]
}

/** POST /sessions/{id}/turns 的 202 回执（子集） */
interface TurnReceiptDto {
  turn_id?: string
  state?: string
  idem_key?: string
}

/** 每轮可选绑定参数（binding 条 G6 接线时由 UI 提供） */
export interface AgentBoxTurnOptions {
  profileRef?: string
  modelOverlay?: Record<string, unknown>
  handoffFrom?: string
}

// ── 错误 ──

/** backend 侧结构化错误（不支持的操作 / 状态机错误） */
export class AgentBoxBackendError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "AgentBoxBackendError"
  }
}

// ── 归一化：WS 事件 → SessionEvent ──

/** 归一化联合里已知的 kebab-case 类型（直接透传） */
const SESSION_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "turn-started",
  "part-appended",
  "part-updated",
  "turn-completed",
  "permission-requested",
  "permission-resolved",
  "status-changed",
  "session-error",
  "snapshot-hydrated",
])

/** 服务端现行归约事件（orchestrator._emit 的 dot 形式）在
 * normalizeSessionEvent 的 switch 中逐个翻译为 kebab-case 联合成员。 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeUsage(raw: unknown): TurnUsage | null {
  if (!isRecord(raw)) return null
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = raw[key]
      if (typeof value === "number") return value
    }
    return undefined
  }
  const inputTokens = pick("inputTokens", "input_tokens", "prompt_tokens")
  const outputTokens = pick(
    "outputTokens",
    "output_tokens",
    "completion_tokens"
  )
  if (inputTokens === undefined && outputTokens === undefined) return null
  return { inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 }
}

/**
 * 事件归一：kebab-case SessionEvent JSON 原样透传；dot 形式的服务端
 * 归约事件翻译成本联合；其余丢弃（返回 null，调用方计数）。
 */
export function normalizeSessionEvent(raw: unknown): SessionEvent | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (typeof type === "string" && SESSION_EVENT_TYPES.has(type)) {
    return raw as unknown as SessionEvent
  }
  const turnId = asString(raw.turn_id)
  switch (type) {
    case "turn.started":
      if (!turnId) return null
      return {
        type: "turn-started",
        turn: {
          id: turnId,
          role: "assistant",
          parts: [],
          startedAt: asString(raw.started_at) ?? nowIso(),
          completedAt: null,
          usage: null,
        },
      }
    case "turn.delta": {
      if (!turnId) return null
      const part: MessagePart = {
        type: "text",
        text: asString(raw.text) ?? "",
      }
      return { type: "part-appended", turnId, part }
    }
    case "turn.completed":
      if (!turnId) return null
      return {
        type: "turn-completed",
        turnId,
        completedAt: asString(raw.completed_at) ?? nowIso(),
        usage: normalizeUsage(raw.usage),
      }
    case "turn.failed":
      return {
        type: "session-error",
        message: asString(raw.error) ?? "turn failed",
        fatal: false,
      }
    default:
      return null
  }
}

// ── transcript → SessionSnapshot ──

const ACTIVE_TURN_STATUSES = new Set(["queued", "running", "pending"])

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * 合成轮次 → 领域 Turn[]：每条记录拆 user（input）+ assistant
 * （assistant_text，缺省/空时不产出）两轮；活跃状态的记录使快照
 * 整体呈 in_progress。
 */
export function transcriptToSnapshot(dto: TranscriptDto): SessionSnapshot {
  const turns: Turn[] = []
  let active = false
  for (const record of dto.turns ?? []) {
    if (!record.turn_id) continue
    const startedAt = record.started_at || nowIso()
    turns.push({
      id: record.turn_id,
      role: "user",
      parts: [{ type: "text", text: record.input ?? "" }],
      startedAt,
      completedAt: null,
      usage: null,
    })
    const assistantText = record.assistant_text?.trim()
    if (assistantText) {
      const completedAt = record.completed_at ?? null
      turns.push({
        id: `${record.turn_id}:assistant`,
        role: "assistant",
        parts: [{ type: "text", text: assistantText }],
        startedAt: completedAt ?? startedAt,
        completedAt,
        usage: normalizeUsage(record.usage),
      })
    }
    if (record.status && ACTIVE_TURN_STATUSES.has(record.status)) {
      active = true
    }
  }
  const status: ConversationStatus = active ? "in_progress" : "completed"
  return {
    conversationId: dto.session_id ?? "",
    status,
    turns,
    pendingPermissions: [],
  }
}

// ── idem key ──

function makeIdemKey(): string {
  const crypto = globalThis.crypto
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `turn-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`
}

// ── Subscribable 基建 ──

function makeSubscribable<T>(): {
  subscribable: Subscribable<T>
  emit: (value: T) => void
} {
  const listeners = new Set<(value: T) => void>()
  return {
    subscribable: {
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    emit: (value) => {
      for (const listener of listeners) {
        try {
          listener(value)
        } catch (err) {
          // 单个坏订阅者不能杀死其他订阅者
          console.error("[agentbox-backend] subscriber threw:", err)
        }
      }
    },
  }
}

/** 永不发射的空变更流（projects.changes） */
function emptySubscribable<T>(): Subscribable<T> {
  return { subscribe: () => () => {} }
}

// ── SessionRuntime ──

/**
 * AgentBox 会话运行时：一个实例服务一条 studio session
 * （接口为单会话形状，语义同 CodegRustSessionRuntime）。
 */
export class AgentBoxSessionRuntime implements SessionRuntime {
  private readonly transport: AgentBoxTransport
  private generation = 0
  private sessionId: string | null = null
  private harnessId: string | null = null
  private lastTurnId: string | null = null
  private eventsUnsub: UnsubscribeFn | null = null
  private reconnectUnsub: UnsubscribeFn | null = null
  private droppedEventCount = 0
  private turnOptions: AgentBoxTurnOptions | undefined
  private pendingPermissions = new Map<ID, PermissionRequest>()

  private readonly eventBus = makeSubscribable<SessionEvent>()
  private readonly permissionBus = makeSubscribable<PermissionRequest[]>()

  readonly events: Subscribable<SessionEvent> = this.eventBus.subscribable
  /** 暂空流（wire 无中途交互端点）；快照水合可能携带待处理请求 */
  readonly permissions: Subscribable<PermissionRequest[]> = {
    subscribe: (listener) => {
      const unsub = this.permissionBus.subscribable.subscribe(listener)
      listener(this.currentPermissions())
      return unsub
    },
  }

  constructor(options: {
    transport: AgentBoxTransport
    /** 每轮固定绑定参数（profile_ref / model_overlay / handoff_from） */
    turnOptions?: AgentBoxTurnOptions
  }) {
    this.transport = options.transport
    this.turnOptions = options.turnOptions
  }

  /** 更新每轮绑定参数（下一轮 send 生效；G6 绑定条的数据入口） */
  setTurnOptions(options: AgentBoxTurnOptions | undefined): void {
    this.turnOptions = options
  }

  /** 当前绑定的 studio session id（诊断 / 测试用） */
  get activeSessionId(): string | null {
    return this.sessionId
  }

  /** 被丢弃的未知事件计数（诊断用） */
  get droppedEvents(): number {
    return this.droppedEventCount
  }

  async connect(spec: SessionSpec): Promise<void> {
    const generation = ++this.generation
    this.teardownSubscriptions()
    this.clearSessionState()
    this.harnessId = spec.harnessId

    if (spec.resumeConversationId) {
      // 续接：直接绑定既有 studio session（restore 场景走 restore()）
      this.sessionId = spec.resumeConversationId
    } else {
      const projectPath = spec.cwd
      const created = await this.transport.post<{ session: StudioSessionDto }>(
        "sessions",
        {
          project_path: projectPath,
          title: `${basename(projectPath)} (${spec.harnessId})`,
        }
      )
      if (generation !== this.generation) return
      this.sessionId = created.session.id
    }

    // 订阅会话 WS 频道（服务端连上即 replay 历史，事件不丢）
    const sessionId = this.sessionId
    this.eventsUnsub = await this.transport.subscribe<unknown>(
      `sessions/${sessionId}/events`,
      (raw) => this.onWireEvent(raw)
    )
    if (generation !== this.generation) {
      this.teardownSubscriptions()
      return
    }

    // 断线恢复（§7）：WS ready 重临后重取转写做一次性水合
    this.reconnectUnsub =
      this.transport.onReconnect?.(() => {
        void this.refetchSnapshot()
      }) ?? null
  }

  async disconnect(): Promise<void> {
    this.generation++
    this.teardownSubscriptions()
    this.clearSessionState()
    this.notifyPermissions()
  }

  async send(input: ComposerInput): Promise<void> {
    const sessionId = this.requireSession()
    const inputText = input.command ?? input.text ?? ""
    if (!inputText && !input.attachments?.length) {
      throw new AgentBoxBackendError(
        "EMPTY_INPUT",
        "send requires text, a command, or attachments"
      )
    }
    // TODO（wire 缺口）：turns 契约暂无附件字段；composer 附件待
    // 服务端扩展后经 inputs 契约解析下发
    const body: Record<string, unknown> = {
      input_text: inputText,
      harness_type: this.harnessId ?? "",
      idem_key: makeIdemKey(),
    }
    if (this.turnOptions?.profileRef) {
      body.profile_ref = this.turnOptions.profileRef
    }
    if (this.turnOptions?.modelOverlay) {
      body.model_overlay = this.turnOptions.modelOverlay
    }
    if (this.turnOptions?.handoffFrom) {
      body.handoff_from = this.turnOptions.handoffFrom
    }
    const receipt = await this.transport.post<TurnReceiptDto>(
      `sessions/${sessionId}/turns`,
      body
    )
    if (receipt?.turn_id) this.lastTurnId = receipt.turn_id
  }

  async cancel(): Promise<void> {
    const sessionId = this.requireSession()
    if (!this.lastTurnId) {
      // 没有进行中的轮次可取消：幂等无操作
      return
    }
    // TODO（wire 缺口）：G5 契约尚无 cancel 端点；POST
    // turns/{id}/cancel 为预留路径，404/405 静默吞掉，
    // 待服务端落地后移除容错。
    try {
      await this.transport.call(
        `sessions/${sessionId}/turns/${this.lastTurnId}/cancel`,
        undefined,
        { method: "POST" } satisfies AgentBoxCallOptions
      )
    } catch (err) {
      console.warn(
        `[agentbox-backend] cancel for turn ${this.lastTurnId} failed:`,
        err
      )
    }
  }

  async respondPermission(
    requestId: ID,
    answer: PermissionAnswer
  ): Promise<void> {
    void requestId
    void answer
    // TODO（wire 缺口）：studio 契约暂无中途交互端点，
    // permissions 通道当前为空流，此入口不应被触达。
    throw new AgentBoxBackendError(
      "UNSUPPORTED",
      "agent-box-studio wire contract has no permission endpoints yet"
    )
  }

  /**
   * 恢复既有会话：GET transcript → 一次性快照水合（snapshot-hydrated），
   * 返回水合后的快照。之后 WS 增量直接叠加。
   */
  async restore(conversationId: ID): Promise<SessionSnapshot> {
    const transcript = await this.transport.get<TranscriptDto>(
      `sessions/${conversationId}/transcript`
    )
    const snapshot = transcriptToSnapshot(transcript)
    snapshot.conversationId = conversationId
    this.sessionId = conversationId
    if (!this.eventsUnsub) {
      this.eventsUnsub = await this.transport.subscribe<unknown>(
        `sessions/${conversationId}/events`,
        (raw) => this.onWireEvent(raw)
      )
    }
    // restore 是全新水合：无条件发射（「一次性替换本地状态」）
    this.emitEvent({ type: "snapshot-hydrated", snapshot })
    return snapshot
  }

  // ── 内部 ──

  private onWireEvent(raw: unknown): void {
    const event = normalizeSessionEvent(raw)
    if (!event) {
      this.droppedEventCount++
      return
    }
    this.emitEvent(event)
  }

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
    this.eventBus.emit(event)
  }

  private notifyPermissions(): void {
    this.permissionBus.emit(this.currentPermissions())
  }

  private currentPermissions(): PermissionRequest[] {
    return [...this.pendingPermissions.values()]
  }

  /** 重连恢复：重取转写做一次性水合（无 seq 游标，无条件替换） */
  private async refetchSnapshot(): Promise<void> {
    const sessionId = this.sessionId
    if (!sessionId) return
    try {
      const transcript = await this.transport.get<TranscriptDto>(
        `sessions/${sessionId}/transcript`
      )
      const snapshot = transcriptToSnapshot(transcript)
      snapshot.conversationId = sessionId
      this.emitEvent({ type: "snapshot-hydrated", snapshot })
    } catch (err) {
      console.warn(
        `[agentbox-backend] reconnect snapshot refetch failed for ${sessionId}:`,
        err
      )
    }
  }

  private teardownSubscriptions(): void {
    this.eventsUnsub?.()
    this.eventsUnsub = null
    this.reconnectUnsub?.()
    this.reconnectUnsub = null
    this.pendingPermissions.clear()
  }

  private clearSessionState(): void {
    this.sessionId = null
    this.harnessId = null
    this.lastTurnId = null
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new AgentBoxBackendError(
        "NOT_CONNECTED",
        "runtime has no active studio session"
      )
    }
    return this.sessionId
  }
}

// ── ProjectsPort ──

interface SessionsListDto {
  sessions?: StudioSessionDto[]
}

/**
 * project_path 去重映射：项目 id 即路径（稳定），name 取路径末段，
 * createdAt 取该路径最早会话时间，lastActiveSessionId 取最近会话。
 */
export function sessionsToProjects(sessions: StudioSessionDto[]): Project[] {
  const byPath = new Map<string, Project>()
  const earliest = new Map<string, string>()
  const latest = new Map<string, string>()
  for (const session of sessions) {
    const path = session.project_path
    if (!path) continue
    const createdAt = session.created_at || ""
    if (!byPath.has(path)) {
      byPath.set(path, {
        id: path,
        name: basename(path) || path,
        origin: { kind: "local", path },
        createdAt: "",
        lastActiveSessionId: session.id,
      })
    }
    const known = earliest.get(path)
    if (createdAt && (!known || createdAt < known)) {
      earliest.set(path, createdAt)
    }
    const currentLatest = latest.get(path) ?? ""
    if (!currentLatest || createdAt >= currentLatest) {
      latest.set(path, createdAt)
      const project = byPath.get(path)
      if (project) project.lastActiveSessionId = session.id
    }
  }
  return [...byPath.values()].map((project) => ({
    ...project,
    createdAt: earliest.get(project.id) || "1970-01-01T00:00:00.000Z",
  }))
}

/** AgentBox 的 ProjectsPort：项目实体由 session 的 project_path 投影而来 */
export class AgentBoxProjectsPort implements ProjectsPort {
  private readonly transport: AgentBoxTransport

  readonly changes = emptySubscribable<ProjectChange>()

  constructor(transport: AgentBoxTransport) {
    this.transport = transport
  }

  async list(): Promise<Project[]> {
    const dto = await this.transport.get<SessionsListDto>("sessions")
    return sessionsToProjects(dto.sessions ?? [])
  }

  async create(): Promise<Project> {
    // studio 契约没有项目实体（会话直接绑定 project_path）；
    // 项目创建是前端侧语义，G7 接线时经「新建会话」落地。
    throw new AgentBoxBackendError(
      "UNSUPPORTED",
      "agent-box-studio has no project entity; sessions bind project_path directly"
    )
  }

  async update(): Promise<Project> {
    throw new AgentBoxBackendError(
      "UNSUPPORTED",
      "project updates are a frontend-side projection for the agentbox backend"
    )
  }

  async remove(): Promise<void> {
    throw new AgentBoxBackendError(
      "UNSUPPORTED",
      "project removal is a frontend-side projection for the agentbox backend"
    )
  }
}

// ── EventChannel ──

/** 本地发布订阅 + transport 重连钩子透传（设计 §4 EventChannel） */
class AgentBoxEventChannel implements EventChannel {
  private readonly transport: AgentBoxTransport
  private readonly listeners = new Map<
    string,
    Set<(payload: unknown) => void>
  >()

  constructor(transport: AgentBoxTransport) {
    this.transport = transport
  }

  subscribe<T>(channel: string, listener: (payload: T) => void): UnsubscribeFn {
    let set = this.listeners.get(channel)
    if (!set) {
      set = new Set()
      this.listeners.set(channel, set)
    }
    const wrapped = listener as (payload: unknown) => void
    set.add(wrapped)
    return () => {
      set?.delete(wrapped)
      if (set && set.size === 0) this.listeners.delete(channel)
    }
  }

  publish<T>(channel: string, payload: T): void {
    const set = this.listeners.get(channel)
    if (!set) return
    for (const listener of set) {
      try {
        listener(payload)
      } catch (err) {
        console.error("[agentbox-backend] event channel listener threw:", err)
      }
    }
  }

  onReconnect(listener: () => void): UnsubscribeFn {
    return this.transport.onReconnect(listener)
  }
}

// ── ProfilesPort（G6 设置页数据源；BackendPorts 收编留待彼时） ──

/** profile 工件透传形状（revision/digest 由服务端权威管理） */
export type AgentBoxProfile = Record<string, unknown>

export interface CreateAgentBoxProfileInput {
  name: string
  payload: Record<string, unknown>
  profileId?: string
}

export interface AgentBoxProfilesPort {
  /** GET /profiles/{harness} → profiles 列表 */
  list(harness: string): Promise<AgentBoxProfile[]>
  /** GET /profiles/{harness}/{id}（可选 revision 回看历史版本） */
  get(
    harness: string,
    profileId: string,
    revision?: number
  ): Promise<AgentBoxProfile>
  /** POST /profiles/{harness} */
  create(
    harness: string,
    input: CreateAgentBoxProfileInput
  ): Promise<AgentBoxProfile>
  /** PUT /profiles/{harness}/{id}（乐观并发：expected_revision） */
  update(
    harness: string,
    profileId: string,
    payload: Record<string, unknown>,
    expectedRevision?: number
  ): Promise<AgentBoxProfile>
  /** DELETE /profiles/{harness}/{id} */
  remove(harness: string, profileId: string): Promise<void>
}

export class AgentBoxProfilesFacade implements AgentBoxProfilesPort {
  private readonly transport: AgentBoxTransport

  constructor(transport: AgentBoxTransport) {
    this.transport = transport
  }

  async list(harness: string): Promise<AgentBoxProfile[]> {
    const dto = await this.transport.get<{ profiles?: AgentBoxProfile[] }>(
      `profiles/${encodeURIComponent(harness)}`
    )
    return dto.profiles ?? []
  }

  async get(
    harness: string,
    profileId: string,
    revision?: number
  ): Promise<AgentBoxProfile> {
    const suffix = revision === undefined ? "" : `?revision=${revision}`
    return this.transport.get<AgentBoxProfile>(
      `profiles/${encodeURIComponent(harness)}/${encodeURIComponent(profileId)}${suffix}`
    )
  }

  async create(
    harness: string,
    input: CreateAgentBoxProfileInput
  ): Promise<AgentBoxProfile> {
    const body: Record<string, unknown> = {
      name: input.name,
      payload: input.payload,
    }
    if (input.profileId !== undefined) body.profile_id = input.profileId
    return this.transport.post<AgentBoxProfile>(
      `profiles/${encodeURIComponent(harness)}`,
      body
    )
  }

  async update(
    harness: string,
    profileId: string,
    payload: Record<string, unknown>,
    expectedRevision?: number
  ): Promise<AgentBoxProfile> {
    const body: Record<string, unknown> = { payload }
    if (expectedRevision !== undefined) {
      body.expected_revision = expectedRevision
    }
    return this.transport.put<AgentBoxProfile>(
      `profiles/${encodeURIComponent(harness)}/${encodeURIComponent(profileId)}`,
      body
    )
  }

  async remove(harness: string, profileId: string): Promise<void> {
    await this.transport.delete(
      `profiles/${encodeURIComponent(harness)}/${encodeURIComponent(profileId)}`
    )
  }
}

// ── 聚合入口 ──

export interface AgentBoxBackend extends BackendPorts {
  /** profiles CRUD（wire：/api/v1/profiles/{harness}），G6 正式收编 */
  readonly profiles: AgentBoxProfilesPort
}

/** 构造 AgentBox 后端绑定（§4.2 换绑插槽的第二个实现） */
export function createAgentBoxBackend(
  config: AgentBoxBackendConfig,
  options?: { transport?: AgentBoxTransport }
): AgentBoxBackend {
  const transport = options?.transport ?? new AgentBoxTransport(config)
  const session = new AgentBoxSessionRuntime({ transport })
  return {
    session,
    projects: new AgentBoxProjectsPort(transport),
    events: new AgentBoxEventChannel(transport),
    profiles: new AgentBoxProfilesFacade(transport),
  }
}
