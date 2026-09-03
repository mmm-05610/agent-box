"use client"

import { useCallback } from "react"
import {
  GitBranch,
  PanelLeft,
  PanelRight,
  Search,
  Settings,
  SquareTerminal,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { openSettingsWindow } from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import { isDesktop } from "@/lib/platform"
import { Button } from "@/components/ui/button"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useWorkspaceShell } from "@/features/shell"
import { useTabStore } from "@/stores/tab-store"
import { WorkbenchRouteChromeActions } from "@/components/workbench/workbench-content"
import { WindowControls } from "@/components/layout/window-controls"
import { useIsActiveChatMode } from "@/hooks/use-is-active-chat-mode"
import { useIsMac } from "@/hooks/use-is-mac"
import { usePlatform } from "@/hooks/use-platform"
import { useShortcutSettings } from "@/hooks/use-shortcut-settings"
import { useZoomLevel } from "@/hooks/use-appearance"
import { formatShortcutLabel } from "@/lib/keyboard-shortcuts"
import { MAC_TRAFFIC_LIGHT_INSET } from "@/lib/window-chrome"

const GHOST_BUTTON =
  "h-6 w-6 hover:bg-foreground/10 hover:text-foreground/80 dark:hover:bg-foreground/10"

/**
 * The window's single top strip (ZCode-style shell, D-004): everything that
 * used to live in the pinned corner overlays (LeftEdgeChrome /
 * RightEdgeChrome / standalone WindowControls) plus the session context —
 * `project › session` and the active branch — in one draggable band.
 *
 * Single-session main area (D-005) is what makes this possible: with no tab
 * strip competing for the top edge, the context band and the window buttons
 * can share one row. The center block is intentionally centered (ZCode's
 * look) rather than left-aligned; the clusters on both ends stay fixed.
 *
 * macOS traffic lights carve their inset out of the leading edge; on
 * Windows/Linux the caption buttons sit at the trailing edge (WindowControls
 * self-nulls elsewhere, and web mode gets no caption buttons at all).
 */
export function TopBar() {
  const t = useTranslations("Folder.folderTitleBar")
  // Narrow selectors (F4): the bar only paints booleans, so it re-renders on
  // none of the store's list churn (terminal tabs, automations, tasks).
  const sidebarOpen = useWorkspaceShell((s) => s.sidebar.isOpen)
  const toggleSidebar = useWorkspaceShell((s) => s.sidebar.toggle)
  const setSearchOpen = useWorkspaceShell((s) => s.searchDialog.setOpen)
  const { activeFolder } = useActiveFolder()
  const isChatMode = useIsActiveChatMode()
  const isConversations = useWorkspaceShell(
    (s) => s.workbenchRoute.isConversations
  )
  const auxPanelOpen = useWorkspaceShell((s) => s.auxPanel.isOpen)
  const toggleAuxPanel = useWorkspaceShell((s) => s.auxPanel.toggle)
  const terminalOpen = useWorkspaceShell((s) => s.terminal.isOpen)
  const toggleTerminal = useWorkspaceShell((s) => s.terminal.toggle)
  const isMac = useIsMac()
  const { isMac: platformIsMac } = usePlatform()
  const { shortcuts } = useShortcutSettings()
  const { zoomLevel } = useZoomLevel()

  // The focused session's title (null while the workspace shows the empty
  // state). The derive keeps the same reference between title changes, so this
  // subscription only fires when the rendered text would change.
  const sessionTitle = useTabStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId)
    return active ? active.title : null
  })
  // Display branch for the focused folder (null until the git-head poll
  // resolves, and on non-repo folders).
  const branch = useAppWorkspaceStore((s) =>
    s.activeFolderId == null ? null : (s.branches.get(s.activeFolderId) ?? null)
  )

  const handleOpenSettings = useCallback(() => {
    openSettingsWindow().catch((err) => {
      toast.error(toErrorMessage(err))
    })
  }, [])

  // The traffic lights only exist on the macOS desktop runtime.
  const showMacInset = platformIsMac && isDesktop()

  return (
    <div className="relative flex h-10 shrink-0 items-stretch bg-muted ws-transparent-bg">
      {showMacInset && (
        <div
          data-tauri-drag-region
          className="h-full shrink-0"
          style={{ width: MAC_TRAFFIC_LIGHT_INSET * (zoomLevel || 1) }}
        />
      )}

      {/* Left cluster: chrome toggles that must survive the sidebar collapsing. */}
      <div className="flex shrink-0 items-center gap-1 pl-3">
        <Button
          variant="ghost"
          size="icon"
          className={GHOST_BUTTON}
          onClick={toggleSidebar}
          title={t("withShortcut", {
            label: t(sidebarOpen ? "hideSidebar" : "showSidebar"),
            shortcut: formatShortcutLabel(shortcuts.toggle_sidebar, isMac),
          })}
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={GHOST_BUTTON}
          onClick={() => setSearchOpen(true)}
          title={t("withShortcut", {
            label: t("search"),
            shortcut: formatShortcutLabel(shortcuts.toggle_search, isMac),
          })}
          aria-label={t("search")}
        >
          <Search aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Center: `project › session` + branch. The whole block is a window-drag
          region; only the text truncates. Falls back to the project alone (or
          nothing on a truly blank workspace). */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center px-3"
      >
        {activeFolder || sessionTitle ? (
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {activeFolder && (
              <span className="truncate text-muted-foreground">
                {activeFolder.name}
              </span>
            )}
            {activeFolder && sessionTitle && (
              <span aria-hidden className="text-muted-foreground/50">
                ›
              </span>
            )}
            {sessionTitle && (
              <span className="truncate font-medium text-foreground">
                {sessionTitle}
              </span>
            )}
            {branch && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" aria-hidden />
                {branch}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Right cluster: terminal/aux (conversations only — full-page routes
          swap in their own page actions), then settings. Caption buttons trail
          on Windows/Linux. */}
      <div className="flex shrink-0 items-center gap-1 pr-3">
        {isConversations && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={`${GHOST_BUTTON} ${terminalOpen ? "bg-accent" : ""}`}
              onClick={() => toggleTerminal()}
              disabled={!activeFolder}
              title={t("withShortcut", {
                label: t("toggleTerminal"),
                shortcut: formatShortcutLabel(shortcuts.toggle_terminal, isMac),
              })}
            >
              <SquareTerminal className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`${GHOST_BUTTON} ${auxPanelOpen ? "bg-accent" : ""}`}
              onClick={toggleAuxPanel}
              disabled={!activeFolder && !isChatMode}
              title={t("withShortcut", {
                label: t("toggleAuxPanel"),
                shortcut: formatShortcutLabel(
                  shortcuts.toggle_aux_panel,
                  isMac
                ),
              })}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <WorkbenchRouteChromeActions
          buttonClassName={GHOST_BUTTON}
          iconClassName="h-3.5 w-3.5"
        />
        <Button
          variant="ghost"
          size="icon"
          className={GHOST_BUTTON}
          onClick={handleOpenSettings}
          title={t("withShortcut", {
            label: t("openSettings"),
            shortcut: formatShortcutLabel(shortcuts.open_settings, isMac),
          })}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>

      <WindowControls />
    </div>
  )
}
