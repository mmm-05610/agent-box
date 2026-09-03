"use client"

import { create } from "zustand"
import {
  loadPersistedPanelState,
  savePersistedPanelState,
} from "@/lib/panel-state-storage"
import {
  loadTasksViewMode,
  saveTasksViewMode,
  type TasksViewMode,
} from "@/lib/tasks-board-filter-storage"
import { automationList, terminalKill, workTaskList } from "@/lib/api"
import { isDesktop } from "@/lib/platform"
import { detectPlatform } from "@/hooks/use-platform"
import { randomUUID } from "@/lib/utils"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { sendSystemNotification } from "@/lib/notification"
import type { Automation, WorkTask } from "@/lib/types"

/**
 * The workspace shell store (F4): one zustand store replacing the seven former
 * shell React contexts — sidebar / aux-panel / terminal / search-dialog /
 * automations-view / tasks-view / workbench-route. Each former context is now a
 * SLICE (data + actions together, exactly the old context value shape), so the
 * per-slice hooks in `./index.ts` keep the old consumer re-render granularity:
 * a slice object is replaced only when one of its fields changes, and the
 * action references live on the store and never change identity.
 *
 * Mount-time wiring the old providers did via effects lives one level up:
 * `./runtime.tsx` (hydration, folder-scoped resets, terminal hotkeys) and
 * `./events.ts` (realtime automation/task sync, terminal settings). The store
 * itself is transport- and React-lifecycle-agnostic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalTab {
  id: string
  folderId: number
  title: string
  workingDir: string
  shell?: string
  initialCommand?: string
}

export type AuxPanelTab =
  | "session_details"
  | "file_tree"
  | "changes"
  | "git_log"

/** The view occupying the main content region (former workbench-route context).
 *  `"conversations"` is the default workspace (folder/conversation tabs); every
 *  other id is a full-page "route" rendered in place of it (see
 *  WORKBENCH_ROUTES in workbench-content.tsx). State is in-memory only: a
 *  reload lands back on the conversation workspace — deliberate, since static
 *  export rules out URL route segments. */
export type WorkbenchRouteId = "conversations" | "automations" | "tasks"

interface SidebarSlice {
  isOpen: boolean
  restored: boolean
  width: number
  minWidth: number
  maxWidth: number
  toggle: () => void
  setWidth: (w: number) => void
}

interface AuxPanelSlice {
  isOpen: boolean
  restored: boolean
  width: number
  minWidth: number
  maxWidth: number
  activeTab: AuxPanelTab
  toggle: () => void
  /** Imperatively set the panel open/closed (used by the chat-mode auto-hide). */
  setOpen: (open: boolean) => void
  setWidth: (w: number) => void
  setActiveTab: (tab: AuxPanelTab) => void
  openTab: (tab: AuxPanelTab) => void
  pendingRevealPath: string | null
  revealInFileTree: (path: string) => void
  consumePendingRevealPath: () => void
}

interface TerminalSlice {
  isOpen: boolean
  height: number
  minHeight: number
  maxHeight: number
  toggle: () => void
  setHeight: (h: number) => void
  tabs: TerminalTab[]
  activeTabId: string | null
  exitedTerminals: Set<string>
  markTerminalExited: (id: string) => void
  createTerminal: () => Promise<void>
  createTerminalInDirectory: (
    workingDir: string,
    title?: string,
    shell?: string
  ) => Promise<string | null>
  createTerminalWithCommand: (
    title: string,
    command: string
  ) => Promise<string | null>
  closeTerminal: (id: string) => void
  closeOtherTerminals: (id: string) => void
  closeAllTerminals: () => void
  renameTerminal: (id: string, title: string) => void
  switchTerminal: (id: string) => void
}

interface SearchDialogSlice {
  open: boolean
  /** Accepts the functional-updater form — the ⌘K shortcut handler does
   *  `setOpen((prev) => !prev)` (former `Dispatch<SetStateAction<boolean>>`). */
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void
}

interface AutomationsViewSlice {
  automations: Automation[]
  /** Sum of unseen failed runs — drives the sidebar badge. */
  unseenFailures: number
  refetch: () => Promise<void>
}

interface TasksViewSlice {
  tasks: WorkTask[]
  /** Count of tasks waiting on the user — the sidebar badge. */
  attentionCount: number
  /** True until the first fetch settles (success OR failure). Lets the board
   *  tell "still loading" from "genuinely empty" and show a skeleton instead of
   *  flashing the empty state. Never flips back on later refetches. */
  loading: boolean
  refetch: () => Promise<void>
  /** Board ⇄ list. Lifted here rather than owned by TasksPage because the
   *  switch renders in the window-chrome strip (TasksPageTitle) — a different
   *  branch of the tree — while the layout it drives renders in the page. */
  viewMode: TasksViewMode
  setViewMode: (mode: TasksViewMode) => void
}

interface WorkbenchRouteSlice {
  routeId: WorkbenchRouteId
  /** Convenience for the common branch — `routeId === "conversations"`. */
  isConversations: boolean
  setRoute: (id: WorkbenchRouteId) => void
  /** Sugar for returning to the conversation workspace. */
  openConversations: () => void
}

export interface WorkspaceShellState {
  sidebar: SidebarSlice
  auxPanel: AuxPanelSlice
  terminal: TerminalSlice
  searchDialog: SearchDialogSlice
  automationsView: AutomationsViewSlice
  tasksView: TasksViewSlice
  workbenchRoute: WorkbenchRouteSlice
  /** One-shot hydration of the persisted panel state (localStorage + mobile
   *  viewport check) and the `restored` flags. Called from the runtime
   *  controller after mount — hydrating during the first render would mismatch
   *  the prerendered (server-default) markup. */
  hydratePersistedPanels: () => void
}

// ---------------------------------------------------------------------------
// Constants (ported verbatim from the former contexts)
// ---------------------------------------------------------------------------

const SIDEBAR_STORAGE_KEY = "workspace:left-sidebar"
const SIDEBAR_DEFAULT_WIDTH = 320
// The sidebar header is the window's top-left edge; its top-left is reserved for
// the fixed window-chrome overlay (macOS traffic-light inset + toggle + remote)
// and its top-right holds the view-options control, so it needs more minimum
// room than the old 200.
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 900
const SIDEBAR_DEFAULT_IS_OPEN = true

const AUX_STORAGE_KEY = "workspace:right-sidebar"
const AUX_DEFAULT_WIDTH = 320
const AUX_MIN_WIDTH = 200
const AUX_MAX_WIDTH = 900
const AUX_DEFAULT_IS_OPEN = false

const TERMINAL_DEFAULT_HEIGHT = 300
const TERMINAL_MIN_HEIGHT = 150
const TERMINAL_MAX_HEIGHT = 600

/** Statuses that need the user ("等你处理") — drives the sidebar badge. */
const TASKS_ATTENTION_STATUSES = new Set(["awaiting_input", "review", "failed"])

// The tabs now sit on their own row below the fixed top-right window-chrome
// overlay (terminal/aux/settings), so they no longer need extra width to clear
// it. The minimum only has to keep that overlay — and, on Windows/Linux, the
// native caption strip beside it (~116 + 138) — from spilling past the panel's
// left edge over the middle column. Elsewhere the base 200 is plenty.
function resolveAuxMinWidth(): number {
  const platform = detectPlatform()
  if (isDesktop() && (platform === "windows" || platform === "linux")) {
    return 260
  }
  return AUX_MIN_WIDTH
}

/** Platform-derived minimum; stable for the session (the former provider
 *  computed it once in a `useMemo`). */
const AUX_MIN_WIDTH_RESOLVED = resolveAuxMinWidth()

function clampSidebarWidth(width: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width))
}

function clampAuxWidth(width: number) {
  return Math.max(AUX_MIN_WIDTH_RESOLVED, Math.min(AUX_MAX_WIDTH, width))
}

// ---------------------------------------------------------------------------
// Module-scoped internals (the former provider refs — never rendered)
// ---------------------------------------------------------------------------

/** Title counter for auto-named terminals; resets when all tabs close. */
let terminalTabCounter = 0

/** Default shell from system settings; synced by `./events.ts`. */
let terminalDefaultShell: string | null = null

export function setTerminalDefaultShell(shell: string | null): void {
  terminalDefaultShell = shell
}

function resolveTerminalShell(shell?: string) {
  return shell ?? terminalDefaultShell ?? undefined
}

/** Stale-response guard for the automations list (the former `reqRef`). */
let automationsReqSeq = 0
/** Stale-response guard for the task list (the former `reqRef`). */
let tasksReqSeq = 0

/** Task statuses as of the last successful fetch; null until then, so the first
 *  load (pure history) never notifies. */
let tasksPrevStatuses: Map<number, WorkTask["status"]> | null = null

/** Translator for task-flip notifications, registered by the runtime
 *  controller from `useTranslations("Tasks")` (a store can't call hooks). Kept
 *  as a setter-registered latest-ref so locale changes don't need to re-wire
 *  the event channel. */
type TasksNotifier = (
  key: "notifyReview" | "notifyFailed",
  values: { title: string }
) => string
let tasksNotifier: TasksNotifier | null = null

export function setTasksNotifier(t: TasksNotifier): void {
  tasksNotifier = t
}

/** The former provider read the active folder through `useActiveFolder()` at
 *  call time; the store reads the same derivation fresh through the workspace
 *  store (the codebase's established getState-instead-of-ref-mirror idiom). */
function activeFolderSnapshot(): { folderPath: string; folderId: number } {
  const ws = useAppWorkspaceStore.getState()
  const folder =
    ws.activeFolderId != null
      ? (ws.allFolders.find((f) => f.id === ws.activeFolderId) ?? null)
      : null
  return { folderPath: folder?.path ?? "", folderId: ws.activeFolderId ?? 0 }
}

function countAttention(tasks: WorkTask[]): number {
  return tasks.filter(
    (t) => TASKS_ATTENTION_STATUSES.has(t.status) && t.archived_at == null
  ).length
}

/**
 * System notification when a task flips into review (ready for acceptance) or
 * failed. The engine runs headless, so this fetch-to-fetch diff is the only
 * place that sees the transition; `sendSystemNotification` itself stays silent
 * while the window is visible.
 */
function notifyTaskFlips(
  prev: Map<number, WorkTask["status"]> | null,
  list: WorkTask[]
): void {
  if (prev == null) return
  for (const task of list) {
    if (prev.get(task.id) === task.status) continue
    if (task.status !== "review" && task.status !== "failed") continue
    if (task.archived_at != null) continue
    const notifier = tasksNotifier
    if (!notifier) continue
    const folder = useAppWorkspaceStore
      .getState()
      .folders.find((f) => f.id === task.folder_id)
    const folderName = folder ? (folder.alias ?? folder.name) : null
    const title = folderName ? `${folderName} - Codeg` : "Codeg"
    const body =
      task.status === "review"
        ? notifier("notifyReview", { title: task.title })
        : notifier("notifyFailed", { title: task.title })
    void sendSystemNotification(title, body)
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceShellStore = create<WorkspaceShellState>()(
  (set, get) => ({
    sidebar: {
      isOpen: SIDEBAR_DEFAULT_IS_OPEN,
      restored: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      minWidth: SIDEBAR_MIN_WIDTH,
      maxWidth: SIDEBAR_MAX_WIDTH,
      toggle: () => {
        set((s) => ({
          sidebar: { ...s.sidebar, isOpen: !s.sidebar.isOpen },
        }))
      },
      setWidth: (w) => {
        const width = clampSidebarWidth(w)
        set((s) =>
          s.sidebar.width === width ? {} : { sidebar: { ...s.sidebar, width } }
        )
      },
    },

    auxPanel: {
      isOpen: AUX_DEFAULT_IS_OPEN,
      restored: false,
      width: AUX_DEFAULT_WIDTH,
      minWidth: AUX_MIN_WIDTH_RESOLVED,
      maxWidth: AUX_MAX_WIDTH,
      activeTab: "session_details",
      toggle: () => {
        set((s) => ({
          auxPanel: { ...s.auxPanel, isOpen: !s.auxPanel.isOpen },
        }))
      },
      setOpen: (open) => {
        set((s) =>
          s.auxPanel.isOpen === open
            ? {}
            : { auxPanel: { ...s.auxPanel, isOpen: open } }
        )
      },
      setWidth: (w) => {
        const width = clampAuxWidth(w)
        set((s) =>
          s.auxPanel.width === width
            ? {}
            : { auxPanel: { ...s.auxPanel, width } }
        )
      },
      setActiveTab: (tab) => {
        set((s) =>
          s.auxPanel.activeTab === tab
            ? {}
            : { auxPanel: { ...s.auxPanel, activeTab: tab } }
        )
      },
      openTab: (tab) => {
        set((s) => ({
          auxPanel: { ...s.auxPanel, activeTab: tab, isOpen: true },
        }))
      },
      pendingRevealPath: null,
      revealInFileTree: (path) => {
        set((s) => ({
          auxPanel: {
            ...s.auxPanel,
            pendingRevealPath: path,
            activeTab: "file_tree",
            isOpen: true,
          },
        }))
      },
      consumePendingRevealPath: () => {
        set((s) =>
          s.auxPanel.pendingRevealPath === null
            ? {}
            : { auxPanel: { ...s.auxPanel, pendingRevealPath: null } }
        )
      },
    },

    terminal: {
      isOpen: false,
      height: TERMINAL_DEFAULT_HEIGHT,
      minHeight: TERMINAL_MIN_HEIGHT,
      maxHeight: TERMINAL_MAX_HEIGHT,
      toggle: () => {
        const { folderPath, folderId } = activeFolderSnapshot()
        const autoId = randomUUID()
        const nextCounter = terminalTabCounter + 1

        const t = get().terminal
        let tabs = t.tabs
        // Auto-create first terminal when opening with no tabs
        if (t.tabs.length === 0 && folderPath) {
          terminalTabCounter = nextCounter
          tabs = [
            {
              id: autoId,
              folderId,
              title: `Terminal ${nextCounter}`,
              workingDir: folderPath,
              shell: resolveTerminalShell(),
            },
          ]
        }

        set({
          terminal: {
            ...t,
            isOpen: !t.isOpen,
            tabs,
            activeTabId:
              t.activeTabId !== null
                ? t.activeTabId
                : folderPath
                  ? autoId
                  : null,
          },
        })
      },
      setHeight: (h) => {
        const height = Math.max(
          TERMINAL_MIN_HEIGHT,
          Math.min(TERMINAL_MAX_HEIGHT, h)
        )
        set((s) =>
          s.terminal.height === height
            ? {}
            : { terminal: { ...s.terminal, height } }
        )
      },
      tabs: [],
      activeTabId: null,
      exitedTerminals: new Set<string>(),
      markTerminalExited: (id) => {
        set((s) => {
          if (s.terminal.exitedTerminals.has(id)) return {}
          const next = new Set(s.terminal.exitedTerminals)
          next.add(id)
          return { terminal: { ...s.terminal, exitedTerminals: next } }
        })
      },
      createTerminal: async () => {
        const { folderPath } = activeFolderSnapshot()
        if (!folderPath) return
        await get().terminal.createTerminalInDirectory(folderPath)
      },
      createTerminalInDirectory: async (workingDir, title, shell) => {
        if (!workingDir) return null

        const { folderId } = activeFolderSnapshot()
        const id = randomUUID()
        terminalTabCounter += 1
        const defaultTitle = `Terminal ${terminalTabCounter}`

        set((s) => ({
          terminal: {
            ...s.terminal,
            isOpen: true,
            tabs: [
              ...s.terminal.tabs,
              {
                id,
                folderId,
                title: title ?? defaultTitle,
                workingDir,
                shell: resolveTerminalShell(shell),
              },
            ],
            activeTabId: id,
          },
        }))

        return id
      },
      createTerminalWithCommand: async (title, command) => {
        const { folderPath, folderId } = activeFolderSnapshot()
        if (!folderPath) return null

        const id = randomUUID()
        terminalTabCounter += 1

        set((s) => ({
          terminal: {
            ...s.terminal,
            isOpen: true,
            tabs: [
              ...s.terminal.tabs,
              {
                id,
                folderId,
                title,
                workingDir: folderPath,
                shell: resolveTerminalShell(),
                initialCommand: command,
              },
            ],
            activeTabId: id,
          },
        }))

        return id
      },
      closeTerminal: (id) => {
        terminalKill(id).catch(() => {})
        set((s) => {
          const t = s.terminal
          const next = t.tabs.filter((tab) => tab.id !== id)
          const exited = new Set(t.exitedTerminals)
          exited.delete(id)
          if (next.length === 0) {
            terminalTabCounter = 0
            return {
              terminal: {
                ...t,
                tabs: next,
                exitedTerminals: exited,
                isOpen: false,
                activeTabId: null,
              },
            }
          }
          return {
            terminal: {
              ...t,
              tabs: next,
              exitedTerminals: exited,
              activeTabId:
                t.activeTabId === id ? next[next.length - 1].id : t.activeTabId,
            },
          }
        })
      },
      closeOtherTerminals: (id) => {
        const t = get().terminal
        const closed = t.tabs.filter((tab) => tab.id !== id)
        closed.forEach((tab) => {
          terminalKill(tab.id).catch(() => {})
        })
        set((s) => {
          const current = s.terminal
          const exited = new Set(current.exitedTerminals)
          let changed = false
          for (const tab of closed) {
            if (exited.delete(tab.id)) changed = true
          }
          return {
            terminal: {
              ...current,
              tabs: current.tabs.filter((tab) => tab.id === id),
              exitedTerminals: changed ? exited : current.exitedTerminals,
              activeTabId: id,
            },
          }
        })
      },
      closeAllTerminals: () => {
        const t = get().terminal
        t.tabs.forEach((tab) => {
          terminalKill(tab.id).catch(() => {})
        })
        terminalTabCounter = 0
        set((s) => ({
          terminal: {
            ...s.terminal,
            tabs: [],
            exitedTerminals: new Set<string>(),
            activeTabId: null,
            isOpen: false,
          },
        }))
      },
      renameTerminal: (id, title) => {
        set((s) => ({
          terminal: {
            ...s.terminal,
            tabs: s.terminal.tabs.map((tab) =>
              tab.id === id ? { ...tab, title } : tab
            ),
          },
        }))
      },
      switchTerminal: (id) => {
        set((s) =>
          s.terminal.activeTabId === id
            ? {}
            : { terminal: { ...s.terminal, activeTabId: id } }
        )
      },
    },

    searchDialog: {
      open: false,
      setOpen: (open) => {
        set((s) => ({
          searchDialog: {
            ...s.searchDialog,
            open: typeof open === "function" ? open(s.searchDialog.open) : open,
          },
        }))
      },
    },

    automationsView: {
      automations: [],
      unseenFailures: 0,
      refetch: async () => {
        const id = ++automationsReqSeq
        try {
          const list = await automationList()
          // Drop stale responses; keep the previous list on transient error
          // rather than blanking the view (matches CONVERSATION_CHANGED_EVENT
          // consumers).
          if (id !== automationsReqSeq) return
          set((s) => ({
            automationsView: {
              ...s.automationsView,
              automations: list,
              unseenFailures: list.reduce(
                (sum, a) => sum + (a.unseen_failures || 0),
                0
              ),
            },
          }))
        } catch {
          // ignore — a later event/refetch recovers
        }
      },
    },

    tasksView: {
      tasks: [],
      attentionCount: 0,
      loading: true,
      refetch: async () => {
        const id = ++tasksReqSeq
        try {
          const list = await workTaskList(null)
          // Drop stale responses; keep the previous list on transient error
          // rather than blanking the board.
          if (id !== tasksReqSeq) return
          notifyTaskFlips(tasksPrevStatuses, list)
          tasksPrevStatuses = new Map(
            list.map((task) => [task.id, task.status])
          )
          set((s) => ({
            tasksView: {
              ...s.tasksView,
              tasks: list,
              attentionCount: countAttention(list),
              loading: false,
            },
          }))
        } catch {
          // ignore — a later event/refetch recovers. A failed FIRST fetch
          // still ends the loading state (unless a newer one is already in
          // flight): the board falls back to its empty state rather than
          // pulsing forever.
          if (id === tasksReqSeq) {
            set((s) => ({
              tasksView: { ...s.tasksView, loading: false },
            }))
          }
        }
      },
      // Restored synchronously from localStorage at store creation (the former
      // provider's lazy useState initializer): nothing in the prerendered tree
      // renders the view mode — the Tasks route mounts only after a
      // client-side route switch — so there is no hydration markup to
      // mismatch, and the page paints in the remembered mode right away.
      viewMode: loadTasksViewMode(),
      setViewMode: (mode) => {
        set((s) =>
          s.tasksView.viewMode === mode
            ? {}
            : { tasksView: { ...s.tasksView, viewMode: mode } }
        )
      },
    },

    workbenchRoute: {
      routeId: "conversations",
      isConversations: true,
      setRoute: (id) => {
        set((s) =>
          s.workbenchRoute.routeId === id
            ? {}
            : {
                workbenchRoute: {
                  ...s.workbenchRoute,
                  routeId: id,
                  isConversations: id === "conversations",
                },
              }
        )
      },
      openConversations: () => {
        get().workbenchRoute.setRoute("conversations")
      },
    },

    hydratePersistedPanels: () => {
      const storedSidebar = loadPersistedPanelState(SIDEBAR_STORAGE_KEY)
      const storedAux = loadPersistedPanelState(AUX_STORAGE_KEY)
      // On mobile (< 768px), always start closed regardless of persisted
      // state.
      const isMobileViewport = window.innerWidth < 768
      set((s) => ({
        sidebar: {
          ...s.sidebar,
          isOpen: isMobileViewport
            ? false
            : (storedSidebar?.isOpen ?? SIDEBAR_DEFAULT_IS_OPEN),
          width: clampSidebarWidth(
            storedSidebar?.width ?? SIDEBAR_DEFAULT_WIDTH
          ),
          restored: true,
        },
        auxPanel: {
          ...s.auxPanel,
          isOpen: isMobileViewport
            ? false
            : (storedAux?.isOpen ?? AUX_DEFAULT_IS_OPEN),
          width: clampAuxWidth(storedAux?.width ?? AUX_DEFAULT_WIDTH),
          restored: true,
        },
      }))
    },
  })
)

// ---------------------------------------------------------------------------
// Persistence bridges (the former providers' save effects)
// ---------------------------------------------------------------------------

/** Mirrors the old save effects: once `restored` flips, every isOpen/width
 *  change of the sidebar / aux panel is written back to localStorage under the
 *  same keys ("workspace:left-sidebar" / "workspace:right-sidebar"), and every
 *  tasks view-mode change under "workspace:tasks-view-mode". */
useWorkspaceShellStore.subscribe((state, prev) => {
  if (
    state.sidebar.restored &&
    (state.sidebar.isOpen !== prev.sidebar.isOpen ||
      state.sidebar.width !== prev.sidebar.width)
  ) {
    savePersistedPanelState(SIDEBAR_STORAGE_KEY, {
      isOpen: state.sidebar.isOpen,
      width: state.sidebar.width,
    })
  }
  if (
    state.auxPanel.restored &&
    (state.auxPanel.isOpen !== prev.auxPanel.isOpen ||
      state.auxPanel.width !== prev.auxPanel.width)
  ) {
    savePersistedPanelState(AUX_STORAGE_KEY, {
      isOpen: state.auxPanel.isOpen,
      width: state.auxPanel.width,
    })
  }
  if (state.tasksView.viewMode !== prev.tasksView.viewMode) {
    saveTasksViewMode(state.tasksView.viewMode)
  }
})

/**
 * Reset to creation state (test isolation / backend switch). Also clears the
 * module-scoped internals the slices close over (terminal title counter,
 * stale-response guards, task-flip history, notifier/shell registrations) — the
 * same idiom as `resetAppWorkspaceStore`. `viewMode` is re-derived from (usually
 * cleared) localStorage rather than the creation-time snapshot, so a test that
 * wrote the key sees it forgotten.
 */
export function resetWorkspaceShellStore() {
  terminalTabCounter = 0
  terminalDefaultShell = null
  automationsReqSeq = 0
  tasksReqSeq = 0
  tasksPrevStatuses = null
  tasksNotifier = null
  const initial = useWorkspaceShellStore.getInitialState()
  useWorkspaceShellStore.setState(
    {
      ...initial,
      tasksView: { ...initial.tasksView, viewMode: loadTasksViewMode() },
    },
    true
  )
}
