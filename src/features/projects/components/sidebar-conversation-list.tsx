"use client"

/**
 * 侧栏列表区（studio-shell 重写，复刻 ZCode 左侧面板）：单个"项目"节。
 *
 * - 节头：`项目 ⌄`（可折叠整节）+ 右侧 `⋮`（节菜单：新建会话 / 导入 /
 *   远程工作区管理）+ `＋`（新建项目：本地文件夹 / 克隆 / 远程向导）。
 * - 项目行：领域组件 ProjectRow（./project-tree）；活动项目自动展开，其
 *   会话以 ProjectConversationRow 嵌套缩进渲染（状态点 + 标题 + 相对时间，
 *   无 harness 图标）。有需注意（pending_review）会话的项目行显示红点。
 * - 相比旧实现删除：Pinned / Chat / Recent 节、"文件夹"节头、拖拽重排、
 *   粘性节头浮层、分组（folder group）渲染与会话委托子树展开。
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Virtualizer, type VirtualizerHandle } from "virtua"
import {
  ChevronDown,
  Download,
  FolderGit2,
  FolderOpenDot,
  Loader2,
  MonitorCloud,
  MoreHorizontal,
  Settings,
  SquarePen,
} from "lucide-react"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useTabActions, useTabStore } from "@/contexts/tab-context"
import { useWorkbenchRoute, useTerminal } from "@/features/shell"
import { useThemeColor } from "@/hooks/use-appearance"
import { useSortedAvailableAgents } from "@/hooks/use-sorted-available-agents"
import {
  openImportSessionsWindow,
  openInCode,
  updateConversationTitle,
  updateConversationStatus,
  updateConversationPinned,
  deleteConversation,
} from "@/lib/api"
// Wire 层（F5）：folder 命令族经 features/projects/wire 取用（后端替换日只换
// 该层）。会话命令族仍走 @/lib/api，待 session 域切片（F3）收口。
import {
  updateFolderAlias,
  updateFolderColor,
  updateFolderDefaultAgent,
  projectWireId,
} from "../wire"
import type { Project } from "@/core/domain"
import { revealItemInDir } from "@/lib/platform"
import type {
  AgentType,
  ConversationStatus,
  DbConversationSummary,
} from "@/lib/types"
import {
  loadFolderExpanded,
  saveFolderExpanded,
  loadSectionCollapsed,
  saveSectionCollapsed,
  type SidebarSectionCollapsed,
  type SidebarSortMode,
} from "@/lib/sidebar-view-mode-storage"
import {
  normalizeFolderThemeColor,
  type FolderThemeColor,
} from "@/lib/theme-presets"
import {
  compareByCreatedAtDesc,
  compareByPinnedAtDesc,
  compareByUpdatedAtDesc,
  formatRelative,
} from "@/components/conversations/sidebar-conversation-grouping"
import { useRemoteWorkspaceConnections } from "@/hooks/use-remote-workspace-connections"
import { ConversationManageDialog } from "@/components/conversations/conversation-manage-dialog"
import { CloneDialog } from "@/components/layout/clone-dialog"
import { RemoteWorkspaceManageDialog } from "@/components/layout/remote-workspace-manage-dialog"
import { WorkspaceFolderDialog } from "@/components/layout/workspace-folder-dialog"
import {
  ProjectRow,
  ProjectConversationRow,
  ProjectTreeAddButton,
} from "./project-tree"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toErrorMessage } from "@/lib/app-error"

export interface SidebarConversationListHandle {
  scrollToActive: () => void
  /** Expand every project (and the section itself). */
  expandAll: () => void
  /** Collapse every project down to the lone section header. */
  collapseAll: () => void
}

export interface SidebarConversationListProps {
  showCompleted?: boolean
  sortMode?: SidebarSortMode
}

/** The flat row model fed to the windowed list. */
type ProjectListRow =
  | { kind: "section" }
  | { kind: "no-projects" }
  | { kind: "project"; folderId: number }
  | { kind: "session"; conversation: DbConversationSummary }
  | { kind: "empty"; folderId: number; total: number }

export function SidebarConversationList({
  ref,
  showCompleted = true,
  sortMode = "created",
}: SidebarConversationListProps & {
  ref?: Ref<SidebarConversationListHandle>
}) {
  const t = useTranslations("Folder.sidebar")
  const tCommon = useTranslations("Folder.common")
  const tFolderDropdown = useTranslations("Folder.folderNameDropdown")
  const tFileTree = useTranslations("Folder.fileTreeTab")
  const tRemote = useTranslations("RemoteWorkspace")
  const { themeColor: appThemeColor } = useThemeColor()
  const { createTerminalInDirectory } = useTerminal()
  const folders = useAppWorkspaceStore((s) => s.folders)
  const allFolders = useAppWorkspaceStore((s) => s.allFolders)
  // 领域切片（F5，设计 §5.1）：store 从 wire 缓存（allFolders）派生的 Project
  // 列表，引用只在 allFolders 变化时刷新——ProjectRow 的 memo 依赖它的稳定性。
  const projects = useAppWorkspaceStore((s) => s.projects)
  // 分支徽标数据源：git HEAD 解析结果（活动项目轮询 + 下方的按需 ensure）。
  const branches = useAppWorkspaceStore((s) => s.branches)
  const ensureGitHead = useAppWorkspaceStore((s) => s.ensureGitHead)
  const conversations = useAppWorkspaceStore((s) => s.conversations)
  const loading = useAppWorkspaceStore((s) => s.conversationsLoading)
  const error = useAppWorkspaceStore((s) => s.conversationsError)
  const refreshConversations = useAppWorkspaceStore(
    (s) => s.refreshConversations
  )
  const updateConversationLocal = useAppWorkspaceStore(
    (s) => s.updateConversationLocal
  )
  const removeFolderFromWorkspace = useAppWorkspaceStore(
    (s) => s.removeFolderFromWorkspace
  )
  const refreshFolder = useAppWorkspaceStore((s) => s.refreshFolder)
  const { activeFolder } = useActiveFolder()

  const activeTabId = useTabStore((s) => s.activeTabId)
  const tabs = useTabStore((s) => s.tabs)
  const {
    openTab,
    closeConversationTab,
    closeTabsByFolder,
    openNewConversationTab,
    openChatModeTab,
  } = useTabActions()
  const { openConversations } = useWorkbenchRoute()

  const folderIndex = useMemo(() => {
    const map = new Map<
      number,
      {
        name: string
        alias: string | null
        path: string
        color: string
        defaultAgentType: AgentType | null
      }
    >()
    for (const f of allFolders)
      map.set(f.id, {
        name: f.name,
        alias: f.alias,
        path: f.path,
        color: f.color,
        defaultAgentType: f.default_agent_type,
      })
    return map
  }, [allFolders])

  // 项目行领域索引（F5）：wire id → 领域 Project。ProjectRow 消费 Project 形状
  // （名称/origin），此处只做 id 换算，引用随 `projects` 切片稳定。
  const projectsById = useMemo(() => {
    const map = new Map<number, Project>()
    for (const p of projects) map.set(projectWireId(p.id), p)
    return map
  }, [projects])

  // 分支徽标按需解析：每个项目挂载时解析一次 git HEAD（store 内部按 gitHeads
  // 已知 + in-flight 去重，N 个项目行 = N 次请求，仅一次）。
  useEffect(() => {
    for (const f of folders) {
      if (f.parent_id == null) ensureGitHead(f.id, f.path)
    }
  }, [folders, ensureGitHead])

  const selectedConversation = useMemo(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    return !activeTab || activeTab.conversationId == null
      ? null
      : { id: activeTab.conversationId, agentType: activeTab.agentType }
  }, [tabs, activeTabId])

  const openTabKeys = useMemo(() => {
    const next = new Set<string>()
    for (const tab of tabs) {
      if (tab.conversationId != null) {
        next.add(`${tab.agentType}:${tab.conversationId}`)
      }
    }
    return next
  }, [tabs])

  const { sortedTypes: availableAgents, fresh: availableAgentsFresh } =
    useSortedAvailableAgents()
  // Expanded state of each project row (absent key = expanded). Hydrated from
  // localStorage after mount.
  const [folderExpanded, setFolderExpanded] = useState<Record<number, boolean>>(
    {}
  )
  // Collapsed state of the top-level "Projects" section. Absent = expanded.
  // Reuses the historical "folders" key so an existing preference survives.
  const [sectionCollapsed, setSectionCollapsed] =
    useState<SidebarSectionCollapsed>({})
  const sectionExpanded = !sectionCollapsed.folders

  const [removeConfirm, setRemoveConfirm] = useState<{
    folderId: number
    folderName: string
  } | null>(null)
  // Project the "manage conversations" dialog opens on.
  const [manageFolderId, setManageFolderId] = useState<number | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [remoteManageOpen, setRemoteManageOpen] = useState(false)
  // Backs the list context menu's "Open remote workspace" submenu.
  const {
    desktop: remoteAvailable,
    connections: remoteConnections,
    refresh: refreshRemote,
    open: openRemote,
  } = useRemoteWorkspaceConnections()
  // Project whose links are being managed (context menu -> Linked folders).
  // F5：只记 wire id，FolderDetail 经 allFolders 查找（UI 层不持有 wire 形状）。
  const [linksFolderId, setLinksFolderId] = useState<number | null>(null)

  // virtua binds to the real OverlayScrollbars viewport element (surfaced via
  // the ScrollArea `onViewportRef` bridge once OS has initialized). We keep both
  // a ref (for the Virtualizer `scrollRef` prop) and a state flag so the
  // Virtualizer only mounts after the viewport exists.
  const viewportRef = useRef<HTMLElement | null>(null)
  const [viewportEl, setViewportEl] = useState<HTMLElement | null>(null)
  const handleViewportRef = useCallback((element: HTMLElement | null) => {
    viewportRef.current = element
    setViewportEl(element)
  }, [])
  const virtualizerRef = useRef<VirtualizerHandle>(null)
  const pendingScrollRef = useRef(false)

  // Single "now" shared by every relative time label, refreshed once a minute.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Hydrate from localStorage after mount to keep SSR/CSR markup consistent.
    setFolderExpanded(loadFolderExpanded())
    setSectionCollapsed(loadSectionCollapsed())
  }, [])

  const toggleSection = useCallback(() => {
    setSectionCollapsed((prev) => {
      const next = { ...prev, folders: !prev.folders }
      saveSectionCollapsed(next)
      return next
    })
  }, [])

  const toggleFolder = useCallback((folderId: number) => {
    setFolderExpanded((prev) => {
      const next = { ...prev, [folderId]: !(prev[folderId] ?? true) }
      saveFolderExpanded(next)
      return next
    })
  }, [])

  // ── Row data ─────────────────────────────────────────────────────────────
  // Maps each open worktree child folder → its (open) root folder, so a
  // worktree's sessions render under the parent project. Display-only merge:
  // it never rewrites `conversation.folder_id`. A child whose parent was
  // closed stands on its own (its sessions stay reachable).
  const childToParent = useMemo(() => {
    const map = new Map<number, number>()
    for (const f of folders) {
      if (f.parent_id != null && folders.some((p) => p.id === f.parent_id)) {
        map.set(f.id, f.parent_id)
      }
    }
    return map
  }, [folders])

  // The projects rendered as rows: top-level open folders (worktree children
  // whose parent is open follow that parent and never render their own row).
  const projectFolders = useMemo(
    () => folders.filter((f) => !childToParent.has(f.id)),
    [folders, childToParent]
  )

  // Sessions listed under projects: chat-kind conversations are NOT listed in
  // the sidebar any more (still creatable; reachable via search), and the
  // completed filter applies per the view-options preference. Pinned sessions
  // stay in their project (the old dedicated Pinned section is gone).
  const visibleConversations = useMemo(() => {
    const base = conversations.filter((c) => c.kind !== "chat")
    if (showCompleted) return base
    return base.filter((c) => c.status !== "completed")
  }, [conversations, showCompleted])

  // Per-project session buckets, pinned first then the chosen sort mode.
  const byFolder = useMemo(() => {
    const map = new Map<number, DbConversationSummary[]>()
    for (const conv of visibleConversations) {
      const groupId = childToParent.get(conv.folder_id) ?? conv.folder_id
      const bucket = map.get(groupId)
      if (bucket) bucket.push(conv)
      else map.set(groupId, [conv])
    }
    const compareSessions =
      sortMode === "updated" ? compareByUpdatedAtDesc : compareByCreatedAtDesc
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const aPinned = a.pinned_at != null
        const bPinned = b.pinned_at != null
        // 置顶优先；同为置顶按置顶时间，同为未置顶走排序模式
        //（compareByPinnedAtDesc 对双未置顶会退化为 id 倒序，不能整体套用）。
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        if (aPinned && bPinned) return compareByPinnedAtDesc(a, b)
        return compareSessions(a, b)
      })
    }
    return map
  }, [visibleConversations, sortMode, childToParent])

  // Unfiltered (completed included) non-chat count per project, so the empty
  // hint distinguishes a truly empty project from one whose rows are merely
  // hidden by the completed filter.
  const folderTotalCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const conv of conversations) {
      if (conv.kind === "chat") continue
      const groupId = childToParent.get(conv.folder_id) ?? conv.folder_id
      map.set(groupId, (map.get(groupId) ?? 0) + 1)
    }
    return map
  }, [conversations, childToParent])

  // Running (`in_progress`) sessions per project — the amber badge.
  const folderRunningCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const conv of conversations) {
      if (conv.kind === "chat" || conv.status !== "in_progress") continue
      const groupId = childToParent.get(conv.folder_id) ?? conv.folder_id
      map.set(groupId, (map.get(groupId) ?? 0) + 1)
    }
    return map
  }, [conversations, childToParent])

  // Attention (pending_review) sessions per project — the red dot.
  const folderAttentionCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const conv of conversations) {
      if (conv.kind === "chat" || conv.status !== "pending_review") continue
      const groupId = childToParent.get(conv.folder_id) ?? conv.folder_id
      map.set(groupId, (map.get(groupId) ?? 0) + 1)
    }
    return map
  }, [conversations, childToParent])

  // Flat row model for windowing. Deliberately excludes `now` (the per-minute
  // label tick must not rebuild rows).
  const rows = useMemo<ProjectListRow[]>(() => {
    const out: ProjectListRow[] = [{ kind: "section" }]
    if (!sectionExpanded) return out
    if (projectFolders.length === 0) {
      out.push({ kind: "no-projects" })
      return out
    }
    for (const folder of projectFolders) {
      out.push({ kind: "project", folderId: folder.id })
      if (folderExpanded[folder.id] ?? true) {
        const bucket = byFolder.get(folder.id)
        if (!bucket || bucket.length === 0) {
          out.push({
            kind: "empty",
            folderId: folder.id,
            total: folderTotalCounts.get(folder.id) ?? 0,
          })
        } else {
          for (const conversation of bucket) {
            out.push({ kind: "session", conversation })
          }
        }
      }
    }
    return out
  }, [
    sectionExpanded,
    projectFolders,
    folderExpanded,
    byFolder,
    folderTotalCounts,
  ])

  // Latest snapshot for the imperative scrollToActive path, refreshed every
  // render so the callback reads current rows without re-subscribing virtua.
  const rowsRef = useRef<ProjectListRow[]>(rows)
  rowsRef.current = rows

  // The active project auto-expands: switching to a folder opens its project
  // row so its sessions are visible without a manual click. Persisted like a
  // manual toggle. `folderExpanded` is a dep on purpose: the persisted state
  // hydrates after mount, so the post-hydration pass is what corrects a
  // stored "collapsed" entry for the active project.
  useEffect(() => {
    const id = activeFolder?.id
    if (id == null || !projectFolders.some((f) => f.id === id)) return
    setFolderExpanded((prev) => {
      if (prev[id] ?? true) return prev
      const next = { ...prev, [id]: true }
      saveFolderExpanded(next)
      return next
    })
  }, [activeFolder?.id, projectFolders, folderExpanded])

  useImperativeHandle(ref, () => ({
    scrollToActive() {
      scrollToActiveRef.current()
    },
    expandAll() {
      setSectionCollapsed((prev) => {
        if (!prev.folders) return prev
        const next = { ...prev, folders: false }
        saveSectionCollapsed(next)
        return next
      })
      setFolderExpanded((prev) => {
        const next: Record<number, boolean> = { ...prev }
        for (const folder of projectFolders) next[folder.id] = true
        saveFolderExpanded(next)
        return next
      })
    },
    collapseAll() {
      setSectionCollapsed((prev) => {
        if (prev.folders) return prev
        const next = { ...prev, folders: true }
        saveSectionCollapsed(next)
        return next
      })
      setFolderExpanded((prev) => {
        const next: Record<number, boolean> = { ...prev }
        for (const folder of projectFolders) next[folder.id] = false
        saveFolderExpanded(next)
        return next
      })
    },
  }))

  const scrollToActiveRef = useRef<() => void>(() => {})

  useEffect(() => {
    scrollToActiveRef.current = () => {
      const selected = selectedConversation
      if (!selected) return
      const conv = conversations.find(
        (c) => c.id === selected.id && c.agent_type === selected.agentType
      )
      if (!conv || conv.kind === "chat") return
      const displayFolderId =
        childToParent.get(conv.folder_id) ?? conv.folder_id
      // Each expansion step below defers the actual scroll to the next render
      // (the row only exists in the flat model once visible); this effect
      // re-runs on the expansion-state change with the rebuilt rows available
      // via rowsRef, and chains via pendingScrollRef.
      if (!sectionExpanded) {
        toggleSection()
        pendingScrollRef.current = true
        return
      }
      if (!(folderExpanded[displayFolderId] ?? true)) {
        setFolderExpanded((prev) => {
          const next = { ...prev, [displayFolderId]: true }
          saveFolderExpanded(next)
          return next
        })
        pendingScrollRef.current = true
        return
      }
      const index = rowsRef.current.findIndex(
        (row) =>
          row.kind === "session" &&
          row.conversation.id === selected.id &&
          row.conversation.agent_type === selected.agentType
      )
      if (index < 0) return
      virtualizerRef.current?.scrollToIndex(index, {
        align: "center",
        smooth: true,
      })
    }

    if (pendingScrollRef.current) {
      pendingScrollRef.current = false
      scrollToActiveRef.current()
    }
  }, [
    selectedConversation,
    conversations,
    folderExpanded,
    sectionExpanded,
    childToParent,
    toggleSection,
  ])

  // ── Handlers (project + session actions) ─────────────────────────────────
  const handleChangeFolderColor = useCallback(
    async (folderId: number, color: FolderThemeColor) => {
      try {
        await updateFolderColor(folderId, color)
        await refreshFolder(folderId)
      } catch (err) {
        const msg = toErrorMessage(err)
        toast.error(t("toasts.changeFolderColorFailed", { message: msg }))
      }
    },
    [refreshFolder, t]
  )

  const handleSetFolderAlias = useCallback(
    async (folderId: number, alias: string | null) => {
      try {
        await updateFolderAlias(folderId, alias)
        await refreshFolder(folderId)
      } catch (err) {
        const msg = toErrorMessage(err)
        toast.error(t("toasts.setFolderAliasFailed", { message: msg }))
      }
    },
    [refreshFolder, t]
  )

  const handleChangeFolderDefaultAgent = useCallback(
    async (folderId: number, agentType: AgentType | null) => {
      try {
        await updateFolderDefaultAgent(folderId, agentType)
        await refreshFolder(folderId)
      } catch (err) {
        const msg = toErrorMessage(err)
        toast.error(
          t("toasts.changeFolderDefaultAgentFailed", { message: msg })
        )
      }
    },
    [refreshFolder, t]
  )

  const handleOpenFolderInSystemExplorer = useCallback(
    (folderId: number) => {
      const folder = folderIndex.get(folderId)
      if (!folder) return
      void revealItemInDir(folder.path).catch(() => {
        toast.error(tFileTree("toasts.openDirectoryFailed"))
      })
    },
    [folderIndex, tFileTree]
  )

  const handleOpenFolderInTerminal = useCallback(
    async (folderId: number) => {
      const folder = folderIndex.get(folderId)
      if (!folder) return
      const title = tFileTree("terminalTitle", { name: folder.name })
      const id = await createTerminalInDirectory(folder.path, title)
      if (!id) {
        toast.error(tFileTree("toasts.openBuiltinTerminalFailed"))
      }
    },
    [folderIndex, createTerminalInDirectory, tFileTree]
  )

  const handleOpenFolderInCode = useCallback(
    (folderId: number) => {
      const folder = folderIndex.get(folderId)
      if (!folder) return
      void openInCode(folder.path).catch((err) => {
        toast.error(tFileTree("toasts.openInCodeFailed"), {
          description: toErrorMessage(err),
        })
      })
    },
    [folderIndex, tFileTree]
  )

  const handleRemoveFolder = useCallback(
    (folderId: number) => {
      const name = folderIndex.get(folderId)?.name ?? String(folderId)
      setRemoveConfirm({ folderId, folderName: name })
    },
    [folderIndex]
  )

  const handleManageConversations = useCallback((folderId: number) => {
    setManageFolderId(folderId)
  }, [])

  const handleManageFolderLinks = useCallback((folderId: number) => {
    setLinksFolderId(folderId)
  }, [])

  const handleRemoveFolderConfirm = useCallback(async () => {
    if (!removeConfirm) return
    const { folderId, folderName } = removeConfirm
    try {
      closeTabsByFolder(folderId)
      await removeFolderFromWorkspace(folderId)
      toast.success(t("toasts.folderRemoved", { name: folderName }))
    } catch (e) {
      const msg = toErrorMessage(e)
      toast.error(t("toasts.removeFolderFailed", { message: msg }))
    } finally {
      setRemoveConfirm(null)
    }
  }, [removeConfirm, closeTabsByFolder, removeFolderFromWorkspace, t])

  const handleSelect = useCallback(
    (id: number, agentType: string, folderId: number) => {
      // Selecting a conversation returns to the conversation workspace if a
      // workbench route (e.g. Automations) was taking over the content region.
      openConversations()
      openTab(folderId, id, agentType as Parameters<typeof openTab>[2], false)
    },
    [openTab, openConversations]
  )

  const handleDoubleClick = useCallback(
    (id: number, agentType: string, folderId: number) => {
      openConversations()
      openTab(folderId, id, agentType as Parameters<typeof openTab>[2], true)
    },
    [openTab, openConversations]
  )

  const handleRename = useCallback(
    async (id: number, newTitle: string) => {
      await updateConversationTitle(id, newTitle)
      refreshConversations()
    },
    [refreshConversations]
  )

  const handleDelete = useCallback(
    async (id: number, agentType: string, folderId: number) => {
      await deleteConversation(id)
      // No-op if no matching tab is open (the context guards on its tab ref).
      closeConversationTab(
        folderId,
        id,
        agentType as Parameters<typeof openTab>[2]
      )
      refreshConversations()
    },
    [closeConversationTab, refreshConversations]
  )

  const handleStatusChange = useCallback(
    async (id: number, status: ConversationStatus) => {
      updateConversationLocal(id, { status })
      await updateConversationStatus(id, status)
    },
    [updateConversationLocal]
  )

  const handleTogglePin = useCallback(
    async (id: number, nextPinned: boolean) => {
      // Optimistic: instantly flip the row's pin state. The upsert echo
      // reconciles the exact server `pinned_at`; on failure the next refresh
      // corrects it (mirrors handleStatusChange's lenient pattern).
      updateConversationLocal(id, {
        pinned_at: nextPinned ? new Date().toISOString() : null,
      })
      await updateConversationPinned(id, nextPinned)
    },
    [updateConversationLocal]
  )

  const handleNewConversation = useCallback(() => {
    // Starting a conversation returns to the conversation workspace if a
    // workbench route (e.g. Automations) was taking over the content region.
    openConversations()
    // With no active folder (all projects closed, or a cold start that
    // recovered to nothing) fall back to folderless chat mode rather than
    // no-op — this entry point is never a dead end.
    if (!activeFolder) {
      openChatModeTab()
      return
    }
    openNewConversationTab(activeFolder.id, activeFolder.path)
  }, [activeFolder, openChatModeTab, openNewConversationTab, openConversations])

  const handleNewConversationForFolder = useCallback(
    (folderId: number) => {
      const folder = folderIndex.get(folderId)
      if (!folder) return
      openConversations()
      openNewConversationTab(folderId, folder.path)
    },
    [folderIndex, openNewConversationTab, openConversations]
  )

  // "Import local sessions" opens a dedicated picker window. The project
  // context-menu entry anchors the picker to its own folder; sidebar refresh
  // arrives via the backend broadcasts, so no local busy state remains here.
  const handleImportForFolder = useCallback(
    (folderId: number) => {
      const folder = folderIndex.get(folderId)
      void openImportSessionsWindow({ focusPath: folder?.path ?? null })
    },
    [folderIndex]
  )

  const handleOpenImportWindow = useCallback(() => {
    void openImportSessionsWindow()
  }, [])

  const handleOpenFolderAction = useCallback(() => setBrowserOpen(true), [])
  const handleOpenCloneDialog = useCallback(() => setCloneOpen(true), [])

  const showEmptyWorkspaceActions =
    folders.length === 0 && conversations.length === 0

  // A project's chosen colour, for the tint its TITLE takes.
  const folderThemeColor = (folderId: number): FolderThemeColor =>
    normalizeFolderThemeColor(folderIndex.get(folderId)?.color)

  const projectRow = (folderId: number) => {
    const folderEntry = folderIndex.get(folderId)
    const project = projectsById.get(folderId)
    // F5：行渲染走领域 ProjectRow——wire 行（folderEntry）只补显示字段
    // （目录原名/主题色/默认 agent）。二者同源于 allFolders，缺一即不渲染
    // （防御性；正常数据流不会发生）。
    if (!folderEntry || !project) return null
    return (
      <ProjectRow
        project={project}
        directoryName={folderEntry.name}
        branch={branches.get(folderId) ?? null}
        runningCount={folderRunningCounts.get(folderId) ?? 0}
        attentionCount={folderAttentionCounts.get(folderId) ?? 0}
        expanded={folderExpanded[folderId] ?? true}
        themeColor={folderThemeColor(folderId)}
        appThemeColor={appThemeColor}
        currentDefaultAgent={folderEntry.defaultAgentType ?? null}
        availableAgents={availableAgents}
        availableAgentsFresh={availableAgentsFresh}
        onToggle={toggleFolder}
        onRemoveFromWorkspace={handleRemoveFolder}
        onNewConversation={handleNewConversationForFolder}
        onImport={handleImportForFolder}
        onManageConversations={handleManageConversations}
        onManageLinks={handleManageFolderLinks}
        onChangeColor={handleChangeFolderColor}
        onSetAlias={handleSetFolderAlias}
        onSetDefaultAgent={handleChangeFolderDefaultAgent}
        onOpenInSystemExplorer={handleOpenFolderInSystemExplorer}
        onOpenInTerminal={handleOpenFolderInTerminal}
        onOpenInCode={handleOpenFolderInCode}
      />
    )
  }

  const renderRow = (row: ProjectListRow) => {
    if (row.kind === "section") {
      // The single "Projects" section header: label toggles the whole
      // section; the right cluster carries the section menu (⋮) and the
      // add-project entry (＋).
      return (
        <div className="group flex h-[2rem] items-center pr-[0.375rem]">
          <button
            type="button"
            onClick={toggleSection}
            aria-expanded={sectionExpanded}
            className={cn(
              "flex h-full min-w-0 items-center gap-1 rounded-full pl-[0.25rem] pr-2 outline-none",
              "text-xs font-medium text-muted-foreground",
              "transition-colors duration-150 hover:text-sidebar-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            <ChevronDown
              aria-hidden
              className={cn(
                "h-3 w-3 shrink-0 transition-transform duration-200 ease-out",
                !sectionExpanded && "-rotate-90"
              )}
            />
            <span className="truncate">{t("sectionProjects")}</span>
          </button>
          <div className="ml-auto flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title={t("moreOptions")}
                  aria-label={t("moreOptions")}
                  aria-haspopup="menu"
                  className={cn(
                    "flex h-6 w-6 cursor-pointer items-center justify-end rounded-[0.375rem] outline-none",
                    "text-muted-foreground/90 transition-colors duration-150 hover:text-sidebar-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  )}
                >
                  <MoreHorizontal
                    aria-hidden
                    className="h-[0.875rem] w-[0.875rem]"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem
                  onSelect={handleNewConversation}
                  disabled={!activeFolder}
                >
                  <SquarePen className="h-3.5 w-3.5" />
                  {t("newConversation")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleOpenImportWindow}>
                  <Download className="h-3.5 w-3.5" />
                  {t("importLocalSessions")}
                </DropdownMenuItem>
                {remoteAvailable && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setRemoteManageOpen(true)}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      {tRemote("manage")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <ProjectTreeAddButton />
          </div>
        </div>
      )
    }
    if (row.kind === "no-projects") {
      return (
        <div className="px-[0.5rem] py-[0.375rem] text-[0.75rem] text-muted-foreground/70">
          {t("noFolders")}
        </div>
      )
    }
    if (row.kind === "project") {
      return projectRow(row.folderId)
    }
    if (row.kind === "empty") {
      // A project's empty hint sits at the session indent so it reads as being
      // INSIDE the project rather than as another top-level row.
      return (
        <div
          className="flex h-[2rem] items-center text-[0.75rem] text-muted-foreground/70"
          style={{
            paddingLeft: "calc(var(--conv-rail-axis) + 0.875rem + 0.875rem)",
          }}
        >
          <span className="truncate">
            {row.total === 0
              ? t("emptyFolderHint")
              : t("noUnfinishedConversations")}
          </span>
        </div>
      )
    }
    const conv = row.conversation
    return (
      <ProjectConversationRow
        conversation={conv}
        isSelected={
          selectedConversation?.agentType === conv.agent_type &&
          selectedConversation?.id === conv.id
        }
        isOpenInTab={openTabKeys.has(`${conv.agent_type}:${conv.id}`)}
        timeLabel={formatRelative(
          sortMode === "updated" ? conv.updated_at : conv.created_at,
          now
        )}
        onSelect={handleSelect}
        onDoubleClick={handleDoubleClick}
        onRename={handleRename}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        onTogglePin={handleTogglePin}
      />
    )
  }

  const rowKey = (row: ProjectListRow): string => {
    if (row.kind === "section") return "section-projects"
    if (row.kind === "no-projects") return "no-projects"
    if (row.kind === "project") return `project-${row.folderId}`
    if (row.kind === "empty") return `empty-${row.folderId}`
    return `conv-${row.conversation.agent_type}-${row.conversation.id}`
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {loading && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-center py-1 z-20 pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      )}

      {loading ? (
        <div className="px-3 space-y-1.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center px-3">
          <p className="text-destructive text-xs">
            {t("error", { message: error })}
          </p>
        </div>
      ) : showEmptyWorkspaceActions ? (
        <div className="flex-1 flex flex-col items-center justify-center px-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full max-w-[14rem] justify-start"
            onClick={handleOpenFolderAction}
          >
            <FolderOpenDot className="h-3.5 w-3.5 mr-1.5" />
            {tFolderDropdown("openFolder")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full max-w-[14rem] justify-start"
            onClick={handleOpenCloneDialog}
          >
            <FolderGit2 className="h-3.5 w-3.5 mr-1.5" />
            {tFolderDropdown("cloneRepository")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full max-w-[14rem] justify-start"
            onClick={handleOpenImportWindow}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {t("importLocalSessions")}
          </Button>
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex-1 min-h-0 relative">
              <ScrollArea
                onViewportRef={handleViewportRef}
                className={cn(
                  "h-full min-h-0 px-1.5 pb-1.5",
                  "[overflow-anchor:none]",
                  "[--conv-rail-axis:0.875rem]"
                )}
              >
                {viewportEl ? (
                  <Virtualizer
                    ref={virtualizerRef}
                    scrollRef={viewportRef}
                    data={rows}
                    itemSize={32}
                    bufferSize={400}
                  >
                    {(row: ProjectListRow) => (
                      <div key={rowKey(row)}>{renderRow(row)}</div>
                    )}
                  </Virtualizer>
                ) : (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className="h-[2rem] w-full rounded-md"
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onSelect={handleNewConversation}
              disabled={!activeFolder}
            >
              <SquarePen className="h-4 w-4" />
              {t("newConversation")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleOpenFolderAction}>
              <FolderOpenDot className="h-4 w-4" />
              {tFolderDropdown("openFolder")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleOpenCloneDialog}>
              <FolderGit2 className="h-4 w-4" />
              {tFolderDropdown("cloneRepository")}
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleOpenImportWindow}>
              <Download className="h-4 w-4" />
              {t("importLocalSessions")}
            </ContextMenuItem>
            {/* Trailing entry, desktop-only: opening a remote workspace spawns
                another window bound to a different server, which a web client
                can't do. Its own group: the rows above all act on THIS
                machine's workspace, while this one leaves for another host. */}
            {remoteAvailable && (
              <>
                <ContextMenuSeparator />
                <ContextMenuSub
                  onOpenChange={(open) => open && void refreshRemote()}
                >
                  <ContextMenuSubTrigger>
                    <MonitorCloud className="h-4 w-4" />
                    {tRemote("openRemoteWorkspace")}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="max-h-(--radix-context-menu-content-available-height) w-72 overflow-x-hidden overflow-y-auto">
                    {remoteConnections.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {tRemote("empty")}
                      </div>
                    ) : (
                      remoteConnections.map((connection) => (
                        <ContextMenuItem
                          key={connection.id}
                          onSelect={() => openRemote(connection.id)}
                        >
                          <MonitorCloud className="h-4 w-4" />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {connection.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {connection.base_url}
                            </span>
                          </span>
                        </ContextMenuItem>
                      ))
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => setRemoteManageOpen(true)}>
                      <Settings className="h-4 w-4" />
                      {tRemote("manage")}
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      )}

      <AlertDialog
        open={removeConfirm !== null}
        onOpenChange={(open) => !open && setRemoveConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeFolderConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeFolderConfirmDescription", {
                name: removeConfirm?.folderName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFolderConfirm}>
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {manageFolderId != null && (
        <ConversationManageDialog
          open
          onOpenChange={(o) => !o && setManageFolderId(null)}
          folderId={manageFolderId}
        />
      )}

      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      <WorkspaceFolderDialog open={browserOpen} onOpenChange={setBrowserOpen} />
      {/* Sibling of the context menu, never a child of it: the menu unmounts
          its content on close, which would take a nested dialog with it. Mounted
          only where its submenu exists, so web builds don't carry a dialog
          nothing can open. */}
      {remoteAvailable && (
        <RemoteWorkspaceManageDialog
          open={remoteManageOpen}
          onOpenChange={setRemoteManageOpen}
          onChanged={refreshRemote}
        />
      )}
      {/* 链接管理模式复用同一对话框：只记 wire id，行数据在渲染时经
          allFolders 解析（找不到即不挂载）。 */}
      {linksFolderId != null &&
        (() => {
          const linksFolderDetail =
            allFolders.find((f) => f.id === linksFolderId) ?? null
          return linksFolderDetail ? (
            <WorkspaceFolderDialog
              open
              onOpenChange={(o) => !o && setLinksFolderId(null)}
              folder={linksFolderDetail}
            />
          ) : null
        })()}
    </div>
  )
}
