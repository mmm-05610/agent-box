import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { ProjectRow, ProjectTreeAddButton } from "./project-tree"
import { RemoteConnectionWizard } from "./remote-connection-wizard"
import type { Project } from "@/core/domain"
import enMessages from "@/i18n/messages/en.json"

// ProjectRow 只消费 SubsessionAncestorRails（纯装饰）与 CONV_RAIL_DEPTH_STEP
// 常量——桩掉整个会话卡片模块，让本套件不背它的依赖图。
vi.mock("@/components/conversations/sidebar-conversation-card", () => ({
  SubsessionAncestorRails: () => null,
  CONV_RAIL_DEPTH_STEP: "1.25rem",
}))

// ProjectTreeAddButton 的“打开本地文件夹”复用 wire 对话框（网络面）——桩掉，
// 菜单项的打开行为由“远程连接…”路径覆盖，本地路径有 workspace-folder-dialog
// 自己的测试。
vi.mock("@/components/layout/workspace-folder-dialog", () => ({
  WorkspaceFolderDialog: () => null,
}))

// “克隆仓库”菜单项复用 CloneDialog（需 GitCredentialProvider）——桩掉，
// 对话框本体有自己的测试。
vi.mock("@/components/layout/clone-dialog", () => ({
  CloneDialog: () => null,
}))

vi.mock("@/lib/platform", () => ({
  isDesktop: () => false,
  revealItemInDir: vi.fn(),
}))

vi.mock("@/lib/custom-agents", () => ({
  getAgentLabel: (agent: string) => agent,
}))

function intl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>
  )
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "7",
    name: "agent-box",
    origin: { kind: "local", path: "/repos/agent-box" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

/** ProjectRow 的稳定回调面（与生产一致：全部引用稳定才保得住 memo）。 */
function rowProps(
  overrides: Partial<Parameters<typeof ProjectRow>[0]> = {}
): Parameters<typeof ProjectRow>[0] {
  const noop = () => {}
  return {
    project: makeProject(),
    directoryName: "agent-box",
    branch: null,
    runningCount: 0,
    attentionCount: 0,
    expanded: true,
    themeColor: "inherit",
    appThemeColor: "blue",
    currentDefaultAgent: null,
    availableAgents: [],
    availableAgentsFresh: true,
    onToggle: noop,
    onRemoveFromWorkspace: noop,
    onNewConversation: noop,
    onImport: noop,
    onManageConversations: noop,
    onManageLinks: noop,
    onChangeColor: noop,
    onSetAlias: noop,
    onSetDefaultAgent: noop,
    onOpenInSystemExplorer: noop,
    onOpenInTerminal: noop,
    onOpenInCode: noop,
    ...overrides,
  }
}

describe("ProjectRow（F5 项目行）", () => {
  it("renders the project name, branch badge and expand state; toggling addresses the wire id", async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(intl(<ProjectRow {...rowProps({ branch: "main", onToggle })} />))

    // 名称 + 分支徽标（git HEAD 解析结果）。
    expect(screen.getByText("agent-box")).toBeTruthy()
    expect(screen.getByText("main")).toBeTruthy()
    // 折叠/展开状态与 origin 路径 tooltip。
    const toggle = screen.getByTitle("/repos/agent-box")
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    // 交互回调以 wire 数字主键寻址（领域 id "7" → 7）。
    await user.click(toggle)
    expect(onToggle).toHaveBeenCalledWith(7)
  })

  it("renders no branch badge when the HEAD is unknown, and a cloud icon for a remote origin", () => {
    const { rerender } = render(intl(<ProjectRow {...rowProps()} />))
    // 无分支（非仓库/未解析）→ 不渲染徽标。
    expect(screen.queryByText("main")).toBeNull()

    rerender(
      intl(
        <ProjectRow
          {...rowProps({
            project: makeProject({
              name: "remote-app",
              origin: {
                kind: "ssh",
                host: { id: "user@build" },
                path: "/srv/app",
              },
            }),
            directoryName: "srv-app",
          })}
        />
      )
    )
    // 远程 origin → 云图标，title 标明 kind · host；本地路径 tooltip换成远端。
    expect(screen.getByTitle("ssh · user@build")).toBeTruthy()
    expect(screen.getByTitle("ssh:user@build/srv/app")).toBeTruthy()
  })
})

describe("ProjectTreeAddButton（项目 + 入口）", () => {
  it("opens the menu and launches the remote-connection wizard from it", async () => {
    const user = userEvent.setup()
    render(intl(<ProjectTreeAddButton />))

    await user.click(screen.getByRole("button", { name: "Projects" }))
    expect(screen.getByText("Open local folder")).toBeTruthy()
    expect(screen.getByText("Remote connection…")).toBeTruthy()

    await user.click(screen.getByText("Remote connection…"))
    // 向导打开（标题出现），进入第 1 步：选择方式。
    expect(await screen.findByText("Add remote project")).toBeTruthy()
    expect(screen.getByRole("radio", { name: /SSH/ })).toBeTruthy()
  })
})

describe("RemoteConnectionWizard（四步骨架）", () => {
  it("advances method → config and keeps the submit disabled with the backend hint", async () => {
    const user = userEvent.setup()
    render(intl(<RemoteConnectionWizard open onOpenChange={() => {}} />))

    // 第 1 步：未选方式时“下一步”不可用；选择 SSH 后进入配置。
    const next = screen.getByRole("button", { name: "Next" })
    expect(next).toBeDisabled()
    await user.click(screen.getByRole("radio", { name: /SSH/ }))
    await user.click(next)

    // 第 2 步：主机/显示名/路径字段就绪；“连接”提交 disabled 并提示后端未接入。
    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByText("Project path")).toBeTruthy()
    expect(screen.getByText("Backend support coming soon")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled()
  })

  it("renders the connecting and directory skeleton branches via initialStep", () => {
    // initialStep 是挂载期取值（测试/未来接线用）：两步各用一次全新挂载渲染。
    const { unmount } = render(
      intl(
        <RemoteConnectionWizard
          open
          initialStep="connecting"
          onOpenChange={() => {}}
        />
      )
    )
    expect(screen.getByText("Connecting…")).toBeTruthy()
    unmount()

    render(
      intl(
        <RemoteConnectionWizard
          open
          initialStep="directory"
          onOpenChange={() => {}}
        />
      )
    )
    // 第 4 步骨架：目录占位行 + 禁用的“添加项目”。
    expect(
      screen.getByText(
        "The remote directory list arrives with backend support."
      )
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add project" })).toBeDisabled()
  })
})
