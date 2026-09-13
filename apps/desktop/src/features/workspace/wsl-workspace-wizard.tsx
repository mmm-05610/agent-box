import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  cancelWslOperation,
  connectWsl,
  discoverWsl,
  listWslDirectories
} from '@/api/workspace'
import { createLatestWins } from '@/application/workspace/latest-wins'
import { releaseWizardConnection, saveWslWorkspaceFromWizard } from '@/application/workspace/wsl-workspace-usecases'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $wslWorkspaceWizardOpen, closeWslWorkspaceWizard } from '@/store/wsl-workspace'
import type { WslDirectoryEntry, WslDistributionInfo, WslWorkspaceErrorCode } from '@/types/workspace'

type Step = 'method' | 'config' | 'connecting' | 'browse'

type DiscoveryState =
  | { kind: 'loading' }
  | { kind: 'ready'; distributions: WslDistributionInfo[]; defaultDistribution: null | string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; code: WslWorkspaceErrorCode | null }

/** Localized copy per typed host error; the host's message stays out of the UI. */
function failureText(t: ReturnType<typeof useI18n>['t'], code: WslWorkspaceErrorCode | null): string {
  const w = t.wslWorkspace

  switch (code) {
    case 'WSL_UNAVAILABLE':
      return w.errWslUnavailable

    case 'WSL_UNKNOWN_DISTRIBUTION':
      return w.errWslUnknownDistribution

    case 'WSL_USER_NOT_FOUND':
      return w.errWslUserNotFound

    case 'WSL_CONNECT_TIMEOUT':
      return w.errWslConnectTimeout

    case 'WSL_CONNECT_FAILED':
      return w.errWslConnectFailed

    case 'WSL_CANCELLED':
      return w.errWslCancelled

    case 'WSL_CONNECTION_EXPIRED':
      return w.errWslConnectionExpired

    case 'WSL_INVALID_PATH':
      return w.errWslInvalidPath

    case 'WSL_DIRECTORY_NOT_FOUND':
      return w.errWslDirectoryNotFound

    case 'WSL_DIRECTORY_NO_PERMISSION':
      return w.errWslDirectoryNoPermission

    case 'WSL_LIST_FAILED':
      return w.errWslListFailed

    case 'WSL_LIST_OVERFLOW':
      return w.errWslListOverflow

    case 'WSL_SAVE_FAILED':
      return w.errWslSaveFailed

    case 'WSL_NOT_FOUND':
      return w.errWslNotFound

    default:
      return w.errUnexpected
  }
}

/**
 * The round-1 WSL connection wizard, mounted once in the project sidebar:
 * choose the connection type (only WSL exists this round) → distribution and
 * optional Linux user → bounded connecting step with cancel → browse the real
 * Linux tree → save the workspace. A cancelled wizard persists nothing, and a
 * failed save keeps the selection for retry.
 */
export function WslWorkspaceWizard() {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const open = useStore($wslWorkspaceWizardOpen)

  const [step, setStep] = useState<Step>('method')
  const [discovery, setDiscovery] = useState<DiscoveryState>({ kind: 'loading' })
  const [distribution, setDistribution] = useState('')
  const [user, setUser] = useState('')
  const [connectionId, setConnectionId] = useState<null | string>(null)
  const [connectError, setConnectError] = useState<WslWorkspaceErrorCode | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Directory browser state. `browserTurn` implements latest-wins: a slow
  // listing for an older path must never overwrite the user's newer one.
  const [path, setPath] = useState('/')
  const [pathInput, setPathInput] = useState('/')
  const [entries, setEntries] = useState<WslDirectoryEntry[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [listing, setListing] = useState(false)
  const [listError, setListError] = useState<WslWorkspaceErrorCode | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<WslWorkspaceErrorCode | null>(null)

  const browseTurns = useRef(createLatestWins())
  const connectOperation = useRef<null | string>(null)

  const runDiscovery = useCallback(async () => {
    setDiscovery({ kind: 'loading' })

    const result = await discoverWsl()

    if (result.ok && result.available) {
      setDiscovery({ kind: 'ready', distributions: result.distributions, defaultDistribution: result.defaultDistribution })
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
    setStep('method')
    setDistribution('')
    setUser('')
    setConnectionId(null)
    setConnectError(null)
    setConnecting(false)
    setPath('/')
    setPathInput('/')
    setEntries([])
    setShowHidden(false)
    setListing(false)
    setListError(null)
    setSaving(false)
    setSaveError(null)
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

  const listDirectory = useCallback(
    async (connection: null | string, target: string, hidden: boolean) => {
      const turn = browseTurns.current.begin()

      setListing(true)
      setListError(null)
      setPath(target)
      setPathInput(target)

      const result = await listWslDirectories({
        connectionId: connection ?? undefined,
        operationId: `browse_${turn}`,
        path: target,
        showHidden: hidden
      })

      // Latest-wins: a stale listing (user already navigated elsewhere) is
      // dropped, never applied over the newer view.
      if (!browseTurns.current.isCurrent(turn)) {
        return
      }

      setListing(false)

      if (!result.ok) {
        setListError(result.code)

        return
      }

      setEntries(result.entries)
      setPath(result.path)
      setPathInput(result.path)
    },
    []
  )

  const startConnect = async () => {
    if (connecting || !distribution) {
      return
    }

    const operationId = `connect_${Date.now()}`
    connectOperation.current = operationId
    setConnecting(true)
    setConnectError(null)
    setStep('connecting')

    const result = await connectWsl({ distribution, operationId, user: user.trim() || undefined })

    setConnecting(false)
    connectOperation.current = null

    if (!result.ok) {
      setConnectError(result.code)
      setStep('config')

      return
    }

    setConnectionId(result.connectionId)
    setPath(result.home)
    setPathInput(result.home)
    setEntries([])
    setStep('browse')
    void listDirectory(result.connectionId, result.home, false)
  }

  const cancelConnect = () => {
    if (connectOperation.current) {
      void cancelWslOperation(connectOperation.current)
    }
  }

  const save = async () => {
    if (saving || !connectionId) {
      return
    }

    setSaving(true)
    setSaveError(null)

    const result = await saveWslWorkspaceFromWizard({
      connectionId,
      name: undefined,
      path
    })

    if (!result.ok) {
      // The selection stays as-is so the user can retry without re-navigating.
      setSaving(false)
      setSaveError(result.code)

      return
    }

    setSaving(false)
    void releaseWizardConnection(connectionId)
    closeWslWorkspaceWizard()
  }

  const stepLabel = (target: Step) =>
    target === 'method' ? w.stepMethod : target === 'config' ? w.stepConfig : target === 'connecting' ? w.stepConnecting : w.stepBrowse

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent className="max-w-lg" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{w.menuRemoteConnection}</DialogTitle>
          <DialogDescription>
            {step === 'browse' ? `${w.stepBrowse} · ${w.sessionUnavailable}` : stepLabel(step)}
          </DialogDescription>
        </DialogHeader>

        {step === 'method' && (
          <div className="flex flex-col gap-2">
            <button
              className="flex items-center gap-3 rounded-lg border border-(--ui-stroke-tertiary) px-3 py-2.5 text-left transition-colors hover:border-(--ui-stroke-secondary) hover:bg-(--ui-control-hover-background)"
              onClick={() => setStep('config')}
              type="button"
            >
              <Codicon className="shrink-0 text-(--ui-text-secondary)" name="vm-connect" size="1.125rem" />
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-medium">{w.wslOption}</span>
                <span className="block text-[0.75rem] text-(--ui-text-tertiary)">{w.wslOptionDesc}</span>
              </span>
              <Codicon className="ml-auto shrink-0 text-(--ui-text-quaternary)" name="chevron-right" size="0.875rem" />
            </button>
          </div>
        )}

        {step === 'config' && (
          <div className="flex flex-col gap-3">
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
                <Button className="self-start" onClick={() => void runDiscovery()} size="sm" type="button" variant="ghost">
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

        {step === 'connecting' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Codicon className="text-(--ui-text-secondary)" name="loading" size="1.25rem" spinning />
            <div className="text-[0.75rem] text-(--ui-text-tertiary)">{w.connectingDesc}</div>
            <Button disabled={!connecting} onClick={cancelConnect} size="sm" type="button" variant="ghost">
              {t.common.cancel}
            </Button>
          </div>
        )}

        {step === 'browse' && (
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <TiplessButton
                ariaLabel={w.upOneLevel}
                disabled={path === '/' || listing}
                onClick={() => void listDirectory(connectionId, path === '/' ? '/' : path.replace(/\/[^/]*$/, '') || '/', showHidden)}
              >
                <Codicon name="arrow-up" size="0.875rem" />
              </TiplessButton>
              <Input
                className="h-7 flex-1 text-[0.75rem]"
                onChange={event => setPathInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void listDirectory(connectionId, pathInput, showHidden)
                  }
                }}
                placeholder={w.pathLabel}
                value={pathInput}
              />
              <Button disabled={listing} onClick={() => void listDirectory(connectionId, pathInput, showHidden)} size="sm" type="button" variant="ghost">
                {w.goTo}
              </Button>
            </div>

            <label className="flex w-fit items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">
              <Checkbox
                checked={showHidden}
                onCheckedChange={checked => {
                  const hidden = checked === true

                  setShowHidden(hidden)
                  void listDirectory(connectionId, path, hidden)
                }}
              />
              {w.showHidden}
            </label>

            <div className="h-64 overflow-y-auto rounded-md border border-(--ui-stroke-tertiary)">
              {listError && (
                <div className="p-3 text-[0.75rem] text-(--ui-red)">{failureText(t, listError)}</div>
              )}

              {!listError && entries.length === 0 && !listing && (
                <div className="p-3 text-[0.75rem] text-(--ui-text-quaternary)">{w.emptyDirectory}</div>
              )}

              {entries.map(entry => (
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.75rem] transition-colors',
                    'hover:bg-(--ui-control-hover-background)'
                  )}
                  key={entry.path}
                  onClick={() => void listDirectory(connectionId, entry.path, showHidden)}
                  type="button"
                >
                  <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="folder" size="0.75rem" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)">{entry.path}</span>
                </button>
              ))}

              {listing && (
                <div className="flex items-center gap-2 p-3 text-[0.75rem] text-(--ui-text-tertiary)">
                  <Codicon name="loading" size="0.75rem" spinning />
                  {t.common.loading}
                </div>
              )}
            </div>

            {saveError && (
              <div className="flex items-start gap-2 text-[0.75rem] text-(--ui-red)">
                <Codicon className="mt-0.5 shrink-0" name="error" size="0.75rem" />
                {failureText(t, saveError)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={connecting}
            onClick={() => {
              if (step === 'connecting') {
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
            {step === 'browse' ? t.common.back : step === 'config' ? t.common.cancel : t.common.close}
          </Button>

          {step === 'config' && (
            <Button
              disabled={discovery.kind !== 'ready' || !distribution || connecting}
              onClick={() => void startConnect()}
              type="button"
            >
              {t.common.connect}
            </Button>
          )}

          {step === 'browse' && (
            <Button disabled={saving || listing} onClick={() => void save()} type="button">
              <Codicon name="check" size="0.75rem" />
              {saving ? t.common.saving : w.chooseDirectory}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Minimal icon button for the browser toolbar. */
function TiplessButton({ children, ...props }: React.ComponentProps<'button'> & { ariaLabel: string }) {
  return (
    <Button {...props} aria-label={props['aria-label'] ?? props.ariaLabel} size="icon-sm" type="button" variant="ghost">
      {children}
    </Button>
  )
}
