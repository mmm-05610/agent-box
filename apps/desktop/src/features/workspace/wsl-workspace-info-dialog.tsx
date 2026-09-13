import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { reconnectWslWorkspaceProjection } from '@/application/workspace/wsl-workspace-usecases'
import { Pill } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { $wslWorkspaceInfoId, $wslWorkspaces, $wslWorkspaceValidation, closeWslWorkspaceInfo } from '@/store/wsl-workspace'
import type { WslWorkspaceValidationState } from '@/store/wsl-workspace'
import type { WslWorkspaceRecord } from '@/types/workspace'

function statusView(t: ReturnType<typeof useI18n>['t'], state: WslWorkspaceValidationState | undefined) {
  const w = t.wslWorkspace

  switch (state?.status) {
    case 'validating':
      return { label: w.statusValidating, tone: 'primary' as const, spinning: true }

    case 'validated':
      return { label: w.statusValidated, tone: 'success' as const, spinning: false }

    case 'failed':
      return { label: w.statusFailed, tone: 'destructive' as const, spinning: false }

    default:
      return { label: w.statusUnverified, tone: 'muted' as const, spinning: false }
  }
}

/**
 * Connection info / reconnect entry for one saved WSL Workspace (work order
 * 35). Opened from the sidebar's remote-project row; the only place this
 * round exposes a workspace's connection — no shared connection library.
 */
export function WslWorkspaceInfoDialog() {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const infoId = useStore($wslWorkspaceInfoId)
  const workspaces = useStore($wslWorkspaces)
  const validation = useStore($wslWorkspaceValidation)
  const [userChangedSeen, setUserChangedSeen] = useState(false)

  const record: WslWorkspaceRecord | undefined = workspaces.find(workspace => workspace.id === infoId)
  const state = infoId ? validation[infoId] : undefined
  const status = statusView(t, state)

  useEffect(() => {
    setUserChangedSeen(false)
  }, [infoId])

  const reconnect = async () => {
    if (!infoId || state?.status === 'validating') {
      return
    }

    await reconnectWslWorkspaceProjection(infoId)
    setUserChangedSeen(true)
  }

  const userChanged =
    state?.status === 'validated' && state.userChanged && !userChangedSeen ? state.actualUser : null

  return (
    <Dialog onOpenChange={next => !next && closeWslWorkspaceInfo()} open={Boolean(infoId && record)}>
      <DialogContent className="max-w-md" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{record?.name ?? w.connectionInfo}</DialogTitle>
          <DialogDescription>{w.connectionInfo}</DialogDescription>
        </DialogHeader>

        {record && (
          <div className="flex flex-col gap-2 text-[0.75rem]">
            <InfoRow label={w.distributionLabel} value={record.distribution} />
            <InfoRow label={w.userLabel} value={record.configuredUser ?? w.defaultUserLabel} />
            <InfoRow label="ID" value={record.actualUser} />
            <InfoRow label={w.rootPathLabel} mono value={record.rootPath} />

            <div className="mt-1 flex items-center gap-2">
              <Pill tone={status.tone}>{status.label}</Pill>
              {status.spinning && <Codicon name="loading" size="0.75rem" spinning />}
            </div>

            {userChanged && (
              <div className="flex items-start gap-2 rounded-md bg-(--ui-control-hover-background) p-2 text-(--ui-orange, --ui-text-secondary)">
                <Codicon className="mt-0.5 shrink-0" name="warning" size="0.75rem" />
                <span>{w.userChangedWarning(userChanged)}</span>
              </div>
            )}

            <div className="text-[0.6875rem] text-(--ui-text-quaternary)">{t.wslWorkspace.sessionUnavailable}</div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => closeWslWorkspaceInfo()} type="button" variant="ghost">
            {t.common.close}
          </Button>
          <Button disabled={state?.status === 'validating' || !record} onClick={() => void reconnect()} type="button">
            <Codicon name="refresh" size="0.75rem" spinning={state?.status === 'validating'} />
            {state?.status === 'validating' ? w.reconnecting : w.reconnect}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-(--ui-text-tertiary)">{label}</span>
      <span className={mono ? 'font-mono text-[0.6875rem]' : ''}>{value}</span>
    </div>
  )
}
