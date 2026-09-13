import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { reconnectWslWorkspaceProjection, refreshWslWorkspaces } from '@/application/workspace/wsl-workspace-usecases'
import { Pill } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $wslWorkspaceInfoId, $wslWorkspaces, $wslWorkspaceValidation, openWslWorkspaceInfo } from '@/store/wsl-workspace'
import type { WslWorkspaceValidationState } from '@/store/wsl-workspace'

function statusPill(t: ReturnType<typeof useI18n>['t'], state: WslWorkspaceValidationState | undefined) {
  const w = t.wslWorkspace

  switch (state?.status) {
    case 'validating':
      return { label: w.statusValidating, tone: 'primary' as const }

    case 'validated':
      return { label: w.statusValidated, tone: 'success' as const }

    case 'failed':
      return { label: w.statusFailed, tone: 'destructive' as const }

    default:
      return { label: w.statusUnverified, tone: 'muted' as const }
  }
}

/**
 * The sidebar's remote-project projection (work order 35): one row per WSL
 * Workspace saved in the Electron host, peer to the local project rows. A row
 * shows the name, the WSL badge, the distribution and the (re)validation
 * status — never a fake online state. Its entries: connection info (this
 * workspace's private connection) and reconnect (re-verify).
 */
export function WslWorkspaceSection({ className }: { className?: string }) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const workspaces = useStore($wslWorkspaces)
  const validation = useStore($wslWorkspaceValidation)
  const infoId = useStore($wslWorkspaceInfoId)

  // The projection is a cache of the host's store: refresh on mount so a
  // reopen shows the saved rows, each starting as "not verified".
  useEffect(() => {
    void refreshWslWorkspaces()
  }, [])

  if (workspaces.length === 0) {
    return null
  }

  return (
    <div className={cn('shrink-0 px-1.5 pb-1', className)} data-wsl-workspace-section>
      <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1">
        <span className="text-[0.625rem] font-medium uppercase tracking-wide text-(--ui-text-quaternary)">
          {w.remoteSectionLabel}
        </span>
      </div>

      <div className="flex flex-col gap-px">
        {workspaces.map(workspace => {
          const state = validation[workspace.id]
          const status = statusPill(t, state)
          const validating = state?.status === 'validating'

          return (
            <div
              className={cn(
                'group/remote-row grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md',
                infoId === workspace.id && 'bg-(--ui-control-hover-background)'
              )}
              key={workspace.id}
            >
              <button
                className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-(--ui-control-hover-background)"
                onClick={() => openWslWorkspaceInfo(workspace.id)}
                type="button"
              >
                <span className="grid size-4 shrink-0 place-items-center text-(--ui-text-tertiary)">
                  <Codicon name="vm-connect" size="0.875rem" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{workspace.name}</span>
                <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)">{workspace.distribution}</span>
                <Pill tone={status.tone}>{status.label}</Pill>
                <Pill tone="muted">{w.wslBadge}</Pill>
                {validating && <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="loading" size="0.75rem" spinning />}
              </button>

              <div className="flex shrink-0 items-center self-stretch pr-1" data-row-actions>
                <Tip label={w.reconnect}>
                  <Button
                    aria-label={w.reconnect}
                    className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100"
                    disabled={validating}
                    onClick={() => void reconnectWslWorkspaceProjection(workspace.id)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Codicon name="refresh" size="0.75rem" />
                  </Button>
                </Tip>
                <Tip label={w.connectionInfo}>
                  <Button
                    aria-label={w.connectionInfo}
                    className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100"
                    onClick={() => openWslWorkspaceInfo(workspace.id)}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <Codicon name="info" size="0.75rem" />
                  </Button>
                </Tip>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
