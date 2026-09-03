"use client"

import { useWorkspaceShellStore } from "./store"
import type { WorkspaceShellState } from "./store"

export { useWorkspaceShellStore, resetWorkspaceShellStore } from "./store"
export type {
  TerminalTab,
  AuxPanelTab,
  WorkbenchRouteId,
  WorkspaceShellState,
} from "./store"
export { WorkspaceShellRuntime } from "./runtime"

/**
 * Public surface of the workspace-shell feature (F4): one zustand store
 * replacing the seven former shell React contexts. Consumers subscribe to the
 * narrowest slice they render — `useWorkspaceShell(selector)` for ad-hoc
 * slices, or the per-domain hooks below, each returning its whole slice (the
 * exact former context value shape, so a component re-renders only when that
 * domain changes, same as before).
 */

/** Narrow selector over the whole shell store. */
export function useWorkspaceShell<T>(
  selector: (state: WorkspaceShellState) => T
): T {
  return useWorkspaceShellStore(selector)
}

/** Sidebar open/width (former `useSidebarContext`). */
export function useSidebar() {
  return useWorkspaceShellStore((s) => s.sidebar)
}

/** Right aux panel (former `useAuxPanelContext`). */
export function useAuxPanel() {
  return useWorkspaceShellStore((s) => s.auxPanel)
}

/** Terminal panel + tabs (former `useTerminalContext`). */
export function useTerminal() {
  return useWorkspaceShellStore((s) => s.terminal)
}

/** Conversation search dialog open-state (former `useSearchDialog`). */
export function useSearchDialog() {
  return useWorkspaceShellStore((s) => s.searchDialog)
}

/** Automations list data layer (former `useAutomationsView`). */
export function useAutomationsView() {
  return useWorkspaceShellStore((s) => s.automationsView)
}

/** Tasks list data layer (former `useTasksView`). */
export function useTasksView() {
  return useWorkspaceShellStore((s) => s.tasksView)
}

/** Workbench route (former `useWorkbenchRoute`). */
export function useWorkbenchRoute() {
  return useWorkspaceShellStore((s) => s.workbenchRoute)
}
