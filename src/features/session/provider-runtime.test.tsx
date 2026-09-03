import { useEffect } from "react"
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  SessionRuntimeProvider,
  useAcpActions,
  useSessionRuntime,
} from "./provider"
import type { CodegRustSessionRuntime } from "./runtime"
import type { AcpActionsValue } from "./provider"

/**
 * F3 集成测试：provider 的命令三路（sendPrompt / cancel / 权限作答）
 * 必须经 per-contextKey 的 CodegRustSessionRuntime（adopt 模式）直达
 * 后端，且注册表随连接生命周期出现 / 消失。传输绑定是
 * model/command-transport 的 api 直通适配——断言落在 lib/api mock 上，
 * 证明命令形状（blocks + 链接字段）经 runtime 后不变形。
 */
const h = vi.hoisted(() => {
  const attach = vi.fn(() => ({ detach: vi.fn() }))
  const stream = { attach }
  return {
    attach,
    stream,
    eventStreamValue: stream as { attach: typeof attach } | null,
    actions: null as AcpActionsValue | null,
    runtime: null as CodegRustSessionRuntime | null,
    acpGetAgentStatus: vi.fn(),
    acpFindConnectionForConversation: vi.fn(),
    acpConnect: vi.fn(),
    acpDisconnect: vi.fn(),
    acpGetSessionSnapshot: vi.fn(),
    acpTouchConnection: vi.fn(),
    acpPrompt: vi.fn(),
    acpCancel: vi.fn(),
    acpRespondPermission: vi.fn(),
    pushAlert: vi.fn(),
  }
})

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/lib/platform", () => ({
  subscribe: vi.fn(async () => () => {}),
  getEventStream: () => h.eventStreamValue,
}))

vi.mock("@/lib/delegation-seed", () => ({
  buildDelegationSeedEnvelopes: vi.fn(() => []),
}))

vi.mock("@/contexts/alert-context", () => ({
  useAlertContext: () => ({ pushAlert: h.pushAlert }),
}))

vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: { path: "/tmp/x", name: "x" } }),
}))

vi.mock("@/lib/notification", () => ({
  sendSystemNotification: vi.fn(async () => undefined),
}))

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}))

vi.mock("@/lib/selector-prefs-storage", () => ({
  getSavedPrefsForConnect: () => ({ modeId: undefined, configValues: {} }),
  saveModePreference: vi.fn(),
  saveConfigPreference: vi.fn(),
}))

vi.mock("@/lib/snapshot-denormalize", () => ({
  denormalizeSnapshot: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  acpGetAgentStatus: h.acpGetAgentStatus,
  acpFindConnectionForConversation: h.acpFindConnectionForConversation,
  acpConnect: h.acpConnect,
  acpDisconnect: h.acpDisconnect,
  acpGetSessionSnapshot: h.acpGetSessionSnapshot,
  acpPrompt: h.acpPrompt,
  acpSetMode: vi.fn(),
  acpSetConfigOption: vi.fn(),
  acpCancel: h.acpCancel,
  acpRespondPermission: h.acpRespondPermission,
  acpTouchConnection: h.acpTouchConnection,
  getFolderConversation: vi.fn(async () => {
    throw new Error("detail not seeded in this suite")
  }),
  getFolderConversationTurns: vi.fn(async () => {
    throw new Error("detail not seeded in this suite")
  }),
}))

const TAB = "conv-1-claude_code-42"

function Probe() {
  const actions = useAcpActions()
  const runtime = useSessionRuntime(TAB)
  useEffect(() => {
    h.actions = actions
    // 注册表面返回接口类型;本套件断言实现专属的 adopt 语义,收窄为
    // CodegRustSessionRuntime。
    h.runtime = runtime as CodegRustSessionRuntime | null
  })
  return null
}

async function mountProvider() {
  render(
    <SessionRuntimeProvider>
      <Probe />
    </SessionRuntimeProvider>
  )
  await act(async () => {})
}

async function connectOwner() {
  h.acpFindConnectionForConversation.mockResolvedValue(null)
  await act(async () => {
    await h.actions!.connect(TAB, "claude_code", "/tmp/x", "sess-1", 42)
  })
}

beforeEach(() => {
  h.attach.mockClear()
  h.actions = null
  h.runtime = null
  h.eventStreamValue = h.stream
  h.acpGetAgentStatus.mockReset()
  h.acpGetAgentStatus.mockResolvedValue({
    agent_type: "claude_code",
    enabled: true,
    available: true,
    installed_version: "1.0.0",
    host_tools_agent_mode: false,
    is_acp_adapter: true,
  })
  h.acpFindConnectionForConversation.mockReset()
  h.acpConnect.mockReset()
  h.acpConnect.mockResolvedValue("spawned-conn")
  h.acpDisconnect.mockReset()
  h.acpDisconnect.mockResolvedValue(undefined)
  h.acpGetSessionSnapshot.mockReset()
  h.acpGetSessionSnapshot.mockResolvedValue(null)
  h.acpTouchConnection.mockReset()
  h.acpTouchConnection.mockResolvedValue(true)
  h.acpPrompt.mockReset()
  h.acpCancel.mockReset()
  h.acpRespondPermission.mockReset()
  h.pushAlert.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("SessionRuntimeProvider runtime registry + command routing (F3)", () => {
  it("exposes a runtime per key once the connection exists, and removes it on disconnect", async () => {
    await mountProvider()
    expect(h.runtime).toBeNull()

    await connectOwner()
    expect(h.runtime).not.toBeNull()
    expect(h.runtime!.activeContextKey).toBe(TAB)

    await act(async () => {
      await h.actions!.disconnect(TAB)
    })
    expect(h.runtime).toBeNull()
  })

  it("routes sendPrompt / cancel / respondPermission through the runtime without deforming the command", async () => {
    await mountProvider()
    await connectOwner()

    const sendPromptSpy = vi.spyOn(h.runtime!, "sendPrompt")
    const cancelSpy = vi.spyOn(h.runtime!, "cancel")
    const respondSpy = vi.spyOn(h.runtime!, "respondPermission")

    const blocks = [{ type: "text", text: "hello" }] as never
    const opts = { folderId: 1, conversationId: 42, clientMessageId: "cmid" }

    await act(async () => {
      await h.actions!.sendPrompt(TAB, blocks, opts)
    })
    expect(sendPromptSpy).toHaveBeenCalledTimes(1)
    expect(sendPromptSpy).toHaveBeenCalledWith(blocks, opts)
    // The runtime's command transport lands on the SAME api command with the
    // SAME shape — the runtime is in the path, not a bypass.
    expect(h.acpPrompt).toHaveBeenCalledTimes(1)
    expect(h.acpPrompt).toHaveBeenCalledWith(
      "spawned-conn",
      blocks,
      1,
      42,
      "cmid"
    )

    await act(async () => {
      await h.actions!.cancel(TAB)
    })
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(h.acpCancel).toHaveBeenCalledWith("spawned-conn")

    await act(async () => {
      await h.actions!.respondPermission(TAB, "req-1", "allow-once")
    })
    expect(respondSpy).toHaveBeenCalledTimes(1)
    expect(respondSpy).toHaveBeenCalledWith("req-1", {
      kind: "option",
      optionId: "allow-once",
    })
    expect(h.acpRespondPermission).toHaveBeenCalledWith(
      "spawned-conn",
      "req-1",
      "allow-once"
    )
  })
})
