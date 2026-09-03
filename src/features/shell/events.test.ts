import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FolderDetail, WorkTask } from "@/lib/types"
import {
  resetAppWorkspaceStore,
  useAppWorkspaceStore,
} from "@/stores/app-workspace-store"

/**
 * The former AutomationsViewProvider / TasksViewProvider / TerminalProvider
 * subscribe effects, now plain start/dispose functions (events.ts). These
 * tests preserve exactly what the old context tests covered: initial fetch,
 * refetch on backend nudge, refetch on transport reconnect, and the default
 * terminal shell staying live on the settings-updated push.
 */

let changedHandler: (() => void) | null = null
let reconnectHandler: (() => void) | null = null
let settingsHandler: ((payload: unknown) => void) | null = null

vi.mock("@/lib/platform", () => ({
  isDesktop: () => false,
  subscribe: vi.fn((channel: string, cb: () => void) => {
    if (channel === "automation://changed" || channel === "task://changed") {
      changedHandler = cb
    }
    return Promise.resolve(() => {
      changedHandler = null
    })
  }),
  onTransportReconnect: vi.fn((cb: () => void) => {
    reconnectHandler = cb
    return () => {
      reconnectHandler = null
    }
  }),
}))

vi.mock("@/core/transport", () => ({
  getTransport: () => ({
    subscribe: (_channel: string, cb: (payload: unknown) => void) => {
      settingsHandler = cb
      return Promise.resolve(() => {
        settingsHandler = null
      })
    },
  }),
}))

const settingsMock = vi.fn()
vi.mock("@/lib/api", () => ({
  getSystemTerminalSettings: (...args: unknown[]) => settingsMock(...args),
  automationList: vi.fn(),
  workTaskList: vi.fn(),
  terminalKill: vi.fn(),
}))

import { useWorkspaceShellStore, resetWorkspaceShellStore } from "./store"
import {
  startAutomationsSync,
  startTasksSync,
  startTerminalSettingsSync,
} from "./events"

const { automationList, workTaskList } = vi.mocked(
  await import("@/lib/api")
) as unknown as {
  automationList: ReturnType<typeof vi.fn>
  workTaskList: ReturnType<typeof vi.fn>
}

const ACTIVE_FOLDER: FolderDetail = {
  id: 7,
  name: "repo",
  alias: null,
  path: "/repo",
  git_branch: null,
  default_agent_type: null,
  last_opened_at: "2026-08-01T00:00:00Z",
  sort_order: 1,
  color: "blue",
  parent_id: null,
  kind: "regular",
} as FolderDetail

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

beforeEach(() => {
  vi.clearAllMocks()
  changedHandler = null
  reconnectHandler = null
  resetAppWorkspaceStore()
  resetWorkspaceShellStore()
})

describe("startTasksSync", () => {
  it("fetches immediately and refetches on task://changed nudges", async () => {
    workTaskList.mockResolvedValueOnce([task(1, "todo")])
    const dispose = startTasksSync()
    await vi.waitFor(() =>
      expect(useWorkspaceShellStore.getState().tasksView.tasks).toHaveLength(1)
    )
    expect(workTaskList).toHaveBeenCalledTimes(1)

    // A backend nudge triggers a refetch that replaces the list.
    workTaskList.mockResolvedValueOnce([
      task(1, "review"),
      task(2, "awaiting_input"),
      task(3, "running"),
    ])
    changedHandler?.()
    await vi.waitFor(() =>
      expect(useWorkspaceShellStore.getState().tasksView.tasks).toHaveLength(3)
    )
    // Attention = awaiting_input + review + failed (running excluded).
    expect(useWorkspaceShellStore.getState().tasksView.attentionCount).toBe(2)

    dispose()
  })

  it("refetches on transport reconnect and keeps data on fetch errors", async () => {
    workTaskList.mockResolvedValueOnce([task(1, "failed")])
    const dispose = startTasksSync()
    await vi.waitFor(() =>
      expect(useWorkspaceShellStore.getState().tasksView.attentionCount).toBe(1)
    )

    // A transient error must not blank the board.
    workTaskList.mockRejectedValueOnce(new Error("boom"))
    reconnectHandler?.()
    await vi.waitFor(() => expect(workTaskList).toHaveBeenCalledTimes(2))
    expect(useWorkspaceShellStore.getState().tasksView.tasks).toHaveLength(1)

    dispose()
  })
})

describe("startAutomationsSync", () => {
  it("fetches immediately and refetches on automation://changed nudges", async () => {
    automationList.mockResolvedValueOnce([{ unseen_failures: 1 }])
    const dispose = startAutomationsSync()
    await vi.waitFor(() =>
      expect(
        useWorkspaceShellStore.getState().automationsView.automations
      ).toHaveLength(1)
    )

    automationList.mockResolvedValueOnce([
      { unseen_failures: 2 },
      { unseen_failures: 0 },
    ])
    changedHandler?.()
    await vi.waitFor(() =>
      expect(
        useWorkspaceShellStore.getState().automationsView.unseenFailures
      ).toBe(2)
    )

    dispose()
  })
})

describe("startTerminalSettingsSync", () => {
  it("loads the default shell and applies settings-updated pushes", async () => {
    settingsMock.mockResolvedValueOnce({ default_shell: "/bin/zsh" })
    const dispose = startTerminalSettingsSync()
    await vi.waitFor(() => expect(settingsMock).toHaveBeenCalledTimes(1))

    // Creating a terminal picks up the synced default shell.
    useAppWorkspaceStore.setState({
      activeFolderId: ACTIVE_FOLDER.id,
      allFolders: [ACTIVE_FOLDER],
    })
    await useWorkspaceShellStore
      .getState()
      .terminal.createTerminalInDirectory("/repo")
    expect(useWorkspaceShellStore.getState().terminal.tabs[0].shell).toBe(
      "/bin/zsh"
    )

    settingsHandler?.({ default_shell: "/usr/bin/fish" })
    await useWorkspaceShellStore
      .getState()
      .terminal.createTerminalInDirectory("/repo")
    expect(useWorkspaceShellStore.getState().terminal.tabs[1].shell).toBe(
      "/usr/bin/fish"
    )

    dispose()
  })
})
