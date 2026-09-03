/**
 * F6 扩展剧本冒烟（设计 §9 / §13-F6）：四个注册表的消费端接线。
 *
 * 与 registry 四件套的单测（注册/获取/列表/回退）不同，这里从**消费端**
 * 走一遍设计 §9 的扩展剧本，证明“注册即出现、未注册回退、永不崩”：
 *
 * 1. 加 harness：registerHarness 假件 → agent 选择器数据源
 *    （harnessOptionsFromRegistry，agent-selector.tsx 的唯一数据源）出现。
 * 2. 加工具渲染：registerToolRenderer 假卡 → dispatchToolRenderer 命中
 *    （含 ContentPartsRenderer 端到端）；未注册 → 返回 null，调用方落
 *    内置通用卡，不崩。
 * 3. 加右面板标签 / 设置分区：registerPanel → aux 标签头数据源
 *    （listAuxPanelTabs，aux-panel.tsx）与设置导航数据源
 *    （listSettingsSections，settings-shell.tsx）出现。
 * 4. 换后端：一个满足 BackendPorts 的假实现可在绑定点整体换绑
 *    （类型 + 运行时形状双冒烟，§4.2 / §9-4）。
 * 5. 加新消息类型：registerPartRenderer → custom part 查表命中；未注册
 *    不渲染，不崩。
 */
import { describe, expect, expectTypeOf, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"

import enMessages from "@/i18n/messages/en.json"
import type { AcpAgentInfo } from "@/lib/types"
import type { AdaptedContentPart } from "@/features/session/model/adapters/ai-elements-adapter"
import type { BackendPorts } from "@/core/ports/backend"
import type { EventChannel } from "@/core/ports/event-channel"
import type { ProjectsPort } from "@/core/ports/projects"
import type { SessionRuntime } from "@/core/ports/session-runtime"
import type { PermissionRequest } from "@/core/domain/permission"
import type { SessionEvent } from "@/core/domain/session-event"
import type { Subscribable } from "@/core/ports/transport"
import {
  registerHarness,
  registerPanel,
  registerPartRenderer,
  registerToolRenderer,
} from "@/core/registry"
import type {
  HarnessDefinition,
  PartRendererProps,
  ToolRendererProps,
} from "@/core/registry"
import { harnessOptionsFromRegistry } from "@/components/chat/harness-registry"
import { dispatchPartRenderer } from "@/components/message/part-renderer-dispatch"
import { dispatchToolRenderer } from "@/components/message/tool-renderer-dispatch"
import { ContentPartsRenderer } from "@/components/message/content-parts-renderer"
import { listAuxPanelTabs } from "@/components/layout/aux-panel-registry"
import { listSettingsSections } from "@/components/settings/settings-shell-panels"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 最小可用的 AcpAgentInfo 假件（acpListAgents 结果的形状） */
function fakeAcpAgent(
  agentType: string,
  overrides: Partial<AcpAgentInfo> = {}
): AcpAgentInfo {
  return {
    agent_type: agentType,
    skills_capable: false,
    registry_id: `registry.example/${agentType}`,
    registry_version: null,
    supports_custom_version: false,
    name: agentType,
    description: "",
    available: true,
    distribution_type: "binary",
    is_acp_adapter: false,
    custom_source: null,
    enabled: true,
    sort_order: 0,
    installed_version: null,
    env: {},
    host_tools_agent_mode: false,
    config_json: null,
    config_file_path: null,
    opencode_auth_json: null,
    codex_auth_json: null,
    codex_config_toml: null,
    codex_model_catalog: null,
    codex_sandbox_settings: null,
    cline_secrets_json: null,
    hermes_config_yaml: null,
    grok_config_toml: null,
    grok_settings: null,
    cursor_cli_config_json: null,
    cursor_settings: null,
    model_provider_id: null,
    icon_url: null,
    ...overrides,
  }
}

function renderIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  )
}

// ---------------------------------------------------------------------------
// 扩展剧本 1：加 harness
// ---------------------------------------------------------------------------

describe("扩展剧本 1：加 harness（选择器数据源 = harnesses 注册表）", () => {
  it("ACP agent 列表同步后出现在选择器数据源（含 ACP 侧可用性信息）", () => {
    const options = harnessOptionsFromRegistry([fakeAcpAgent("wiring-claude")])
    const claude = options.find((o) => o.harness.id === "wiring-claude")
    expect(claude).toBeDefined()
    expect(claude?.agent?.available).toBe(true)
  })

  it("registerHarness 假 harness 后自动出现在选择器数据源", () => {
    const fake: HarnessDefinition = {
      id: "wiring-fake-harness",
      displayName: "Wiring Fake Harness",
      capabilities: {
        supportsResume: false,
        supportsCancel: false,
        supportsAttachments: false,
        supportsPlanApproval: false,
        supportsQuestions: false,
      },
      connect: () => {
        throw new Error("wiring smoke: connect not expected")
      },
    }
    registerHarness(fake)

    const options = harnessOptionsFromRegistry([fakeAcpAgent("wiring-gemini")])
    const ids = options.map((o) => o.harness.id)
    expect(ids).toContain("wiring-gemini")
    expect(ids).toContain("wiring-fake-harness")
    // ACP 已知的排在前，注册表独有的（扩展注册）追加在后
    expect(ids.indexOf("wiring-fake-harness")).toBeGreaterThan(
      ids.indexOf("wiring-gemini")
    )
    const registered = options.find(
      (o) => o.harness.id === "wiring-fake-harness"
    )
    expect(registered?.harness).toBe(fake)
    // 扩展注册没有 ACP 侧信息 —— 按可用处理
    expect(registered?.agent).toBeNull()
  })

  it("曾同步进注册表、后从 ACP 列表消失的 harness 不回流为扩展", () => {
    // ACP 列表对自身 id 是权威源：后端卸载 / 停用后条目从列表消失，
    // 不能作为“注册表扩展”重新出现（只有从未经 ACP 同步过的才算）。
    harnessOptionsFromRegistry([fakeAcpAgent("wiring-vanishing")])
    const after = harnessOptionsFromRegistry([fakeAcpAgent("wiring-staying")])
    const ids = after.map((o) => o.harness.id)
    expect(ids).toContain("wiring-staying")
    expect(ids).not.toContain("wiring-vanishing")
  })

  it("禁用（enabled=false）的 ACP agent 不出现在选择器数据源", () => {
    const options = harnessOptionsFromRegistry([
      fakeAcpAgent("wiring-enabled-sibling"),
      fakeAcpAgent("wiring-disabled-agent", { enabled: false }),
    ])
    const ids = options.map((o) => o.harness.id)
    expect(ids).toContain("wiring-enabled-sibling")
    expect(ids).not.toContain("wiring-disabled-agent")
  })
})

// ---------------------------------------------------------------------------
// 扩展剧本 2：加工具渲染
// ---------------------------------------------------------------------------

describe("扩展剧本 2：加工具渲染（tool-renderers 注册表分派）", () => {
  it("registerToolRenderer 假卡后分派命中（工具名归一化 + 领域状态翻译）", () => {
    function WiringFakeToolCard({ part }: ToolRendererProps) {
      return (
        <div data-testid="wiring-fake-tool-card">
          {`${part.toolName}:${part.state}`}
        </div>
      )
    }
    registerToolRenderer("wiring_fake_tool", WiringFakeToolCard)

    // 分派按归一化工具名（小写）查表；注册组件收到 core 领域
    // ToolCallPart（toolName 保持 normalizeToolName 的原大小写输出，
    // Adapted 四态 output-available → 领域 result）
    const node = dispatchToolRenderer({
      type: "tool-call",
      toolCallId: "tc-1",
      toolName: "Wiring_Fake_Tool",
      input: "{}",
      state: "output-available",
      output: "done",
    })
    expect(node).not.toBeNull()
    renderIntl(node)
    expect(screen.getByTestId("wiring-fake-tool-card").textContent).toBe(
      "Wiring_Fake_Tool:result"
    )
  })

  it("未注册的工具分派返回 null（调用方回退内置通用卡）", () => {
    expect(
      dispatchToolRenderer({
        type: "tool-call",
        toolCallId: "tc-2",
        toolName: "wiring_unregistered_tool",
        input: null,
        state: "output-available",
        output: null,
      })
    ).toBeNull()
  })

  it("端到端：注册卡命中，未注册落通用卡，渲染不崩", () => {
    renderIntl(
      <ContentPartsRenderer
        role="assistant"
        parts={[
          {
            type: "tool-call",
            toolCallId: "tc-3",
            toolName: "Wiring_Fake_Tool",
            input: null,
            state: "output-available",
            output: null,
          },
          {
            type: "tool-call",
            toolCallId: "tc-4",
            toolName: "wiring_unregistered_tool",
            input: null,
            state: "output-available",
            output: null,
          },
        ]}
      />
    )
    // 注册卡替换内置渲染
    expect(screen.getByTestId("wiring-fake-tool-card")).toBeTruthy()
    // 未注册 → 内置通用卡（标题 = 归一化工具名），不崩
    expect(screen.getByText("wiring_unregistered_tool")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 扩展剧本 3：加面板（右面板标签 + 设置导航两处消费点）
// ---------------------------------------------------------------------------

describe("扩展剧本 3：加面板（panels 注册表两处消费点）", () => {
  it("内置 aux 标签全部注册化，顺序与原 TAB_ORDER 一致", () => {
    expect(listAuxPanelTabs().map((tab) => tab.panel.id)).toEqual([
      "session_details",
      "file_tree",
      "changes",
      "git_log",
    ])
  })

  it("内置设置分区全部注册化，顺序与原导航一致", () => {
    expect(listSettingsSections().map((s) => s.panel.id)).toEqual([
      "appearance",
      "general",
      "mcp",
      "skills",
      "skill-packs",
      "agents",
      "model-providers",
      "shortcuts",
      "version-control",
      "web-service",
      "logs",
      "system",
    ])
  })

  it("registerPanel 假右面板标签 → 标签头数据源出现（order 插位 + 扩展默认值）", () => {
    registerPanel({
      id: "wiring-review",
      title: "Wiring Review",
      placement: "right-panel",
      order: 25, // 插在 file_tree(20) 与 changes(30) 之间
      component: () => <div data-testid="wiring-review-panel" />,
    })
    const tabs = listAuxPanelTabs()
    const ids = tabs.map((tab) => tab.panel.id)
    expect(ids).toContain("wiring-review")
    expect(ids.indexOf("wiring-review")).toBe(ids.indexOf("changes") - 1)
    // 扩展标签默认：常驻显示（chat 模式也可见）、首次激活懒挂载、标题直出
    const review = tabs.find((tab) => tab.panel.id === "wiring-review")
    expect(review?.folderScoped).toBe(false)
    expect(review?.lazyMount).toBe(true)
    expect(review?.label.source).toBe("registry-title")
  })

  it("registerPanel 假设置分区 → 导航数据源出现（href 派生 + 末位）", () => {
    registerPanel({
      id: "wiring-fake-section",
      title: "Wiring Fake Section",
      placement: "settings",
      order: 125,
      component: () => null,
    })
    const sections = listSettingsSections()
    const ids = sections.map((s) => s.panel.id)
    expect(ids).toContain("wiring-fake-section")
    expect(ids[ids.length - 1]).toBe("wiring-fake-section")
    const fake = sections.find((s) => s.panel.id === "wiring-fake-section")
    expect(fake?.href).toBe("/settings/wiring-fake-section")
    expect(fake?.labelKey).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 扩展剧本 4：换后端（BackendPorts 绑定点）
// ---------------------------------------------------------------------------

describe("扩展剧本 4：换后端（BackendPorts 换绑定点冒烟）", () => {
  function subscribable<T>(): Subscribable<T> {
    return { subscribe: () => () => {} }
  }

  /** 假后端：满足 BackendPorts 的最小实现（未来 agent-box-web 的替身） */
  function makeFakeBackend(): BackendPorts {
    const session: SessionRuntime = {
      connect: async () => {},
      disconnect: async () => {},
      send: async () => {},
      cancel: async () => {},
      events: subscribable<SessionEvent>(),
      permissions: subscribable<PermissionRequest[]>(),
      respondPermission: async () => {},
      restore: async () => ({
        conversationId: "conversation-1",
        status: "completed",
        turns: [],
        pendingPermissions: [],
      }),
    }
    const projects: ProjectsPort = {
      list: async () => [],
      create: async (input) => ({
        id: "project-1",
        name: input.name,
        origin: input.origin,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      update: async (id, patch) => ({
        id,
        name: patch.name ?? "project",
        origin: { kind: "local", path: "/repo" },
        createdAt: "2026-01-01T00:00:00.000Z",
        lastActiveSessionId: patch.lastActiveSessionId ?? undefined,
      }),
      remove: async () => {},
      changes: subscribable(),
    }
    const events: EventChannel = {
      subscribe: () => () => {},
      publish: () => {},
      onReconnect: () => () => {},
    }
    return { session, projects, events }
  }

  it("假后端满足 BackendPorts，可在绑定点整体换绑", async () => {
    const fake = makeFakeBackend()
    // 类型冒烟：实现形状与接口精确一致（tsc --noEmit 守护）
    expectTypeOf(fake).toEqualTypeOf<BackendPorts>()
    // 换绑 = 绑定点换一个满足接口的实例，消费端零改动
    let bound: BackendPorts = makeFakeBackend()
    bound = fake
    expect(bound).toBe(fake)
    expect(Object.keys(bound).sort()).toEqual(["events", "projects", "session"])
    // 消费端只经接口取用（与具体实例无关）
    await expect(bound.session.restore("c1")).resolves.toEqual({
      conversationId: "conversation-1",
      status: "completed",
      turns: [],
      pendingPermissions: [],
    })
  })
})

// ---------------------------------------------------------------------------
// 扩展剧本 5：加新消息类型（custom part + part-renderers 注册表）
// ---------------------------------------------------------------------------

describe("扩展剧本 5：加新消息类型（part-renderers 注册表分派）", () => {
  it("registerPartRenderer 后 custom part 分派命中（收到领域 custom 形状）", () => {
    function WiringFakePartCard({ part }: PartRendererProps) {
      return (
        <div data-testid="wiring-fake-part-card">
          {part.type === "custom"
            ? `${part.partType}:${JSON.stringify(part.data)}`
            : part.type}
        </div>
      )
    }
    registerPartRenderer("wiring_canvas", WiringFakePartCard)

    const node = dispatchPartRenderer({
      type: "wiring_canvas",
      payload: { strokes: 3 },
    } as unknown as AdaptedContentPart)
    expect(node).not.toBeNull()
    renderIntl(node)
    expect(screen.getByTestId("wiring-fake-part-card").textContent).toBe(
      'wiring_canvas:{"type":"wiring_canvas","payload":{"strokes":3}}'
    )
  })

  it("未注册的 custom part 不渲染且不崩（分派返回 null）", () => {
    expect(
      dispatchPartRenderer({
        type: "wiring_mystery",
      } as unknown as AdaptedContentPart)
    ).toBeNull()
  })

  it("端到端：未注册 custom part 经 ContentPartsRenderer 渲染为空、不崩", () => {
    const { container } = renderIntl(
      <ContentPartsRenderer
        role="assistant"
        parts={[
          { type: "wiring_mystery", data: 1 } as unknown as AdaptedContentPart,
        ]}
      />
    )
    expect(container.textContent).toBe("")
  })
})
