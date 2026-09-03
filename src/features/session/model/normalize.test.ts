/**
 * §12.3 归一化映射表的形状守护：每行至少 1 个正例 + 未知事件 null 例
 * + 快照水合。只断言映射形状，不做状态归约（那是 F3 model 层的事）。
 */
import type { AcpEvent, EventEnvelope } from "@/lib/types"
import { envelopeToSessionEvent, snapshotToHydration } from "./normalize"

function env(event: AcpEvent, seq = 1, connectionId = "conn-1"): EventEnvelope {
  return { seq, connection_id: connectionId, ...event } as EventEnvelope
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

describe("envelopeToSessionEvent（§12.3 映射表）", () => {
  it("status_changed(prompting) → turn-started（assistant live 轮）", () => {
    const event = envelopeToSessionEvent(
      env({ type: "status_changed", status: "prompting" })
    )
    expect(event).toEqual({
      type: "turn-started",
      turn: {
        id: "live:conn-1",
        role: "assistant",
        parts: [],
        startedAt: expect.stringMatching(ISO_RE),
      },
    })
  })

  it("status_changed(非 prompting) → null（连接级状态不进会话流）", () => {
    expect(
      envelopeToSessionEvent(
        env({ type: "status_changed", status: "connected" })
      )
    ).toBeNull()
  })

  it("user_message → part-appended(text, role=user)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "user_message",
        message_id: "m-1",
        blocks: [{ type: "text", text: "hello" }],
      })
    )
    expect(event).toEqual({
      type: "part-appended",
      turnId: "user:conn-1:m-1",
      part: { type: "text", text: "hello" },
      role: "user",
    })
  })

  it("content_delta → part-appended(text)", () => {
    const event = envelopeToSessionEvent(
      env({ type: "content_delta", text: "chunk" })
    )
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: { type: "text", text: "chunk" },
    })
  })

  it("thinking → part-appended(reasoning)", () => {
    const event = envelopeToSessionEvent(env({ type: "thinking", text: "hmm" }))
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: { type: "reasoning", text: "hmm", collapsed: true },
    })
  })

  it("tool_call → part-appended(tool-call, running)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "tool_call",
        tool_call_id: "t-1",
        title: "Bash",
        kind: "execute",
        status: "in_progress",
        content: null,
        raw_input: '{"command":"ls"}',
        raw_output: null,
      })
    )
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: {
        type: "tool-call",
        toolName: "Bash",
        state: "running",
        toolCallId: "t-1",
        input: { command: "ls" },
        output: undefined,
        error: undefined,
      },
    })
  })

  it("tool_call_update(失败) → part-updated(tool-call, error)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "tool_call_update",
        tool_call_id: "t-1",
        title: null,
        status: "failed",
        content: "boom",
        raw_input: null,
        raw_output: null,
      })
    )
    expect(event).toEqual({
      type: "part-updated",
      turnId: "live:conn-1",
      part: {
        type: "tool-call",
        toolName: "",
        state: "error",
        toolCallId: "t-1",
        input: undefined,
        output: "boom",
        error: "boom",
      },
    })
  })

  it("tool_call_update(完成) → part-updated(tool-call, result)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "tool_call_update",
        tool_call_id: "t-1",
        title: "Bash",
        status: "completed",
        content: null,
        raw_input: null,
        raw_output: '"done"',
      })
    )
    expect(event).toMatchObject({
      type: "part-updated",
      turnId: "live:conn-1",
      part: { type: "tool-call", state: "result", output: "done" },
    })
  })

  it("plan_update → part-appended(custom, 原样载荷)", () => {
    const entries = [{ content: "step", priority: "high", status: "pending" }]
    const event = envelopeToSessionEvent(env({ type: "plan_update", entries }))
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: { type: "custom", partType: "plan_update", data: entries },
    })
  })

  it("usage_update → part-appended(custom, 原样载荷)", () => {
    const event = envelopeToSessionEvent(
      env({ type: "usage_update", used: 10, size: 100 })
    )
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: {
        type: "custom",
        partType: "usage_update",
        data: { used: 10, size: 100 },
      },
    })
  })

  it("selectors_ready → part-appended(custom)", () => {
    const event = envelopeToSessionEvent(env({ type: "selectors_ready" }))
    expect(event).toEqual({
      type: "part-appended",
      turnId: "live:conn-1",
      part: { type: "custom", partType: "selectors_ready", data: null },
    })
  })

  it("permission_request → permission-requested(tool)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "permission_request",
        request_id: "pr-1",
        tool_call: { title: "Bash", command: "rm -rf /" },
        options: [
          { option_id: "allow", name: "Allow", kind: "allow_once", meta: null },
        ],
        queued: 2,
      })
    )
    expect(event).toEqual({
      type: "permission-requested",
      request: {
        type: "tool",
        id: "pr-1",
        conversationId: "conn-1",
        title: "Bash",
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once", meta: null },
        ],
        queuedCount: 2,
        createdAt: expect.stringMatching(ISO_RE),
      },
    })
  })

  it("question_request → permission-requested(question)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "question_request",
        question_id: "q-1",
        questions: [
          {
            id: "q1",
            question: "Pick one",
            header: "Choice",
            multi_select: false,
            options: [{ label: "A", description: "first" }],
            is_secret: true,
          },
        ],
      })
    )
    expect(event).toEqual({
      type: "permission-requested",
      request: {
        type: "question",
        id: "q-1",
        conversationId: "conn-1",
        questions: [
          {
            questionId: "q1",
            question: "Pick one",
            header: "Choice",
            multiSelect: false,
            options: [{ label: "A", description: "first" }],
            isSecret: true,
          },
        ],
        createdAt: expect.stringMatching(ISO_RE),
      },
    })
  })

  it("plan_approval_request → permission-requested(plan-approval)", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "plan_approval_request",
        approval_id: "pa-1",
        tool_call_id: "t-9",
        plan_markdown: "## plan",
      })
    )
    expect(event).toMatchObject({
      type: "permission-requested",
      request: {
        type: "plan-approval",
        id: "pa-1",
        conversationId: "conn-1",
        planMarkdown: "## plan",
        createdAt: expect.stringMatching(ISO_RE),
      },
    })
  })

  it.each([
    [{ type: "permission_resolved", request_id: "pr-1" }, "pr-1"],
    [{ type: "question_resolved", question_id: "q-1" }, "q-1"],
    [{ type: "plan_approval_resolved", approval_id: "pa-1" }, "pa-1"],
  ] as Array<[AcpEvent, string]>)(
    "%s → permission-resolved",
    (event, requestId) => {
      expect(envelopeToSessionEvent(env(event))).toEqual({
        type: "permission-resolved",
        requestId,
      })
    }
  )

  it("conversation_status_changed → status-changed", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "conversation_status_changed",
        conversation_id: 42,
        status: "completed",
      })
    )
    expect(event).toEqual({
      type: "status-changed",
      conversationId: "42",
      status: "completed",
    })
  })

  it("turn_complete → turn-completed（wire 无用量，usage=null）", () => {
    const event = envelopeToSessionEvent(
      env({ type: "turn_complete", session_id: "s-1", stop_reason: "end_turn" })
    )
    expect(event).toEqual({
      type: "turn-completed",
      turnId: "live:conn-1",
      completedAt: expect.stringMatching(ISO_RE),
      usage: null,
    })
  })

  it("error(process_exited) → session-error fatal", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "error",
        message: "agent died",
        agent_type: "claude",
        code: "process_exited",
      })
    )
    expect(event).toEqual({
      type: "session-error",
      message: "agent died",
      code: "process_exited",
      fatal: true,
    })
  })

  it("error(turn_failed_unknown) → session-error 非致命", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "error",
        message: "turn failed",
        agent_type: "claude",
        code: "turn_failed_unknown",
      })
    )
    expect(event).toMatchObject({ type: "session-error", fatal: false })
  })

  it("turn_retrying → session-error 非致命", () => {
    const event = envelopeToSessionEvent(
      env({ type: "turn_retrying", message: "retrying" })
    )
    expect(event).toEqual({
      type: "session-error",
      message: "retrying",
      fatal: false,
    })
  })

  it("session_load_failed → session-error fatal", () => {
    const event = envelopeToSessionEvent(
      env({
        type: "session_load_failed",
        session_id: "s-1",
        message: "gone",
        code: "session_unavailable",
      })
    )
    expect(event).toEqual({
      type: "session-error",
      message: "gone",
      code: "session_unavailable",
      fatal: true,
    })
  })

  it("未知 / 明确丢弃的事件 → null（绝不崩）", () => {
    expect(
      envelopeToSessionEvent(
        env({ type: "claude_sdk_message", session_id: "s", message: {} })
      )
    ).toBeNull()
    expect(
      envelopeToSessionEvent(
        env({
          type: "delegation_started",
          parent_connection_id: "p",
          parent_tool_use_id: "t",
          child_connection_id: "c",
          child_conversation_id: 1,
          agent_type: "claude",
        })
      )
    ).toBeNull()
    expect(
      envelopeToSessionEvent(env({ type: "session_started", session_id: "s" }))
    ).toBeNull()
    expect(
      envelopeToSessionEvent(env({ type: "permission_queue_depth", depth: 3 }))
    ).toBeNull()
    // 防御：wire 未来新增的事件类型同样丢弃
    expect(
      envelopeToSessionEvent(
        env({ type: "brand_new_event" } as unknown as AcpEvent)
      )
    ).toBeNull()
  })
})

describe("snapshotToHydration", () => {
  it("把 LiveSessionSnapshot 水合成 snapshot-hydrated（user + live 轮）", () => {
    const event = snapshotToHydration({
      connection_id: "conn-7",
      conversation_id: 42,
      folder_id: null,
      status: "prompting",
      external_id: "ext-1",
      live_message: {
        id: "lm-1",
        role: "assistant",
        content: [
          { kind: "text", text: "working" },
          { kind: "thinking", text: "why" },
          { kind: "tool_call_ref", tool_call_id: "t-1" },
          {
            kind: "plan",
            entries: [{ content: "s", priority: "high", status: "pending" }],
          },
        ],
        started_at: "2026-09-03T00:00:00.000Z",
      },
      active_tool_calls: [
        {
          id: "t-1",
          kind: "execute",
          label: "Bash",
          status: "completed",
          input: { command: "ls" },
          output: { kind: "text", content: "out" },
          content: null,
          locations: null,
          meta: null,
        },
      ],
      pending_permission: {
        request_id: "pr-9",
        tool_call_id: "t-1",
        tool_call: { title: "Bash" },
        options: [{ option_id: "a", name: "Allow", kind: "allow_once" }],
        created_at: "2026-09-03T00:01:00.000Z",
        queued: 1,
      },
      modes: null,
      current_mode: null,
      config_options: null,
      prompt_capabilities: null,
      usage: null,
      fork_supported: false,
      available_commands: [],
      selectors_ready: true,
      event_seq: 77,
    })
    expect(event.type).toBe("snapshot-hydrated")
    if (event.type !== "snapshot-hydrated") return
    const snapshot = event.snapshot
    expect(snapshot.conversationId).toBe("42")
    expect(snapshot.status).toBe("in_progress") // prompting → in_progress
    expect(snapshot.lastEventSeq).toBe(77)
    expect(snapshot.turns).toEqual([
      {
        id: "live:conn-7",
        role: "assistant",
        parts: [
          { type: "text", text: "working" },
          { type: "reasoning", text: "why", collapsed: true },
          {
            type: "tool-call",
            toolName: "Bash",
            state: "result",
            toolCallId: "t-1",
            input: { command: "ls" },
            output: "out",
            error: undefined,
          },
          {
            type: "custom",
            partType: "plan",
            data: [{ content: "s", priority: "high", status: "pending" }],
          },
        ],
        startedAt: "2026-09-03T00:00:00.000Z",
      },
    ])
    expect(snapshot.pendingPermissions).toEqual([
      {
        type: "tool",
        id: "pr-9",
        conversationId: "42",
        title: "Bash",
        options: [
          { optionId: "a", name: "Allow", kind: "allow_once", meta: null },
        ],
        queuedCount: 1,
        createdAt: "2026-09-03T00:01:00.000Z",
      },
    ])
  })

  it("pending_user_message → user 轮；conversation_id 为 null 时退回连接 id", () => {
    const event = snapshotToHydration({
      connection_id: "conn-8",
      conversation_id: null,
      folder_id: null,
      status: "prompting",
      external_id: null,
      live_message: null,
      active_tool_calls: [],
      pending_permission: null,
      pending_user_message: {
        message_id: "um-1",
        blocks: [{ type: "text", text: "hi" }],
      },
      modes: null,
      current_mode: null,
      config_options: null,
      prompt_capabilities: null,
      usage: null,
      fork_supported: false,
      available_commands: [],
      selectors_ready: false,
      event_seq: 5,
    })
    if (event.type !== "snapshot-hydrated") throw new Error("bad event")
    expect(event.snapshot.conversationId).toBe("conn-8")
    expect(event.snapshot.turns).toEqual([
      {
        id: "user:conn-8:um-1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
        startedAt: expect.stringMatching(ISO_RE),
      },
    ])
  })
})
