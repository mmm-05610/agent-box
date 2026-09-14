import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { wireCapability } from '@/api/wire-v1-client'
import { cancelWslOperation, connectWsl, discoverWsl } from '@/api/workspace'
import { createLatestWins } from '@/application/workspace/latest-wins'
import { wireAgentBoxWorkspaceBrowserPort } from '@/application/workspace/wire-workspace-browser'
import { releaseWizardConnection, saveWslWorkspaceFromWizard } from '@/application/workspace/wsl-workspace-usecases'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentBoxWorkspaceBrowser } from '@/features/workspace/agentbox-workspace-browser'
import { wslFailureText as failureText } from '@/features/workspace/wsl-failure-text'
import { useI18n } from '@/i18n'
import { $agentBoxHello, $agentBoxService } from '@/store/agentbox-service'
import { selectWorkspaceView } from '@/store/workspace-view'
import { $wslWorkspaceWizardOpen, closeWslWorkspaceWizard } from '@/store/wsl-workspace'
import type { EnvironmentIdentity } from '@/types/wire/wire-v1'
import type { WslDistributionInfo, WslWorkspaceErrorCode } from '@/types/workspace'

type Step = 'config' | 'browse'

type DiscoveryState =
  | { kind: 'loading' }
  | { kind: 'ready'; distributions: WslDistributionInfo[]; defaultDistribution: null | string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; code: WslWorkspaceErrorCode | null }

const CONFIG_RESOLVE_UNSUPPORTED = 'CAPABILITY_NOT_DECLARED'

/**
 * The round-36 WSL connection wizard, mounted once in the workspace sidebar:
 * distribution (default preselected) and an optional Linux user → connect and
 * browse the real Linux tree → picking a directory saves and opens the
 * workspace. There is no method-selection page (only WSL exists this round)
 * and no separate connecting page — connecting is a loading state on the same
 * page, with cancel, typed errors and retry. A cancelled wizard persists
 * nothing, and a failed save keeps the selection for retry.
 *
 * The host owns discovery and the verified connection; DIRECTORY LISTING is the
 * AgentBox service's job (workspaces.browse), never the host's. Without a ready
 * service that declares the method the wizard offers nothing rather than
 * falling back to host enumeration.
 */
export function WslWorkspaceWizard() {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const open = useStore($wslWorkspaceWizardOpen)
  const service = useStore($agentBoxService)
  const hello = useStore($agentBoxHello)

  const [step, setStep] = useState<Step>('config')
  const [discovery, setDiscovery] = useState<DiscoveryState>({ kind: 'loading' })
  const [distribution, setDistribution] = useState('')
  const [user, setUser] = useState('')
  const [connectionId, setConnectionId] = useState<null | string>(null)
  const [connectError, setConnectError] = useState<WslWorkspaceErrorCode | null>(null)
  const [connecting, setConnecting] = useState(false)
  // The identity the host verified and the home directory it proved: the
  // service browses THAT environment, starting where the host left off.
  const [target, setTarget] = useState<null | { environment: EnvironmentIdentity; initialPath: string }>(null)

  const connectOperation = useRef<null | string>(null)
  const saveTurns = useRef(createLatestWins())
  const browserPort = useMemo(() => wireAgentBoxWorkspaceBrowserPort(agentBoxRuntimeClient()), [])

  // Browsing is only offered when the service is usable AND declares the
  // method. Absence is reported, never replaced by host enumeration.
  const browseCapability = hello ? wireCapability(hello, 'workspaces.browse') : null
  const browseSupported = service.phase === 'ready' && Boolean(browseCapability?.supported)
  const browseReason = browseCapability?.reason || CONFIG_RESOLVE_UNSUPPORTED

  const runDiscovery = useCallback(async () => {
    setDiscovery({ kind: 'loading' })

    const result = await discoverWsl()

    if (result.ok && result.available) {
      setDiscovery({
        kind: 'ready',
        distributions: result.distributions,
        defaultDistribution: result.defaultDistribution
      })
      // The select shows the default immediately; the state must agree, or
      // the Connect button would stay disabled until the user re-picked.
      setDistribution(result.defaultDistribution ?? result.distributions[0]?.name ?? '')
    } else if (result.ok) {
      setDiscovery({ kind: 'unavailable', reason: result.reason })
    } else {
      setDiscovery({ kind: 'error', code: result.code })
    }
  }, [])

  // The reset effect legitimately clears the non-atom `connectOperation` ref
  // (an in-flight connect token), so the ref-mirror rule's pattern matches the
  // whole effect; suppressed at the anchor line.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!open) {
      return
    }

    // Fresh wizard per open: nothing from a previous attempt leaks in, and
    // closing/cancelling never leaves a project behind.
    setStep('config')
    setDistribution('')
    setUser('')
    setConnectionId(null)
    setConnectError(null)
    setConnecting(false)
    setTarget(null)
    connectOperation.current = null

    void runDiscovery()
  }, [open, runDiscovery])

  const onClose = (next: boolean) => {
    if (next) {
      return
    }

    // A cancelled or half-finished wizard persists nothing; the temporary
    // connection is released so it cannot linger on the host.
    if (connectOperation.current) {
      void cancelWslOperation(connectOperation.current)
      connectOperation.current = null
    }

    void releaseWizardConnection(connectionId)
    closeWslWorkspaceWizard()
  }

  const startConnect = async () => {
    if (connecting || !distribution || !browseSupported) {
      return
    }

    const operationId = `connect_${Date.now()}`
    connectOperation.current = operationId
    setConnecting(true)
    setConnectError(null)

    const result = await connectWsl({ distribution, operationId, user: user.trim() || undefined })

    setConnecting(false)
    connectOperation.current = null

    if (!result.ok) {
      // Back on the same page: the typed error is inline, the config stays
      // editable, and Connect itself is the retry.
      setConnectError(result.code)

      return
    }

    // The host verified the identity and the home directory; the service lists
    // from there, for exactly that verified user.
    setConnectionId(result.connectionId)
    setTarget({
      environment: { host: result.distribution, kind: 'wsl', user: result.user },
      initialPath: result.home
    })
    setStep('browse')
  }

  const cancelConnect = () => {
    if (connectOperation.current) {
      void cancelWslOperation(connectOperation.current)
    }
  }

  // The host saves the shell record; selecting its row is what the main chat
  // observes to register the service Workspace. A late answer after the wizard
  // moved on must not re-select anything.
  const save = useCallback(
    async (path: string): Promise<{ message: string; ok: false } | { ok: true }> => {
      if (!connectionId) {
        return { message: failureText(t, 'WSL_SAVE_FAILED'), ok: false }
      }

      const turn = saveTurns.current.begin()
      const result = await saveWslWorkspaceFromWizard({ connectionId, name: undefined, path })

      if (!result.ok) {
        return { message: failureText(t, result.code), ok: false }
      }

      if (saveTurns.current.isCurrent(turn)) {
        selectWorkspaceView(result.workspace.id)
        void releaseWizardConnection(connectionId)
        closeWslWorkspaceWizard()
      }

      return { ok: true }
    },
    [connectionId, t]
  )

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent className="max-w-lg" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{w.menuOpenRemoteFolder}</DialogTitle>
          <DialogDescription>
            {step === 'browse' ? `${w.stepBrowse} · ${w.sessionUnavailable}` : w.stepConfig}
          </DialogDescription>
        </DialogHeader>

        {step === 'config' && (
          <div className="flex flex-col gap-3">
            {!browseSupported && (
              <div className="text-[0.75rem] text-(--ui-red)" data-browser-capability="">
                {w.browseUnavailable} · {service.detail || browseReason}
              </div>
            )}

            {discovery.kind === 'loading' && (
              <div className="flex items-center gap-2 text-[0.75rem] text-(--ui-text-tertiary)">
                <Codicon name="loading" size="0.75rem" spinning />
                {w.discovering}
              </div>
            )}

            {discovery.kind === 'unavailable' && (
              <div className="text-[0.75rem] text-(--ui-text-tertiary)">{w.wslUnavailableDesc}</div>
            )}

            {discovery.kind === 'error' && (
              <div className="flex flex-col gap-2 text-[0.75rem] text-(--ui-red)">
                <span>{discovery.code ? failureText(t, discovery.code) : w.discoverFailed}</span>
                <Button
                  className="self-start"
                  onClick={() => void runDiscovery()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Codicon name="refresh" size="0.75rem" />
                  {t.common.retry}
                </Button>
              </div>
            )}

            {discovery.kind === 'ready' && discovery.distributions.length === 0 && (
              <div className="text-[0.75rem] text-(--ui-text-tertiary)">{w.wslUnavailableDesc}</div>
            )}

            {discovery.kind === 'ready' && discovery.distributions.length > 0 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.6875rem] font-medium text-(--ui-text-tertiary)" htmlFor="wsl-distribution">
                    {w.distributionLabel}
                  </label>
                  <Select
                    disabled={connecting}
                    onValueChange={setDistribution}
                    value={distribution || discovery.defaultDistribution || discovery.distributions[0]?.name || ''}
                  >
                    <SelectTrigger id="wsl-distribution">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {discovery.distributions.map(d => (
                        <SelectItem key={d.name} value={d.name}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[0.6875rem] font-medium text-(--ui-text-tertiary)" htmlFor="wsl-user">
                    {w.userLabel}
                  </label>
                  <Input
                    disabled={connecting}
                    id="wsl-user"
                    onChange={event => setUser(event.target.value)}
                    placeholder={w.userPlaceholder}
                    value={user}
                  />
                </div>

                {connectError && (
                  <div className="flex items-start gap-2 text-[0.75rem] text-(--ui-red)">
                    <Codicon className="mt-0.5 shrink-0" name="error" size="0.75rem" />
                    {failureText(t, connectError)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 'browse' && target && (
          <AgentBoxWorkspaceBrowser
            environment={target.environment}
            initialPath={target.initialPath}
            onBack={() => setStep('config')}
            onChoose={save}
            port={browserPort}
          />
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              // Connecting: the primary action becomes the cancel — the only
              // honest way out of an in-flight connect.
              if (connecting) {
                cancelConnect()

                return
              }

              if (step === 'browse' && connectionId) {
                // Back to configuration keeps the selections; the connection
                // stays valid until it expires.
                setStep('config')

                return
              }

              onClose(false)
            }}
            type="button"
            variant="ghost"
          >
            {connecting
              ? t.common.cancel
              : step === 'browse'
                ? t.common.back
                : step === 'config' && connectionId
                  ? t.common.close
                  : t.common.cancel}
          </Button>

          {step === 'config' && (
            <Button
              disabled={discovery.kind !== 'ready' || !distribution || connecting || !browseSupported}
              onClick={() => void startConnect()}
              type="button"
            >
              {connecting ? (
                <>
                  <Codicon className="shrink-0" name="loading" size="0.75rem" spinning />
                  {w.connectingDesc}
                </>
              ) : (
                t.common.connect
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
