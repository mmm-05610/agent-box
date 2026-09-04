/**
 * AgentBox 后端绑定行为测试：mock transport 驱动
 * turns POST 载荷 / 事件归一透传 / restore 快照水合 / projects 去重 /
 * profiles CRUD / 聚合入口。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentBoxTransport } from "@/core/transport/agentbox-transport"
import {
  AgentBoxBackendError,
  AgentBoxSessionRuntime,
  createAgentBoxBackend,
  normalizeSessionEvent,
  sessionsToProjects,
  transcriptToSnapshot,
} from "./backend-agentbox"
import type { SessionEvent } from "@/core/domain"

// ─── mock 设施 ───

type MockFn = ReturnType<typeof vi.fn>

interface MockHarness {
  transport: AgentBoxTransport
  call: MockFn
  get: MockFn
  post: MockFn
  put: MockFn
  del: MockFn
  subscribe: MockFn
  onReconnect: MockFn
  /** subscribe(event, handler) 的 handler 取用器 */
  eventsHandler: () => ((raw: unknown) => void) | undefined
  /** onReconnect(callback) 的回调触发器 */
  fireReconnect: () => void
}

function createHarness(): MockHarness {
  const harness = {} as MockHarness
  const reconnectCallbacks: Array<() => void> = []
  harness.call = vi.fn(async () => null)
  harness.get = vi.fn(async () => ({}))
  harness.post = vi.fn(async () => ({}))
  harness.put = vi.fn(async () => ({}))
  harness.del = vi.fn(async () => ({}))
  harness.subscribe = vi.fn(async () => () => {})
  harness.onReconnect = vi.fn((callback: () => void) => {
    reconnectCallbacks.push(callback)
    return () => {}
  })
  const transport = {
    call: harness.call,
    get: harness.get,
    post: harness.post,
    put: harness.put,
    delete: harness.del,
    subscribe: harness.subscribe,
    onReconnect: harness.onReconnect,
    isDesktop: () => false,
  } as unknown as AgentBoxTransport
  harness.transport = transport
  harness.eventsHandler = () => {
    const calls = harness.subscribe.mock.calls as Array<
      [string, (raw: unknown) => void]
    >
    const last = calls[calls.length - 1]
    return last?.[1]
  }
  harness.fireReconnect = () => {
    for (const callback of reconnectCallbacks) callback()
  }
  return harness
}

/** 建好会话（s1）并连上 events 频道的 runtime */
async function connectRuntime(harness: MockHarness) {
  harness.post.mockImplementation(async (path: string) => {
    if (path === "sessions") {
      return {
        session: {
          id: "s1",
          project_path: "/repo",
          title: "repo (codex)",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      }
    }
    return { turn_id: "t9", state: "queued", idem_key: "k" }
  })
  const runtime = new AgentBoxSessionRuntime({ transport: harness.transport })
  await runtime.connect({ harnessId: "codex", cwd: "/repo" })
  return runtime
}

function sessionRow(id: string, projectPath: string, createdAt: string) {
  return { id, project_path: projectPath, title: id, created_at: createdAt }
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

// ─── connect / send / cancel ───

describe("AgentBoxSessionRuntime lifecycle", () => {
  it("connect creates a studio session and subscribes its events channel", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)

    expect(harness.post).toHaveBeenCalledWith("sessions", {
      project_path: "/repo",
      title: "repo (codex)",
    })
    expect(harness.subscribe).toHaveBeenCalledWith(
      "sessions/s1/events",
      expect.any(Function)
    )
    expect(runtime.activeSessionId).toBe("s1")
  })

  it("connect with resumeConversationId binds the existing session without POST", async () => {
    const harness = createHarness()
    const runtime = new AgentBoxSessionRuntime({ transport: harness.transport })
    await runtime.connect({
      harnessId: "claude",
      cwd: "/repo",
      resumeConversationId: "s9",
    })

    expect(harness.post).not.toHaveBeenCalled()
    expect(harness.subscribe).toHaveBeenCalledWith(
      "sessions/s9/events",
      expect.any(Function)
    )
    expect(runtime.activeSessionId).toBe("s9")
  })

  it("disconnect tears down the events subscription and clears state", async () => {
    const harness = createHarness()
    const unsub = vi.fn()
    // 在 connect 之前就位：首次 subscribe 返回侦探
    harness.subscribe.mockReturnValue(unsub)
    const runtime = await connectRuntime(harness)

    await runtime.disconnect()
    expect(unsub).toHaveBeenCalled()
    expect(runtime.activeSessionId).toBeNull()
    // 幂等
    await expect(runtime.disconnect()).resolves.toBeUndefined()
  })

  it("a second connect replaces the first session's subscription", async () => {
    const harness = createHarness()
    const firstUnsub = vi.fn()
    harness.subscribe
      .mockReturnValueOnce(firstUnsub)
      .mockReturnValueOnce(vi.fn())
    harness.post.mockImplementation(async () => ({
      session: { id: "s1", project_path: "/repo", title: "t" },
    }))
    const runtime = new AgentBoxSessionRuntime({ transport: harness.transport })
    await runtime.connect({ harnessId: "codex", cwd: "/repo" })
    await runtime.connect({ harnessId: "codex", cwd: "/other" })

    expect(firstUnsub).toHaveBeenCalled()
    expect(runtime.activeSessionId).toBe("s1")
    const channels = harness.subscribe.mock.calls.map((call) => call[0])
    expect(channels).toEqual(["sessions/s1/events", "sessions/s1/events"])
  })
})

describe("AgentBoxSessionRuntime send/cancel", () => {
  it("send POSTs the governed turn payload with input_text/harness_type/idem_key", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    await runtime.send({ text: "hello world" })

    expect(harness.post).toHaveBeenCalledWith("sessions/s1/turns", {
      input_text: "hello world",
      harness_type: "codex",
      idem_key: expect.any(String),
    })
    const body = harness.post.mock.calls[1][1] as { idem_key: string }
    expect(body.idem_key.length).toBeGreaterThan(8)
  })

  it("send maps command to input_text and includes binding options when set", async () => {
    const harness = createHarness()
    harness.post.mockResolvedValue({
      session: { id: "s1", project_path: "/repo", title: "t" },
    })
    const runtime = new AgentBoxSessionRuntime({
      transport: harness.transport,
      turnOptions: {
        profileRef: "codex-work@3",
        modelOverlay: { model: "gpt-5.4-mini" },
        handoffFrom: "claude-s4",
      },
    })
    await runtime.connect({ harnessId: "codex", cwd: "/repo" })
    await runtime.send({ command: "/review", attachments: [{ path: "/a.ts" }] })

    expect(harness.post).toHaveBeenCalledWith("sessions/s1/turns", {
      input_text: "/review",
      harness_type: "codex",
      idem_key: expect.any(String),
      profile_ref: "codex-work@3",
      model_overlay: { model: "gpt-5.4-mini" },
      handoff_from: "claude-s4",
    })
  })

  it("send with no text, command, or attachments is rejected", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    await expect(runtime.send({})).rejects.toMatchObject({
      code: "EMPTY_INPUT",
    })
  })

  it("cancel POSTs the provisional per-turn endpoint after a send", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    await runtime.send({ text: "go" })
    await runtime.cancel()

    expect(harness.call).toHaveBeenCalledWith(
      "sessions/s1/turns/t9/cancel",
      undefined,
      { method: "POST" }
    )
  })

  it("cancel without a prior turn is a no-op and swallows endpoint failures", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    await runtime.cancel()
    expect(harness.call).not.toHaveBeenCalled()

    await runtime.send({ text: "go" })
    harness.call.mockRejectedValue(new Error("HTTP 404"))
    // wire 尚无 cancel 端点：404 静默吞掉，不向调用方抛错
    await expect(runtime.cancel()).resolves.toBeUndefined()
  })

  it("send/cancel before connect fail with NOT_CONNECTED", async () => {
    const harness = createHarness()
    const runtime = new AgentBoxSessionRuntime({ transport: harness.transport })
    await expect(runtime.send({ text: "x" })).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    })
    await expect(runtime.cancel()).rejects.toMatchObject({
      code: "NOT_CONNECTED",
    })
  })
})

// ─── 事件归一透传 ───

describe("AgentBoxSessionRuntime events", () => {
  it("passes normalized SessionEvent JSON through unchanged", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    const seen: SessionEvent[] = []
    runtime.events.subscribe((event) => seen.push(event))

    const event = {
      type: "turn-completed",
      turnId: "t1",
      completedAt: "2026-01-01T00:00:01.000Z",
      usage: { inputTokens: 3, outputTokens: 5 },
    } satisfies SessionEvent
    harness.eventsHandler()?.(event)

    expect(seen).toEqual([event])
  })

  it("translates legacy dot-form reduced events into the union", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    const seen: SessionEvent[] = []
    runtime.events.subscribe((event) => seen.push(event))
    const push = harness.eventsHandler()

    push?.({
      type: "turn.started",
      turn_id: "t1",
      started_at: "2026-01-01T00:00:00.000Z",
    })
    push?.({ type: "turn.delta", turn_id: "t1", text: "hi" })
    push?.({
      type: "turn.completed",
      turn_id: "t1",
      completed_at: "2026-01-01T00:00:02.000Z",
      usage: { input_tokens: 7, output_tokens: 9 },
    })
    push?.({ type: "turn.failed", error: "boom" })

    expect(seen).toEqual([
      {
        type: "turn-started",
        turn: {
          id: "t1",
          role: "assistant",
          parts: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: null,
          usage: null,
        },
      },
      {
        type: "part-appended",
        turnId: "t1",
        part: { type: "text", text: "hi" },
      },
      {
        type: "turn-completed",
        turnId: "t1",
        completedAt: "2026-01-01T00:00:02.000Z",
        usage: { inputTokens: 7, outputTokens: 9 },
      },
      { type: "session-error", message: "boom", fatal: false },
    ])
  })

  it("counts unrecognized wire events as dropped", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    runtime.events.subscribe(() => {})

    harness.eventsHandler()?.({ type: "mystery" })
    harness.eventsHandler()?.("not-an-object")
    expect(runtime.droppedEvents).toBe(2)
  })

  it("keeps the permissions stream fed from pass-through permission events", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    const snapshots: unknown[][] = []
    runtime.permissions.subscribe((requests) => snapshots.push(requests))
    // 空流起步
    expect(snapshots).toEqual([[]])

    const request = {
      type: "tool",
      id: "perm-1",
      conversationId: "s1",
      title: "run command",
      options: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    }
    harness.eventsHandler()?.({ type: "permission-requested", request })
    expect(snapshots[snapshots.length - 1]).toEqual([request])

    harness.eventsHandler()?.({
      type: "permission-resolved",
      requestId: "perm-1",
    })
    expect(snapshots[snapshots.length - 1]).toEqual([])

    // wire 暂无答复端点：显式拒绝而不是静默丢弃
    await expect(
      runtime.respondPermission("perm-1", { kind: "option", optionId: "allow" })
    ).rejects.toMatchObject({ code: "UNSUPPORTED" })
  })
})

// ─── restore / 重连 ───

describe("AgentBoxSessionRuntime restore", () => {
  it("hydrates a snapshot-hydrated event from the transcript and returns it", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    harness.get.mockResolvedValue({
      session_id: "s1",
      turns: [
        {
          turn_id: "t1",
          input: "fix the bug",
          assistant_text: "done",
          status: "completed",
          usage: { input_tokens: 11, output_tokens: 4 },
          started_at: "2026-01-01T00:00:00.000Z",
          completed_at: "2026-01-01T00:00:05.000Z",
        },
        { turn_id: "t2", input: "again", status: "running" },
      ],
    })
    const seen: SessionEvent[] = []
    runtime.events.subscribe((event) => seen.push(event))

    const snapshot = await runtime.restore("s1")

    expect(harness.get).toHaveBeenCalledWith("sessions/s1/transcript")
    expect(snapshot.conversationId).toBe("s1")
    expect(snapshot.status).toBe("in_progress")
    expect(snapshot.turns).toEqual([
      {
        id: "t1",
        role: "user",
        parts: [{ type: "text", text: "fix the bug" }],
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: null,
        usage: null,
      },
      {
        id: "t1:assistant",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
        startedAt: "2026-01-01T00:00:05.000Z",
        completedAt: "2026-01-01T00:00:05.000Z",
        usage: { inputTokens: 11, outputTokens: 4 },
      },
      {
        id: "t2",
        role: "user",
        parts: [{ type: "text", text: "again" }],
        startedAt: expect.any(String),
        completedAt: null,
        usage: null,
      },
    ])
    expect(snapshot.pendingPermissions).toEqual([])
    const hydrated = seen.find((event) => event.type === "snapshot-hydrated")
    expect(hydrated).toBeDefined()
  })

  it("refetches the transcript as hydration when the transport reconnects", async () => {
    const harness = createHarness()
    const runtime = await connectRuntime(harness)
    harness.get.mockResolvedValue({ session_id: "s1", turns: [] })
    const seen: SessionEvent[] = []
    runtime.events.subscribe((event) => seen.push(event))

    harness.fireReconnect()
    await vi.waitFor(() => {
      expect(harness.get).toHaveBeenCalledWith("sessions/s1/transcript")
    })
    expect(seen[seen.length - 1]?.type).toBe("snapshot-hydrated")
  })
})

// ─── transcript / sessions 映射（纯函数） ───

describe("transcriptToSnapshot", () => {
  it("marks finished sessions completed and keeps assistant turns out when empty", () => {
    const snapshot = transcriptToSnapshot({
      session_id: "s1",
      turns: [
        {
          turn_id: "t1",
          input: "q",
          assistant_text: null,
          status: "completed",
        },
      ],
    })
    expect(snapshot.status).toBe("completed")
    expect(snapshot.turns).toHaveLength(1)
    expect(snapshot.turns[0]?.role).toBe("user")
  })

  it("synthesizes an id when the dto has no session_id", () => {
    const snapshot = transcriptToSnapshot({ turns: [] })
    expect(snapshot.conversationId).toBe("")
    expect(snapshot.turns).toEqual([])
  })
})

describe("sessionsToProjects", () => {
  it("dedupes sessions by project_path into projects", () => {
    const projects = sessionsToProjects([
      sessionRow("s1", "/repo", "2026-01-02T00:00:00.000Z"),
      sessionRow("s2", "/other", "2026-01-01T00:00:00.000Z"),
      sessionRow("s3", "/repo", "2026-01-03T00:00:00.000Z"),
    ])

    expect(projects).toEqual([
      {
        id: "/repo",
        name: "repo",
        origin: { kind: "local", path: "/repo" },
        createdAt: "2026-01-02T00:00:00.000Z",
        lastActiveSessionId: "s3",
      },
      {
        id: "/other",
        name: "other",
        origin: { kind: "local", path: "/other" },
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveSessionId: "s2",
      },
    ])
  })

  it("skips rows without project_path and falls back for missing timestamps", () => {
    const projects = sessionsToProjects([
      { id: "s1", project_path: "", title: "x" },
      { id: "s2", project_path: "/repo", title: "y" },
    ])
    expect(projects).toHaveLength(1)
    expect(projects[0]?.createdAt).toBe("1970-01-01T00:00:00.000Z")
    expect(projects[0]?.lastActiveSessionId).toBe("s2")
  })
})

// ─── ProjectsPort / profiles / 聚合 ───

describe("AgentBoxProjectsPort", () => {
  it("list maps GET /sessions through the dedup projection", async () => {
    const harness = createHarness()
    harness.get.mockResolvedValue({
      sessions: [
        sessionRow("s1", "/repo", "2026-01-02T00:00:00.000Z"),
        sessionRow("s2", "/repo", "2026-01-03T00:00:00.000Z"),
      ],
    })
    const backend = createAgentBoxBackend(
      { baseUrl: "http://x" },
      { transport: harness.transport }
    )
    const projects = await backend.projects.list()

    expect(harness.get).toHaveBeenCalledWith("sessions")
    expect(projects).toHaveLength(1)
    expect(projects[0]?.lastActiveSessionId).toBe("s2")
  })

  it("create/update/remove are explicit UNSUPPORTED", async () => {
    const harness = createHarness()
    const backend = createAgentBoxBackend(
      { baseUrl: "http://x" },
      { transport: harness.transport }
    )
    await expect(
      backend.projects.create({
        name: "x",
        origin: { kind: "local", path: "/x" },
      })
    ).rejects.toBeInstanceOf(AgentBoxBackendError)
    await expect(
      backend.projects.update("/x", { name: "y" })
    ).rejects.toBeInstanceOf(AgentBoxBackendError)
    await expect(backend.projects.remove("/x")).rejects.toBeInstanceOf(
      AgentBoxBackendError
    )
  })
})

describe("AgentBoxProfilesFacade", () => {
  it("list/create/get/update/remove map the /profiles CRUD surface", async () => {
    const harness = createHarness()
    const profile = { profile_id: "work", revision: 3, digest: "abc" }
    // 按路径路由：列表返回 {profiles:[…]}，单查返回 profile 本体
    harness.get.mockImplementation(async (path: string) =>
      path === "profiles/codex" ? { profiles: [profile] } : profile
    )
    harness.post.mockResolvedValue(profile)
    harness.put.mockResolvedValue(profile)
    harness.del.mockResolvedValue({ deleted: true })

    const backend = createAgentBoxBackend(
      { baseUrl: "http://x" },
      { transport: harness.transport }
    )
    const profiles = backend.profiles

    await expect(profiles.list("codex")).resolves.toEqual([profile])
    expect(harness.get).toHaveBeenCalledWith("profiles/codex")

    await expect(profiles.get("codex", "work", 3)).resolves.toEqual(profile)
    expect(harness.get).toHaveBeenCalledWith("profiles/codex/work?revision=3")

    await expect(
      profiles.create("codex", { name: "work", payload: { a: 1 } })
    ).resolves.toEqual(profile)
    expect(harness.post).toHaveBeenCalledWith("profiles/codex", {
      name: "work",
      payload: { a: 1 },
    })

    await expect(
      profiles.update("codex", "work", { a: 2 }, 3)
    ).resolves.toEqual(profile)
    expect(harness.put).toHaveBeenCalledWith("profiles/codex/work", {
      payload: { a: 2 },
      expected_revision: 3,
    })

    await expect(profiles.remove("codex", "work")).resolves.toBeUndefined()
    expect(harness.del).toHaveBeenCalledWith("profiles/codex/work")
  })

  it("url-encodes harness and profile ids", async () => {
    const harness = createHarness()
    harness.get.mockResolvedValue({ profiles: [] })
    const backend = createAgentBoxBackend(
      { baseUrl: "http://x" },
      { transport: harness.transport }
    )
    await backend.profiles.list("claude code/edge")
    expect(harness.get).toHaveBeenCalledWith("profiles/claude%20code%2Fedge")
  })
})

describe("createAgentBoxBackend aggregation", () => {
  it("wires all ports over one transport; EventChannel publishes locally and forwards reconnects", async () => {
    const harness = createHarness()
    const backend = createAgentBoxBackend(
      { baseUrl: "http://x", token: "tok" },
      { transport: harness.transport }
    )

    // BackendPorts 结构完备
    expect(backend.session).toBeInstanceOf(AgentBoxSessionRuntime)
    expect(typeof backend.projects.list).toBe("function")
    expect(typeof backend.profiles.list).toBe("function")

    const seen: string[] = []
    backend.events.subscribe<string>("channel-x", (payload) =>
      seen.push(payload)
    )
    backend.events.publish<string>("channel-x", "v")
    expect(seen).toEqual(["v"])

    const reconnect = vi.fn()
    backend.events.onReconnect(reconnect)
    harness.fireReconnect()
    expect(reconnect).toHaveBeenCalled()
  })

  it("works without an injected transport (real transport accepted)", () => {
    const backend = createAgentBoxBackend({ baseUrl: "http://x" })
    expect(backend.session).toBeInstanceOf(AgentBoxSessionRuntime)
    backend.session.disconnect()
  })
})

describe("normalizeSessionEvent", () => {
  it("drops non-object payloads", () => {
    expect(normalizeSessionEvent(null)).toBeNull()
    expect(normalizeSessionEvent(42)).toBeNull()
  })
})
