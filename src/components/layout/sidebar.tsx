"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Crosshair,
  Eraser,
  Eye,
  Hash,
  ListChevronsDownUp,
  ListChevronsUpDown,
  ListFilter,
  ListTodo,
  Menu,
  MessagesSquare,
  Puzzle,
  RectangleHorizontal,
  Search,
  Settings,
  SquarePen,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActiveFolder } from "@/contexts/active-folder-context"
import {
  useSidebar,
  useSearchDialog,
  useAutomationsView,
  useTasksView,
  useWorkbenchRoute,
} from "@/features/shell"
import { openSettingsWindow } from "@/lib/api"
import { useTabActions } from "@/contexts/tab-context"
import {
  SidebarConversationList,
  type SidebarConversationListHandle,
} from "@/features/projects/components/sidebar-conversation-list"
// F5 / S2.3：项目树底部"项目 +"入口（本地文件夹 / 远程连接向导）。
import { ProjectTreeAddButton } from "@/features/projects/components/project-tree"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { useIsMac } from "@/hooks/use-is-mac"
import { usePlatform } from "@/hooks/use-platform"
import { useZoomLevel } from "@/hooks/use-appearance"
import { useShortcutSettings } from "@/hooks/use-shortcut-settings"
import { formatShortcutLabel } from "@/lib/keyboard-shortcuts"
import { isDesktop } from "@/lib/platform"
import { leftChromeReserve } from "@/lib/window-chrome"
import {
  isNavItemVisible,
  loadNavItemVisibility,
  loadShowCompleted,
  loadShowRecent,
  loadShowWorktrees,
  loadSortMode,
  loadSectionOrder,
  moveSectionInOrder,
  saveNavItemVisibility,
  saveShowCompleted,
  saveShowRecent,
  saveShowWorktrees,
  saveSortMode,
  saveSectionOrder,
  DEFAULT_SECTION_ORDER,
  SIDEBAR_NAV_ITEM_IDS,
  type SidebarNavItemId,
  type SidebarNavItemVisibility,
  type SidebarSectionId,
  type SidebarSortMode,
  type SidebarSectionOrder,
} from "@/lib/sidebar-view-mode-storage"
import { SidebarSectionOrderControl } from "./sidebar-section-order-control"
import { cn } from "@/lib/utils"

// Keyboard-shortcut hint at the trailing edge of the New chat row.
// Mirrors the folder count badge exactly — same chip (0.9375rem height,
// 0.3125rem radius, bg-primary/10, text-primary, 0.625rem text) per the request
// to match it. That pairing is also solidly legible (text-primary on
// primary/10 ≈ 14:1 light / 11:1 dark), unlike the muted-on-muted kbd it
// replaces (4.34:1). Revealed only on hover / keyboard focus of its row (each
// row is a `group`); font-mono renders the shortcut glyphs cleanly.
const SHORTCUT_BADGE_CLASS = cn(
  "ml-auto inline-flex h-[0.9375rem] shrink-0 items-center justify-center",
  "rounded-[0.3125rem] bg-primary/10 px-[0.25rem]",
  "font-mono text-[0.625rem] font-medium leading-none text-primary",
  "opacity-0 transition-opacity duration-150",
  "group-hover:opacity-100 group-focus-visible:opacity-100"
)

// Which sections the order editor should render as switched-off. Module
// constants rather than a per-render `new Set`, so the reference is stable and
// the two states are spelled out once. "Recent" is the only section with a
// visibility toggle today.
const NO_HIDDEN_SECTIONS: ReadonlySet<SidebarSectionId> = new Set()
const RECENT_HIDDEN: ReadonlySet<SidebarSectionId> = new Set(["recent"])

// Icon per optional nav row. The visibility checkboxes in the view-options menu
// carry the same glyph as the row they switch, so that group reads as a mirror
// of the nav block rather than three bare labels.
const NAV_ITEM_ICONS: Record<SidebarNavItemId, LucideIcon> = {
  automations: Zap,
  tasks: ListTodo,
}

/**
 * A fixed top-of-sidebar action / route row. `active` marks the row as the
 * current workbench route (selected styling); `trailing` carries a shortcut hint
 * or a count badge. Extracting this keeps every fixed nav item — and any future
 * route — on one geometry instead of copy-pasting the className. Each row is a
 * `group` so a `group-hover`-revealed trailing element works.
 */
function SidebarNavButton({
  icon: Icon,
  label,
  onClick,
  active,
  trailing,
  disabled = false,
  tooltip,
}: {
  icon: LucideIcon
  label: string
  /** Omitted on disabled placeholder rows (plugin marketplace). */
  onClick?: () => void
  active?: boolean
  trailing?: ReactNode
  /** Placeholder rows (plugin marketplace): greyed, inert, tooltip explains. */
  disabled?: boolean
  /** Overrides the row's `title` when it should differ from the label (the
   *  disabled marketplace row says "coming soon" instead). */
  tooltip?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 w-full items-center gap-[0.4375rem] rounded-full pl-[0.4375rem] pr-1.5",
        "text-[0.875rem] text-sidebar-foreground outline-none",
        "transition-colors duration-150 hover:bg-sidebar-accent",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        active && "bg-sidebar-primary/8",
        disabled &&
          "cursor-not-allowed text-muted-foreground/60 opacity-70 hover:bg-transparent"
      )}
    >
      <Icon
        className={cn(
          "h-[0.875rem] w-[0.875rem] shrink-0 text-muted-foreground",
          disabled && "text-muted-foreground/60"
        )}
      />
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  )
}

/**
 * One half of the ZCode-style view switcher (`# 分组 | ▭ 项目`): a compact pill
 * inside a shared track. `active` renders the `bg-accent` pressed state; the
 * inactive pill stays muted until hovered. The track owns the visual grouping,
 * so each pill only needs its own padding + radius.
 */
function SidebarViewPill({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex h-6 cursor-pointer items-center gap-1 rounded-full px-2",
        "text-[0.75rem] outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-sidebar-foreground"
      )}
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

export function Sidebar() {
  const t = useTranslations("Folder.sidebar")
  const { isOpen, toggle } = useSidebar()
  const { activeFolder } = useActiveFolder()
  const { openNewConversationTab, openChatModeTab } = useTabActions()
  const { unseenFailures } = useAutomationsView()
  const { attentionCount } = useTasksView()
  const { routeId, setRoute, openConversations } = useWorkbenchRoute()
  const { setOpen: setSearchOpen } = useSearchDialog()
  const isMac = useIsMac()
  const { isMac: platformIsMac } = usePlatform()
  const { zoomLevel } = useZoomLevel()
  const { shortcuts } = useShortcutSettings()
  const isMobile = useIsMobile()
  const listRef = useRef<SidebarConversationListHandle>(null)
  // On desktop the header's top-left is owned by the fixed window-chrome overlay
  // (sidebar toggle + remote); reserve exactly its width so the view controls
  // and drag region clear it. The reserve scales with the app zoom to track the
  // rem-sized overlay buttons. Mobile has no overlay (the sidebar is a Drawer).
  const leftReserve = leftChromeReserve(platformIsMac && isDesktop(), zoomLevel)

  // `showCompleted` defaults OFF; `showWorktrees` and `showRecent` default ON
  // (the mount effect below reconciles a persisted override). Each initial
  // value matches its own default so the pre-hydration render doesn't flash as
  // the stored preference is applied.
  const [showCompleted, setShowCompleted] = useState(false)
  const [showWorktrees, setShowWorktrees] = useState(true)
  const [showRecent, setShowRecent] = useState(true)
  // Empty = every nav row shown, which is also the hydrated default — so the
  // pre-hydration render matches for a user who never hid one.
  const [navItems, setNavItems] = useState<SidebarNavItemVisibility>({})
  const [sortMode, setSortMode] = useState<SidebarSortMode>("created")
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionOrder>(
    DEFAULT_SECTION_ORDER
  )
  const [allExpanded, setAllExpanded] = useState(true)
  const newConversationShortcutLabel = formatShortcutLabel(
    shortcuts.new_conversation,
    isMac
  )
  const searchShortcutLabel = formatShortcutLabel(
    shortcuts.toggle_search,
    isMac
  )
  // General umbrella name for the eye menu (list toggles + nav rows + sort +
  // section order). Kept generic so the accessible name / tooltip stays
  // accurate as the menu gains options.
  const viewOptionsLabel = t("viewOptions")
  // 底部账户行：占位用户名（头像圆标取其首字母）。
  const localUserLabel = t("localUser")
  const toggleExpandLabel = allExpanded
    ? t("collapseAllGroups")
    : t("expandAllGroups")
  const hiddenSections = showRecent ? NO_HIDDEN_SECTIONS : RECENT_HIDDEN

  useEffect(() => {
    // Hydrate from localStorage after mount to keep SSR/CSR markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowCompleted(loadShowCompleted())
    setShowWorktrees(loadShowWorktrees())
    setShowRecent(loadShowRecent())
    setNavItems(loadNavItemVisibility())
    setSortMode(loadSortMode())
    setSectionOrder(loadSectionOrder())
  }, [])

  const handleSetShowCompleted = useCallback((value: boolean) => {
    setShowCompleted(value)
    saveShowCompleted(value)
  }, [])

  const handleSetShowWorktrees = useCallback((value: boolean) => {
    setShowWorktrees(value)
    saveShowWorktrees(value)
  }, [])

  const handleSetShowRecent = useCallback((value: boolean) => {
    setShowRecent(value)
    saveShowRecent(value)
  }, [])

  const handleSetNavItem = useCallback(
    (id: SidebarNavItemId, visible: boolean) => {
      setNavItems((prev) => {
        const next = { ...prev, [id]: visible }
        saveNavItemVisibility(next)
        return next
      })
    },
    []
  )

  const handleSetSortMode = useCallback((value: string) => {
    const mode: SidebarSortMode = value === "updated" ? "updated" : "created"
    setSortMode(mode)
    saveSortMode(mode)
  }, [])

  // Nudge one section up/down a slot. `moveSectionInOrder` returns the SAME
  // array when the move would fall off an end, so a clamped nudge neither
  // re-renders the list nor rewrites localStorage.
  const handleMoveSection = useCallback(
    (id: SidebarSectionId, delta: number) => {
      setSectionOrder((prev) => {
        const next = moveSectionInOrder(prev, id, delta)
        if (next !== prev) saveSectionOrder(next)
        return next
      })
    },
    []
  )

  const handleToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      listRef.current?.collapseAll()
      setAllExpanded(false)
    } else {
      listRef.current?.expandAll()
      setAllExpanded(true)
    }
  }, [allExpanded])

  const handleNewConversation = useCallback(() => {
    // On mobile the sidebar is a Drawer overlay — close it so the new
    // conversation is visible (mirrors tapping a conversation card, which the
    // list wrapper already closes on).
    if (isMobile) toggle()
    // Starting a conversation always returns to the conversation workspace (in
    // case a route like Automations was taking over the content region).
    openConversations()
    // Defense-in-depth: with no active folder (e.g. a cold start that recovered
    // to nothing, or all folders closed) fall back to folderless chat mode
    // rather than no-op, so this entry point is never a dead end.
    if (!activeFolder) {
      openChatModeTab()
      return
    }
    openNewConversationTab(activeFolder.id, activeFolder.path)
  }, [
    activeFolder,
    openChatModeTab,
    openNewConversationTab,
    openConversations,
    isMobile,
    toggle,
  ])

  // 搜索（Ctrl+K）：打开既有的会话搜索对话框（workspace-shell store 的
  // searchDialog slice — 对话框本体由 workspace-chrome-controller 挂载，
  // ⌘K 快捷键同走这里，所以收起侧栏也不影响）。
  const handleOpenSearch = useCallback(() => {
    setSearchOpen(true)
  }, [setSearchOpen])

  // “分组”视图本期限留视觉位：点击只提示“即将上线”，不切换（实现成本最低
  // 的二选一；按状态分组的平铺列表留待后端聚合接口）。
  const handleGroupViewClick = useCallback(() => {
    toast.info(t("comingSoon"))
  }, [t])

  // 底部账户行的设置齿轮：打开既有设置窗口（openSettingsWindow）。
  const handleOpenSettings = useCallback(() => {
    openSettingsWindow().catch((err) => {
      console.error("[Sidebar] failed to open settings:", err)
    })
  }, [])

  // 任务空态 → tasks 路由（移动端先收起 Drawer，与其它入口一致）。
  const handleOpenTasks = useCallback(() => {
    if (isMobile) toggle()
    setRoute("tasks")
  }, [isMobile, setRoute, toggle])

  if (!isOpen) return null

  return (
    <aside className="@container/sidebar flex h-full min-h-0 flex-col overflow-hidden text-sidebar-foreground select-none">
      <div
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 pr-2",
          // Desktop: the fixed left window-chrome overlay (reserved below) owns
          // the top-left, so drop the header's own left padding. Off-image the
          // divider is border-border/50, matching the conversation / file detail
          // headers. But the sidebar sits on a FROSTED surface (ws-surface-sidebar)
          // while those headers sit on the transparent canvas: with a workspace
          // background image on, a border-border/50 hairline washes out against the
          // frosted shade, so it takes the boosted `ws-chrome-border` (like the
          // frosted status bar) to stay legible. Mobile (Drawer): keep the original
          // title padding + a full-strength divider — mobile is unchanged.
          isMobile
            ? "border-b border-border pl-4"
            : "border-b border-border/50 ws-chrome-border pl-0"
        )}
      >
        {isMobile ? (
          <div className="flex min-w-0 items-center gap-4">
            <h2 className="truncate text-[0.875rem] font-bold tracking-[-0.00625rem] text-sidebar-foreground">
              {t("title")}
            </h2>
          </div>
        ) : (
          // Reserve exactly the fixed left overlay's width so the view controls
          // clear it; the empty reserved space is a window-drag region.
          <div
            data-tauri-drag-region
            className="h-full shrink-0"
            style={{ width: leftReserve }}
          />
        )}
        {/* Draggable filler between the two clusters — the header is the
            window's top edge, so its empty space must move the window. */}
        <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
        <div className="flex items-center gap-0.5">
          {/* Locate the active conversation in the list below (moved here from
              the conversation detail header). Always shown, leading the header
              cluster. The sidebar is unmounted while collapsed, so `listRef` is
              live whenever this button is visible. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            onClick={() => listRef.current?.scrollToActive()}
            title={t("locateActiveConversation")}
            aria-label={t("locateActiveConversation")}
          >
            <Crosshair aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
          {/* Expand/collapse-all is an icon-only header button on every
              viewport (it used to be a labelled row inside the view-options
              menu on desktop): it acts on the list right now instead of storing
              a display preference, so it does not belong among that menu's
              settings rows — and it took two clicks there. The icon itself
              states the direction, hence label-free with a tooltip. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            onClick={handleToggleExpandAll}
            title={toggleExpandLabel}
            aria-label={toggleExpandLabel}
          >
            {allExpanded ? (
              <ListChevronsDownUp aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <ListChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground"
                title={viewOptionsLabel}
                aria-label={viewOptionsLabel}
              >
                {/* An eye, not a funnel: nothing in this menu filters the list
                    down to matches — every option decides what is shown and in
                    what order. */}
                <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {/* Wider than the shared `min-w-48`: the section-order rows carry a
                position chip and two move buttons beside the name, and the menu
                clips overflow-x — 48 would start truncating longer localized
                section names. */}
            <DropdownMenuContent align="end" className="min-w-56">
              {/* Four groups: what the list shows → which nav rows exist → how
                  the list is sorted → how its sections are stacked. The first
                  two are hover-opened submenus rather than inline blocks: they
                  are set-and-forget on/off inventories, six checkboxes between
                  them, and inlining all six left a fifteen-row menu with Sort
                  by / Section order — the two settings people actually come
                  back for — stranded at the bottom of it. Those two stay
                  inline: a pair of radios and a ranked list read wrong behind
                  another hop, and the order rows need this menu's width.
                  Every option keeps the menu open on select (the default is to
                  close): this menu is a settings panel, not a command list, and
                  flipping two of them used to cost two round trips through the
                  trigger. The one action it used to carry — expand/collapse
                  all — is now a header button of its own. */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MessagesSquare className="text-muted-foreground" />
                  {t("listOptions")}
                </DropdownMenuSubTrigger>
                {/* No width override: unlike the root content — held at exactly
                    `min-w-56` and clipping overflow-x — the sub-content grows to
                    fit its rows, which is the headroom these three (the longest
                    labels in the menu) want. */}
                <DropdownMenuSubContent>
                  <DropdownMenuCheckboxItem
                    checked={showCompleted}
                    onCheckedChange={handleSetShowCompleted}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t("showCompleted")}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showWorktrees}
                    onCheckedChange={handleSetShowWorktrees}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t("showWorktrees")}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showRecent}
                    onCheckedChange={handleSetShowRecent}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t("showRecent")}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Menu className="text-muted-foreground" />
                  {t("navigationItems")}
                </DropdownMenuSubTrigger>
                {/* Driven by the id list itself, so a route added there can
                    never ship a row without its toggle. Each id doubles as its
                    message key. Hiding one only drops the sidebar shortcut: the
                    status bar's quick-actions menu still reaches every route, so
                    no choice here can strand the user on a page. */}
                <DropdownMenuSubContent>
                  {SIDEBAR_NAV_ITEM_IDS.map((id) => {
                    const Icon = NAV_ITEM_ICONS[id]
                    return (
                      <DropdownMenuCheckboxItem
                        key={id}
                        checked={isNavItemVisible(navItems, id)}
                        onCheckedChange={(value) => handleSetNavItem(id, value)}
                        onSelect={(event) => event.preventDefault()}
                      >
                        <Icon className="text-muted-foreground" />
                        {t(id)}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("sortBy")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortMode}
                onValueChange={handleSetSortMode}
              >
                <DropdownMenuRadioItem
                  value="created"
                  onSelect={(event) => event.preventDefault()}
                >
                  {t("sortByCreatedAt")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="updated"
                  onSelect={(event) => event.preventDefault()}
                >
                  {t("sortByUpdatedAt")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("sectionOrder")}</DropdownMenuLabel>
              <SidebarSectionOrderControl
                order={sectionOrder}
                onMove={handleMoveSection}
                hiddenSections={hiddenSections}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Fixed actions above the scrollable list. `shrink-0` keeps them pinned —
          they never scroll with the conversation list. Rows are `rounded-full`
          like the conversation pills, and the icon/text geometry matches the
          folder header: a 0.875rem icon + 0.875rem label at a 0.4375rem gap, with
          the row's pl-[0.4375rem] (atop the container's px-1.5) placing the icon
          center on the same 0.875rem rail axis as the folder/conversation icons in
          the list below. Each row is a `group` so its shortcut hint reveals on
          hover / keyboard focus. */}
      <div className="flex shrink-0 flex-col gap-0.5 px-1.5 pt-1.5">
        <SidebarNavButton
          icon={SquarePen}
          label={t("newChat")}
          onClick={handleNewConversation}
          trailing={
            newConversationShortcutLabel ? (
              <kbd className={SHORTCUT_BADGE_CLASS}>
                {newConversationShortcutLabel}
              </kbd>
            ) : null
          }
        />
        {/* 搜索（ZCode 布局回到固定导航区，Ctrl+K）：打开既有搜索对话框。
            对话框本体与 ⌘K 全局快捷键仍由 workspace-chrome-controller 持有，
            侧栏收起时搜索依然可达。 */}
        <SidebarNavButton
          icon={Search}
          label={t("search")}
          onClick={handleOpenSearch}
          trailing={
            searchShortcutLabel ? (
              <kbd className={SHORTCUT_BADGE_CLASS}>{searchShortcutLabel}</kbd>
            ) : null
          }
        />
        {/* Each route row can be switched off from the view-options menu's
            "Navigation items" group — for a workspace that never uses one of
            them, this block is pure noise above the list. The routes stay
            reachable from the status bar's quick-actions menu either way.
            All three close the mobile Drawer on the way out, like tapping a
            conversation card (handled by the list wrapper below) — otherwise the
            page they just opened stays hidden behind the sidebar. */}
        {isNavItemVisible(navItems, "automations") && (
          <SidebarNavButton
            icon={Zap}
            label={t("automations")}
            active={routeId === "automations"}
            onClick={() => {
              if (isMobile) toggle()
              setRoute("automations")
            }}
            trailing={
              unseenFailures > 0 ? (
                <span className="ml-auto inline-flex h-[0.9375rem] min-w-[0.9375rem] shrink-0 items-center justify-center rounded-full bg-destructive/15 px-1 font-mono text-[0.625rem] font-medium leading-none text-destructive">
                  {unseenFailures}
                </span>
              ) : null
            }
          />
        )}
        {/* 插件市场（ZCode 布局占位）：置灰 + “即将上线” tooltip，无功能。 */}
        <SidebarNavButton
          icon={Puzzle}
          label={t("pluginMarketplace")}
          tooltip={t("comingSoon")}
          disabled
        />
        {/* 视图切换排（ZCode 布局）：`# 分组 | ▭ 项目` 两个 pill + 右侧筛选/
            清理图标占位。默认激活“项目”；“分组”本期限留视觉位（点击提示
            即将上线）。 */}
        <div className="mt-1.5 flex h-7 items-center justify-between gap-1">
          <div className="flex items-center gap-0.5 rounded-full bg-sidebar-accent/50 p-0.5">
            <SidebarViewPill
              icon={Hash}
              label={t("groupView")}
              active={false}
              onClick={handleGroupViewClick}
            />
            <SidebarViewPill
              icon={RectangleHorizontal}
              label={t("projectView")}
              active
              onClick={() => {}}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="h-6 w-6 shrink-0 text-muted-foreground"
              title={t("comingSoon")}
              aria-label={t("comingSoon")}
            >
              <ListFilter aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="h-6 w-6 shrink-0 text-muted-foreground"
              title={t("comingSoon")}
              aria-label={t("comingSoon")}
            >
              <Eraser aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* On mobile, clicking a conversation card auto-closes the Drawer */}
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden pt-1.5"
        onClick={
          isMobile
            ? (e) => {
                const target = e.target as HTMLElement
                if (target.closest("[data-conversation-id]")) {
                  toggle()
                }
              }
            : undefined
        }
      >
        <SidebarConversationList
          ref={listRef}
          showCompleted={showCompleted}
          showWorktrees={showWorktrees}
          showRecent={showRecent}
          sortMode={sortMode}
          sectionOrder={sectionOrder}
        />
      </div>

      {/* 任务区（ZCode 布局）：小节标题 + “还没有任务”空态入口（tasks 路由）。
          保留 view-options 菜单里既有的 nav visibility 开关控制整节显隐；
          有待处理任务时标题旁沿用原 nav 行的 primary 关注徽标。不随列表滚动。 */}
      {isNavItemVisible(navItems, "tasks") && (
        <div className="shrink-0 px-1.5">
          <div className="flex items-center gap-1 px-[0.4375rem] pb-1 pt-1.5">
            <span className="text-xs text-muted-foreground">{t("tasks")}</span>
            {attentionCount > 0 && (
              <span className="inline-flex h-[0.9375rem] min-w-[0.9375rem] shrink-0 items-center justify-center rounded-full bg-primary/10 px-1 font-mono text-[0.625rem] font-medium leading-none text-primary">
                {attentionCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenTasks}
            className={cn(
              "flex h-7 w-full cursor-pointer items-center rounded-full px-[0.4375rem]",
              "text-xs text-muted-foreground outline-none",
              "transition-colors duration-150 hover:bg-sidebar-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            )}
          >
            <span className="truncate">{t("noTasksYet")}</span>
          </button>
        </div>
      )}

      {/* 项目树固定底栏（F5 / S2.3）："项目 +" 入口——打开本地文件夹（既有
          对话框）/ 远程连接…（向导骨架）。不随列表滚动。 */}
      <div className="shrink-0 px-1.5 pb-1.5 pt-1.5">
        <ProjectTreeAddButton />
      </div>

      {/* 底部账户行（ZCode 布局，sticky 底部）：圆形头像占位（本地用户首字母）
          + 用户名 + 设置齿轮（打开既有设置窗口）。 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-border/50 px-2.5 ws-chrome-border">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.625rem] font-semibold uppercase leading-none text-primary"
        >
          {localUserLabel.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-sidebar-foreground">
          {localUserLabel}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground"
          onClick={handleOpenSettings}
          title={t("settings")}
          aria-label={t("settings")}
        >
          <Settings aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  )
}
