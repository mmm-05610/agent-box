/**
 * OpenCode 原生驱动模块：在隔离 guest 内托管真实的 `opencode serve` 进程。
 *
 * 这是"非 ACP Harness"的通用驱动接缝（`runtime/native-driver.mjs`）加载的模块，
 * 由 deployment 的 `adapter.driver.source` 声明、随评审过的 bundle 进入 guest。
 * 它只做 OpenCode 原生语义的三件事：
 *
 *   1. 用上游复用组件 `ManagedOpenCodeHost` 启动 `opencode serve`（loopback、
 *      随机空闲端口、每次运行生成基本认证口令），健康就绪后通过它的 HTTP API
 *      驱动一个原生会话；
 *   2. 把每一轮的真实增量（SSE `message.part.delta`）即时 emit 成产品中立的
 *      `message_delta` 事件，把轮次结束交给 prompt 的返回值；
 *   3. `open` 只重开"已经存在"的原生会话（读 SQLite 存储），绝不静默新建；
 *      找不到就报错，让产品看到可恢复性失败而不是一条错位的转写。
 *
 * 边界（与 Pi 一样由通用接缝强制，这里只是遵守）：
 *   - 驱动永远拿不到产品凭据值，只能通过 `context.spawnProcess` 启动原生进程，
 *     秘密因此只进入子进程环境，不进 argv、不进文件、不进事件；
 *   - 驱动自己的诊断文本走 `context.redact`，向上事件由 sidecar 再做一次深红删；
 *   - 模型值由上层翻译后传入（`provider/model` 形式），驱动不写死任何模型映射，
 *     只做"这段原生地址在本机目录里是否存在"的校验。
 *
 * 实测依据（见 docs/server-round1/fullstack/opencode-production-packaging.md）：
 *   - `serve` 的会话与消息持久化在 `$XDG_DATA_HOME/opencode/opencode.db`（SQLite，
 *     含 -wal/-shm），stop(SIGTERM) 后重新启动同一数据目录即可读回同一 session；
 *   - 带 title 创建会话后，一轮 prompt 恰好产生 1 次 provider 请求；不传 title 时
 *     OpenCode 会额外用模型生成标题（多一次请求），所以 `create` 始终写入标题；
 *   - `sessionCapabilities.resume` 的声明以"重开后 `GET /session/<id>` 与
 *     `GET /session/<id>/message` 能读回上一轮"为证据，而不是猜测。
 */
import { randomBytes } from "node:crypto"
import { appendFileSync } from "node:fs"
import { createServer } from "node:net"
import { ManagedOpenCodeHost } from "../../third_party/harness_remote/bridge/src/opencode-host.js"

/** 向上事件名：与 sidecar 的通用映射一致（不得改成任何产品事件名）。 */
export const DELTA_EVENT = "message_delta"
/** guest 内托管的 server 只绑 loopback。 */
export const HOST = "127.0.0.1"
export const READY_TIMEOUT_MS = 30_000
export const PROMPT_TIMEOUT_MS = 570_000
export const CLOSE_TIMEOUT_MS = 15_000
/** 响应返回后等待迟到增量事件的排空窗口（毫秒）。 */
export const DRAIN_DELTAS_MS = 400
/** 由驱动生成、只用于本机 loopback 服务的基本认证口令长度（base64url）。 */
const SECRET_BYTES = 32
/** 不传 title 时 OpenCode 会为了生成标题多发一次 provider 请求；这里给一个常量标题。 */
const FALLBACK_TITLE = "agentbox-session"

export class DriverError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`)
    this.name = "DriverError"
    this.code = code
  }
}

function fail(code, message) {
  throw new DriverError(code, message)
}

/**
 * 把上层传来的原生模型值拆成 OpenCode 的 provider/model 地址。
 *
 * 这不是模型映射表：翻译（产品 modelId -> 原生值）由 Harness 扩展层完成，
 * 驱动只是校验"这段原生地址形态正确"，形态不对时用与 Pi 相同的措辞拒绝，
 * 使产品的失败理由里能看到用户选择的模型。
 */
export function splitNativeModel(value) {
  const shown = typeof value === "string" ? value : String(value)
  if (typeof value !== "string" || value.length === 0 || value.length > 200
      || value.startsWith("/") || !value.includes("/")) {
    fail("OPENCODE_MODEL_NOT_AVAILABLE", `Harness model is not available: ${shown}`)
  }
  const index = value.indexOf("/")
  const providerID = value.slice(0, index)
  const modelID = value.slice(index + 1)
  if (!providerID || !modelID || modelID.includes("/")) {
    fail("OPENCODE_MODEL_NOT_AVAILABLE", `Harness model is not available: ${shown}`)
  }
  return { providerID, modelID }
}

/** 原生目录里是否存在该 provider/model；不存在即拒绝（发送 provider 请求之前）。 */
export function catalogHasModel(catalog, providerID, modelID) {
  const providers = catalog && typeof catalog === "object" && Array.isArray(catalog.providers)
    ? catalog.providers : null
  if (!providers) return null // 目录读不到：与"不存在"分开处理
  const provider = providers.find((item) => item && item.id === providerID)
  if (!provider || typeof provider.models !== "object" || provider.models === null) return false
  return Object.prototype.hasOwnProperty.call(provider.models, modelID)
}

/** 从 OpenCode 的 parts 里取出助手文本（仅在增量缺失时作为兜底）。 */
export function textOfParts(parts) {
  if (!Array.isArray(parts)) return ""
  return parts.filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text).join("")
}

/** 审计钩子：只有显式声明且位于本次工作目录内的绝对路径才会被写入。 */
export function auditPathFor(environment, directory) {
  const value = environment ? environment.AGENTBOX_DRIVER_AUDIT : undefined
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) return null
  if (typeof directory === "string" && directory.startsWith("/")
      && !value.startsWith(directory.replace(/\/+$/, "") + "/")) {
    return null
  }
  return value
}

/** OpenCode 在给定的 XDG 数据根下使用的目录名。 */
export function dataDirectoryUnder(xdgDataHome) {
  return `${String(xdgDataHome).replace(/\/+$/, "")}/opencode`
}

/** 在 serve 之前插入 `--pure`（对外部插件的关闭与 42d 的 `run --pure` 对齐）。 */
export function withPure(args) {
  if (!Array.isArray(args) || args.length === 0 || args[0] !== "serve") return args
  return args.includes("--pure") ? args : [args[0], "--pure", ...args.slice(1)]
}

/** 让操作系统给出一个空闲端口：绑定 0 再释放（端口随后立刻被本进程占用）。 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on("error", reject)
    probe.listen(0, HOST, () => {
      const address = probe.address()
      const port = address && typeof address === "object" ? address.port : 0
      probe.close(() => (port ? resolve(port) : reject(new Error("no free port"))))
    })
  })
}

export async function createDriver(context) {
  const emit = typeof context?.emit === "function" ? context.emit : () => {}
  const redact = typeof context?.redact === "function"
    ? context.redact : (value, maximum) => String(value ?? "").slice(0, maximum)
  const environment = { ...(context?.environment ?? {}) }
  const directory = typeof context?.directory === "string" ? context.directory : process.cwd()
  const stateDirectory = typeof context?.stateDirectory === "string" ? context.stateDirectory : null
  // OpenCode 的持久化根（SQLite 与快照）是 `$XDG_DATA_HOME/opencode`。XDG 根由
  // guest 环境给出，deployment **不**再声明它（否则同一个事实会有两份、可以漂移）；
  // 本进程就跑在那个 guest 环境里，所以审计/status 用的数据目录优先取声明值、
  // 其次取进程环境。它只用于审计，不参与任何寻址决定。
  const xdgDataHome = typeof environment.XDG_DATA_HOME === "string"
    ? environment.XDG_DATA_HOME
    : typeof process.env.XDG_DATA_HOME === "string" ? process.env.XDG_DATA_HOME : null
  const dataDirectory = xdgDataHome ? dataDirectoryUnder(xdgDataHome) : null
  const auditTarget = auditPathFor(environment, directory)
  const authorization = () => "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
  const username = "agentbox"
  // 每次运行一张一次性口令：它只保护本机 loopback 端口，从不写进任何文件或事件。
  const password = randomBytes(SECRET_BYTES).toString("base64url")
  const sessions = new Map()
  let port = 0
  let host = null
  let catalog = null
  let stopEvents = null
  let active = null
  let closed = false

  const capabilities = {
    agentInfo: { name: "opencode", version: null },
    promptCapabilities: { image: false },
    // resume 声明基于实测：重开后同一 native session 与其消息可从存储读回，
    // 因此产品的 checkpoint 可以是 resumable。
    sessionCapabilities: { resume: {}, list: {} },
  }
  const contract = { transport: "opencode-server", health: "/global/health", state: "sqlite" }

  function audit(record) {
    if (!auditTarget) return
    const sanitized = {}
    for (const [key, value] of Object.entries(record)) {
      sanitized[key] = typeof value === "string" ? redact(value, 200) : value
    }
    try {
      appendFileSync(auditTarget, JSON.stringify({ at: new Date().toISOString(), driver: "opencode", ...sanitized }) + "\n")
    } catch {
      // 审计永远不是驱动失败的理由。
    }
  }

  function baseUrl() {
    return `http://${HOST}:${port}`
  }

  async function rawRequest(method, suffix, body, timeoutMs = 30_000) {
    const response = await fetch(baseUrl() + suffix, {
      method,
      headers: {
        Authorization: authorization(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    return { status: response.status, body: parsed, text }
  }

  async function expectJson(method, suffix, body, timeoutMs = 30_000) {
    const result = await rawRequest(method, suffix, body, timeoutMs)
    if (result.status < 200 || result.status >= 300) {
      // 服务端错误的理由可能包含请求细节，先由驱动自己脱敏。
      fail("OPENCODE_SERVER_ERROR", `${method} ${suffix} -> HTTP ${result.status}: ${redact(result.text, 200)}`)
    }
    return result.body
  }

  async function loadCatalog() {
    const result = await rawRequest("GET", "/config/providers")
    if (result.status !== 200 || !result.body) {
      fail("OPENCODE_MODEL_CATALOG_UNAVAILABLE",
        `the native model catalogue could not be read (HTTP ${result.status})`)
    }
    catalog = result.body
    return catalog
  }

  async function assertModelAvailable(native, requested) {
    const current = catalog ?? await loadCatalog()
    const available = catalogHasModel(current, native.providerID, native.modelID)
    if (available === null) {
      fail("OPENCODE_MODEL_CATALOG_UNAVAILABLE", "the native model catalogue has no providers")
    }
    if (!available) {
      fail("OPENCODE_MODEL_NOT_AVAILABLE", `Harness model is not available: ${requested}`)
    }
  }

  /**
   * 订阅 server 的 SSE 事件流，把助手文本增量即时上报。
   *
   * OpenCode 把每次流式增量作为 `message.part.delta`（field=text）播发，正是产品
   * `message.delta` 需要的粒度；这里只按当前活跃的 session 过滤，事件名保持通用。
   */
  async function subscribe() {
    const controller = new AbortController()
    const response = await fetch(`${baseUrl()}/event`, {
      headers: { Authorization: authorization() }, signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      fail("OPENCODE_EVENT_STREAM_UNAVAILABLE", `the event stream answered HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const pump = (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let boundary = buffer.indexOf("\n\n")
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue
              let event = null
              try {
                event = JSON.parse(line.slice(6))
              } catch {
                event = null
              }
              if (!event) continue
              if (event.type === "message.part.delta") {
                const properties = event.properties ?? {}
                const text = typeof properties.delta === "string" ? properties.delta : ""
                if (text && properties.field === "text" && active && active.sessionId === properties.sessionID) {
                  active.deltas += 1
                  emit({ event: DELTA_EVENT, data: { text } })
                }
              }
            }
            boundary = buffer.indexOf("\n\n")
          }
        }
      } catch {
        // 流断开不是驱动失败：prompt 仍有返回值兜底，审计会记录实际增量数。
      }
    })()
    return () => {
      try {
        controller.abort()
      } catch {
        // 关闭路径上的异常不得覆盖主结果。
      }
      void pump
    }
  }

  async function start() {
    port = await freePort()
    host = new ManagedOpenCodeHost({
      command: context.command,
      host: HOST,
      port,
      username,
      password,
      environment,
      startTimeoutMs: READY_TIMEOUT_MS,
      // 口令只经 `env` 子进程的瞬时 argv 与子进程环境传递；opencode 自身的 argv
      // 里没有口令（`env` 在执行时消耗掉 VAR=value 参数），文件里也没有。
      spawnProcess: (command, args, options = {}) => context.spawnProcess(
        "/usr/bin/env",
        [`OPENCODE_SERVER_USERNAME=${username}`, `OPENCODE_SERVER_PASSWORD=${password}`,
          command, ...withPure(args)],
        { ...options, cwd: directory },
      ),
    })
    const argv = withPure(["serve", "--hostname", HOST, "--port", String(port)])
    await host.start()
    // 托管进程意外退出才算这一轮失败：主动 close 不产生 driver_exit，
    // 否则会在正常收尾时给产品上报一个假的失败事实。
    host.on("unavailable", (error) => {
      if (closed) return
      emit({ event: "driver_exit", data: { message: redact(String(error?.message ?? error), 300) } })
    })
    const health = await expectJson("GET", "/global/health")
    capabilities.agentInfo.version = typeof health?.version === "string" ? health.version : null
    await loadCatalog()
    stopEvents = await subscribe()
    audit({
      event: "host-start",
      command: context.command,
      argv,
      host: HOST,
      port,
      processID: host.processID ?? null,
      dataDirectory,
      stateDirectory,
      configPath: typeof environment.OPENCODE_CONFIG === "string" ? environment.OPENCODE_CONFIG : null,
      healthVersion: capabilities.agentInfo.version,
      credentialsInArgv: false,
    })
  }

  async function create({ title, model } = {}) {
    const native = splitNativeModel(model)
    await assertModelAvailable(native, model)
    const created = await expectJson("POST", "/session", {
      // 显式标题避免 OpenCode 为生成标题再发一次 provider 请求（实测）。
      title: typeof title === "string" && title.length > 0 ? title.slice(0, 200) : FALLBACK_TITLE,
      model: { id: native.modelID, providerID: native.providerID },
    })
    const sessionId = created && typeof created.id === "string" ? created.id : null
    if (!sessionId) fail("OPENCODE_SESSION_CREATE_FAILED", "the native session id is missing")
    sessions.set(sessionId, { title: created.title ?? null, model: String(model) })
    audit({
      event: "create", method: "POST /session", sessionId,
      title: created.title ?? null, model: String(model), titleSupplied: true,
    })
    return { sessionId, title: created.title ?? null }
  }

  async function storedSession(sessionId) {
    const result = await rawRequest("GET", `/session/${encodeURIComponent(sessionId)}`)
    if (result.status === 404 || !result.body || typeof result.body.id !== "string") return null
    if (result.status !== 200) {
      fail("OPENCODE_SERVER_ERROR", `GET /session -> HTTP ${result.status}`)
    }
    return result.body
  }

  /**
   * 重开一个已经存储的原生会话：只读存储，绝不新建。
   *
   * 证据：`GET /session/<id>` 与 `GET /session/<id>/message` 从 SQLite 读回上一轮
   * 的标题与消息；找不到时以 OPENCODE_SESSION_NOT_FOUND 失败，让产品的不可用
   * checkpoint 明确失败而不是静默换一条新会话。
   */
  async function open({ sessionId, model } = {}) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      fail("OPENCODE_SESSION_NOT_FOUND", "the native session id is missing")
    }
    const stored = await storedSession(sessionId)
    if (!stored) {
      fail("OPENCODE_SESSION_NOT_FOUND", `the native session is not stored: ${redact(sessionId, 120)}`)
    }
    const messages = await rawRequest("GET", `/session/${encodeURIComponent(sessionId)}/message`)
    sessions.set(sessionId, { title: stored.title ?? null, model: String(model ?? "") })
    audit({
      event: "open",
      method: `GET /session/${redact(sessionId, 120)}`,
      created: false,
      sessionId,
      title: stored.title ?? null,
      storedMessages: Array.isArray(messages.body) ? messages.body.length : null,
      model: model === undefined ? null : String(model),
    })
    return { sessionId: stored.id }
  }

  async function prompt({ sessionId, text, model, attachments } = {}) {
    if (closed) fail("OPENCODE_DRIVER_CLOSED", "the driver is closed")
    if (Array.isArray(attachments) && attachments.length > 0) {
      fail("OPENCODE_ATTACHMENTS_UNSUPPORTED", "this deployment does not carry attachments")
    }
    if (typeof text !== "string" || text.length === 0) {
      fail("OPENCODE_PROMPT_INVALID", "the prompt text is empty")
    }
    const native = splitNativeModel(model)
    await assertModelAvailable(native, model)
    if (!sessions.has(sessionId)) {
      // 重开路径不会先 create；这里仍然只校验存在性，不新建。
      const stored = await storedSession(sessionId)
      if (!stored) fail("OPENCODE_SESSION_NOT_FOUND", `the native session is not stored: ${redact(sessionId, 120)}`)
      sessions.set(sessionId, { title: stored.title ?? null, model: String(model) })
    }
    const current = { sessionId, deltas: 0 }
    active = current
    let response = null
    try {
      response = await expectJson("POST", `/session/${encodeURIComponent(sessionId)}/message`, {
        model: { providerID: native.providerID, modelID: native.modelID },
        parts: [{ type: "text", text }],
      }, PROMPT_TIMEOUT_MS)
      // provider 一次性返回整段文本时，最后一个增量事件与响应几乎同时到达；
      // 给事件流一个很短的排空窗口，避免丢掉"已经发生"的增量。
      const drainUntil = Date.now() + DRAIN_DELTAS_MS
      while (current.deltas === 0 && Date.now() < drainUntil) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    } finally {
      active = null
    }
    if (current.deltas === 0) {
      // 兜底：SSE 未送达任何增量时，把这一轮的最终文本作为一次增量上报，
      // 保证产品的转写不会丢掉真实答案。
      const finalText = textOfParts(response?.parts)
      if (finalText) emit({ event: DELTA_EVENT, data: { text: finalText } })
    }
    audit({
      event: "prompt", sessionId, model: String(model),
      incrementalDeltas: current.deltas, streamed: current.deltas > 0,
      messageId: response && response.info ? response.info.id ?? null : null,
      failed: Boolean(response && response.info && response.info.error),
    })
    return {
      done: true,
      sessionId,
      messageId: response && response.info ? response.info.id ?? null : null,
      deltas: current.deltas,
    }
  }

  async function abort(sessionId) {
    if (typeof sessionId !== "string" || sessionId.length === 0) return
    try {
      await rawRequest("POST", `/session/${encodeURIComponent(sessionId)}/abort`, {})
      audit({ event: "abort", sessionId })
    } catch {
      // 中止是尽力而为：会话可能已经结束。
    }
  }

  async function waitForExit(timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!host || host.processID === undefined) return true
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return !host || host.processID === undefined
  }

  async function close() {
    if (closed) return
    closed = true
    if (stopEvents) stopEvents()
    let stopped = false
    let forced = false
    if (host) {
      host.stop("SIGTERM")
      stopped = await waitForExit(CLOSE_TIMEOUT_MS)
      if (!stopped) {
        host.stop("SIGKILL")
        forced = true
        stopped = await waitForExit(CLOSE_TIMEOUT_MS)
      }
    }
    audit({ event: "close", stopped, forced, dataDirectory, stateDirectory })
  }

  async function status(sessionId) {
    return {
      sessions: [...sessions.keys()],
      sessionId: sessionId ?? null,
      host: HOST,
      port,
      processID: host ? host.processID ?? null : null,
      dataDirectory,
      stateDirectory,
      modelDirectory: catalog !== null,
      deltas: active ? active.deltas : 0,
    }
  }

  return { capabilities, contract, start, create, open, prompt, abort, close, status }
}
