import { describe, expect, expectTypeOf, it } from "vitest"

import type { Turn } from "./message"
import type { PermissionRequest } from "./permission"
import type { SessionEvent, SessionSnapshot } from "./session-event"

const turn: Turn = {
  id: "turn-1",
  role: "assistant",
  parts: [{ type: "text", text: "working…" }],
  startedAt: "2026-01-01T00:00:00.000Z",
}

const permission: PermissionRequest = {
  type: "tool",
  id: "permission-1",
  conversationId: "conversation-1",
  title: "Run `npm install`",
  options: [{ optionId: "allow", name: "Allow", kind: "allow" }],
  createdAt: "2026-01-01T00:00:01.000Z",
}

const snapshot: SessionSnapshot = {
  conversationId: "conversation-1",
  status: "in_progress",
  turns: [turn],
  pendingPermissions: [],
  lastEventSeq: 7,
}

/** 九个成员各构造一条；字面量赋给 SessionEvent[] 本身就是编译期形状校验 */
const sessionEvents: SessionEvent[] = [
  { type: "turn-started", turn },
  {
    type: "part-appended",
    turnId: "turn-1",
    part: { type: "text", text: "hi" },
  },
  {
    type: "part-updated",
    turnId: "turn-1",
    part: { type: "tool-call", toolName: "Bash", state: "result" },
  },
  {
    type: "turn-completed",
    turnId: "turn-1",
    completedAt: "2026-01-01T00:00:02.000Z",
    usage: { inputTokens: 12, outputTokens: 34 },
  },
  { type: "permission-requested", request: permission },
  { type: "permission-resolved", requestId: "permission-1" },
  {
    type: "status-changed",
    conversationId: "conversation-1",
    status: "completed",
  },
  { type: "session-error", message: "boom", code: "E_IO", fatal: false },
  { type: "snapshot-hydrated", snapshot },
]

describe("SessionEvent discriminated union", () => {
  it("exposes exactly the nine documented type discriminants", () => {
    expectTypeOf<SessionEvent["type"]>().toEqualTypeOf<
      | "turn-started"
      | "part-appended"
      | "part-updated"
      | "turn-completed"
      | "permission-requested"
      | "permission-resolved"
      | "status-changed"
      | "session-error"
      | "snapshot-hydrated"
    >()
  })

  it("constructs every member with its documented type discriminant", () => {
    expect(sessionEvents.map((event) => event.type)).toEqual([
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
  })

  it("narrows payloads on the discriminant", () => {
    for (const event of sessionEvents) {
      if (event.type === "turn-started") {
        expectTypeOf(event.turn).toEqualTypeOf<Turn>()
        expect(event.turn.id).toBe("turn-1")
      }
      if (event.type === "turn-completed") {
        expect(event.usage).toEqual({ inputTokens: 12, outputTokens: 34 })
      }
      if (event.type === "permission-requested") {
        expectTypeOf(event.request).toEqualTypeOf<PermissionRequest>()
      }
      if (event.type === "snapshot-hydrated") {
        expectTypeOf(event.snapshot).toEqualTypeOf<SessionSnapshot>()
        expect(event.snapshot.lastEventSeq).toBe(7)
      }
    }
  })
})
