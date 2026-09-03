"use client"

import { memo, useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Bot,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FolderClosed,
  FolderGit2,
  FolderOpen,
  FolderOpenDot,
  FolderPlus,
  FolderRoot,
  GitBranch,
  Layers,
  LayersPlus,
  Link2,
  ListChecks,
  MonitorCloud,
  MoreHorizontal,
  Palette,
  Plus,
  SquarePen,
  Tag,
  XCircle,
} from "lucide-react"
import { useImeGuard } from "@/hooks/use-ime-guard"
import { OpenInSubContent } from "@/components/layout/open-in-menu"
import { isDesktop } from "@/lib/platform"
import type { AgentType, FolderGroupDetail } from "@/lib/types"
import { getAgentLabel } from "@/lib/custom-agents"
import {
  FOLDER_THEME_COLOR_INHERIT,
  THEME_COLOR_PREVIEW,
  THEME_COLORS,
  folderTitleTintVars,
  type FolderThemeColor,
  type ThemeColor,
} from "@/lib/theme-presets"
import {
  SubsessionAncestorRails,
  CONV_RAIL_DEPTH_STEP,
} from "@/components/conversations/sidebar-conversation-card"
import { worktreeHeaderAlias } from "@/components/conversations/sidebar-conversation-grouping"
import { FolderAliasLabel } from "@/components/conversations/folder-alias-label"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkspaceFolderDialog } from "@/components/layout/workspace-folder-dialog"
import { cn } from "@/lib/utils"
import type { Project, ProjectOrigin } from "@/core/domain"
import { projectWireId } from "../wire"
import { RemoteConnectionWizard } from "./remote-connection-wizard"

/**
 * 项目树（F5 / S2.3，设计 §3 features/projects/components）。
 *
 * - `ProjectRow`：侧栏项目行——名称 + 分支徽标 + 远程 origin 云图标，可展开/
 *   折叠；展开后内嵌该项目下的会话列表（会话行由 sidebar-conversation-list
 *   复用 SidebarConversationCard 渲染）。由原 sidebar-conversation-list 内的
 *   FolderHeader 迁入改型：领域身份（`project: Project`）+ wire 显示补充
 *   （`directoryName` 等，后端长出对应列后移入 Project）。
 * - `ProjectTreeAddButton`：侧栏底部"项目 +"入口，菜单两项——打开本地文件
 *   夹（复用 WorkspaceFolderDialog）/ 远程连接…（RemoteConnectionWizard）。
 */

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
   *  不渲染。worktree 子组不消费它——分支在那儿是标签本身（worktreeBranch）。 */
  branch: string | null
  /**
   * How many of this project's sessions are currently RUNNING (`in_progress`) —
   * not how many it holds. Zero renders no badge at all.
   */
  runningCount: number
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
  /**
   * Every project group, for the "Move to group" submenu. Omitted on the header
   * variants that can't move on their own (worktree sub-groups and the "root"
   * sub-group follow their repo). Must be referentially stable to preserve the
   * memo.
   */
  folderGroups?: readonly FolderGroupDetail[]
  /** Which group this project is currently in (null = top level). */
  currentGroupId?: number | null
  onMoveToGroup?: (folderId: number, groupId: number | null) => void
  /** Create a group and move this project into it in one step. */
  onNewGroupWithFolder?: (folderId: number) => void
  isDragging?: boolean
  /** Starts a reorder gesture from the header's grip. Omitted on the drag
   *  surface so headers there are pure drop-target visuals. */
  onGripPointerDown?: (folderId: number, event: React.PointerEvent) => void
  /** True for the in-list copy whose floating sticky overlay is showing (the
   *  overlay is the accessible control for that row; see FolderHeader 历史). */
  suppressed?: boolean
  /** Nesting depth of the row (0 top-level; 1 worktree/root sub-group; +1 in a
   *  group). Drives indent and the connector-spine ancestor rails. */
  depth?: number
  /**
   * Which glyph + label this row renders:
   * - `repo` (default): a top-level project / repo container.
   * - `worktree`: a git worktree sub-group (FolderGit2 glyph, branch as alias).
   * - `root`: a repo container's own-sessions sub-group (FolderRoot glyph,
   *   fixed "root" label).
   */
  variant?: "repo" | "worktree" | "root"
  /** The worktree's branch name (its own `git_branch`), used as the alias when
   *  none is set. Leaves the bare directory name when absent. */
  worktreeBranch?: string | null
}

export const ProjectRow = memo(function ProjectRow({
  project,
  directoryName,
  branch,
  runningCount,
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
  folderGroups,
  currentGroupId,
  onMoveToGroup,
  onNewGroupWithFolder,
  isDragging,
  onGripPointerDown,
  suppressed = false,
  depth = 0,
  variant = "repo",
  worktreeBranch = null,
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
            className={cn("relative h-[2rem]", isDragging && "opacity-60")}
          >
            <div
              onPointerDown={(e) => onGripPointerDown?.(folderId, e)}
              className={cn(
                "group flex h-[1.9375rem] w-full items-center",
                "rounded-full",
                "transition-colors duration-150",
                isDragging
                  ? "cursor-grabbing"
                  : "cursor-grab hover:bg-[color-mix(in_oklab,var(--sidebar-accent),var(--sidebar-foreground)_2%)]"
              )}
            >
              <button
                data-folder-id={folderId}
                onClick={() => onToggle(folderId)}
                title={originTitle(project.origin)}
                aria-expanded={expanded}
                className={cn(
                  "relative flex h-full min-w-0 flex-1 items-center pr-[0.5rem] outline-none",
                  "rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  "text-sidebar-foreground",
                  isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{
                  paddingLeft: `calc(var(--conv-rail-axis) + 0.875rem + ${depth} * ${CONV_RAIL_DEPTH_STEP})`,
                }}
              >
                {/* Connector spine (Show worktrees): a depth-1 sub-group header
                    draws its container's vertical rail at the depth-0 axis, so
                    stacked across the container's children (root + worktree
                    headers and their session cards) it forms one continuous line
                    down from the container. Renders nothing at depth 0. */}
                <SubsessionAncestorRails depth={depth} />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute flex items-center justify-center text-muted-foreground/75"
                  )}
                  style={{
                    top: "50%",
                    left: `calc(var(--conv-rail-axis) + ${depth} * ${CONV_RAIL_DEPTH_STEP})`,
                    width: "0.875rem",
                    height: "0.875rem",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {variant === "worktree" ? (
                    <FolderGit2 className="h-[0.875rem] w-[0.875rem]" />
                  ) : variant === "root" ? (
                    <FolderRoot className="h-[0.875rem] w-[0.875rem]" />
                  ) : expanded ? (
                    <FolderOpen className="h-[0.875rem] w-[0.875rem]" />
                  ) : (
                    <FolderClosed className="h-[0.875rem] w-[0.875rem]" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-[0.5rem]">
                  {/* The project's chosen colour lands HERE and nowhere else: the
                      row's hover pill, its badges and every conversation card
                      under it stay on the app theme. `folderTitleTintVars`
                      writes both themes' values as inline custom properties and
                      `.folder-title-tint` (globals.css) picks one; `inherit`
                      returns undefined and the default class carries the day. */}
                  <span
                    style={titleTint}
                    className={cn(
                      "min-w-0 flex-shrink truncate text-left text-[0.875rem] font-normal",
                      titleTint
                        ? "folder-title-tint"
                        : "text-sidebar-foreground/75"
                    )}
                  >
                    {variant === "worktree" ? (
                      // Branch as the alias, directory as the name — the same
                      // two-part label a repo header renders.
                      <FolderAliasLabel
                        name={directoryName}
                        alias={worktreeHeaderAlias(folderAlias, worktreeBranch)}
                        bracketClassName={bracketClassName}
                      />
                    ) : variant === "root" ? (
                      // The container repo's own-sessions sub-group is labeled
                      // with a fixed, non-localized "root" (its glyph is
                      // FolderRoot); it stands for the repo root regardless of
                      // UI language.
                      "root"
                    ) : (
                      <FolderAliasLabel
                        name={directoryName}
                        alias={folderAlias}
                        bracketClassName={bracketClassName}
                      />
                    )}
                  </span>
                  {/* 分支徽标（F5）：项目当前分支（git HEAD 解析结果）。非仓库或
                      未解析（null）不渲染；与下方的 amber 运行徽标区分，走中性
                      元数据配色。仅 repo 变体消费——worktree 子组的分支就是其
                      标签本身，root 子组是仓库自身会话的分组。 */}
                  {variant === "repo" &&
                  branch != null &&
                  branch.trim() !== "" ? (
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
                  {/* 远程 origin 云图标（F5）：origin 非 local 时标识来源主机。
                      当前后端只产生本地 origin，此标记在远程项目命令接入后
                      自然出现（向导见 RemoteConnectionWizard）。 */}
                  {project.origin.kind !== "local" ? (
                    <span
                      title={tProject("remoteOriginTitle", {
                        kind: project.origin.kind,
                        host: project.origin.host.id,
                      })}
                      className="inline-flex shrink-0 items-center text-muted-foreground"
                    >
                      <MonitorCloud
                        aria-hidden
                        className="h-[0.75rem] w-[0.75rem]"
                      />
                    </span>
                  ) : null}
                  {/* Live-activity badge: the number of RUNNING sessions in this
                      group, and nothing at all when none are. Amber (not the
                      primary tint the old total-count chip used) is the same
                      "running" semantic the conversation cards spin in amber, so
                      the two read as one signal. amber-700 (not the card's
                      amber-600) carries the light-mode fill: at 0.625rem this is
                      small text, and amber-600 on the tinted surface lands near
                      3:1 — under the AA floor amber-700 (~4.7:1) clears. */}
                  {runningCount > 0 && (
                    <span
                      title={t("runningCountBadge", { count: runningCount })}
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center",
                        "h-[0.9375rem] min-w-[1rem] rounded-[0.3125rem] px-[0.25rem]",
                        "text-[0.625rem] font-semibold leading-none tabular-nums",
                        "bg-amber-500/12 text-amber-700",
                        "dark:bg-amber-400/15 dark:text-amber-300"
                      )}
                    >
                      <span aria-hidden>{runningCount}</span>
                      <span className="sr-only">
                        {t("runningCountBadge", { count: runningCount })}
                      </span>
                    </span>
                  )}
                  {/* Disclosure chevron mirrors the section headers: hover-revealed,
                      rotates on expand. The persistent open/closed state still reads
                      from the folder icon on the left, which is why the chevron can
                      stay hidden at rest in BOTH states (collapsed included) — it is
                      a redundant affordance, not the only one. Touch keeps it pinned
                      on, since there is no hover to reveal it there.
                      NOTE: `group-focus-within` (not `group-focus-visible` like the
                      section header) is intentional — here the `group` is the outer
                      row wrapper and focus lands on a child (the toggle button or the
                      sibling ⋯ menu button), so the reveal must react to focus
                      anywhere inside the row. The section header's `group` IS its
                      button, so it uses `group-focus-visible`. Don't "normalize". */}
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
                  // truth — the menu has 3 submenus, duplicating it would drift).
                  // Dispatch a synthetic contextmenu event from this button; it
                  // bubbles to the enclosing <ContextMenuTrigger>, which Radix opens
                  // at the given coords — anchored just under the button.
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
                  // Shares the card action-icon palette: default /90 is the lightest
                  // muted shade clearing 3:1 non-text contrast (incl. on touch, where
                  // this stays visible); hover deepens to full foreground.
                  "rounded-[0.375rem] cursor-pointer outline-none text-muted-foreground/90",
                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                  "transition-[opacity,color] duration-150 hover:text-sidebar-foreground"
                )}
              >
                <MoreHorizontal className="h-[0.875rem] w-[0.875rem]" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onNewConversation(folderId)
                }}
                title={t("newConversation")}
                aria-label={t("newConversation")}
                className={cn(
                  // Mirrors the ⋯ button's action-icon palette and hover-reveal so
                  // the two read as one trailing control cluster. As the rightmost
                  // control it carries the right-edge margin that lines this cluster
                  // up with the other sidebar affordances: 0.375rem + the list's
                  // px-1.5 (0.375rem) = a uniform 0.75rem inset from the border,
                  // matching the section-header actions and conversation-card badges.
                  // h-6 (not h-7) keeps every action-icon centre on the same axis, and
                  // justify-end flushes the glyph to that 0.75rem edge so the visible
                  // icon — not the transparent button box — lines up with the badges.
                  "mr-[0.375rem] flex h-6 w-6 shrink-0 items-center justify-end",
                  "rounded-[0.375rem] cursor-pointer outline-none text-muted-foreground/90",
                  "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                  "transition-[opacity,color] duration-150 hover:text-sidebar-foreground"
                )}
              >
                <SquarePen className="h-[0.875rem] w-[0.875rem]" />
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
          {/* The keyboard/menu path into and out of a project group — the drag
              gesture is the fast one, but it is pointer-only, and a project
              inside a collapsed group has no drag target at all until you open
              it. Hidden on worktree / root sub-groups (no handlers passed):
              those follow their repo and can't be grouped on their own. */}
          {folderGroups != null && onMoveToGroup != null && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Layers className="h-4 w-4" />
                {t("folderGroup.moveToGroup")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-[12rem]">
                <ContextMenuItem
                  onSelect={() => onMoveToGroup(folderId, null)}
                  className="gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {t("folderGroup.removeFromGroup")}
                  </span>
                  {currentGroupId == null ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                </ContextMenuItem>
                {folderGroups.length > 0 && <ContextMenuSeparator />}
                {folderGroups.map((group) => (
                  <ContextMenuItem
                    key={group.id}
                    onSelect={() => onMoveToGroup(folderId, group.id)}
                    className="gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {group.name}
                    </span>
                    {currentGroupId === group.id ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </ContextMenuItem>
                ))}
                {onNewGroupWithFolder != null && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => onNewGroupWithFolder(folderId)}
                    >
                      <LayersPlus className="h-4 w-4" />
                      {t("folderGroup.newGroupAndMove")}
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
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

/**
 * 侧栏底部"项目 +"入口（F5 / S2.3）。菜单两项：
 * - 打开本地文件夹 → 复用 WorkspaceFolderDialog（wire 层本地命令）；
 * - 远程连接… → RemoteConnectionWizard 四步向导骨架（提交 disabled，
 *   等后端远程项目命令接入）。
 *
 * 自带两个对话框（选中菜单项时才挂载内容），挂载在 sidebar 底部固定区，
 * 不随会话列表滚动。
 */
export function ProjectTreeAddButton() {
  const t = useTranslations("ProjectTree")
  const [localDialogOpen, setLocalDialogOpen] = useState(false)
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
              // 与侧栏固定操作行（New chat / Automations / Tasks）同一几何：
              // h-8 圆角行 + 0.875rem 图标/文案 + 0.4375rem 左内距，图标中心
              // 落在与列表行相同的 0.875rem 轴上。
              "group flex h-8 w-full cursor-pointer items-center gap-[0.4375rem] rounded-full pl-[0.4375rem] pr-1.5",
              "text-[0.875rem] text-sidebar-foreground outline-none",
              "transition-colors duration-150 hover:bg-sidebar-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            <FolderPlus
              aria-hidden
              className="h-[0.875rem] w-[0.875rem] shrink-0 text-muted-foreground"
            />
            <span className="truncate">{t("addProject")}</span>
            {/* 尾缘 "+"：悬停/键盘聚焦才显现，与固定操作行的快捷键徽标同一
                reveal 规则——按钮本体已足够克制，加号只作动作预告。 */}
            <Plus
              aria-hidden
              className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuItem onSelect={() => setLocalDialogOpen(true)}>
            <FolderOpenDot className="h-3.5 w-3.5 shrink-0" />
            {t("openLocalFolder")}
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
      <RemoteConnectionWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
