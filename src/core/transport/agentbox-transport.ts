/**
 * AgentBoxTransport —— agent-box-studio 服务（/api/v1 契约）的 Transport 实现。
 *
 * 与 WebTransport（codeg 方言：POST /api/{command} + 全局 /ws）不同，这里
 * 面向干净的 REST + 每会话 WS：
 * - call(path, args) → POST/GET/PUT/DELETE {base}/api/v1/{path}（Bearer token）
 * - subscribe(channel) → WS {base}/api/v1/{channel}（如 sessions/{id}/events），
 *   消息即归一化 SessionEvent JSON 本体，`ready`/`ping` 为控制帧
 * - onReconnect 语义照 web-transport 简化：通道级 ready 帧，首次 = 初连，
 *   之后每次 ready 触发重连回调（断线窗口事件可能丢失，订阅方重取快照）
 *
 * token 从配置注入（服务端 AGENT_BOX_STUDIO_TOKEN）；WS 握手无法携带
 * header，token 以 `?token=` 查询参数传递。
 */
import type {
  CallOptions,
  Transport,
  UnsubscribeFn,
} from "@/core/ports/transport"

/** 默认请求超时：turn 派发是 202 异步编排，远端往返留足余量 */
const AGENTBOX_CALL_TIMEOUT_MS = 30_000
/** 通道 ready 帧等待上限（照 web-transport READY_TIMEOUT_MS 简化） */
const READY_TIMEOUT_MS = 5_000
/** 重连退避：1s → 2s → … → 32s 封顶，永不放弃 */
const WS_BACKOFF_INITIAL_MS = 1_000
const WS_BACKOFF_MAX_MS = 32_000

/** 构造配置：token 支持静态串或惰性解析（换绑 / 过期刷新） */
export interface AgentBoxTransportConfig {
  baseUrl: string
  token?: string | (() => string | null | undefined)
}

/** call 的 AgentBox 扩展选项：REST 方法覆盖（默认 POST） */
export interface AgentBoxCallOptions extends CallOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE"
}

/** FastAPI 风格错误载荷 */
interface ApiErrorBody {
  detail?: unknown
  message?: unknown
}

/** 单个 WS 通道（每 channel 一条 socket，多订阅者共享） */
interface WsChannel {
  path: string
  handlers: Set<(payload: unknown) => void>
  ws: WebSocket | null
  readyPromise: Promise<void>
  resolveReady: () => void
  hasReadied: boolean
  failCount: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

export class AgentBoxTransport implements Transport {
  private readonly baseUrl: string
  private readonly tokenSource: () => string | null | undefined
  private readonly channels = new Map<string, WsChannel>()
  private readonly reconnectCallbacks = new Set<() => void>()
  private destroyed = false

  constructor(config: AgentBoxTransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "")
    const source = config.token
    this.tokenSource =
      typeof source === "function" ? source : () => source ?? null
  }

  private token(): string | null {
    const value = this.tokenSource()
    return value && value.trim() ? value.trim() : null
  }

  private apiUrl(path: string): string {
    return `${this.baseUrl}/api/v1/${path.replace(/^\/+|\/+$/g, "")}`
  }

  /** HTTP 调用：默认 POST（args 为 JSON body），method 覆盖为 GET/PUT/DELETE */
  async call<T>(
    path: string,
    args?: Record<string, unknown>,
    options?: AgentBoxCallOptions
  ): Promise<T> {
    const method = options?.method ?? "POST"
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? AGENTBOX_CALL_TIMEOUT_MS
    )
    const headers: Record<string, string> = {}
    const token = this.token()
    if (token) headers.Authorization = `Bearer ${token}`
    const hasBody = method !== "GET" && args !== undefined
    if (hasBody) headers["Content-Type"] = "application/json"

    let res: Response
    try {
      res = await fetch(this.apiUrl(path), {
        method,
        headers,
        ...(hasBody ? { body: JSON.stringify(args ?? {}) } : {}),
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Request timed out")
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (res.status === 401) {
      throw new Error("Unauthorized")
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : typeof body?.message === "string"
            ? body.message
            : `HTTP ${res.status}`
      throw new Error(detail)
    }
    // 202/204 等可能没有响应体
    const text = await res.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return undefined as T
    }
  }

  /** GET 便捷方法（session/transcript、profiles、harnesses…） */
  get<T>(path: string, options?: CallOptions): Promise<T> {
    return this.call<T>(path, undefined, { ...options, method: "GET" })
  }

  /** POST 便捷方法（sessions、turns…） */
  post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.call<T>(path, body, { method: "POST" })
  }

  /** PUT 便捷方法（profile 修订） */
  put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    return this.call<T>(path, body, { method: "PUT" })
  }

  /** DELETE 便捷方法（session/profile 删除） */
  delete<T = void>(path: string): Promise<T> {
    return this.call<T>(path, undefined, { method: "DELETE" })
  }

  async subscribe<T>(
    channel: string,
    handler: (payload: T) => void
  ): Promise<UnsubscribeFn> {
    const wrapped = handler as (payload: unknown) => void
    const entry = this.channels.get(channel)
    if (entry) {
      entry.handlers.add(wrapped)
    } else {
      const fresh = this.createChannel(channel, wrapped)
      this.channels.set(channel, fresh)
      this.connectChannel(fresh)
    }
    await this.waitChannelReady(this.channels.get(channel))
    return () => {
      const current = this.channels.get(channel)
      if (!current) return
      current.handlers.delete(wrapped)
      if (current.handlers.size === 0) this.teardownChannel(channel)
    }
  }

  isDesktop(): boolean {
    return false
  }

  onReconnect(callback: () => void): UnsubscribeFn {
    this.reconnectCallbacks.add(callback)
    return () => {
      this.reconnectCallbacks.delete(callback)
    }
  }

  /**
   * 等待当前所有活跃通道的 ready 帧（各通道独立限时，
   * 超时放行避免 UI 挂死 —— 语义照 web-transport 简化）。
   */
  async waitForReady(): Promise<void> {
    await Promise.all(
      [...this.channels.values()].map((channel) =>
        this.waitChannelReady(channel)
      )
    )
  }

  destroy(): void {
    this.destroyed = true
    for (const path of [...this.channels.keys()]) {
      this.teardownChannel(path)
    }
    this.reconnectCallbacks.clear()
  }

  // ── 内部：通道生命周期 ──

  private createChannel(
    path: string,
    firstHandler: (payload: unknown) => void
  ): WsChannel {
    const channel: WsChannel = {
      path,
      handlers: new Set([firstHandler]),
      ws: null,
      readyPromise: null as unknown as Promise<void>,
      resolveReady: () => {},
      hasReadied: false,
      failCount: 0,
      reconnectTimer: null,
    }
    this.resetChannelReady(channel)
    return channel
  }

  private resetChannelReady(channel: WsChannel) {
    channel.readyPromise = new Promise<void>((resolve) => {
      channel.resolveReady = resolve
    })
  }

  private wsUrl(path: string): string {
    const base = this.baseUrl.replace(/^http/, "ws")
    const token = this.token()
    const suffix = token ? `?token=${encodeURIComponent(token)}` : ""
    return `${base}/api/v1/${path.replace(/^\/+|\/+$/g, "")}${suffix}`
  }

  private connectChannel(channel: WsChannel): void {
    if (this.destroyed) return
    this.teardownSocket(channel)
    const ws = new WebSocket(this.wsUrl(channel.path))
    channel.ws = ws

    ws.onopen = () => {
      // 连接建立 ≠ 应用就绪；ready 帧才是（见 onmessage）
    }

    ws.onmessage = (msg: { data: unknown }) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(msg.data)) as unknown
      } catch {
        return // 忽略畸形帧
      }
      if (!parsed || typeof parsed !== "object") return
      const type = (parsed as { type?: unknown }).type
      if (type === "ready") {
        channel.failCount = 0
        channel.resolveReady()
        if (channel.hasReadied) {
          // 重连路径：断线窗口内的事件可能丢失，通知订阅方重取快照
          this.fireReconnect()
        } else {
          channel.hasReadied = true
        }
        return
      }
      if (type === "ping" || type === "echo") return
      for (const handler of channel.handlers) {
        try {
          handler(parsed)
        } catch (err) {
          // 单个坏订阅者不能杀死其他订阅者
          console.error("[AgentBoxTransport] subscriber threw:", err)
        }
      }
    }

    ws.onclose = () => {
      channel.ws = null
      // 新订阅者必须等下一条连接的 ready 才放行
      this.resetChannelReady(channel)
      if (this.destroyed) return
      this.scheduleChannelReconnect(channel)
    }

    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        // CONNECTING 态 close() 可能抛错，onclose 兜底
      }
    }
  }

  private scheduleChannelReconnect(channel: WsChannel) {
    if (this.destroyed) return
    channel.failCount++
    if (channel.reconnectTimer) clearTimeout(channel.reconnectTimer)
    const shift = Math.min(channel.failCount - 1, 8)
    const delay = Math.min(WS_BACKOFF_INITIAL_MS << shift, WS_BACKOFF_MAX_MS)
    channel.reconnectTimer = setTimeout(() => {
      channel.reconnectTimer = null
      if (!this.destroyed && channel.handlers.size > 0) {
        this.connectChannel(channel)
      }
    }, delay)
  }

  private waitChannelReady(channel: WsChannel | undefined): Promise<void> {
    if (!channel) return Promise.resolve()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutId = setTimeout(() => resolve("timeout"), READY_TIMEOUT_MS)
    })
    return Promise.race([
      channel.readyPromise.then(() => "ready" as const),
      timeoutPromise,
    ]).then((result) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      if (result === "timeout") {
        console.warn(
          `[AgentBoxTransport] ready frame for "${channel.path}" did not ` +
            `arrive within ${READY_TIMEOUT_MS}ms; proceeding without it.`
        )
      }
    })
  }

  private fireReconnect() {
    for (const callback of this.reconnectCallbacks) {
      try {
        callback()
      } catch (err) {
        console.error("[AgentBoxTransport] reconnect callback threw:", err)
      }
    }
  }

  private teardownSocket(channel: WsChannel) {
    if (!channel.ws) return
    // 先摘 handler 再 close，防异步 onclose 触发伪重连
    channel.ws.onopen = null
    channel.ws.onmessage = null
    channel.ws.onclose = null
    channel.ws.onerror = null
    try {
      channel.ws.close()
    } catch {
      // CONNECTING 态的 close() 可能抛错；handler 已摘除，无副作用
    }
    channel.ws = null
  }

  private teardownChannel(path: string) {
    const channel = this.channels.get(path)
    if (!channel) return
    if (channel.reconnectTimer) {
      clearTimeout(channel.reconnectTimer)
      channel.reconnectTimer = null
    }
    this.teardownSocket(channel)
    this.channels.delete(path)
    // 排空在途 waitChannelReady 的等待者
    channel.resolveReady()
  }
}
