import {
  createRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
} from "react"
import { act, render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SidebarConversationList,
  type SidebarConversationListHandle,
} from "./sidebar-conversation-list"
import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import {
  resetAppWorkspaceStore,
  useAppWorkspaceStore,
} from "@/stores/app-workspace-store"
import enMessages from "@/i18n/messages/en.json"

// ── Probes ────────────────────────────────────────────────────────────────
// AgentIcon is FORBIDDEN on the ZCode-style session rows. The mock counts
// renders; every suite asserts it stays at 0. The folder glyph probe counts
// project-row bodies (FolderClosed/FolderOpen render once per ProjectRow).
const probes = vi.hoisted(() => ({ agent: 0, folder: 0 }))

// Mutable backing store the mocked tab-context hook reads from. `tabs` is
// rebuilt fresh every render to mirror tab-context re-deriving it on each
// `conversations` change.
const store = vi.hoisted(() => ({
  activeTabId: null as string | null,
  tabSpec: [] as Array<{
    id: string
    conversationId: number | null
    agentType: string
    folderId: number
    title: string
    isPinned: boolean
  }>,
}))

// Mutable active folder (auto-expand tests flip it).
const activeFolderState = vi.hoisted(() => ({
  activeFolder: null as { id: number; path: string } | null,
}))

// Action spies installed into the workspace store before each test. zustand
// keeps these referentially stable across renders (as the real store's action
// fields are), so the list's folder callbacks that close over them stay
// memoized.
const stableWorkspaceFns = vi.hoisted(() => ({
  refreshConversations: async () => {},
  updateConversationLocal: () => {},
  removeFolderFromWorkspace: async () => {},
  refreshFolder: async () => {},
  // 分支徽标的按需 HEAD 解析——网络动作，测试里静音。
  ensureGitHead: () => {},
}))

const stableTabFns = vi.hoisted(() => ({
  openTab: vi.fn(),
  closeConversationTab: vi.fn(),
  closeTabsByFolder: vi.fn(),
  openNewConversationTab: vi.fn(),
  openChatModeTab: vi.fn(),
}))

const stableAgents = vi.hoisted(() => ({ sortedTypes: ["claude_code"] }))

const stableTerminal = vi.hoisted(() => ({
  createTerminalInDirectory: async () => "term",
}))

vi.mock("@/components/agent-icon", () => ({
  AgentIcon: () => {
    probes.agent++
    return null
  },
}))

// Controllable virtua geometry. All rows are 32px (h-[2rem]), so offsets are
// index*32. Render EVERY row (data.map) rather than only a window so the
// assertions see the whole list in jsdom (which has no real layout/scroll).
const virtuaCtl = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
}))

vi.mock("virtua", () => ({
  Virtualizer: ({
    data,
    children,
    ref,
  }: {
    data: unknown[]
    children: (row: unknown, index: number) => ReactNode
    ref?: React.Ref<unknown>
  }) => {
    useImperativeHandle(ref, () => ({
      get scrollOffset() {
        return 0
      },
      get scrollSize() {
        return data.length * 32
      },
      get viewportSize() {
        return 600
      },
      findItemIndex: (offset: number) =>
        Math.max(0, Math.min(data.length - 1, Math.floor(offset / 32))),
      getItemOffset: (index: number) => index * 32,
      getItemSize: () => 32,
      scrollToIndex: virtuaCtl.scrollToIndex,
      scrollTo: () => {},
      scrollBy: () => {},
    }))
    return <>{data.map((row, i) => children(row, i))}</>
  },
}))

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    FolderClosed: () => {
      probes.folder++
      return null
    },
    FolderOpen: () => {
      probes.folder++
      return null
    },
  }
})

// The list mounts the Virtualizer only once OverlayScrollbars surfaces its
// viewport; the mock fires that bridge synchronously after mount.
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({
    children,
    onViewportRef,
  }: {
    children?: ReactNode
    onViewportRef?: (el: HTMLElement | null) => void
  }) => {
    useEffect(() => {
      onViewportRef?.(document.createElement("div"))
    }, [onViewportRef])
    return <>{children}</>
  },
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("@/hooks/use-appearance", () => ({
  useThemeColor: () => ({ themeColor: "blue" }),
  useZoomLevel: () => ({ zoomLevel: 100, setZoomLevel: () => {} }),
}))

vi.mock("@/hooks/use-sorted-available-agents", () => ({
  useSortedAvailableAgents: () => ({
    sortedTypes: stableAgents.sortedTypes,
    fresh: true,
    refresh: () => {},
  }),
}))

vi.mock("@/features/shell", () => {
  const routeValue = {
    routeId: "conversations",
    isConversations: true,
    setRoute: () => {},
    openConversations: () => {},
  }
  return {
    useTerminal: () => stableTerminal,
    useWorkbenchRoute: () => routeValue,
  }
})

vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: activeFolderState.activeFolder }),
}))

vi.mock("@/contexts/tab-context", () => ({
  useTabActions: () => stableTabFns,
  useTabStore: (
    selector: (s: {
      activeTabId: string | null
      tabs: Array<Record<string, unknown>>
    }) => unknown
  ) =>
    selector({
      activeTabId: store.activeTabId,
      tabs: store.tabSpec.map((t) => ({ ...t })),
    }),
}))

// These only mount when their state opens (never in these tests); stub to keep
// the import graph light.
vi.mock("@/components/conversations/conversation-manage-dialog", () => ({
  ConversationManageDialog: () => null,
}))
vi.mock("@/components/layout/clone-dialog", () => ({ CloneDialog: () => null }))
vi.mock("@/components/layout/remote-workspace-manage-dialog", () => ({
  RemoteWorkspaceManageDialog: () => null,
}))
vi.mock("@/hooks/use-remote-workspace-connections", () => ({
  useRemoteWorkspaceConnections: () => ({
    desktop: false,
    connections: [],
    refresh: async () => {},
    open: () => {},
  }),
}))

const MINUTE = 60_000
const FIXED = 1_700_000_000_000

function conv(
  id: number,
  folderId: number,
  overrides: Partial<DbConversationSummary> = {}
): DbConversationSummary {
  const createdAt = new Date(FIXED - 5 * MINUTE).toISOString()
  return {
    id,
    folder_id: folderId,
    title: `conv-${id}`,
    title_locked: false,
    agent_type: "claude_code",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 0,
    child_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
    pinned_at: null,
    ...overrides,
  }
}

function folder(
  id: number,
  name: string,
  parentId: number | null = null
): FolderDetail {
  return {
    id,
    name,
    path: `/p/${id}`,
    color: "blue",
    default_agent_type: null,
    parent_id: parentId,
  } as unknown as FolderDetail
}

// Harness keeps the intl provider mounted once (mirrors production, where
// NextIntlClientProvider sits high in the tree) while the list re-renders.
let lastProps: { showCompleted?: boolean; sortMode?: "created" | "updated" } = {
  showCompleted: true,
  sortMode: "created",
}
function Harness() {
  return (
    <SidebarConversationList
      showCompleted={lastProps.showCompleted}
      sortMode={lastProps.sortMode}
    />
  )
}

function tree() {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Harness />
    </NextIntlClientProvider>
  )
}

/** The section header's toggle is the only "Projects" button with
 *  aria-expanded (the ＋ menu trigger shares the label). */
function sectionToggle(): HTMLElement {
  const candidates = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      `button[aria-expanded][aria-label], button[aria-expanded]`
    )
  ).filter((el) => el.textContent?.includes("Projects"))
  expect(candidates.length).toBeGreaterThan(0)
  return candidates[0]
}

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED })
  probes.agent = 0
  probes.folder = 0
  localStorage.clear()
  resetAppWorkspaceStore()
  useAppWorkspaceStore.setState({
    conversationsLoading: false,
    conversationsError: null,
    ...stableWorkspaceFns,
  })
  virtuaCtl.scrollToIndex.mockClear()
  activeFolderState.activeFolder = null
  store.activeTabId = null
  store.tabSpec = []
  lastProps = { showCompleted: true, sortMode: "created" }
})

afterEach(() => {
  vi.useRealTimers()
})

function seedWorkspace(
  folders: FolderDetail[],
  conversations: DbConversationSummary[]
) {
  useAppWorkspaceStore.setState({
    folders,
    allFolders: folders,
    conversations,
  })
}

describe("SidebarConversationList — ZCode project section", () => {
  it("renders the Projects section header and one row per open project", () => {
    seedWorkspace(
      [folder(1, "alpha"), folder(2, "beta")],
      [conv(11, 1), conv(21, 2)]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).toContain("Projects")
    expect(text).toContain("alpha")
    expect(text).toContain("beta")
    // 项目行的图标 probe：两个项目行 = 两次 glyph 渲染。
    expect(probes.folder).toBe(2)
  })

  it("nests sessions under their project with status dot + title + relative time and NEVER an agent icon", () => {
    seedWorkspace([folder(1, "alpha")], [conv(11, 1), conv(12, 1)])
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).toContain("conv-11")
    expect(text).toContain("conv-12")
    // 相对时间（FIXED - 5m → "5m"）。
    expect(text).toContain("5m")
    // 会话行是 harness-free 的：AgentIcon 一次都不许渲染。
    expect(probes.agent).toBe(0)
  })

  it("chat-kind conversations are no longer listed (reachable via search)", () => {
    seedWorkspace(
      [folder(1, "alpha")],
      [conv(11, 1), conv(99, 1, { kind: "chat", title: "chat-session" })]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).toContain("conv-11")
    expect(text).not.toContain("chat-session")
  })

  it("collapsing a project hides its sessions, and the state persists", () => {
    localStorage.setItem(
      "workspace:sidebar-folder-expanded",
      JSON.stringify({ "1": false })
    )
    seedWorkspace(
      [folder(1, "alpha"), folder(2, "beta")],
      [conv(11, 1), conv(21, 2)]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).not.toContain("conv-11")
    expect(text).toContain("conv-21")
  })

  it("the section header toggle collapses the whole section", () => {
    seedWorkspace([folder(1, "alpha")], [conv(11, 1)])
    render(tree())

    act(() => {
      sectionToggle().click()
    })
    expect(document.body.textContent).not.toContain("conv-11")
    // 折叠状态持久化在历史的 folders 键上。
    expect(
      JSON.parse(
        localStorage.getItem("workspace:sidebar-section-collapsed") ?? "{}"
      )
    ).toEqual({ folders: true })
  })

  it("showCompleted=false hides completed sessions and shows the unfinished hint", () => {
    lastProps = { showCompleted: false, sortMode: "created" }
    seedWorkspace([folder(1, "alpha")], [conv(11, 1, { status: "completed" })])
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).not.toContain("conv-11")
    // 目录里并非真空（有已完成会话被过滤）→ 提示未完成列表为空。
    expect(text).toContain("No unfinished conversations")
  })

  it("an empty project shows the empty hint", () => {
    seedWorkspace([folder(1, "alpha")], [])
    render(tree())

    expect(document.body.textContent).toContain("No conversations")
  })

  it("no projects → the section shows the no-folders hint", () => {
    // 有会话但没有任何打开的项目：既非空工作区动作页，也非空项目提示。
    seedWorkspace([], [conv(99, 1)])
    render(tree())

    expect(document.body.textContent).toContain("No folders open")
  })

  it("marks a project with a running badge and a red attention dot", () => {
    seedWorkspace(
      [folder(1, "alpha")],
      [
        conv(11, 1, { status: "in_progress" }),
        conv(12, 1, { status: "pending_review" }),
      ]
    )
    const { container } = render(tree())

    // 运行徽标（amber 计数 chip）。
    expect(document.body.textContent).toContain("1 session running")
    // 需注意红点（destructive 圆点）。
    expect(container.querySelector(".bg-destructive")).toBeTruthy()
  })

  it("sorts pinned sessions first, then by the chosen sort mode", () => {
    lastProps = { showCompleted: true, sortMode: "created" }
    seedWorkspace(
      [folder(1, "alpha")],
      [
        conv(11, 1, {
          created_at: new Date(FIXED - 30 * MINUTE).toISOString(),
        }),
        conv(12, 1, {
          created_at: new Date(FIXED - 2 * MINUTE).toISOString(),
          pinned_at: new Date(FIXED).toISOString(),
        }),
      ]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    // conv-12 更"新"且被置顶；两种理由都把它排在前面。
    expect(text.indexOf("conv-12")).toBeLessThan(text.indexOf("conv-11"))
  })

  it("sortMode=updated orders by last update instead of creation", () => {
    lastProps = { showCompleted: true, sortMode: "updated" }
    seedWorkspace(
      [folder(1, "alpha")],
      [
        conv(11, 1, {
          created_at: new Date(FIXED - 40 * MINUTE).toISOString(),
          updated_at: new Date(FIXED - 1 * MINUTE).toISOString(),
        }),
        conv(12, 1, {
          created_at: new Date(FIXED - 5 * MINUTE).toISOString(),
          updated_at: new Date(FIXED - 20 * MINUTE).toISOString(),
        }),
      ]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text.indexOf("conv-11")).toBeLessThan(text.indexOf("conv-12"))
  })

  it("worktree children merge into their open parent project", () => {
    seedWorkspace(
      [folder(1, "alpha"), folder(2, "wt", 1)],
      [conv(11, 1), conv(21, 2)]
    )
    render(tree())

    const text = document.body.textContent ?? ""
    // 两个项目的会话都渲染在 alpha 名下；wt 不再是独立行（旧"文件夹"节的
    // 展示由项目行替代，worktree 会话并入父项目）。
    expect(text).toContain("conv-11")
    expect(text).toContain("conv-21")
    // 只有一个项目行 glyph（alpha），wt 没有自己的行。
    expect(probes.folder).toBe(1)
  })
})

describe("SidebarConversationList — interactions", () => {
  it("selecting a session opens a tab in its folder", () => {
    seedWorkspace([folder(1, "alpha")], [conv(11, 1)])
    render(tree())

    const row = document.querySelector<HTMLButtonElement>(
      `[data-conversation-id="11"]`
    )
    expect(row).toBeTruthy()
    act(() => {
      row!.click()
    })
    expect(stableTabFns.openTab).toHaveBeenCalledWith(
      1,
      11,
      "claude_code",
      false
    )
  })

  it("scrollToActive expands a collapsed project and scrolls to the row", async () => {
    localStorage.setItem(
      "workspace:sidebar-folder-expanded",
      JSON.stringify({ "1": false })
    )
    seedWorkspace([folder(1, "alpha")], [conv(11, 1)])
    store.activeTabId = "tab-11"
    store.tabSpec = [
      {
        id: "tab-11",
        conversationId: 11,
        agentType: "claude_code",
        folderId: 1,
        title: "conv-11",
        isPinned: false,
      },
    ]
    const listRef = createRef<SidebarConversationListHandle>()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SidebarConversationList ref={listRef} showCompleted />
      </NextIntlClientProvider>
    )

    expect(document.body.textContent).not.toContain("conv-11")
    act(() => {
      listRef.current?.scrollToActive()
    })
    // 展开先落库（pendingScroll 链），下一拍滚到行。
    await act(async () => {})
    expect(virtuaCtl.scrollToIndex).toHaveBeenCalled()
    expect(document.body.textContent).toContain("conv-11")
  })

  it("expandAll / collapseAll drive every project plus the section", () => {
    localStorage.setItem(
      "workspace:sidebar-folder-expanded",
      JSON.stringify({ "1": false, "2": false })
    )
    seedWorkspace(
      [folder(1, "alpha"), folder(2, "beta")],
      [conv(11, 1), conv(21, 2)]
    )
    const listRef = createRef<SidebarConversationListHandle>()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SidebarConversationList ref={listRef} showCompleted />
      </NextIntlClientProvider>
    )

    act(() => {
      listRef.current?.expandAll()
    })
    expect(document.body.textContent).toContain("conv-11")
    expect(document.body.textContent).toContain("conv-21")

    act(() => {
      listRef.current?.collapseAll()
    })
    const text = document.body.textContent ?? ""
    expect(text).not.toContain("conv-11")
    expect(text).not.toContain("conv-21")
    // 折叠到底只剩节头本身。
    expect(text).toContain("Projects")
    expect(
      JSON.parse(
        localStorage.getItem("workspace:sidebar-section-collapsed") ?? "{}"
      )
    ).toEqual({ folders: true })
  })

  it("auto-expands the active project", async () => {
    localStorage.setItem(
      "workspace:sidebar-folder-expanded",
      JSON.stringify({ "1": false, "2": false })
    )
    activeFolderState.activeFolder = { id: 1, path: "/p/1" }
    seedWorkspace(
      [folder(1, "alpha"), folder(2, "beta")],
      [conv(11, 1), conv(21, 2)]
    )
    render(tree())

    // 活动项目自动展开：conv-11 可见，非活动的 beta 仍折叠。
    const text = document.body.textContent ?? ""
    expect(text).toContain("conv-11")
    expect(text).not.toContain("conv-21")
    expect(
      JSON.parse(
        localStorage.getItem("workspace:sidebar-folder-expanded") ?? "{}"
      )
    ).toEqual({ "1": true, "2": false })
  })

  it("empty workspace shows the open/clone/import actions", () => {
    seedWorkspace([], [])
    render(tree())

    const text = document.body.textContent ?? ""
    expect(text).toContain("Open Folder")
    expect(text).toContain("Clone Repository")
    expect(text).toContain("Import local sessions")
  })
})
