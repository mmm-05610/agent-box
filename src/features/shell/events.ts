"use client"

import { subscribe, onTransportReconnect } from "@/lib/platform"
import { getSystemTerminalSettings } from "@/lib/api"
import { getTransport } from "@/core/transport"
import { useWorkspaceShellStore, setTerminalDefaultShell } from "./store"

const AUTOMATION_CHANGED_EVENT = "automation://changed"
const WORK_TASK_CHANGED_EVENT = "task://changed"
const TERMINAL_SETTINGS_UPDATED_EVENT = "app://terminal-settings-updated"

/**
 * Realtime wiring for the shell store (the former providers' subscribe
 * effects), per the architecture rule that each feature owns its event
 * subscriptions. Each `start*Sync` does the initial fetch plus the backend
 * event subscription, and returns a dispose function. The runtime controller
 * (`./runtime.tsx`) mounts them once, always-mounted, so the sidebar badges
 * stay live regardless of which route is showing.
 */

export function startAutomationsSync(): () => void {
  const refetch = () =>
    void useWorkspaceShellStore.getState().automationsView.refetch()

  void refetch()
  let unsub: (() => void) | undefined
  let cancelled = false
  void subscribe(AUTOMATION_CHANGED_EVENT, refetch).then((u: () => void) => {
    if (cancelled) u()
    else unsub = u
  })
  // Events fired while the WS was disconnected are dropped by the broadcaster
  // (receiver_count == 0); re-fetch on reconnect so a run that settled during
  // the gap doesn't leave the list stale. No-op on desktop IPC.
  const offReconnect = onTransportReconnect(refetch)
  return () => {
    cancelled = true
    unsub?.()
    offReconnect?.()
  }
}

export function startTasksSync(): () => void {
  const refetch = () =>
    void useWorkspaceShellStore.getState().tasksView.refetch()

  void refetch()
  let unsub: (() => void) | undefined
  let cancelled = false
  void subscribe(WORK_TASK_CHANGED_EVENT, refetch).then((u: () => void) => {
    if (cancelled) u()
    else unsub = u
  })
  // Events fired while the WS was disconnected are dropped by the
  // broadcaster; refetch on reconnect so a task that settled during the gap
  // doesn't leave the board stale. No-op on desktop IPC.
  const offReconnect = onTransportReconnect(refetch)
  return () => {
    cancelled = true
    unsub?.()
    offReconnect?.()
  }
}

/** Loads the system default terminal shell and keeps it live on the
 *  `app://terminal-settings-updated` push (the former TerminalProvider
 *  effect). The value is an input to terminal creation, never rendered, so it
 *  lives as a module-level ref inside the store module rather than state. */
export function startTerminalSettingsSync(): () => void {
  let cancelled = false
  let unlisten: (() => void) | undefined

  getSystemTerminalSettings()
    .then((settings) => {
      if (!cancelled) setTerminalDefaultShell(settings.default_shell)
    })
    .catch((err) => {
      console.error("[terminal] load terminal settings failed:", err)
    })

  getTransport()
    .subscribe<{ default_shell: string | null }>(
      TERMINAL_SETTINGS_UPDATED_EVENT,
      (settings) => {
        setTerminalDefaultShell(settings.default_shell)
      }
    )
    .then((dispose) => {
      if (cancelled) {
        dispose()
        return
      }
      unlisten = dispose
    })
    .catch((err) => {
      console.error("[terminal] subscribe terminal settings failed:", err)
    })

  return () => {
    cancelled = true
    unlisten?.()
  }
}
