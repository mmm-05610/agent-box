/**
 * AgentBoxTransport 行为测试：mock fetch / WebSocket 驱动
 * HTTP 方法与鉴权头 / 超时 / 错误透传 / WS 通道 ready + 事件分发 /
 * 重连回调（首次 ready 不算重连）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentBoxTransport } from "./agentbox-transport"

// 最小可控 WebSocket 替身：记录实例、暴露 open/ready/drop 驱动，
// 语义对齐 web-transport.test.ts 的 MockWebSocket。
class MockWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  constructor(
    public url: string,
    public protocols?: string | string[]
  ) {
    MockWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
  // 服务端连上即推 ready 帧（agent-box-studio 语义）
  ready() {
    this.onmessage?.({ data: JSON.stringify({ type: "ready" }) })
  }
  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
  drop() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  MockWebSocket.instances = []
  vi.stubGlobal("WebSocket", MockWebSocket)
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const ok200 = (body: unknown = {}) => ({
  status: 200,
  ok: true,
  text: async () => JSON.stringify(body),
})

describe("AgentBoxTransport HTTP", () => {
  it("call defaults to POST with Bearer auth and JSON body", async () => {
    fetchMock.mockResolvedValue(ok200({ turn_id: "t1", state: "queued" }))
    const t = new AgentBoxTransport({
      baseUrl: "http://localhost:3081/",
      token: "secret",
    })
    const receipt = await t.call<{ turn_id: string }>("sessions/s1/turns", {
      input_text: "hi",
    })

    expect(receipt).toEqual({ turn_id: "t1", state: "queued" })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3081/api/v1/sessions/s1/turns",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        }),
      })
    )
    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({ input_text: "hi" })
  })

  it("get() uses GET without a body and post/put/delete map methods", async () => {
    fetchMock.mockResolvedValue(ok200({ profiles: [] }))
    const t = new AgentBoxTransport({ baseUrl: "http://x", token: "t" })

    await t.get("sessions")
    await t.post("sessions", { project_path: "/p" })
    await t.put("profiles/codex/p1", { payload: {} })
    await t.delete("sessions/s1")

    const methods = fetchMock.mock.calls.map(
      (call) => (call[1] as RequestInit).method
    )
    expect(methods).toEqual(["GET", "POST", "PUT", "DELETE"])
    const getUrl = fetchMock.mock.calls[0][0] as string
    expect(getUrl).toBe("http://x/api/v1/sessions")
    // GET 不携带 body
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeUndefined()
  })

  it("token can be resolved lazily per call", async () => {
    fetchMock.mockResolvedValue(ok200())
    let dynamic = "first"
    const t = new AgentBoxTransport({
      baseUrl: "http://x",
      token: () => dynamic,
    })

    await t.get("health")
    dynamic = "second"
    await t.get("health")

    const headers = fetchMock.mock.calls.map(
      (call) => (call[1] as RequestInit).headers as Record<string, string>
    )
    expect(headers[0].Authorization).toBe("Bearer first")
    expect(headers[1].Authorization).toBe("Bearer second")
  })

  it("aborts a hung call at timeoutMs and reports 'Request timed out'", async () => {
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        })
    )
    const t = new AgentBoxTransport({ baseUrl: "http://x" })

    const pending = t.get("sessions", { timeoutMs: 1000 })
    const expectation = expect(pending).rejects.toThrow("Request timed out")
    await vi.advanceTimersByTimeAsync(1_000)
    await expectation
  })

  it("surfaces FastAPI detail strings and 401 as Unauthorized", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })

    fetchMock.mockResolvedValue({
      status: 404,
      ok: false,
      json: async () => ({ detail: "session not found" }),
    })
    await expect(t.get("sessions/nope")).rejects.toThrow("session not found")

    fetchMock.mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ detail: "invalid token" }),
    })
    await expect(t.get("sessions")).rejects.toThrow("Unauthorized")

    fetchMock.mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => {
        throw new Error("not json")
      },
    })
    await expect(t.get("sessions")).rejects.toThrow("HTTP 500")
  })

  it("returns undefined for empty 2xx bodies", async () => {
    fetchMock.mockResolvedValue({
      status: 204,
      ok: true,
      text: async () => "",
    })
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    await expect(t.delete("sessions/s1")).resolves.toBeUndefined()
  })
})

describe("AgentBoxTransport WS channels", () => {
  it("subscribe opens the session events WS and dispatches payloads", async () => {
    const t = new AgentBoxTransport({
      baseUrl: "http://localhost:3081",
      token: "tok",
    })
    const seen: unknown[] = []
    const pending = t.subscribe("sessions/s1/events", (payload) => {
      seen.push(payload)
    })

    const ws = lastWs()
    expect(ws.url).toBe(
      "ws://localhost:3081/api/v1/sessions/s1/events?token=tok"
    )
    ws.open()
    ws.ready()
    const unsub = await pending

    // 控制帧被忽略，事件本体原样分发
    ws.emit({ type: "ping" })
    const event = { type: "turn-completed", turnId: "t1" }
    ws.emit(event)
    expect(seen).toEqual([event])

    unsub()
    // 最后一个订阅者退订 → 通道 socket 关闭
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })

  it("subscribe tolerates a missing ready frame (bounded wait)", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const unsubPromise = t.subscribe("sessions/s1/events", () => {})
    lastWs().open()
    // 不发 ready —— 5s 后放行而不是挂死
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(unsubPromise).resolves.toBeTypeOf("function")
    warn.mockRestore()
    unsubPromise.then((unsub) => unsub())
  })

  it("shares one socket across subscribers of the same channel", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    const first = t.subscribe("sessions/s1/events", () => {})
    const second = t.subscribe("sessions/s1/events", () => {})
    lastWs().open()
    lastWs().ready()
    await Promise.all([first, second])
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it("treats the first ready as initial connect and later readies as reconnect", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    const onReconnect = vi.fn()
    t.onReconnect(onReconnect)
    const pending = t.subscribe("sessions/s1/events", () => {})
    const ws = lastWs()
    ws.open()
    ws.ready()
    const unsub = await pending
    expect(onReconnect).not.toHaveBeenCalled()

    // 断线 → 退避重连 → 第二次 ready = 重连回调
    ws.drop()
    await vi.advanceTimersByTimeAsync(1_000)
    const ws2 = lastWs()
    expect(ws2).not.toBe(ws)
    ws2.open()
    ws2.ready()
    expect(onReconnect).toHaveBeenCalledTimes(1)

    unsub()
  })

  it("keeps backing off with exponential delays when reconnects fail", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    const pending = t.subscribe("sessions/s1/events", () => {})
    lastWs().open()
    lastWs().ready()
    const unsub = await pending

    let ws = lastWs()
    ws.drop()
    await vi.advanceTimersByTimeAsync(1_000)
    ws = lastWs()
    ws.drop()
    await vi.advanceTimersByTimeAsync(1_000)
    // 第二次失败后下一次退避是 2s，不是 1s：1s 处还没有新 socket
    expect(MockWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(MockWebSocket.instances).toHaveLength(3)
    unsub()
  })

  it("waitForReady resolves immediately with no channels and waits for active ones", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    await expect(t.waitForReady()).resolves.toBeUndefined()

    const pending = t.subscribe("sessions/s1/events", () => {})
    lastWs().open()
    const waitPromise = t.waitForReady()
    let settled = false
    void waitPromise.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    lastWs().ready()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(true)
    await pending.then((unsub) => unsub())
  })

  it("destroy() closes channels and a late close schedules nothing", async () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    const pending = t.subscribe("sessions/s1/events", () => {})
    const ws = lastWs()
    ws.open()
    ws.ready()
    const unsub = await pending
    const lateClose = ws.onclose

    t.destroy()
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
    lateClose?.() // destroy 之后的异步 close 不得触发重连
    await vi.advanceTimersByTimeAsync(60_000)
    expect(MockWebSocket.instances).toHaveLength(1)
    unsub() // 幂等
  })

  it("isDesktop is always false", () => {
    const t = new AgentBoxTransport({ baseUrl: "http://x" })
    expect(t.isDesktop()).toBe(false)
  })
})
