"use client"

import { memo, useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FolderClosed,
  FolderGit2,
  FolderOpen,
  FolderOpenDot,
  GitBranch,
  Link2,
  ListChecks,
  MonitorCloud,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Plus,
  SquarePen,
  Tag,
  Trash2,
  XCircle,
  Bot,
} from "lucide-react"
import { useImeGuard } from "@/hooks/use-ime-guard"
import { OpenInSubContent } from "@/components/layout/open-in-menu"
import { isDesktop } from "@/lib/platform"
import type {
  AgentType,
  ConversationStatus,
  DbConversationSummary,
} from "@/lib/types"
import { STATUS_ORDER } from "@/lib/types"
import { getAgentLabel } from "@/lib/custom-agents"
import {
  FOLDER_THEME_COLOR_INHERIT,
  THEME_COLOR_PREVIEW,
  THEME_COLORS,
  folderTitleTintVars,
  type FolderThemeColor,
  type ThemeColor,
} from "@/lib/theme-presets"
import { formatConversationTitle } from "@/lib/conversation-title"
import { FolderAliasLabel } from "@/components/conversations/folder-alias-label"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkspaceFolderDialog } from "@/components/layout/workspace-folder-dialog"
import { CloneDialog } from "@/components/layout/clone-dialog"
import { cn } from "@/lib/utils"
import type { Project, ProjectOrigin } from "@/core/domain"
import { projectWireId } from "../wire"
import { RemoteConnectionWizard } from "./remote-connection-wizard"

/**
 * 项目树（studio-shell 重写，复刻 ZCode 左侧面板）。
 *
 * - `ProjectRow`：项目行——本地图标 / 远程云图标 + 项目名 + 右侧控制
 *   （分支徽标、运行中徽标、需注意红点、悬停 ⋮ 菜单）。点击整行展开/折叠，
 *   展开后其会话由 sidebar-conversation-list 嵌套缩进渲染。
 * - `ProjectConversationRow`：项目下的会话行——状态点 + 标题 + 相对时间，
 *   无任何 harness（agent）图标。
 * - `ProjectTreeAddButton`：项目节头右侧的 "＋" 入口——打开本地文件夹 /
 *   克隆仓库 / 远程连接（自带三个对话框）。
 */

/** 会话行相对项目行的缩进步长：与会话行的图标轴一致（0.875rem 的轴 + 同
 *  步长的内容内距），让状态点恰好落在父项目行标题起始的正下方。 */
const SESSION_INDENT_STEP = "0.875rem"

/** origin 的 tooltip 文案：本地就是路径；远程拼 `kind:host:path`。 */
function originTitle(origin: ProjectOrigin): string {
  return origin.kind === "local"
    ? origin.path
    : `${origin.kind}:${origin.host.id}${origin.path}`
}

export interface ProjectRowProps {
  /** 领域项目（设计 §5.1）：行身份（id）、显示名（alias 优先，见
   *  wire 的 folderDetailToProject）、origin（远程时渲染云图标）。 */
  project: Project
  /**
   * Wire 显示补充（F5 豁免）：目录原名。领域 `project.name` 已是 alias 优先，
   * 与原名不同时渲染 `alias [ name ]` 两段式标签；相同（未设 alias）时渲染
   * 裸名。后端把 alias 并入项目名后此 prop 删除。
   */
  directoryName: string
  /** 分支徽标：git HEAD 解析结果（store `branches`）；null（非仓库/未解析）
   *  不渲染。 */
  branch: string | null
  /**
   * How many of this project's sessions are currently RUNNING (`in_progress`) —
   * not how many it holds. Zero renders no badge at all.
   */
  runningCount: number
  /**
   * How many of this project's sessions need the user's attention
   * (`pending_review`). Zero renders no dot; any positive count renders the
   * red dot — same "someone is waiting on you" semantic as the tasks
   * attention badge.
   */
  attentionCount: number
  expanded: boolean
  themeColor: FolderThemeColor
  appThemeColor: ThemeColor
  currentDefaultAgent: AgentType | null
  availableAgents: AgentType[]
  /** False while the agent list is still the localStorage seed (see
   *  useSortedAvailableAgents); gates "Set default agent" selection. */
  availableAgentsFresh: boolean
  onToggle: (folderId: number) => void
  onRemoveFromWorkspace: (folderId: number) => void
  onNewConversation: (folderId: number) => void
  onImport: (folderId: number) => void
  onManageConversations: (folderId: number) => void
  onManageLinks: (folderId: number) => void
  onChangeColor: (folderId: number, color: FolderThemeColor) => void
  onSetAlias: (folderId: number, alias: string | null) => void
  onSetDefaultAgent: (folderId: number, agentType: AgentType | null) => void
  onOpenInSystemExplorer: (folderId: number) => void
  onOpenInTerminal: (folderId: number) => void
  onOpenInCode: (folderId: number) => void
  /** True for the in-list copy whose floating sticky overlay is showing. */
  suppressed?: boolean
}

export const ProjectRow = memo(function ProjectRow({
  project,
  directoryName,
  branch,
  runningCount,
  attentionCount,
  expanded,
  themeColor,
  appThemeColor,
  currentDefaultAgent,
  availableAgents,
  availableAgentsFresh,
  onToggle,
  onRemoveFromWorkspace,
  onNewConversation,
  onImport,
  onManageConversations,
  onManageLinks,
  onChangeColor,
  onSetAlias,
  onSetDefaultAgent,
  onOpenInSystemExplorer,
  onOpenInTerminal,
  onOpenInCode,
  suppressed = false,
}: ProjectRowProps) {
  // Wire 接缝：领域 id 是字符串（core/domain），行交互回调仍以 wire 数字主键
  // 寻址（展开状态、tab、wire 命令）。后端替换日由 wire 层统一消化。
  const folderId = projectWireId(project.id)
  // 领域名（alias 优先）与目录原名不同 → 两段式标签的 alias 段。
  const folderAlias = project.name !== directoryName ? project.name : null

  // Own the translations here rather than receiving `t` as a prop: next-intl
  // returns a fresh `t` on every parent render, so passing it down would defeat
  // this component's memo and re-render every header on each status event.
  const t = useTranslations("Folder.sidebar")
  const tProject = useTranslations("ProjectTree")
  const ime = useImeGuard()
  // Only flag a stale default once the live list is known; before fresh,
  // `availableAgents` is the localStorage seed and may legitimately omit a
  // newly-enabled agent.
  const showStaleDefault =
    availableAgentsFresh &&
    currentDefaultAgent !== null &&
    !availableAgents.includes(currentDefaultAgent)
  const tFileTree = useTranslations("Folder.fileTreeTab")
  const systemExplorerLabel =
    typeof navigator === "undefined"
      ? tFileTree("openInFileManager")
      : (() => {
          const platform =
            `${navigator.platform} ${navigator.userAgent}`.toLowerCase()
          if (platform.includes("mac")) return tFileTree("openInFinder")
          if (platform.includes("win")) return tFileTree("openInExplorer")
          return tFileTree("openInFileManager")
        })()
  // `revealItemInDir` only works inside Tauri; in web mode it is a no-op,
  // so disable the entry there to avoid silent failures.
  const isDesktopMode = isDesktop()

  // Alias dialog: controlled Dialog rendered as a sibling of the ContextMenu so
  // it survives the menu closing on select. Seeded from the current alias on
  // open.
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false)
  const [aliasValue, setAliasValue] = useState("")
  const openAliasDialog = useCallback(() => {
    setAliasValue(folderAlias ?? "")
    setAliasDialogOpen(true)
  }, [folderAlias])
  const confirmAlias = useCallback(() => {
    // Empty / whitespace clears the alias (null); the backend re-normalizes too.
    const trimmed = aliasValue.trim()
    onSetAlias(folderId, trimmed ? trimmed : null)
    setAliasDialogOpen(false)
  }, [aliasValue, folderId, onSetAlias])

  const titleTint = folderTitleTintVars(themeColor)
  // The `[ name ]` half of an aliased label is normally a DEEPER shade than the
  // alias beside it. A tinted title has no deeper shade to reach for (the tint
  // is already pinned to the one lightness that clears AA on this surface), so
  // it just inherits — the brackets alone carry the alias/name split there.
  const bracketClassName = titleTint
    ? "text-current"
    : "text-sidebar-foreground"

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            inert={suppressed || undefined}
            aria-hidden={suppressed || undefined}
            className="relative h-[2rem]"
          >
            <div
              className={cn(
                "group flex h-[1.9375rem] w-full items-center",
                "rounded-md",
                "transition-colors duration-150",
                "hover:bg-[var(--surface-hover)]"
              )}
            >
              <button
                data-folder-id={folderId}
                onClick={() => onToggle(folderId)}
                title={originTitle(project.origin)}
                aria-expanded={expanded}
                className={cn(
                  "relative flex h-full min-w-0 flex-1 items-center pr-[0.5rem] outline-none",
                  "rounded-md focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-workbench)] focus-visible:ring-inset",
                  "text-sidebar-foreground cursor-pointer"
                )}
                style={{
                  paddingLeft: "calc(var(--conv-rail-axis) + 0.875rem)",
                }}
              >
                {/* 项目图标：远程项目用云图标标识来源主机，本地项目用文件夹
                    图标（开/合随展开状态）。 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute flex items-center justify-center text-muted-foreground/75"
                  style={{
                    top: "50%",
                    left: "var(--conv-rail-axis)",
                    width: "0.875rem",
                    height: "0.875rem",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {project.origin.kind !== "local" ? (
                    <span
                      title={tProject("remoteOriginTitle", {
                        kind: project.origin.kind,
                        host: project.origin.host.id,
                      })}
                      className="inline-flex h-full items-center"
                    >
                      <MonitorCloud className="h-[0.875rem] w-[0.875rem]" />
                    </span>
                  ) : expanded ? (
                    <FolderOpen className="h-[0.875rem] w-[0.875rem]" />
                  ) : (
                    <FolderClosed className="h-[0.875rem] w-[0.875rem]" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-[0.5rem]">
                  {/* The project's chosen colour lands HERE and nowhere else: the
                      row's hover pill and its badges stay on the app theme. */}
                  <span
                    style={titleTint}
                    className={cn(
                      "min-w-0 flex-shrink truncate text-left text-[0.875rem] font-normal",
                      titleTint
                        ? "folder-title-tint"
                        : "text-sidebar-foreground/75"
                    )}
                  >
                    <FolderAliasLabel
                      name={directoryName}
                      alias={folderAlias}
                      bracketClassName={bracketClassName}
                    />
                  </span>
                  {/* 分支徽标：项目当前分支（git HEAD 解析结果）。非仓库或
                      未解析（null）不渲染；走中性元数据配色。 */}
                  {branch != null && branch.trim() !== "" ? (
                    <span
                      title={tProject("branchBadge", { branch })}
                      className={cn(
                        "inline-flex h-[0.9375rem] min-w-0 max-w-[7rem] shrink-0 items-center gap-[0.1875rem]",
                        "rounded-[0.3125rem] px-[0.25rem]",
                        "bg-[color-mix(in_oklab,var(--sidebar-accent),var(--sidebar-foreground)_6%)]",
                        "text-[0.625rem] font-medium leading-none text-muted-foreground"
                      )}
                    >
                      <GitBranch
                        aria-hidden
                        className="h-[0.625rem] w-[0.625rem] shrink-0"
                      />
                      <span className="truncate font-mono">{branch}</span>
                    </span>
                  ) : null}
                  {/* Live-activity badge: the number of RUNNING sessions in this
                      project, and nothing at all when none are. Amber — the same
                      "running" semantic the conversation status dot spins in. */}
                  {runningCount > 0 && (
                    <span
                      title={t("runningCountBadge", { count: runningCount })}
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center",
                        "h-[0.9375rem] min-w-[1rem] rounded-[0.3125rem] px-[0.25rem]",
                        "text-[0.625rem] font-semibold leading-none tabular-nums",
                        "bg-[var(--surface-hover)] text-[var(--text-faint)]"
                      )}
                    >
                      <span aria-hidden>{runningCount}</span>
                      <span className="sr-only">
                        {t("runningCountBadge", { count: runningCount })}
                      </span>
                    </span>
                  )}
                  {/* 需注意红点：项目下存在等待用户处理（pending_review）的
                      会话时点亮——与任务节的 attention 徽标同一"有人在等你"
                      语义，只是不需要计数，一眼可见即可。 */}
                  {attentionCount > 0 && (
                    <span
                      title={t("attentionBadge", { count: attentionCount })}
                      className="inline-flex h-[0.9375rem] min-w-[0.9375rem] shrink-0 items-center justify-center"
                    >
                      <span className="h-[0.5rem] w-[0.5rem] rounded-full bg-destructive" />
                      <span className="sr-only">
                        {t("attentionBadge", { count: attentionCount })}
                      </span>
                    </span>
                  )}
                  {/* Disclosure chevron: hover-revealed, rotates on expand. The
                      open/closed state also reads from the folder icon on the
                      left, so the chevron can stay hidden at rest. Touch keeps
                      it pinned on, since there is no hover to reveal it there.
                      NOTE: `group-focus-within` is intentional — the `group` is
                      the outer row wrapper and focus lands on a child. */}
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "h-3 w-3 shrink-0 text-muted-foreground/60",
                      "transition-[transform,opacity] duration-200 ease-out",
                      "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      "[@media(hover:none)]:opacity-100",
                      expanded && "rotate-90"
                    )}
                  />
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  // Re-open the SAME context menu as right-click (single source of
                  // truth — duplicating it would drift). Dispatch a synthetic
                  // contextmenu event from this button; it bubbles to the enclosing
                  // <ContextMenuTrigger>, which Radix opens at the given coords —
                  // anchored just under the button.
                  const rect = e.currentTarget.getBoundingClientRect()
                  e.currentTarget.dispatchEvent(
                    new MouseEvent("contextmenu", {
                      bubbles: true,
                      cancelable: true,
                      button: 2,
                      clientX: rect.left,
                      clientY: rect.bottom,
                    })
                  )
                }}
                title={t("moreOptions")}
                aria-label={t("moreOptions")}
                aria-haspopup="menu"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-end",
                  // Shares the card action-icon palette. Visible on hover /
                  // keyboard focus / touch; hidden at rest on pointer devices.
                  "mr-[0.375rem] rounded-[0.375rem] cursor-pointer outline-none text-muted-foreground/90",
                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                  "transition-[opacity,color] duration-150 hover:text-sidebar-foreground"
                )}
              >
                <MoreHorizontal className="h-[0.875rem] w-[0.875rem]" />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onNewConversation(folderId)}>
            <SquarePen className="h-4 w-4" />
            {t("newConversation")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onImport(folderId)}>
            <Download className="h-4 w-4" />
            {t("importLocalSessions")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ExternalLink className="h-4 w-4" />
              {tFileTree("openIn")}
            </ContextMenuSubTrigger>
            <OpenInSubContent
              explorerLabel={systemExplorerLabel}
              terminalLabel={tFileTree("openInTerminal")}
              codeLabel={tFileTree("openInCode")}
              explorerDisabled={!isDesktopMode}
              onOpenExplorer={() => onOpenInSystemExplorer(folderId)}
              onOpenTerminal={() => onOpenInTerminal(folderId)}
              onOpenCode={() => onOpenInCode(folderId)}
            />
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onManageConversations(folderId)}>
            <ListChecks className="h-4 w-4" />
            {t("folderHeaderMenu.manageConversations")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onManageLinks(folderId)}>
            <Link2 className="h-4 w-4" />
            {t("folderHeaderMenu.manageLinks")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Bot className="h-4 w-4" />
              {t("folderHeaderMenu.setDefaultAgent")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[12rem]">
              <ContextMenuItem
                onSelect={() => onSetDefaultAgent(folderId, null)}
                className="gap-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {t("folderHeaderMenu.defaultAgentNone")}
                </span>
                {currentDefaultAgent === null ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : null}
              </ContextMenuItem>
              <ContextMenuSeparator />
              {availableAgentsFresh ? (
                <>
                  {availableAgents.map((agent) => {
                    const active = currentDefaultAgent === agent
                    return (
                      <ContextMenuItem
                        key={agent}
                        onSelect={() => onSetDefaultAgent(folderId, agent)}
                        className="gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {getAgentLabel(agent)}
                        </span>
                        {active ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : null}
                      </ContextMenuItem>
                    )
                  })}
                  {showStaleDefault && currentDefaultAgent !== null ? (
                    <ContextMenuItem
                      key={currentDefaultAgent}
                      disabled
                      className="gap-2 opacity-60"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {`${getAgentLabel(currentDefaultAgent)} ${t("folderHeaderMenu.agentUnavailableSuffix")}`}
                      </span>
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    </ContextMenuItem>
                  ) : null}
                </>
              ) : (
                <ContextMenuItem disabled className="gap-2 opacity-60">
                  <span className="min-w-0 flex-1 truncate">
                    {t("folderHeaderMenu.loadingAgents")}
                  </span>
                </ContextMenuItem>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette className="h-4 w-4" />
              {t("folderHeaderMenu.changeColor")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[12rem] p-2">
              <ContextMenuItem
                onSelect={() =>
                  onChangeColor(folderId, FOLDER_THEME_COLOR_INHERIT)
                }
                className="gap-2"
              >
                <span
                  aria-hidden
                  className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-[0.25rem] border border-border"
                  style={{
                    backgroundColor: THEME_COLOR_PREVIEW[appThemeColor],
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {t("folderHeaderMenu.useThemeColor")}
                </span>
                {themeColor === FOLDER_THEME_COLOR_INHERIT ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : null}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <div className="grid grid-cols-6 gap-1">
                {THEME_COLORS.map((color) => {
                  const active = color === themeColor
                  return (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={color}
                      onClick={() => onChangeColor(folderId, color)}
                      className={cn(
                        "h-[1.125rem] w-[1.125rem] cursor-pointer rounded-[0.25rem]",
                        "outline-none ring-offset-1 ring-offset-popover",
                        "transition-[box-shadow,transform] duration-100 hover:scale-110",
                        active && "ring-2 ring-foreground/60"
                      )}
                      style={{ backgroundColor: THEME_COLOR_PREVIEW[color] }}
                    />
                  )
                })}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={openAliasDialog}>
            <Tag className="h-4 w-4" />
            {t("folderHeaderMenu.setAlias")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => onRemoveFromWorkspace(folderId)}
          >
            <XCircle className="h-4 w-4" />
            {t("folderHeaderMenu.removeFromWorkspace")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={aliasDialogOpen} onOpenChange={setAliasDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("folderHeaderMenu.setAliasTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={aliasValue}
            onChange={(e) => setAliasValue(e.target.value)}
            {...ime.props}
            onKeyDown={(e) => {
              if (ime.isComposing(e)) return
              if (e.key === "Enter") confirmAlias()
            }}
            placeholder={t("folderHeaderMenu.setAliasPlaceholder")}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasDialogOpen(false)}>
              {t("folderHeaderMenu.setAliasCancel")}
            </Button>
            <Button onClick={confirmAlias}>
              {t("folderHeaderMenu.setAliasSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

export interface ProjectConversationRowProps {
  conversation: DbConversationSummary
  isSelected: boolean
  isOpenInTab?: boolean
  timeLabel?: string
  onSelect: (id: number, agentType: string, folderId: number) => void
  onDoubleClick?: (id: number, agentType: string, folderId: number) => void
  onRename: (id: number, newTitle: string) => Promise<void>
  onDelete: (id: number, agentType: string, folderId: number) => Promise<void>
  onStatusChange: (id: number, status: ConversationStatus) => Promise<void>
  onTogglePin?: (id: number, nextPinned: boolean) => void
}

/**
 * 项目下的会话行：状态点 + 标题 + 相对时间，嵌套缩进显示在项目行下方。
 * 刻意不渲染任何 harness（agent）专属元素——agent 图标、委托子会话展开、
 * 连接轨道全部不出现；行只回答"哪个会话、什么状态、多久之前"。
 */
export const ProjectConversationRow = memo(function ProjectConversationRow({
  conversation,
  isSelected,
  isOpenInTab = false,
  timeLabel,
  onSelect,
  onDoubleClick,
  onRename,
  onDelete,
  onStatusChange,
  onTogglePin,
}: ProjectConversationRowProps) {
  const t = useTranslations("Folder.conversationCard")
  const tStatus = useTranslations("Folder.statusLabels")
  const ime = useImeGuard()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")

  const status = conversation.status as ConversationStatus
  const isPinned = conversation.pinned_at != null

  const handleClick = useCallback(() => {
    onSelect(conversation.id, conversation.agent_type, conversation.folder_id)
  }, [
    onSelect,
    conversation.id,
    conversation.agent_type,
    conversation.folder_id,
  ])

  const handleDblClick = useCallback(() => {
    onDoubleClick?.(
      conversation.id,
      conversation.agent_type,
      conversation.folder_id
    )
  }, [
    onDoubleClick,
    conversation.id,
    conversation.agent_type,
    conversation.folder_id,
  ])

  const handleRenameOpen = useCallback(() => {
    setRenameValue(conversation.title || "")
    setRenameOpen(true)
  }, [conversation.title])

  const handleRenameConfirm = useCallback(async () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      await onRename(conversation.id, trimmed)
    }
    setRenameOpen(false)
  }, [renameValue, conversation.id, conversation.title, onRename])

  const handleDeleteConfirm = useCallback(async () => {
    await onDelete(
      conversation.id,
      conversation.agent_type,
      conversation.folder_id
    )
    setDeleteOpen(false)
  }, [
    conversation.id,
    conversation.agent_type,
    conversation.folder_id,
    onDelete,
  ])

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="relative h-[2rem]"
            data-conv-key={`${conversation.agent_type}:${conversation.id}`}
          >
            <div
              className={cn(
                "group relative flex h-[1.9375rem] w-full items-center",
                "rounded-md text-sidebar-foreground",
                "transition-colors duration-[120ms]",
                isSelected
                  ? "bg-[var(--surface-active)]"
                  : "hover:bg-[var(--surface-hover)]"
              )}
            >
              <button
                data-conversation-id={conversation.id}
                onClick={handleClick}
                onDoubleClick={handleDblClick}
                className={cn(
                  "relative flex h-full min-w-0 flex-1 items-center gap-[0.625rem] text-left outline-none",
                  "rounded-md",
                  "pr-[0.25rem]"
                )}
                // 项目行下方一级缩进：状态点的轴 = 项目行标题的起始位置
                //（0.875rem 轴 + 一个 SESSION_INDENT_STEP），内容再让出
                // 0.875rem 的点到文字间距。
                style={{
                  paddingLeft: `calc(var(--conv-rail-axis) + ${SESSION_INDENT_STEP} + 0.875rem)`,
                }}
              >
                {/* 状态点：会话当前状态（进行中黄 / 待评审蓝 / 已完成绿 /
                    已取消红）。这是行首唯一的图形元素。 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 flex items-center justify-center"
                  style={{
                    left: `calc(var(--conv-rail-axis) + ${SESSION_INDENT_STEP})`,
                    width: "0.875rem",
                    height: "0.875rem",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <ConversationStatusDot status={status} size="sm" />
                </span>
                <span
                  className={cn(
                    "relative min-w-0 flex-1 truncate text-[0.875rem] font-normal",
                    isOpenInTab && "text-foreground"
                  )}
                >
                  {formatConversationTitle(conversation.title) ||
                    t("untitledConversation")}
                </span>
              </button>
              {/* Right slot: the relative time — the row reads "dot, title,
                  when" exactly, with no further chrome. */}
              <div className="flex h-full shrink-0 items-center pr-[0.375rem]">
                {timeLabel ? (
                  <span
                    className={cn(
                      "relative shrink-0 tabular-nums",
                      "text-[0.71875rem]",
                      isSelected
                        ? "font-medium text-muted-foreground"
                        : "font-normal text-muted-foreground/70"
                    )}
                  >
                    {timeLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={handleRenameOpen}>
            <Pencil className="h-4 w-4" />
            {t("rename")}
          </ContextMenuItem>
          {onTogglePin && (
            <ContextMenuItem
              onSelect={() => onTogglePin(conversation.id, !isPinned)}
            >
              {isPinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
              {isPinned ? t("unpin") : t("pin")}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ConversationStatusDot status={status} />
              {t("status")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {STATUS_ORDER.filter((s) => s !== conversation.status).map(
                (s) => (
                  <ContextMenuItem
                    key={s}
                    onSelect={() => onStatusChange(conversation.id, s)}
                  >
                    <ConversationStatusDot status={s} />
                    {tStatus(s)}
                  </ContextMenuItem>
                )
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameConversation")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            {...ime.props}
            onKeyDown={(e) => {
              if (ime.isComposing(e)) return
              if (e.key === "Enter") handleRenameConfirm()
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleRenameConfirm}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConversationTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConversationDescription", {
                title:
                  formatConversationTitle(conversation.title) ||
                  t("untitledConversation"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

/**
 * 项目节头右侧的 "＋" 入口。菜单三项：
 * - 打开本地文件夹 → 复用 WorkspaceFolderDialog（wire 层本地命令）；
 * - 克隆仓库 → CloneDialog；
 * - 远程连接… → RemoteConnectionWizard 四步向导骨架。
 *
 * 自带三个对话框（选中菜单项时才挂载内容），挂在项目节头，不随会话列表
 * 滚动。
 */
export function ProjectTreeAddButton() {
  const t = useTranslations("ProjectTree")
  const tFolderDropdown = useTranslations("Folder.folderNameDropdown")
  const [localDialogOpen, setLocalDialogOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={t("addProject")}
            aria-label={t("addProject")}
            aria-haspopup="menu"
            className={cn(
              // 与其它节头/行尾动作图标同一几何：h-6 w-6、glyph 靠右缘。
              "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-end",
              "rounded-[0.375rem] outline-none text-muted-foreground/90",
              "transition-colors duration-150 hover:text-sidebar-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            <Plus aria-hidden className="h-[0.875rem] w-[0.875rem]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => setLocalDialogOpen(true)}>
            <FolderOpenDot className="h-3.5 w-3.5 shrink-0" />
            {t("openLocalFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
            <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
            {tFolderDropdown("cloneRepository")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
            <MonitorCloud className="h-3.5 w-3.5 shrink-0" />
            {t("remoteConnection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceFolderDialog
        open={localDialogOpen}
        onOpenChange={setLocalDialogOpen}
      />
      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      <RemoteConnectionWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
