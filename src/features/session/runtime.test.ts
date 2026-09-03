/**
 * CodegRustSessionRuntime 行为测试（§12.4）：mock transport 驱动
 * connect 时序 / send 直通 / 重连重放 / 权限作答直通 / 先快照后增量。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AttachHandlers,
  EventStream,
  EventStreamSubscription,
} from "@/core/transport/types"
import type {
  EventEnvelope,
  LiveSessionSnapshot,
  PreflightResult,
} from "@/lib/types"
import {
  CodegRustSessionRuntime,
  SessionRuntimeError,
  type AttachCapableTransport,
} from "./runtime"

// ─── mock 设施 ───

type MockFn = ReturnType<typeof vi.fn>

/** attach(connectionId, options, handlers) 的调用记录形状 */
type AttachHandlersCall = [string, AttachOptionsLike, AttachHandlers]
type AttachOptionsLike = { sinceSeq?: number }
/** subscribe(event, handler) 的调用记录形状 */
type FirehoseCall = [string, (envelope: EventEnvelope) => void]

interface MockHarness {
  transport: AttachCapableTransport
  call: MockFn
  subscribe: MockFn
  waitForReady: MockFn
  attach: MockFn
  /** attach 订阅返回的 detach 侦探（断言 disconnect 拆订阅用） */
  detachSpy: MockFn
  attachHandlers: () => AttachHandlers | undefined
  firehoseHandler: () => ((envelope: EventEnvelope) => void) | undefined
  reconnectCallbacks: Array<() => void>
  /** acp_get_session_snapshot 的返回（firehose 路径用） */
  snapshot: LiveSessionSnapshot | null
  /** 快照请求期间的延迟控制（测试缓冲语义时用） */
  snapshotDelay: () => Promise<void>
}

function makeSnapshot(eventSeq: number): LiveSessionSnapshot {
  return {
    connection_id: "conn-1",
    conversation_id: 42,
    folder_id: null,
    status: "prompting",
    external_id: null,
    live_message: {
      id: "lm-1",
      role: "assistant",
      content: [{ kind: "text", text: "mid-turn" }],
      started_at: "2026-09-03T00:00:00.000Z",
    },
    active_tool_calls: [],
    pending_permission: null,
    modes: null,
    current_mode: null,
    config_options: null,
    prompt_capabilities: null,
    usage: null,
    fork_supported: false,
    available_commands: [],
    selectors_ready: true,
    event_seq: eventSeq,
  }
}

function createHarness(opts?: {
  /** false = 无 attach 协议（legacy firehose 路径） */
  attachCapable?: boolean
}): MockHarness {
  const detach = vi.fn()
  const attach = vi.fn(
    (): EventStreamSubscription => ({ detach, subscriptionId: "sub-1" })
  )
  const reconnectCallbacks: Array<() => void> = []
  const harness = {} as MockHarness
  const call = vi.fn(
    async (command: string, args?: Record<string, unknown>) => {
      void args
      switch (command) {
        case "acp_preflight":
          return {
            agent_type: "claude",
            agent_name: "Claude",
            passed: true,
            checks: [],
            adapter: null,
          } satisfies PreflightResult
        case "acp_connect":
          return "conn-1"
        case "acp_get_session_snapshot":
        case "acp_get_session_snapshot_by_conversation":
          await harness.snapshotDelay()
          return harness.snapshot
        default:
          return null
      }
    }
  )
  const subscribe = vi.fn(async () => () => {})
  const waitForReady = vi.fn(async () => {})
  const stream: EventStream = { attach: attach as EventStream["attach"] }
  const transport: AttachCapableTransport = {
    call: call as unknown as AttachCapableTransport["call"],
    subscribe: subscribe as unknown as AttachCapableTransport["subscribe"],
    isDesktop: () => false,
    waitForReady,
    onReconnect: (callback: () => void) => {
      reconnectCallbacks.push(callback)
      return () => {}
    },
    ...(opts?.attachCapable === false ? {} : { eventStream: () => stream }),
  }
  harness.transport = transport
  harness.call = call
  harness.subscribe = subscribe
  harness.waitForReady = waitForReady
  harness.attach = attach
  harness.detachSpy = detach
  harness.attachHandlers = () => {
    const calls = attach.mock.calls as unknown as AttachHandlersCall[]
    return calls.length > 0 ? calls[calls.length - 1]?.[2] : undefined
  }
  harness.firehoseHandler = () => {
    const calls = subscribe.mock.calls as unknown as FirehoseCall[]
    return calls.length > 0 ? calls[calls.length - 1]?.[1] : undefined
  }
  harness.reconnectCallbacks = reconnectCallbacks
  harness.snapshot = makeSnapshot(10)
  harness.snapshotDelay = () => Promise.resolve()
  return harness
}

function envelope(
  event: Record<string, unknown>,
  seq: number,
  connectionId = "conn-1"
): EventEnvelope {
  return {
    seq,
    connection_id: connectionId,
    ...event,
  } as EventEnvelope
}

function collect(runtime: CodegRustSessionRuntime) {
  const events: string[] = []
  runtime.events.subscribe((event) => events.push(event.type))
  return events
}

const SPEC = { harnessId: "claude", cwd: "/tmp/project" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("connect 时序（preflight → connect → waitForReady → attach）", () => {
  it("按 §12.2 顺序执行且不带 sinceSeq 冷启动", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)

    expect(h.call.mock.calls.map((c) => c[0])).toEqual([
      "acp_preflight",
      "acp_connect",
    ])
    // waitForReady 在 acp_connect 之后、attach 之前
    const readyOrder = h.waitForReady.mock.invocationCallOrder[0]
    const connectOrder = h.call.mock.invocationCallOrder[1]
    const attachOrder = h.attach.mock.invocationCallOrder[0]
    expect(connectOrder).toBeLessThan(readyOrder)
    expect(readyOrder).toBeLessThan(attachOrder)
    expect(h.attach).toHaveBeenCalledWith(
      "conn-1",
      { sinceSeq: undefined },
      expect.anything()
    )
  })

  it("注入的 resolveContextKey 参与解析", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({
      transport: h.transport,
      resolveContextKey: (spec) => `key:${spec.harnessId}`,
    })
    await runtime.connect(SPEC)
    expect(runtime.activeContextKey).toBe("key:claude")
  })

  it("preflight 未通过 → connect 拒绝且不 acp_connect", async () => {
    const h = createHarness()
    h.call.mockImplementation(async (command: string) => {
      if (command === "acp_preflight") {
        return {
          passed: false,
          checks: [],
          agent_type: "x",
          agent_name: "x",
          adapter: null,
        }
      }
      return null
    })
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await expect(runtime.connect(SPEC)).rejects.toBeInstanceOf(
      SessionRuntimeError
    )
    expect(h.call.mock.calls.some((c) => c[0] === "acp_connect")).toBe(false)
  })

  it("无 attach 协议时走 legacy firehose：订阅 + 快照 + 无 attach 调用", async () => {
    const h = createHarness({ attachCapable: false })
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    expect(h.subscribe).toHaveBeenCalledWith(
      "acp://event",
      expect.any(Function)
    )
    expect(h.call.mock.calls.map((c) => c[0])).toContain(
      "acp_get_session_snapshot"
    )
  })
})

describe("命令直通", () => {
  it("send → acp_prompt（文本/附件/命令归一化）", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    await runtime.send({
      text: "hello",
      attachments: [{ path: "file:///tmp/a.png", mimeType: "image/png" }],
    })
    const promptCall = h.call.mock.calls.find((c) => c[0] === "acp_prompt")
    expect(promptCall?.[1]).toEqual({
      connectionId: "conn-1",
      blocks: [
        { type: "text", text: "hello" },
        {
          type: "resource",
          uri: "file:///tmp/a.png",
          mime_type: "image/png",
        },
      ],
      folderId: null,
      conversationId: null,
      clientMessageId: null,
    })
  })

  it("cancel → acp_cancel", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    await runtime.cancel()
    expect(h.call).toHaveBeenCalledWith("acp_cancel", {
      connectionId: "conn-1",
    })
  })

  it("未连接时 send/cancel 抛 NOT_CONNECTED", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await expect(runtime.send({ text: "x" })).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    })
    await expect(runtime.cancel()).rejects.toBeInstanceOf(SessionRuntimeError)
  })

  it("respondPermission：option/question/plan-approval 三路直通", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)

    await runtime.respondPermission("pr-1", {
      kind: "option",
      optionId: "allow",
    })
    expect(h.call).toHaveBeenCalledWith("acp_respond_permission", {
      connectionId: "conn-1",
      requestId: "pr-1",
      optionId: "allow",
    })

    await runtime.respondPermission("q-1", {
      kind: "question",
      answers: [{ questionId: "q1", labels: ["A"] }],
    })
    expect(h.call).toHaveBeenCalledWith("acp_answer_question", {
      connectionId: "conn-1",
      questionId: "q-1",
      answer: {
        answers: [{ questionId: "q1", labels: ["A"] }],
        declined: false,
      },
    })

    await runtime.respondPermission("pa-1", {
      kind: "plan-approval",
      decision: "approve",
      feedback: null,
    })
    expect(h.call).toHaveBeenCalledWith("acp_answer_plan_approval", {
      connectionId: "conn-1",
      approvalId: "pa-1",
      answer: { decision: "approve", feedback: null },
    })
  })
})

describe("attach 路径：快照对齐与 seq 去重", () => {
  it("onSnapshot → snapshot-hydrated；seq<=基线 的 onEvent 丢弃", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const events = collect(runtime)
    const handlers = h.attachHandlers()!

    handlers.onSnapshot!(makeSnapshot(10), 10)
    expect(events).toEqual(["snapshot-hydrated"])

    handlers.onEvent!(envelope({ type: "content_delta", text: "x" }, 10))
    handlers.onEvent!(envelope({ type: "content_delta", text: "x" }, 9))
    expect(events).toEqual(["snapshot-hydrated"])

    handlers.onEvent!(envelope({ type: "content_delta", text: "ok" }, 11))
    expect(events).toEqual(["snapshot-hydrated", "part-appended"])
  })

  it("异连接信封被过滤；未知事件被丢弃计数", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const events = collect(runtime)
    const handlers = h.attachHandlers()!

    handlers.onEvent!(
      envelope({ type: "content_delta", text: "other" }, 1, "conn-2")
    )
    handlers.onEvent!(envelope({ type: "session_started", session_id: "s" }, 2))
    expect(events).toEqual([])
    expect(runtime.droppedEventCount).toBe(1)
  })

  it("onReplay 重放逐条去重", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const events = collect(runtime)
    const handlers = h.attachHandlers()!

    handlers.onReplay!(
      [
        envelope({ type: "content_delta", text: "a" }, 1),
        envelope({ type: "content_delta", text: "a" }, 1),
        envelope({ type: "thinking", text: "b" }, 2),
      ],
      2
    )
    expect(events).toEqual(["part-appended", "part-appended"])
  })

  it("onDetached(lagged) 携当前游标重挂", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const handlers = h.attachHandlers()!
    handlers.onEvent!(envelope({ type: "content_delta", text: "x" }, 30))

    handlers.onDetached!("lagged")
    expect(h.attach).toHaveBeenCalledTimes(2)
    expect(h.attach).toHaveBeenLastCalledWith(
      "conn-1",
      { sinceSeq: 30 },
      expect.anything()
    )
  })

  it("onDetached(connection_gone) → fatal session-error", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const events: string[] = []
    runtime.events.subscribe((event) => {
      if (event.type === "session-error") events.push(event.code ?? "")
    })
    h.attachHandlers()!.onDetached!("connection_gone")
    expect(events).toEqual(["connection_gone"])
    await expect(runtime.cancel()).rejects.toBeInstanceOf(SessionRuntimeError)
  })
})

describe("firehose 路径：先快照后增量", () => {
  it("快照请求期间到达的信封缓冲，水合后按序排空（seq 去重）", async () => {
    const h = createHarness({ attachCapable: false })
    // TS 无法跨闭包追踪赋值：先给一个可调用的占位实现
    let releaseSnapshot: () => void = () => {}
    h.snapshotDelay = () =>
      new Promise<void>((resolve) => {
        releaseSnapshot = resolve
      })
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    const events = collect(runtime)
    const connectPromise = runtime.connect(SPEC)
    // connect 的前置命令都是 await，订阅注册要等微任务排空后再取
    await vi.waitFor(() => expect(h.subscribe).toHaveBeenCalled())

    // 快照请求在途：先投递两帧（一帧 <= 快照基线，会被去重）
    const firehose = h.firehoseHandler()!
    firehose(envelope({ type: "content_delta", text: "dup" }, 10))
    firehose(envelope({ type: "thinking", text: "new" }, 11))
    expect(events).toEqual([]) // 快照未落地前不增量

    releaseSnapshot()
    await connectPromise
    expect(events).toEqual([
      "snapshot-hydrated", // 先快照
      "part-appended", // 后增量（seq 11；seq 10 被去重）
    ])
  })

  it("断线重连：firehose 模式重取快照", async () => {
    const h = createHarness({ attachCapable: false })
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const events = collect(runtime)

    h.snapshot = makeSnapshot(50)
    h.reconnectCallbacks.forEach((cb) => cb())
    await vi.waitFor(() => {
      expect(events).toContain("snapshot-hydrated")
    })
    // 陈旧保护：基线已到 50，旧快照（10）不再发射
    events.length = 0
    h.snapshot = makeSnapshot(10)
    h.reconnectCallbacks.forEach((cb) => cb())
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toEqual([])
  })
})

describe("重连重放（attach 模式）", () => {
  it("onReconnect 触发重挂，sinceSeq = 已应用最高 seq", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    h.attachHandlers()!.onEvent!(
      envelope({ type: "content_delta", text: "x" }, 99)
    )

    expect(h.attach).toHaveBeenCalledTimes(1)
    h.reconnectCallbacks.forEach((cb) => cb())
    expect(h.attach).toHaveBeenCalledTimes(2)
    expect(h.attach).toHaveBeenLastCalledWith(
      "conn-1",
      { sinceSeq: 99 },
      expect.anything()
    )
  })
})

describe("permissions 通道", () => {
  it("permission-requested / resolved 维护列表并通知", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const snapshots: number[] = []
    runtime.permissions.subscribe((requests) => snapshots.push(requests.length))
    expect(snapshots).toEqual([0]) // 订阅即得当前值

    const handlers = h.attachHandlers()!
    handlers.onEvent!(
      envelope(
        {
          type: "permission_request",
          request_id: "pr-1",
          tool_call: { title: "Bash" },
          options: [{ option_id: "a", name: "Allow", kind: "allow_once" }],
        },
        1
      )
    )
    expect(snapshots).toEqual([0, 1])
    handlers.onEvent!(
      envelope({ type: "permission_resolved", request_id: "pr-1" }, 2)
    )
    expect(snapshots).toEqual([0, 1, 0])
  })

  it("快照水合替换权限列表", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    const snapshots: unknown[][] = []
    runtime.permissions.subscribe((requests) => snapshots.push(requests))

    h.attachHandlers()!.onSnapshot!(
      {
        ...makeSnapshot(3),
        pending_permission: {
          request_id: "pr-9",
          tool_call_id: "t-1",
          tool_call: { title: "Bash" },
          options: [],
          created_at: "2026-09-03T00:00:00.000Z",
        },
      },
      3
    )
    expect(snapshots[snapshots.length - 1]).toEqual([
      expect.objectContaining({ type: "tool", id: "pr-9" }),
    ])
  })
})

describe("restore / disconnect", () => {
  it("restore：按会话取快照 → 发射 snapshot-hydrated → 返回领域快照", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    const events = collect(runtime)
    const snapshot = await runtime.restore("42")
    expect(h.call).toHaveBeenCalledWith(
      "acp_get_session_snapshot_by_conversation",
      { conversationId: 42 }
    )
    expect(events).toEqual(["snapshot-hydrated"])
    expect(snapshot.conversationId).toBe("42")
    expect(snapshot.lastEventSeq).toBe(10)
  })

  it("restore 无活跃会话 → SESSION_NOT_FOUND", async () => {
    const h = createHarness()
    h.snapshot = null
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await expect(runtime.restore("42")).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    })
  })

  it("disconnect 幂等：拆订阅 + acp_disconnect 一次", async () => {
    const h = createHarness()
    const runtime = new CodegRustSessionRuntime({ transport: h.transport })
    await runtime.connect(SPEC)
    await runtime.disconnect()
    await runtime.disconnect()
    expect(h.detachSpy).toHaveBeenCalledTimes(1)
    const disconnectCalls = h.call.mock.calls.filter(
      (c) => c[0] === "acp_disconnect"
    )
    expect(disconnectCalls).toEqual([
      ["acp_disconnect", { connectionId: "conn-1" }],
    ])
  })
})
