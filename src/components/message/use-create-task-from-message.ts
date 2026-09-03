"use client"

import { useCallback } from "react"
import { useWorkbenchRoute } from "@/features/shell"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useTabStore } from "@/stores/tab-store"
import { requestCreateTaskFromText } from "@/lib/task-compose-events"

/**
 * "Turn this message into a work task": parks the text + source project folder
 * in the task-compose buffer and switches to the Tasks route, whose editor
 * opens pre-filled. Worktree conversations resolve to their parent project
 * folder (tasks bind to projects); chat-mode / unknown folders fall back to
 * the board's own default.
 */
export function useCreateTaskFromMessage(getText: () => string) {
  const { setRoute } = useWorkbenchRoute()
  const tabFolderId = useTabStore((s) => {
    const tab = s.rawTabs.find((t) => t.id === s.activeTabId)
    return tab?.folderId ?? null
  })

  return useCallback(() => {
    const text = getText().trim()
    if (!text) return
    const folders = useAppWorkspaceStore.getState().folders
    let folder =
      tabFolderId == null
        ? null
        : (folders.find((f) => f.id === tabFolderId) ?? null)
    if (folder?.parent_id != null) {
      folder = folders.find((f) => f.id === folder?.parent_id) ?? null
    }
    const folderId =
      folder != null && folder.parent_id == null && folder.kind === "regular"
        ? folder.id
        : null
    requestCreateTaskFromText({ text, folderId })
    setRoute("tasks")
  }, [getText, tabFolderId, setRoute])
}
