"use client"

import { MonitorCloud } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useRemoteConnection } from "@/contexts/remote-connection-context"

/**
 * The workspace-stats cluster at the left end of the status bar: the
 * conversation counter, plus the remote connection name in a remote-desktop
 * window. (The Token Usage dashboard route this counter used to open was
 * removed with the v0.1 subtraction; the counter stays as plain stats.)
 */
export function StatusBarStats() {
  const t = useTranslations("Folder.statusBar.stats")
  const stats = useAppWorkspaceStore((s) => s.stats)
  // Non-null only in a remote-desktop window (a Tauri client bound to a remote
  // codeg-server); local windows have no RemoteConnection in context.
  const remoteConnection = useRemoteConnection()?.connection ?? null

  if (!remoteConnection && !stats) return null

  return (
    <div className="flex items-center gap-3">
      {remoteConnection && (
        <span
          className="flex max-w-40 items-center gap-1.5"
          // Name on the first line, service URL on the second — the same two
          // lines the tooltip used to stack.
          title={`${remoteConnection.name}\n${remoteConnection.base_url}`}
        >
          <MonitorCloud className="h-3 w-3 shrink-0" />
          <span className="truncate">{remoteConnection.name}</span>
        </span>
      )}
      {stats && (
        <span className="flex items-center gap-1.5">
          <span>
            {t("conversations", { count: stats.total_conversations })}
          </span>
        </span>
      )}
    </div>
  )
}
