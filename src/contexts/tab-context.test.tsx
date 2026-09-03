import { act, render, screen, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TabProvider, useTabContext } from "@/contexts/tab-context"
import { CONVERSATION_CHANGED_EVENT, TABS_CHANGED_EVENT } from "@/lib/types"
import type {
  AgentType,
  ConversationChange,
  DbConversationSummary,
  FolderDetail,
  OpenedTab,
  TabsChanged,
} from "@/lib/types"
import {
  resetAppWorkspaceStore,
  useAppWorkspaceStore,
} from "@/stores/app-workspace-store"
import {
  resetTabStore,
  useTabStore,
  type OpenedDraftTarget,
} from "@/stores/tab-store"

const listOpenedTabsMock = vi.fn()
const saveOpenedTabsMock = vi.fn()
const getFolderConversationMock = vi.fn()
const setActiveFolderIdMock = vi.fn()
const activateConversationPaneMock = vi.fn()
const disconnectMock = vi.fn()
const subscribeMock = vi.fn()
const onTransportReconnectMock = vi.fn()
const loadLastActiveContextMock = vi.fn()
const saveLastActiveContextMock = vi.fn()
const clearLastActiveContextMock = vi.fn()
// Captured `tabs://changed` handler so tests can simulate inbound broadcasts.
let tabsChangedHandler: ((change: TabsChanged) => void) | null = null
// Captured `conversation://changed` handler so tests can drive sub-session
// status/upsert/delete events into the open-tab summary cache.
let conversationChangedHandler: ((change: ConversationChange) => void) | null =
  null

vi.mock("next-intl", () => {
  // Return a STABLE function instance across renders, mirroring next-intl's
  // real behavior. An unstable `t` would re-run effects that depend on it
  // (e.g. the hydrate effect) on every render.
  const t = (key: string) => key
  return { useTranslations: () => t }
})

vi.mock("@/lib/api", () => ({
  listOpenedTabs: (...args: unknown[]) => listOpenedTabsMock(...args),
  saveOpenedTabs: (...args: unknown[]) => saveOpenedTabsMock(...args),
  getFolderConversation: (...args: unknown[]) =>
    getFolderConversationMock(...args),
}))

vi.mock("@/lib/platform", () => ({
  subscribe: (...args: unknown[]) => subscribeMock(...args),
  onTransportReconnect: (...args: unknown[]) =>
    onTransportReconnectMock(...args),
}))

vi.mock("@/contexts/workspace-context", () => ({
  useWorkspaceActions: () => ({
    activateConversationPane: activateConversationPaneMock,
  }),
}))

vi.mock("@/contexts/acp-connections-context", () => ({
  useAcpActions: () => ({
    disconnect: disconnectMock,
  }),
}))

vi.mock("@/hooks/use-sorted-available-agents", () => ({
  useSortedAvailableAgents: () => ({
    sortedTypes: ["codex" satisfies AgentType],
    fresh: true,
  }),
}))

vi.mock("@/lib/last-active-context-storage", () => ({
  loadLastActiveContext: () => loadLastActiveContextMock(),
  saveLastActiveContext: (...args: unknown[]) =>
    saveLastActiveContextMock(...args),
  clearLastActiveContext: () => clearLastActiveContextMock(),
}))

const defaultFoldersMock: FolderDetail[] = [
  {
    id: 1,
    name: "repo",
    path: "/repo",
    git_branch: null,
    default_agent_type: "codex",
    last_opened_at: "2026-05-24T00:00:00Z",
    sort_order: 0,
    color: "blue",
    parent_id: null,
    kind: "regular",
    alias: null,
    group_id: null,
  },
  {
    id: 2,
    name: "other",
    path: "/other",
    git_branch: null,
    default_agent_type: "codex",
    last_opened_at: "2026-05-24T00:00:00Z",
    sort_order: 1,
    color: "green",
    parent_id: null,
    kind: "regular",
    alias: null,
    group_id: null,
  },
]

const defaultConversationsMock: DbConversationSummary[] = [
  {
    id: 1,
    folder_id: 1,
    title: "First",
    title_locked: false,
    agent_type: "codex",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-05-24T00:00:00Z",
    updated_at: "2026-05-24T00:00:00Z",
    pinned_at: null,
  },
  {
    id: 2,
    folder_id: 1,
    title: "Second",
    title_locked: false,
    agent_type: "codex",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-05-24T00:00:00Z",
    updated_at: "2026-05-24T00:00:00Z",
    pinned_at: null,
  },
  {
    id: 3,
    folder_id: 2,
    title: "Third",
    title_locked: false,
    agent_type: "codex",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-05-24T00:00:00Z",
    updated_at: "2026-05-24T00:00:00Z",
    pinned_at: null,
  },
]

// Reset the real workspace store and seed it with the default fixtures.
// `allFolders` includes hidden chat folders that the user-facing `folders`
// list excludes; both default to the same set (no chat folders) for most
// tests. `conversationsLoading` gates the sub-session seed effect; it defaults
// to loaded (false) so most tests seed immediately. Individual tests override
// slices via `useAppWorkspaceStore.setState` (e.g. an empty root list for the
// loaded-but-empty case).
function seedWorkspaceStore() {
  resetAppWorkspaceStore()
  useAppWorkspaceStore.setState({
    conversations: defaultConversationsMock,
    conversationsLoading: false,
    folders: defaultFoldersMock,
    allFolders: defaultFoldersMock,
    foldersHydrated: true,
    setActiveFolderId: setActiveFolderIdMock,
  })
  // Drop device-local drafts blobs BEFORE the reset re-reads them —
  // `persistDraftState` writes localStorage during hydrated tests and would
  // otherwise leak restored drafts across tests.
  localStorage.clear()
  // The tab store is a module-level singleton: reset it (state + coordination
  // vars + injected runtime + one-shot correction/recovery flags) after seeding
  // the workspace store so `lastConversations` aligns with the seeded list.
  resetTabStore()
}

let latestContext: ReturnType<typeof useTabContext> | null = null

function Probe() {
  const ctx = useTabContext()
  const activeTab = ctx.tabs.find((tab) => tab.id === ctx.activeTabId)

  useEffect(() => {
    latestContext = ctx
  }, [ctx])

  return (
    <div>
      <output data-testid="active">{ctx.activeTabId ?? "none"}</output>
      <output data-testid="tabs">
        {ctx.tabs.map((tab) => tab.id).join(",")}
      </output>
      <output data-testid="active-folder">
        {activeTab?.folderId ?? "none"}
      </output>
    </div>
  )
}

function renderTabs() {
  latestContext = null
  return render(
    <TabProvider>
      <Probe />
    </TabProvider>
  )
}

function openConversationTab(
  folderId: number,
  conversationId: number,
  title: string
) {
  act(() => {
    latestContext?.openTab(folderId, conversationId, "codex", true, title)
  })
}

describe("TabProvider tab state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedWorkspaceStore()
    listOpenedTabsMock.mockReturnValue(new Promise(() => {}))
    saveOpenedTabsMock.mockResolvedValue({
      accepted: true,
      version: 1,
      tabs: [],
    })
    // mockReset (not just clearAllMocks) also drains any leftover
    // mockReturnValueOnce queue from a prior test so it can't leak a stale
    // (e.g. never-resolving) promise into the next test's first fetch.
    getFolderConversationMock.mockReset()
    getFolderConversationMock.mockReturnValue(new Promise(() => {}))
    tabsChangedHandler = null
    conversationChangedHandler = null
    subscribeMock.mockImplementation((event: string, handler: unknown) => {
      if (event === TABS_CHANGED_EVENT)
        tabsChangedHandler = handler as (change: TabsChanged) => void
      if (event === CONVERSATION_CHANGED_EVENT)
        conversationChangedHandler = handler as (
          change: ConversationChange
        ) => void
      return Promise.resolve(() => {})
    })
    onTransportReconnectMock.mockReturnValue(() => {})
  })

  it("creates and activates a replacement draft when closing the last tab with folders available", () => {
    renderTabs()

    expect(latestContext).not.toBeNull()

    openConversationTab(1, 1, "First")

    act(() => {
      latestContext?.closeTab("conv-1-codex-1")
    })

    const tabsText = screen.getByTestId("tabs").textContent ?? ""
    expect(tabsText).toMatch(/^new-/)
    expect(screen.getByTestId("active")).toHaveTextContent(tabsText)
  })

  it("clears the active tab when closing the last tab with no folders available", () => {
    act(() => {
      useAppWorkspaceStore.setState({ folders: [] })
    })
    renderTabs()

    expect(latestContext).not.toBeNull()

    openConversationTab(1, 1, "First")

    act(() => {
      latestContext?.closeTab("conv-1-codex-1")
    })

    expect(screen.getByTestId("tabs")).toHaveTextContent("")
    expect(screen.getByTestId("active")).toHaveTextContent("none")
  })

  it("activates a remaining tab when closing a folder after switching to one of its tabs in the same batch", () => {
    renderTabs()

    expect(latestContext).not.toBeNull()

    openConversationTab(1, 1, "First")
    openConversationTab(1, 2, "Second")
    openConversationTab(2, 3, "Third")
    act(() => {
      latestContext?.switchTab("conv-2-codex-3")
    })

    expect(screen.getByTestId("active")).toHaveTextContent("conv-2-codex-3")

    act(() => {
      latestContext?.switchTab("conv-1-codex-1")
      latestContext?.closeTabsByFolder(1)
    })

    expect(screen.getByTestId("tabs")).toHaveTextContent("conv-2-codex-3")
    expect(screen.getByTestId("active")).toHaveTextContent("conv-2-codex-3")
  })

  it("keeps an existing draft active when reopening a draft after closing it in the same batch", () => {
    renderTabs()

    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openNewConversationTab(1, "/repo")
    })

    const draftTabId = latestContext?.activeTabId
    expect(draftTabId).toMatch(/^new-/)

    act(() => {
      latestContext?.closeTab(draftTabId!)
      latestContext?.openNewConversationTab(1, "/repo")
    })

    const tabsText = screen.getByTestId("tabs").textContent ?? ""
    expect(tabsText).toMatch(/^new-/)
    expect(screen.getByTestId("active")).toHaveTextContent(tabsText)
  })

  it("redirects a new-conversation action targeting a hidden chat folder to chat mode", () => {
    // The open-folder list (`folders`) excludes chat folders after refetch, but
    // `allFolders` keeps them — chat detection must read `allFolders`, else a
    // "new conversation" from an active chat conversation would pile a normal
    // draft onto the hidden per-conversation chat folder.
    const chatFolder: FolderDetail = {
      id: 42,
      name: "Chat",
      path: "/data/chat-sessions/x",
      git_branch: null,
      default_agent_type: null,
      last_opened_at: "2026-06-11T00:00:00Z",
      sort_order: 99,
      color: "inherit",
      parent_id: null,
      kind: "chat",
      alias: null,
      group_id: null,
    }
    act(() => {
      useAppWorkspaceStore.setState({
        folders: defaultFoldersMock,
        allFolders: [...defaultFoldersMock, chatFolder],
      })
    })
    renderTabs()
    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openNewConversationTab(42, "/data/chat-sessions/x")
    })

    const activeId = latestContext?.activeTabId ?? ""
    const draft = latestContext?.tabs.find((t) => t.id === activeId)
    expect(activeId).toMatch(/^new-/)
    expect(draft?.isChat).toBe(true)
    expect(draft?.folderId).toBe(0)
  })

  it("seeds a non-chat replacement draft when closing a bound chat tab whose folder is filtered from the open list", () => {
    const chatFolder: FolderDetail = {
      id: 42,
      name: "Chat",
      path: "/data/chat-sessions/x",
      git_branch: null,
      default_agent_type: null,
      last_opened_at: "2026-06-11T00:00:00Z",
      sort_order: 99,
      color: "inherit",
      parent_id: null,
      kind: "chat",
      alias: null,
      group_id: null,
    }
    act(() => {
      useAppWorkspaceStore.setState({
        folders: defaultFoldersMock, // open list excludes the chat folder
        allFolders: [...defaultFoldersMock, chatFolder],
      })
    })
    renderTabs()
    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openTab(42, 5, "codex", true, "chat conversation")
    })
    act(() => {
      latestContext?.closeTab("conv-42-codex-5")
    })

    const replId = latestContext?.activeTabId ?? ""
    const repl = latestContext?.tabs.find((t) => t.id === replId)
    expect(replId).toMatch(/^new-/)
    expect(repl?.conversationId).toBeNull()
    expect(repl?.folderId).not.toBe(42)
    expect(repl?.isChat ?? false).toBe(false)
  })

  it("retargets the replacement draft when reopening a closed draft for another folder in the same batch", async () => {
    renderTabs()

    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openNewConversationTab(1, "/repo")
    })

    const draftTabId = latestContext?.activeTabId
    expect(draftTabId).toMatch(/^new-/)

    act(() => {
      latestContext?.closeTab(draftTabId!)
      latestContext?.openNewConversationTab(2, "/other")
    })

    const replacementTabId = screen.getByTestId("tabs").textContent ?? ""
    expect(replacementTabId).toMatch(/^new-/)
    expect(replacementTabId).not.toBe(draftTabId)
    expect(screen.getByTestId("active")).toHaveTextContent(replacementTabId)

    await waitFor(() => {
      expect(disconnectMock).toHaveBeenCalledWith(replacementTabId)
      expect(screen.getByTestId("active-folder")).toHaveTextContent("2")
    })
  })

  it("applies the supplied folderDefaultAgent for a folder not in the open list", () => {
    // Regression: navigating a branch switch to a just-reopened (closed) folder
    // passes that folder's saved default agent explicitly, because `foldersRef`
    // only catches up on the next render. Folder 999 is absent from the
    // provider's folders, so without the override the draft would fall back to
    // sortedTypes[0] ("codex"); the override must win.
    renderTabs()
    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openNewConversationTab(999, "/closed-wt", {
        folderDefaultAgent: "claude_code",
      })
    })

    const activeId = latestContext?.activeTabId
    const draft = latestContext?.tabs.find((tab) => tab.id === activeId)
    expect(draft?.folderId).toBe(999)
    expect(draft?.agentType).toBe("claude_code")
  })

  it("pins the draft to a forced agent, outranking the folder default", () => {
    // "Ask about this selection" opens the question on the agent that WROTE the
    // text, so the force has to beat folder 1's pinned "codex" default — which
    // otherwise wins over everything.
    renderTabs()
    expect(latestContext).not.toBeNull()

    let opened: OpenedDraftTarget | null = null
    act(() => {
      opened = latestContext!.openNewConversationTab(1, "/repo", {
        forceAgent: "claude_code",
      })
    })

    const target = opened as OpenedDraftTarget | null
    expect(target?.tabId).toBe(latestContext?.activeTabId)
    expect(target).toMatchObject({ agentType: "claude_code", folderId: 1 })
    const draft = latestContext?.tabs.find((tab) => tab.id === target?.tabId)
    expect(draft?.agentType).toBe("claude_code")
    // Explicit caller intent, so the provisional-agent correction pass must not
    // "fix" it back to the resolved default once the agent list goes fresh.
    expect(
      useTabStore.getState().rawTabs.find((t) => t.id === target?.tabId)
        ?.agentTypeProvisional
    ).toBe(false)
  })

  it("promises the retargeted identity when it reuses the existing draft", () => {
    // A single draft slot is reused, so the second open retargets the first
    // tab rather than adding one — ASYNCHRONOUSLY. Callers that hand work to the
    // returned tab (the "ask about this selection" hand-off) must be told the
    // identity it is heading for, not the stale one it still has, or they would
    // act on the tab while it is still the previous folder's agent.
    renderTabs()
    expect(latestContext).not.toBeNull()

    let first: OpenedDraftTarget | null = null
    act(() => {
      first = latestContext!.openNewConversationTab(1, "/repo")
    })
    expect((first as OpenedDraftTarget | null)?.tabId).toMatch(/^new-/)

    let second: OpenedDraftTarget | null = null
    act(() => {
      // A different agent — the retarget path, not the plain focus path.
      second = latestContext!.openNewConversationTab(1, "/repo", {
        forceAgent: "claude_code",
      })
    })

    const reused = second as OpenedDraftTarget | null
    expect(reused?.tabId).toBe((first as OpenedDraftTarget | null)?.tabId)
    // The promise is the POST-retarget identity, even though the tab has not
    // been patched yet at this point.
    expect(reused).toMatchObject({ agentType: "claude_code", folderId: 1 })
    expect(
      latestContext?.tabs.filter((t) => t.conversationId == null)
    ).toHaveLength(1)
  })

  it("re-points an existing chat draft at a forced agent", () => {
    // A chat-mode draft is normally left alone when it is reopened — it keeps
    // whatever agent it was on, because `inherit` is only a suggestion. A FORCED
    // agent is not: asking about a selection in a codex chat must not have the
    // question answered by whichever agent the group's chat draft happened to be
    // sitting on.
    renderTabs()
    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext?.openChatModeTab({ forceAgent: "claude_code" })
    })
    const chatDraftId = latestContext?.activeTabId ?? ""
    expect(
      latestContext?.tabs.find((t) => t.id === chatDraftId)?.agentType
    ).toBe("claude_code")

    let reopened: OpenedDraftTarget | null = null
    act(() => {
      reopened = latestContext!.openChatModeTab({ forceAgent: "codex" })
    })

    const target = reopened as OpenedDraftTarget | null
    expect(target?.tabId).toBe(chatDraftId)
    expect(target).toMatchObject({ agentType: "codex", folderId: 0 })
    const draft = latestContext?.tabs.find((t) => t.id === chatDraftId)
    expect(draft?.agentType).toBe("codex")
    expect(draft?.isChat).toBe(true)
    expect(
      useTabStore.getState().rawTabs.find((t) => t.id === chatDraftId)
        ?.agentTypeProvisional
    ).toBe(false)
  })

  it("keeps the retained draft tab active when binding it over an existing duplicate conversation tab", () => {
    renderTabs()

    expect(latestContext).not.toBeNull()

    openConversationTab(1, 1, "First")
    act(() => {
      latestContext?.openNewConversationTab(1, "/repo")
    })

    const draftTabId = latestContext?.activeTabId
    expect(draftTabId).toMatch(/^new-/)

    act(() => {
      latestContext?.setTabRuntimeConversationId(draftTabId!, -1)
      latestContext?.bindConversationTab(draftTabId!, 1, "codex", "First", -1)
    })

    expect(screen.getByTestId("tabs")).toHaveTextContent(draftTabId!)
    expect(screen.getByTestId("tabs").textContent).not.toContain(
      "conv-1-codex-1"
    )
    expect(screen.getByTestId("active")).toHaveTextContent(draftTabId!)
  })

  it("does not report a preview replacement for a preview tab already closed in the same batch", () => {
    const replacedTabIds: string[] = []
    renderTabs()

    expect(latestContext).not.toBeNull()

    latestContext?.onPreviewTabReplaced((tabId) => {
      replacedTabIds.push(tabId)
    })
    act(() => {
      latestContext?.openTab(1, 1, "codex", false, "First")
    })

    expect(screen.getByTestId("active")).toHaveTextContent("conv-1-codex-1")

    act(() => {
      latestContext?.closeTab("conv-1-codex-1")
      latestContext?.openTab(1, 2, "codex", false, "Second")
    })

    expect(screen.getByTestId("tabs")).toHaveTextContent("conv-1-codex-2")
    expect(screen.getByTestId("active")).toHaveTextContent("conv-1-codex-2")
    expect(replacedTabIds).toEqual([])
  })
})

function tabItem(
  folderId: number,
  conversationId: number,
  isActive = false
): OpenedTab {
  return {
    id: conversationId,
    folder_id: folderId,
    conversation_id: conversationId,
    agent_type: "codex",
    position: 0,
    is_active: isActive,
    is_pinned: true,
  }
}

describe("TabProvider post-hydration recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedWorkspaceStore()
    // Draft-only sessions persist nothing, so a fresh launch hydrates empty.
    listOpenedTabsMock.mockResolvedValue({ items: [], version: 0 })
    saveOpenedTabsMock.mockResolvedValue({
      accepted: true,
      version: 1,
      tabs: [],
    })
    disconnectMock.mockResolvedValue(undefined)
    loadLastActiveContextMock.mockReturnValue(null)
    tabsChangedHandler = null
    subscribeMock.mockImplementation(
      (event: string, handler: (change: TabsChanged) => void) => {
        if (event === TABS_CHANGED_EVENT) tabsChangedHandler = handler
        return Promise.resolve(() => {})
      }
    )
    onTransportReconnectMock.mockReturnValue(() => {})
  })

  async function renderHydrated() {
    renderTabs()
    await act(async () => {})
  }

  function activeTab() {
    return latestContext?.tabs.find((t) => t.id === latestContext?.activeTabId)
  }

  it("restores a draft on the hinted folder when it still exists", async () => {
    loadLastActiveContextMock.mockReturnValue({
      folderId: 2,
      isChat: false,
    })
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active-folder")).toHaveTextContent("2")
    )
    expect(activeTab()?.id).toMatch(/^new-/)
    expect(activeTab()?.conversationId).toBeNull()
  })

  it("falls back to the first folder when the hinted folder is gone", async () => {
    loadLastActiveContextMock.mockReturnValue({
      folderId: 999,
      isChat: false,
    })
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active-folder")).toHaveTextContent("1")
    )
    expect(activeTab()?.conversationId).toBeNull()
  })

  it("restores chat mode when the hint is a chat draft", async () => {
    loadLastActiveContextMock.mockReturnValue({
      folderId: 0,
      isChat: true,
    })
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active")).not.toHaveTextContent("none")
    )
    expect(activeTab()?.isChat).toBe(true)
    expect(activeTab()?.folderId).toBe(0)
    expect(activeTab()?.conversationId).toBeNull()
  })

  it("synthesizes a first-folder draft when there is no hint", async () => {
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active-folder")).toHaveTextContent("1")
    )
    expect(activeTab()?.id).toMatch(/^new-/)
    expect(activeTab()?.conversationId).toBeNull()
  })

  it("synthesizes a chat draft when there are no folders (never blank)", async () => {
    act(() => {
      useAppWorkspaceStore.setState({ folders: [], allFolders: [] })
    })
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active")).not.toHaveTextContent("none")
    )
    // An active tab exists → the panel is not blank and the sidebar is enabled.
    expect(screen.getByTestId("tabs").textContent ?? "").toMatch(/^new-/)
    expect(activeTab()?.isChat).toBe(true)
  })

  it("recovers only once — a later remote snapshot adds no second draft", async () => {
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("active")).not.toHaveTextContent("none")
    )
    const draftId = latestContext?.activeTabId
    act(() => {
      tabsChangedHandler?.({ version: 1, origin: "x", tabs: [tabItem(1, 1)] })
    })
    const drafts =
      latestContext?.tabs.filter((t) => t.conversationId == null) ?? []
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.id).toBe(draftId)
  })

  it("persists the active draft's context for the next launch", async () => {
    await renderHydrated()
    await waitFor(() =>
      expect(saveLastActiveContextMock).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: 1, isChat: false })
      )
    )
  })

  it("clears the hint once a real conversation is focused", async () => {
    await renderHydrated()
    await waitFor(() => expect(saveLastActiveContextMock).toHaveBeenCalled())
    clearLastActiveContextMock.mockClear()
    act(() => {
      latestContext?.openTab(1, 1, "codex", true, "First")
      latestContext?.switchTab("conv-1-codex-1")
    })
    await waitFor(() => expect(clearLastActiveContextMock).toHaveBeenCalled())
  })

  it("does not recover when persisted tabs hydrate non-empty", async () => {
    listOpenedTabsMock.mockResolvedValue({
      items: [tabItem(1, 1, true)],
      version: 1,
    })
    loadLastActiveContextMock.mockReturnValue({
      folderId: 2,
      isChat: false,
    })
    await renderHydrated()
    await waitFor(() =>
      expect(screen.getByTestId("tabs")).toHaveTextContent("conv-1-codex-1")
    )
    const drafts =
      latestContext?.tabs.filter((t) => t.conversationId == null) ?? []
    expect(drafts).toHaveLength(0)
    expect(screen.getByTestId("active")).toHaveTextContent("conv-1-codex-1")
  })
})

describe("TabProvider sub-session tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedWorkspaceStore()
    // No hydration noise — open the sub-session tab imperatively instead.
    listOpenedTabsMock.mockReturnValue(new Promise(() => {}))
    saveOpenedTabsMock.mockResolvedValue({
      accepted: true,
      version: 1,
      tabs: [],
    })
    // mockReset (not just clearAllMocks) also drains any leftover
    // mockReturnValueOnce queue from a prior test so it can't leak a stale
    // (e.g. never-resolving) promise into the next test's first fetch.
    getFolderConversationMock.mockReset()
    getFolderConversationMock.mockReturnValue(new Promise(() => {}))
    tabsChangedHandler = null
    conversationChangedHandler = null
    subscribeMock.mockImplementation((event: string, handler: unknown) => {
      if (event === TABS_CHANGED_EVENT)
        tabsChangedHandler = handler as (change: TabsChanged) => void
      if (event === CONVERSATION_CHANGED_EVENT)
        conversationChangedHandler = handler as (
          change: ConversationChange
        ) => void
      return Promise.resolve(() => {})
    })
    onTransportReconnectMock.mockReturnValue(() => {})
  })

  function subSummary(
    overrides: Partial<DbConversationSummary> = {}
  ): DbConversationSummary {
    return {
      id: 99,
      folder_id: 1,
      title: "Review the auth module",
      title_locked: false,
      agent_type: "codex",
      status: "in_progress",
      kind: "delegate",
      model: null,
      git_branch: null,
      external_id: null,
      message_count: 0,
      child_count: 0,
      created_at: "2026-05-24T00:00:00Z",
      updated_at: "2026-05-24T00:00:00Z",
      pinned_at: null,
      parent_id: 1,
      ...overrides,
    }
  }

  it("resolves an open sub-session tab's title + status from a fetched summary, then keeps the status dot live", async () => {
    // Sub-session id 99 is absent from the root conversations list (1,2,3), so a
    // tab for it can ONLY get its title/status from the seed fetch + the live
    // conversation channel — the exact gap this fix closes.
    getFolderConversationMock.mockResolvedValue({
      summary: subSummary(),
      turns: [],
      session_stats: null,
    })
    renderTabs()
    await act(async () => {}) // flush mount: subscribe() captures the handler
    // Open WITHOUT a seed title — mirrors handleSelect opening a sidebar child.
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    const subTab = () =>
      latestContext?.tabs.find((tab) => tab.conversationId === 99)
    // Before the fetch resolves the tab can't resolve a title (root-only map).
    expect(subTab()?.title).toBe("untitledConversation")
    // Flush the seed fetch → title + status fill in from the fetched summary.
    await act(async () => {})
    expect(subTab()?.title).toBe("Review the auth module")
    expect(subTab()?.status).toBe("in_progress")
    // A live status event for the running sub-agent flips the tab's status dot.
    act(() => {
      conversationChangedHandler?.({
        kind: "status",
        id: 99,
        status: "completed",
      })
    })
    expect(subTab()?.status).toBe("completed")
  })

  it("does not fetch a summary for a root conversation tab (resolved from the list)", async () => {
    // Id 1 IS a root in the conversations list, so the tab resolves from there
    // and the sub-session seed fetch must never fire for it.
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 1, "codex", true)
    })
    await act(async () => {})
    expect(getFolderConversationMock).not.toHaveBeenCalled()
    expect(
      latestContext?.tabs.find((tab) => tab.conversationId === 1)?.title
    ).toBe("First")
  })

  it("applies a status event that arrives while the seed fetch is still in flight (no lost event)", async () => {
    // Hold the seed fetch open so an event can land mid-flight.
    let resolveFetch: (detail: unknown) => void = () => {}
    getFolderConversationMock.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res
      })
    )
    renderTabs()
    await act(async () => {}) // capture the conversation://changed handler
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {}) // reconcile effect → seed fetch in flight
    // An event lands before the seed resolves — it must be buffered, then win
    // over the (older) fetched status when the seed commits.
    act(() => {
      conversationChangedHandler?.({
        kind: "status",
        id: 99,
        status: "completed",
      })
    })
    await act(async () => {
      resolveFetch({
        summary: subSummary({ status: "in_progress" }),
        turns: [],
        session_stats: null,
      })
    })
    const subTab = latestContext?.tabs.find((tab) => tab.conversationId === 99)
    expect(subTab?.title).toBe("Review the auth module")
    expect(subTab?.status).toBe("completed") // buffered event won over the fetch
  })

  it("merges an upsert then a status that both land during the seed window (upsert title + later status)", async () => {
    let resolveFetch: (detail: unknown) => void = () => {}
    getFolderConversationMock.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res
      })
    )
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {}) // seed in flight
    // Two events during the fetch: a full upsert (new title) THEN a status. The
    // status must not clobber the upsert's title — both must survive.
    act(() => {
      conversationChangedHandler?.({
        kind: "upsert",
        summary: subSummary({ title: "Renamed by AI", status: "in_progress" }),
      })
      conversationChangedHandler?.({
        kind: "status",
        id: 99,
        status: "completed",
      })
    })
    // The fetched snapshot carries the OLD title; the merge must prefer the
    // upsert's summary and the later status.
    await act(async () => {
      resolveFetch({
        summary: subSummary({ title: "OLD", status: "pending" }),
        turns: [],
        session_stats: null,
      })
    })
    const subTab = latestContext?.tabs.find((tab) => tab.conversationId === 99)
    expect(subTab?.title).toBe("Renamed by AI") // upsert summary won over the fetch
    expect(subTab?.status).toBe("completed") // later status patched on top
  })

  it("keeps a delete terminal across a late status during the seed window (no resurrection)", async () => {
    let resolveFetch: (detail: unknown) => void = () => {}
    getFolderConversationMock.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res
      })
    )
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {}) // seed in flight
    act(() => {
      conversationChangedHandler?.({ kind: "deleted", id: 99 })
      conversationChangedHandler?.({
        kind: "status",
        id: 99,
        status: "completed",
      })
    })
    await act(async () => {
      resolveFetch({
        summary: subSummary(),
        turns: [],
        session_stats: null,
      })
    })
    // A child deleted mid-fetch must not be committed by the seed despite a later
    // status — the tab stays unresolved ("Untitled"), with no status.
    const subTab = latestContext?.tabs.find((tab) => tab.conversationId === 99)
    expect(subTab?.title).toBe("untitledConversation")
    expect(subTab?.status).toBeUndefined()
  })

  it("seeds an open child tab even when the (loaded) root list is empty", async () => {
    // Loaded-but-empty root list: the seed must still fire (gated on loading, not
    // on conversationMap.size, which an old `size === 0` guard would skip).
    act(() => {
      useAppWorkspaceStore.setState({
        conversations: [],
        conversationsLoading: false,
      })
    })
    getFolderConversationMock.mockResolvedValue({
      summary: subSummary(),
      turns: [],
      session_stats: null,
    })
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {})
    expect(getFolderConversationMock).toHaveBeenCalledWith(99)
    expect(
      latestContext?.tabs.find((tab) => tab.conversationId === 99)?.title
    ).toBe("Review the auth module")
  })

  it("does not seed while the root list is still loading", async () => {
    act(() => {
      useAppWorkspaceStore.setState({ conversationsLoading: true })
    })
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {})
    expect(getFolderConversationMock).not.toHaveBeenCalled()
  })

  it("discards a stale in-flight seed on reconnect and reseeds the open child tab", async () => {
    // TabProvider registers MORE THAN ONE reconnect handler (tab resync + this
    // sub-session cache), so capture them all and fire all to exercise ours.
    const reconnectCbs: Array<() => void> = []
    onTransportReconnectMock.mockImplementation((cb: () => void) => {
      reconnectCbs.push(cb)
      return () => {}
    })
    let resolveStale: (detail: unknown) => void = () => {}
    let resolveFresh: (detail: unknown) => void = () => {}
    getFolderConversationMock
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveStale = res
        })
      )
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveFresh = res
        })
      )
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {}) // seed #1 in flight
    act(() => {
      reconnectCbs.forEach((cb) => cb())
    })
    await act(async () => {}) // reconcile reruns under a new epoch → seed #2 in flight
    // The pre-reconnect (stale) response must be ignored…
    await act(async () => {
      resolveStale({
        summary: subSummary({ title: "STALE" }),
        turns: [],
        session_stats: null,
      })
    })
    expect(
      latestContext?.tabs.find((tab) => tab.conversationId === 99)?.title
    ).toBe("untitledConversation")
    // …and the fresh reseed response applied.
    await act(async () => {
      resolveFresh({
        summary: subSummary({ title: "FRESH" }),
        turns: [],
        session_stats: null,
      })
    })
    expect(
      latestContext?.tabs.find((tab) => tab.conversationId === 99)?.title
    ).toBe("FRESH")
    expect(getFolderConversationMock).toHaveBeenCalledTimes(2)
  })

  it("prunes a child tab's cached summary when the tab closes (so a reopen refetches)", async () => {
    getFolderConversationMock.mockResolvedValue({
      summary: subSummary(),
      turns: [],
      session_stats: null,
    })
    renderTabs()
    await act(async () => {})
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {})
    expect(getFolderConversationMock).toHaveBeenCalledTimes(1)
    const tabId = latestContext?.tabs.find(
      (tab) => tab.conversationId === 99
    )?.id
    act(() => {
      latestContext?.closeTab(tabId!)
    })
    await act(async () => {})
    // Reopen → a pruned cache forces a fresh fetch (a leaked entry would not).
    act(() => {
      latestContext?.openTab(1, 99, "codex", true)
    })
    await act(async () => {})
    expect(getFolderConversationMock).toHaveBeenCalledTimes(2)
  })
})
