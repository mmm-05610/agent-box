"use client"

import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { terminalKill } from "@/lib/api"
import { matchShortcutEvent } from "@/lib/keyboard-shortcuts"
import { useShortcutSettings } from "@/hooks/use-shortcut-settings"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useWorkspaceShellStore, setTasksNotifier } from "./store"
import {
  startAutomationsSync,
  startTasksSync,
  startTerminalSettingsSync,
} from "./events"

/**
 * Headless runtime controller for the workspace-shell store (F4). Everything
 * the seven former shell providers did in mount effects lives here, so the
 * store itself stays free of React lifecycle and transport wiring. Rendered
 * once by the workspace layout; renders nothing.
 *
 * Order matters within the mount pass: the tasks notifier must be registered
 * before `startTasksSync()` fires the initial fetch, so the first fetch's
 * history diff (which never notifies) and every later flip notification share
 * the same translator path — effects run top-to-bottom, matching the provider
 * stack's old ordering.
 */
export function WorkspaceShellRuntime() {
  // Persisted panel state (open/width) hydrates AFTER mount, exactly like the
  // old providers' effects: hydrating during the first render would mismatch
  // the prerendered (server-default) markup. Also flips the `restored` flags,
  // which gate the panel slide animations off for this initial adoption.
  useEffect(() => {
    useWorkspaceShellStore.getState().hydratePersistedPanels()
  }, [])

  // Reset the aux panel's pending file-tree reveal when the active folder
  // changes; file tree state is content-driven by the workspace contexts and
  // will refetch naturally via its folder-path dependency.
  const activeFolderId = useAppWorkspaceStore((s) => s.activeFolderId)
  useEffect(() => {
    useWorkspaceShellStore.getState().auxPanel.consumePendingRevealPath()
  }, [activeFolderId])

  // Latest-ref translator for task-flip notifications (locale-aware; a store
  // can't call useTranslations). Registered before the sync effects below.
  const t = useTranslations("Tasks")
  useEffect(() => {
    setTasksNotifier((key, values) => t(key, values))
  }, [t])

  // Always-mounted realtime wiring: automations + tasks lists (sidebar badges)
  // and the system terminal-shell setting.
  useEffect(() => startAutomationsSync(), [])
  useEffect(() => startTasksSync(), [])
  useEffect(() => startTerminalSettingsSync(), [])

  // Terminal input-region tracking + in-terminal hotkeys (the former
  // TerminalProvider listeners). The region test matches the marker attribute
  // TerminalPanel sets on its wrapper.
  const { shortcuts } = useShortcutSettings()
  const terminalIsOpen = useWorkspaceShellStore((s) => s.terminal.isOpen)
  const activeTerminalTabId = useWorkspaceShellStore(
    (s) => s.terminal.activeTabId
  )
  const lastMouseActivityInTerminalRef = useRef(false)

  const isInTerminalRegion = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest('[data-terminal-panel-region="true"]'))

  useEffect(() => {
    const updateLastMouseActivity = (target: EventTarget | null) => {
      lastMouseActivityInTerminalRef.current = isInTerminalRegion(target)
    }
    const handlePointerActivity = (event: PointerEvent) => {
      updateLastMouseActivity(event.target)
    }
    const handleFocusActivity = (event: FocusEvent) => {
      updateLastMouseActivity(event.target)
    }

    window.addEventListener("pointerover", handlePointerActivity, true)
    window.addEventListener("pointerdown", handlePointerActivity, true)
    window.addEventListener("focusin", handleFocusActivity, true)
    return () => {
      window.removeEventListener("pointerover", handlePointerActivity, true)
      window.removeEventListener("pointerdown", handlePointerActivity, true)
      window.removeEventListener("focusin", handleFocusActivity, true)
    }
  }, [])

  useEffect(() => {
    if (!terminalIsOpen) {
      lastMouseActivityInTerminalRef.current = false
    }
  }, [terminalIsOpen])

  useEffect(() => {
    if (!terminalIsOpen) return

    const handleTerminalHotkeys = (event: KeyboardEvent) => {
      const targetInTerminal = isInTerminalRegion(event.target)
      const activeElementInTerminal = isInTerminalRegion(document.activeElement)
      const shouldHandle =
        lastMouseActivityInTerminalRef.current ||
        targetInTerminal ||
        activeElementInTerminal
      if (!shouldHandle) return

      const terminal = useWorkspaceShellStore.getState().terminal
      if (matchShortcutEvent(event, shortcuts.new_terminal_tab)) {
        event.preventDefault()
        event.stopPropagation()
        void terminal.createTerminal()
        return
      }

      if (
        activeTerminalTabId &&
        matchShortcutEvent(event, shortcuts.close_current_terminal_tab)
      ) {
        event.preventDefault()
        event.stopPropagation()
        terminal.closeTerminal(activeTerminalTabId)
      }
    }

    window.addEventListener("keydown", handleTerminalHotkeys, true)
    return () => {
      window.removeEventListener("keydown", handleTerminalHotkeys, true)
    }
  }, [
    terminalIsOpen,
    activeTerminalTabId,
    shortcuts.close_current_terminal_tab,
    shortcuts.new_terminal_tab,
  ])

  // Kill every live terminal when the workspace unmounts — reading the store
  // at teardown time replaces the old tabsRef dance with the same freshness.
  useEffect(() => {
    return () => {
      const { tabs } = useWorkspaceShellStore.getState().terminal
      tabs.forEach((tab) => {
        terminalKill(tab.id).catch(() => {})
      })
    }
  }, [])

  return null
}
