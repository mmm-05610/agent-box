import { describe, expect, it } from "vitest"

import type { SessionRuntime, SessionSpec } from "../ports/session-runtime"
import type { HarnessDefinition } from "./harnesses"
import { getHarness, listHarnesses, registerHarness } from "./harnesses"

function stubRuntime(): SessionRuntime {
  const unsubscribe = () => {}
  return {
    connect: async () => {},
    disconnect: async () => {},
    send: async () => {},
    cancel: async () => {},
    events: { subscribe: () => unsubscribe },
    permissions: { subscribe: () => unsubscribe },
    respondPermission: async () => {},
    restore: async () => ({
      conversationId: "conversation-1",
      status: "completed",
      turns: [],
      pendingPermissions: [],
    }),
  }
}

/** 造一个最小可注册的 harness 定义；runtime 暴露出来供 connect 断言 */
function makeHarness(
  id: string,
  displayName: string
): { definition: HarnessDefinition; runtime: SessionRuntime } {
  const runtime = stubRuntime()
  const definition: HarnessDefinition = {
    id,
    displayName,
    capabilities: {
      supportsResume: true,
      supportsCancel: true,
      supportsAttachments: false,
      supportsPlanApproval: false,
      supportsQuestions: false,
    },
    connect: () => runtime,
  }
  return { definition, runtime }
}

// 注册表是模块级单例：本文件的用例按书写顺序累积注册状态，
// 排序断言覆盖此前用例注册过的全部条目。
describe("harness registry", () => {
  it("returns undefined for unregistered ids", () => {
    expect(getHarness("no-such-harness")).toBeUndefined()
  })

  it("registers a harness and retrieves it by id", () => {
    const { definition } = makeHarness("claude", "Claude Code")
    registerHarness(definition)
    expect(getHarness("claude")).toBe(definition)
  })

  it("lets a later registration with the same id override the earlier one", () => {
    const first = makeHarness("codex", "Codex First")
    const second = makeHarness("codex", "Codex Second")
    registerHarness(first.definition)
    registerHarness(second.definition)
    expect(getHarness("codex")).toBe(second.definition)
    expect(getHarness("codex")).not.toBe(first.definition)
    // 覆盖是替换而非追加：同 id 只占一个槽位
    expect(
      listHarnesses().filter((harness) => harness.id === "codex")
    ).toHaveLength(1)
  })

  it("connects by delegating to the definition's factory", () => {
    const { definition, runtime } = makeHarness("gemini", "Gemini CLI")
    registerHarness(definition)
    const spec: SessionSpec = { harnessId: "gemini", cwd: "/repo" }
    expect(definition.connect(spec)).toBe(runtime)
    const registered = getHarness("gemini")
    expect(registered?.connect({ harnessId: "gemini", cwd: "/" })).toBe(runtime)
  })

  it("lists every registered harness sorted by displayName", () => {
    const bravo = makeHarness("bravo-h", "Bravo Agent")
    const alpha = makeHarness("alpha-h", "Alpha Agent")
    registerHarness(bravo.definition)
    registerHarness(alpha.definition)
    // 含此前用例注册的 claude / codex（已被覆盖为 "Codex Second"）/ gemini
    expect(listHarnesses().map((harness) => harness.id)).toEqual([
      "alpha-h",
      "bravo-h",
      "claude",
      "codex",
      "gemini",
    ])
  })
})
