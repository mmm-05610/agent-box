import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Automation, FolderDetail, WorkTask } from "@/lib/types"
import { automationList, terminalKill, workTaskList } from "@/lib/api"
import { sendSystemNotification } from "@/lib/notification"
import {
  resetAppWorkspaceStore,
  useAppWorkspaceStore,
} from "@/stores/app-workspace-store"

vi.mock("@/lib/api", () => ({
  automationList: vi.fn(),
  workTaskList: vi.fn(),
  terminalKill: vi.fn().mockResolvedValue(undefined),
  getSystemTerminalSettings: vi.fn(),
  getFolder: vi.fn(),
  getGitHead: vi.fn(),
  listOpenFolderDetails: vi.fn(async () => []),
  listAllFolderDetails: vi.fn(async () => []),
  listFolderGroups: vi.fn(async () => []),
  listAllConversations: vi.fn(async () => []),
  openFolder: vi.fn(),
  openFolderById: vi.fn(),
  openWorktreeFolder: vi.fn(),
  removeFolderFromWorkspace: vi.fn(),
  applySidebarLayout: vi.fn(),
  createFolderGroup: vi.fn(),
  updateFolderGroup: vi.fn(),
  deleteFolderGroup: vi.fn(),
  setFolderGroup: vi.fn(),
}))
vi.mock("@/lib/notification", () => ({
  sendSystemNotification: vi.fn(),
}))

import {
  resetWorkspaceShellStore,
  setTasksNotifier,
  useWorkspaceShellStore,
} from "./store"

const mockListAutomations = vi.mocked(automationList)
const mockListTasks = vi.mocked(workTaskList)
const mockTerminalKill = vi.mocked(terminalKill)
const mockNotify = vi.mocked(sendSystemNotification)

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 1,
    folder_id: 1,
    name: "a1",
    enabled: true,
    schedule: null,
    prompt: null,
    last_run_status: null,
    unseen_failures: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  } as Automation
}

function folder(id: number, path: string, alias: string | null = null) {
  return {
    id,
    name: `folder-${id}`,
    alias,
    path,
    git_branch: null,
    default_agent_type: null,
    last_opened_at: "2026-08-01T00:00:00Z",
    sort_order: id,
    color: "blue",
    parent_id: null,
    kind: "regular",
    group_id: null,
  } as FolderDetail
}

function task(id: number, status: WorkTask["status"]): WorkTask {
  return {
    id,
    folder_id: 1,
    title: `t${id}`,
    config: null,
    status,
    failure_reason: null,
    last_error: null,
    run_seq: 0,
    sort_order: id,
    worktree_folder_id: null,
    conversation_id: null,
    connection_id: null,
    base_branch: null,
    base_sha: null,
    work_branch: null,
    cleanup_state: null,
    verdict: null,
    result_summary: null,
    files_changed: null,
    additions: null,
    deletions: null,
    merge_commit: null,
    preflight: null,
    archived_at: null,
    scheduled_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    started_at: null,
    settled_at: null,
    finished_at: null,
  }
}

function seedActiveFolder() {
  useAppWorkspaceStore.setState({
    activeFolderId: 7,
    allFolders: [folder(7, "/repo")],
    folders: [folder(7, "/repo")],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetAppWorkspaceStore()
  resetWorkspaceShellStore()
})

// ---------------------------------------------------------------------------
// workbenchRoute (former workbench-route context)
// ---------------------------------------------------------------------------

describe("workbenchRoute slice", () => {
  it("defaults to the conversation workspace", () => {
    const { routeId, isConversations } =
      useWorkspaceShellStore.getState().workbenchRoute
    expect(routeId).toBe("conversations")
    expect(isConversations).toBe(true)
  })

  it("switches routes and flips isConversations", () => {
    useWorkspaceShellStore.getState().workbenchRoute.setRoute("automations")
    let route = useWorkspaceShellStore.getState().workbenchRoute
    expect(route.routeId).toBe("automations")
    expect(route.isConversations).toBe(false)

    useWorkspaceShellStore.getState().workbenchRoute.openConversations()
    route = useWorkspaceShellStore.getState().workbenchRoute
    expect(route.routeId).toBe("conversations")
    expect(route.isConversations).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// searchDialog (former search-dialog context)
// ---------------------------------------------------------------------------

describe("searchDialog slice", () => {
  it("supports plain and functional setOpen", () => {
    const { searchDialog } = useWorkspaceShellStore.getState()
    searchDialog.setOpen(true)
    expect(useWorkspaceShellStore.getState().searchDialog.open).toBe(true)
    // The ⌘K shortcut toggles via the functional-updater form.
    searchDialog.setOpen((prev) => !prev)
    expect(useWorkspaceShellStore.getState().searchDialog.open).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sidebar / auxPanel hydration + persistence (former sidebar/aux-panel contexts)
// ---------------------------------------------------------------------------

describe("persisted panel hydration", () => {
  it("restores open/width under the original localStorage keys and flips restored", () => {
    localStorage.setItem(
      "workspace:left-sidebar",
      JSON.stringify({ isOpen: false, width: 420 })
    )
    localStorage.setItem(
      "workspace:right-sidebar",
      JSON.stringify({ isOpen: true, width: 500 })
    )

    useWorkspaceShellStore.getState().hydratePersistedPanels()

    const s = useWorkspaceShellStore.getState()
    expect(s.sidebar.restored).toBe(true)
    expect(s.sidebar.isOpen).toBe(false)
    expect(s.sidebar.width).toBe(420)
    expect(s.auxPanel.restored).toBe(true)
    expect(s.auxPanel.isOpen).toBe(true)
    expect(s.auxPanel.width).toBe(500)
  })

  it("forces both panels closed on a mobile viewport (<768px)", () => {
    localStorage.setItem(
      "workspace:left-sidebar",
      JSON.stringify({ isOpen: true, width: 420 })
    )
    const originalWidth = window.innerWidth
    window.innerWidth = 480
    try {
      useWorkspaceShellStore.getState().hydratePersistedPanels()
      const s = useWorkspaceShellStore.getState()
      expect(s.sidebar.isOpen).toBe(false)
      expect(s.auxPanel.isOpen).toBe(false)
    } finally {
      window.innerWidth = originalWidth
    }
  })

  it("does not persist until restored, then writes every change", () => {
    // Pre-restore mutations must not write (the old save effects gated on
    // `restored`, so a pre-hydration default never clobbered the key).
    useWorkspaceShellStore.getState().sidebar.toggle()
    expect(localStorage.getItem("workspace:left-sidebar")).toBeNull()

    useWorkspaceShellStore.getState().hydratePersistedPanels()
    const width = useWorkspaceShellStore.getState().sidebar.width
    useWorkspaceShellStore.getState().sidebar.toggle()

    const stored = JSON.parse(
      localStorage.getItem("workspace:left-sidebar") ?? "{}"
    )
    // Default open=true → the toggle above closed it.
    expect(stored).toEqual({ isOpen: false, width })
  })

  it("clamps hydrated and manual widths to the min/max range", () => {
    useWorkspaceShellStore.getState().hydratePersistedPanels()
    useWorkspaceShellStore.getState().sidebar.setWidth(10000)
    expect(useWorkspaceShellStore.getState().sidebar.width).toBe(900)
    useWorkspaceShellStore.getState().sidebar.setWidth(1)
    expect(useWorkspaceShellStore.getState().sidebar.width).toBe(300)

    useWorkspaceShellStore.getState().auxPanel.setWidth(10000)
    expect(useWorkspaceShellStore.getState().auxPanel.width).toBe(900)
  })
})

// ---------------------------------------------------------------------------
// terminal slice (former terminal context)
// ---------------------------------------------------------------------------

describe("terminal slice", () => {
  it("toggle auto-creates the first terminal when a folder is active", () => {
    seedActiveFolder()

    useWorkspaceShellStore.getState().terminal.toggle()

    const t = useWorkspaceShellStore.getState().terminal
    expect(t.isOpen).toBe(true)
    expect(t.tabs).toHaveLength(1)
    expect(t.tabs[0].title).toBe("Terminal 1")
    expect(t.tabs[0].workingDir).toBe("/repo")
    expect(t.activeTabId).toBe(t.tabs[0].id)
  })

  it("toggle does not create a tab when no folder is active", () => {
    useWorkspaceShellStore.getState().terminal.toggle()
    const t = useWorkspaceShellStore.getState().terminal
    expect(t.isOpen).toBe(true)
    expect(t.tabs).toHaveLength(0)
    expect(t.activeTabId).toBeNull()
  })

  it("toggle keeps existing tabs and the active tab", () => {
    seedActiveFolder()
    useWorkspaceShellStore.getState().terminal.toggle()
    const firstId = useWorkspaceShellStore.getState().terminal.activeTabId

    useWorkspaceShellStore.getState().terminal.toggle() // close
    useWorkspaceShellStore.getState().terminal.toggle() // reopen
    const t = useWorkspaceShellStore.getState().terminal
    expect(t.tabs).toHaveLength(1)
    expect(t.activeTabId).toBe(firstId)
  })

  it("createTerminalInDirectory appends a tab, opens the panel, activates it", async () => {
    seedActiveFolder()
    const id = await useWorkspaceShellStore
      .getState()
      .terminal.createTerminalInDirectory("/repo/nested", "Build watcher")
    expect(id).toBeTruthy()
    const t = useWorkspaceShellStore.getState().terminal
    expect(t.isOpen).toBe(true)
    expect(t.tabs).toHaveLength(1)
    expect(t.tabs[0].title).toBe("Build watcher")
    expect(t.tabs[0].workingDir).toBe("/repo/nested")
    expect(t.activeTabId).toBe(id)
    // Empty working dir is a no-op returning null.
    await expect(
      useWorkspaceShellStore.getState().terminal.createTerminalInDirectory("")
    ).resolves.toBeNull()
    expect(useWorkspaceShellStore.getState().terminal.tabs).toHaveLength(1)
  })

  it("closeTerminal falls back to the last tab, and closes the panel + resets the counter when empty", () => {
    seedActiveFolder()
    const { terminal } = useWorkspaceShellStore.getState()
    void terminal.createTerminalInDirectory("/repo")
    void terminal.createTerminalInDirectory("/repo")
    const [firstId, secondId] = useWorkspaceShellStore
      .getState()
      .terminal.tabs.map((tab) => tab.id)

    useWorkspaceShellStore.getState().terminal.closeTerminal(secondId)
    let t = useWorkspaceShellStore.getState().terminal
    expect(t.tabs.map((tab) => tab.id)).toEqual([firstId])
    expect(t.activeTabId).toBe(firstId)
    expect(t.isOpen).toBe(true)

    // markTerminalExited tracks process deaths; closing un-exits the id again.
    useWorkspaceShellStore.getState().terminal.markTerminalExited(firstId)
    expect(
      useWorkspaceShellStore.getState().terminal.exitedTerminals.has(firstId)
    ).toBe(true)

    useWorkspaceShellStore.getState().terminal.closeTerminal(firstId)
    t = useWorkspaceShellStore.getState().terminal
    expect(t.tabs).toHaveLength(0)
    expect(t.activeTabId).toBeNull()
    expect(t.isOpen).toBe(false)
    expect(t.exitedTerminals.has(firstId)).toBe(false)

    // Counter restarted → the next auto-created tab is "Terminal 1" again.
    useWorkspaceShellStore.getState().terminal.toggle()
    expect(useWorkspaceShellStore.getState().terminal.tabs[0].title).toBe(
      "Terminal 1"
    )
  })

  it("closeOtherTerminals keeps only the given tab and re-activates it", () => {
    seedActiveFolder()
    const { terminal } = useWorkspaceShellStore.getState()
    void terminal.createTerminalInDirectory("/repo")
    void terminal.createTerminalInDirectory("/repo")
    void terminal.createTerminalInDirectory("/repo")
    const keepId = useWorkspaceShellStore.getState().terminal.tabs[1].id

    useWorkspaceShellStore.getState().terminal.closeOtherTerminals(keepId)
    const t = useWorkspaceShellStore.getState().terminal
    expect(t.tabs.map((tab) => tab.id)).toEqual([keepId])
    expect(t.activeTabId).toBe(keepId)
    expect(t.isOpen).toBe(true)
  })

  it("closeAllTerminals empties everything and kills each process", () => {
    seedActiveFolder()
    const { terminal } = useWorkspaceShellStore.getState()
    void terminal.createTerminalInDirectory("/repo")
    void terminal.createTerminalInDirectory("/repo")

    useWorkspaceShellStore.getState().terminal.closeAllTerminals()
    const t = useWorkspaceShellStore.getState().terminal
    expect(t.tabs).toHaveLength(0)
    expect(t.activeTabId).toBeNull()
    expect(t.isOpen).toBe(false)
    expect(t.exitedTerminals.size).toBe(0)
    expect(mockTerminalKill).toHaveBeenCalledTimes(2)
  })

  it("renameTerminal / switchTerminal / setHeight behave", async () => {
    seedActiveFolder()
    const id = await useWorkspaceShellStore
      .getState()
      .terminal.createTerminalInDirectory("/repo")

    useWorkspaceShellStore.getState().terminal.renameTerminal(id!, "dev")
    expect(useWorkspaceShellStore.getState().terminal.tabs[0].title).toBe("dev")

    useWorkspaceShellStore.getState().terminal.switchTerminal("other")
    expect(useWorkspaceShellStore.getState().terminal.activeTabId).toBe("other")

    useWorkspaceShellStore.getState().terminal.setHeight(10000)
    expect(useWorkspaceShellStore.getState().terminal.height).toBe(600)
    useWorkspaceShellStore.getState().terminal.setHeight(1)
    expect(useWorkspaceShellStore.getState().terminal.height).toBe(150)
  })
})

// ---------------------------------------------------------------------------
// automationsView slice (former automations-view context data layer)
// ---------------------------------------------------------------------------

describe("automationsView slice", () => {
  it("refetch stores the list and sums unseen failures", async () => {
    mockListAutomations.mockResolvedValue([
      automation({ unseen_failures: 2 }),
      automation({ id: 2, unseen_failures: 0 }),
      automation({ id: 3 }),
    ])
    await useWorkspaceShellStore.getState().automationsView.refetch()
    const slice = useWorkspaceShellStore.getState().automationsView
    expect(slice.automations).toHaveLength(3)
    expect(slice.unseenFailures).toBe(2)
  })

  it("keeps the previous list on fetch errors", async () => {
    mockListAutomations.mockResolvedValueOnce([
      automation({ unseen_failures: 1 }),
    ])
    await useWorkspaceShellStore.getState().automationsView.refetch()
    mockListAutomations.mockRejectedValueOnce(new Error("boom"))
    await useWorkspaceShellStore.getState().automationsView.refetch()
    const slice = useWorkspaceShellStore.getState().automationsView
    expect(slice.automations).toHaveLength(1)
    expect(slice.unseenFailures).toBe(1)
  })

  it("drops stale responses (a newer in-flight fetch wins)", async () => {
    let resolveOld: (value: unknown) => void = () => {}
    const old = new Promise((resolve) => {
      resolveOld = resolve
    })
    mockListAutomations.mockReturnValueOnce(
      old as ReturnType<typeof automationList>
    )
    mockListAutomations.mockResolvedValueOnce([
      automation({ unseen_failures: 3 }),
    ])

    const first = useWorkspaceShellStore.getState().automationsView.refetch()
    const second = useWorkspaceShellStore.getState().automationsView.refetch()
    await second
    resolveOld([automation({ unseen_failures: 99 })])
    await first
    expect(
      useWorkspaceShellStore.getState().automationsView.unseenFailures
    ).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// tasksView slice (former tasks-view context data layer)
// ---------------------------------------------------------------------------

describe("tasksView slice", () => {
  it("starts loading and refetch fills tasks + attentionCount", async () => {
    expect(useWorkspaceShellStore.getState().tasksView.loading).toBe(true)
    mockListTasks.mockResolvedValue([
      task(1, "awaiting_input"),
      task(2, "review"),
      task(3, "failed"),
      task(4, "running"),
      task(5, "todo"),
    ])
    await useWorkspaceShellStore.getState().tasksView.refetch()
    const slice = useWorkspaceShellStore.getState().tasksView
    expect(slice.tasks).toHaveLength(5)
    expect(slice.attentionCount).toBe(3)
    expect(slice.loading).toBe(false)
  })

  it("excludes archived tasks from the attention count", async () => {
    const archived = { ...task(9, "review"), archived_at: "2026-08-01" }
    mockListTasks.mockResolvedValue([task(1, "review"), archived])
    await useWorkspaceShellStore.getState().tasksView.refetch()
    expect(useWorkspaceShellStore.getState().tasksView.attentionCount).toBe(1)
  })

  it("a failed first fetch still ends loading; later errors keep data", async () => {
    mockListTasks.mockRejectedValueOnce(new Error("boom"))
    await useWorkspaceShellStore.getState().tasksView.refetch()
    expect(useWorkspaceShellStore.getState().tasksView.loading).toBe(false)

    mockListTasks.mockResolvedValueOnce([task(1, "todo")])
    await useWorkspaceShellStore.getState().tasksView.refetch()
    mockListTasks.mockRejectedValueOnce(new Error("boom"))
    await useWorkspaceShellStore.getState().tasksView.refetch()
    expect(useWorkspaceShellStore.getState().tasksView.tasks).toHaveLength(1)
  })

  it("notifies on review/failed flips but never for the initial load", async () => {
    setTasksNotifier((key, values) => `${key}:${values.title}`)
    useAppWorkspaceStore.setState({
      folders: [folder(1, "/proj", "my-alias")],
    })

    mockListTasks.mockResolvedValue([task(1, "review"), task(2, "running")])
    await useWorkspaceShellStore.getState().tasksView.refetch()
    // Pre-existing review task = history, not news.
    expect(mockNotify).not.toHaveBeenCalled()

    mockListTasks.mockResolvedValue([task(1, "review"), task(2, "failed")])
    await useWorkspaceShellStore.getState().tasksView.refetch()
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith(
      "my-alias - Codeg",
      "notifyFailed:t2"
    )
  })

  it("restores and persists the view mode under the original key", () => {
    expect(useWorkspaceShellStore.getState().tasksView.viewMode).toBe("board")
    useWorkspaceShellStore.getState().tasksView.setViewMode("list")
    expect(localStorage.getItem("workspace:tasks-view-mode")).toBe("list")

    // A reset re-reads the (cleared) storage.
    localStorage.removeItem("workspace:tasks-view-mode")
    resetWorkspaceShellStore()
    expect(useWorkspaceShellStore.getState().tasksView.viewMode).toBe("board")
  })
})
