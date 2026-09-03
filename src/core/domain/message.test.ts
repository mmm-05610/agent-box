import { describe, expect, expectTypeOf, it } from "vitest"

import type { MessagePart, ToolCallPart } from "./message"

/**
 * 判别联合穷尽性守护（编译期）：
 * switch 覆盖 MessagePart 的全部 type 成员后，落出 switch 的 `part`
 * 被收窄为 never；联合新增成员而此处未处理时，
 * `const _exhaustive: never = part` 会让 `tsc --noEmit` 直接失败。
 */
function partSummary(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return `text(${part.text})`
    case "reasoning":
      return `reasoning(${part.collapsed ? "collapsed" : "expanded"})`
    case "tool-call":
      return `tool-call(${part.toolName}/${part.state})`
    case "file-change":
      return `file-change(${part.files.map((f) => f.path).join(",")})`
    case "error":
      return `error(${part.message})`
    case "custom":
      return `custom(${part.partType})`
  }
  const _exhaustive: never = part
  return `unhandled(${String(_exhaustive)})`
}

const sampleParts: MessagePart[] = [
  { type: "text", text: "hello" },
  { type: "reasoning", text: "thinking…", collapsed: true },
  {
    type: "tool-call",
    toolName: "Bash",
    state: "running",
    toolCallId: "tool-call-1",
  },
  {
    type: "file-change",
    files: [
      { path: "src/a.ts", kind: "created", additions: 3, deletions: 1 },
      { path: "src/b.ts", kind: "deleted" },
    ],
  },
  { type: "error", message: "boom" },
  { type: "custom", partType: "canvas", data: { nodes: [] } },
]

describe("MessagePart discriminated union", () => {
  it("exposes exactly the six documented type discriminants", () => {
    expectTypeOf<MessagePart["type"]>().toEqualTypeOf<
      "text" | "reasoning" | "tool-call" | "file-change" | "error" | "custom"
    >()
  })

  it("handles every member through the exhaustive switch", () => {
    expect(sampleParts.map(partSummary)).toEqual([
      "text(hello)",
      "reasoning(collapsed)",
      "tool-call(Bash/running)",
      "file-change(src/a.ts,src/b.ts)",
      "error(boom)",
      "custom(canvas)",
    ])
  })

  it("narrows to the exact member type on the discriminant", () => {
    for (const part of sampleParts) {
      if (part.type === "tool-call") {
        expectTypeOf(part).toEqualTypeOf<ToolCallPart>()
        expect(part.toolName).toBe("Bash")
      }
      if (part.type === "custom") {
        expectTypeOf(part).toEqualTypeOf<{
          type: "custom"
          partType: string
          data: unknown
        }>()
      }
    }
  })

  it("keeps the tool-call lifecycle states as documented", () => {
    expectTypeOf<ToolCallPart["state"]>().toEqualTypeOf<
      "input" | "running" | "result" | "error"
    >()
  })
})
