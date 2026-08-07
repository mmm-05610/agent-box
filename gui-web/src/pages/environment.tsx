/**
 * Environment Page — WSL runtime health, binary detection + one-click install,
 * and the agent-box update check.
 *
 * Registry-driven: the backend reports which agent binaries / cc-switch exist
 * inside WSL and the one-line install command for each.  The frontend only
 * renders; it never hardcodes an agent name or install recipe.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import { Loading, StatusDot, useToast } from '@/components/feedback'
import { PageHeader } from '@/components/layout'
import {
  useAgentBoxUpdate,
  useAgentConfigs,
  useBinaries,
  useEnvironment,
  useVersion,
  resolveAgentIdentity,
} from '@/hooks'
import {
  downloadUpdate,
  getDownloadProgress,
  getInstallProgress,
  installAcsDeps,
  installBinary,
  launchAcs,
  launchUpdateInstaller,
  openExternal,
  type DownloadProgress,
  type InstallProgress,
} from '@/api/environment'
import type { BinaryInfo } from '@/api/environment'
import { cn } from '@/lib/utils'

export function EnvironmentPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const version = useVersion()
  const { agentConfigs } = useAgentConfigs()
  const { status } = useEnvironment()
  const { binaries, loading, refresh } = useBinaries()
  const { hasUpdate, info, loading: updateChecking, refresh: refreshUpdate } = useAgentBoxUpdate()

  const agents = binaries.filter((b) => b.kind === 'agent')
  const acs = binaries.find((b) => b.kind === 'acs')

  // Version-check in progress (manual re-check) — drives the recheck button
  // spinner + per-row "checking version" indicators.
  const [checking, setChecking] = useState(false)
  const recheck = async () => {
    setChecking(true)
    try {
      await refresh()
      await refreshUpdate()
    } finally {
      setChecking(false)
    }
  }

  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [installProg, setInstallProg] = useState<Record<string, InstallProgress>>({})
  const isUpdating = (agentType: string) => updating.has(agentType)

  /** Async background install/update for one agent.  The install is a detached
  WSL process; we poll getInstallProgress every 2s and show elapsed time + live
  output in the row so a 10-minute npm/pip run reads as "working", never
  "frozen".  Errors are surfaced as a readable hint + output tail.  ENOTEMPTY
  is auto-healed (backend cleans the leftover dirs, we retry once). */
  const installOne = async (b: BinaryInfo) => {
    if (isUpdating(b.agentType)) return
    setUpdating((p) => new Set(p).add(b.agentType))
    toast({
      type: 'info',
      message: b.installed
        ? t('environment.updatingNote', { name: b.name })
        : t('environment.installingNote', { name: b.name }),
    })
    let failed: string | null = null
    let retried = false
    try {
      await installBinary(b.agentType)
      await new Promise<void>((resolve) => {
        let tries = 0
        const tick = async () => {
          const p = await getInstallProgress()
          setInstallProg((m) => ({ ...m, [b.agentType]: p }))
          if (p.status === 'done') return resolve()
          if (p.status === 'error') {
            if (!retried && p.error && p.error.includes('ENOTEMPTY')) {
              retried = true
              await installBinary(b.agentType)  // backend cleans, restarts
            } else {
              failed = p.hint ? `${p.hint}\n${p.error ?? ''}` : (p.error ?? t('environment.installFailed', { name: b.name }))
              return resolve()
            }
          }
          if (tries++ > 900) {  // 30 min ceiling; hermes install.sh can take 15
            failed = t('environment.installTimeout')
            return resolve()
          }
          setTimeout(tick, 2000)
        }
        void tick()
      })
    } catch (e) {
      failed = e instanceof Error ? e.message : t('environment.installFailed', { name: b.name })
    }
    setInstallProg((m) => {
      const n = { ...m }
      delete n[b.agentType]
      return n
    })
    const data = await refresh()
    const cur = data.find((r) => r.agentType === b.agentType)
    const caughtUp = !!(cur && cur.installed && (!cur.latestVersion || !hasBinaryUpdate(cur)))
    setUpdating((p) => {
      const n = new Set(p)
      n.delete(b.agentType)
      return n
    })
    if (failed) {
      toast({ type: 'error', message: `${b.name}: ${failed}` })
    } else if (!caughtUp) {
      toast({ type: 'info', message: t('environment.installCheck', { name: b.name }) })
    }
  }

  /** One click, updates every out-of-date agent silently (no console). */
  const updateAll = async () => {
    const targets = agents.filter((b) => b.installed && !b.broken && hasBinaryUpdate(b))
    if (targets.length === 0) return
    toast({ type: 'info', message: t('environment.updatingAll', { count: targets.length }) })
    // Sequential, not parallel: concurrent `npm install -g` into the same
    // global prefix races on node_modules writes.
    for (const b of targets) {
      await installOne(b)
    }
    toast({ type: 'success', message: t('environment.updateAllDone') })
    await refresh()
  }

  const handleAcsOpen = async () => {
    try {
      await launchAcs()
    } catch (e) {
      // launch_acs now raises a readable message when the GUI libs are missing.
      const msg = e instanceof Error ? e.message : ''
      toast({ type: 'error', message: msg || t('environment.acsFailed') })
    }
  }

  const [acsDepsBusy, setAcsDepsBusy] = useState(false)
  const handleInstallAcsDeps = async () => {
    setAcsDepsBusy(true)
    try {
      await installAcsDeps()
      toast({ type: 'success', message: t('environment.acsDepsInstalled') })
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      toast({ type: 'error', message: msg || t('environment.acsDepsFailed') })
    } finally {
      setAcsDepsBusy(false)
    }
  }

  const [dlProgress, setDlProgress] = useState<DownloadProgress | null>(null)
  const [dlReady, setDlReady] = useState(false)
  const dlTimerRef = useRef<number | null>(null)
  const stopDlPoll = () => {
    if (dlTimerRef.current != null) {
      window.clearInterval(dlTimerRef.current)
      dlTimerRef.current = null
    }
  }
  useEffect(() => stopDlPoll, [])

  const handleUpdate = async () => {
    if (!info?.asset_url) return
    setDlReady(false)
    try {
      const start = await downloadUpdate()
      if (start.mode === 'browser') {
        toast({ type: 'info', message: t('environment.updateBrowser') })
        return
      }
      setDlProgress({ status: 'downloading', bytesWritten: 0, bytesTotal: 0, dest: start.dest })
      // Poll BITS progress; on done/error stop. BITS resumes a dropped
      // transfer automatically, so no manual retry needed. On done we show a
      // confirm (close the running app?) instead of launching blindly.
      dlTimerRef.current = window.setInterval(async () => {
        const p = await getDownloadProgress()
        setDlProgress(p)
        if (p.status === 'done') {
          stopDlPoll()
          setDlReady(true)
        } else if (p.status === 'error') {
          stopDlPoll()
          setDlProgress(null)
          if (p.error) {
            // Readable error (proxy/BITS failure) — don't silently fall back.
            toast({ type: 'error', message: p.error })
          } else if (info.release_url) {
            await openExternal(info.release_url)
            toast({ type: 'info', message: t('environment.updateBrowser') })
          }
        }
      }, 1000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg && !/Unknown error|Bridge/i.test(msg)) {
        toast({ type: 'error', message: msg })
      } else if (info.release_url) {
        await openExternal(info.release_url)
        toast({ type: 'info', message: t('environment.updateBrowser') })
      }
    }
  }

  const handleStartInstall = async () => {
    try {
      await launchUpdateInstaller()
      // The silent installer closes the running app (CloseApplications in
      // setup.iss) and installs — nothing more to do here.
      toast({ type: 'success', message: t('environment.installingNow') })
    } catch {
      toast({ type: 'error', message: t('environment.installFailed', { name: 'agent-box' }) })
    }
  }

  const handleInstallLater = () => {
    setDlReady(false)
    setDlProgress(null)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <PageHeader
        title={t('environment.title')}
        stats={
          <>
            <StatusDot variant={status?.ready ? 'running' : 'stopped'} className="inline-block align-[-1px] mr-1.5" />
            <span>{t('environment.wslState')}</span>
            {version && (
              <>
                <span className="mx-2 text-border">·</span>
                <span className="font-mono">{`v${version}`}</span>
              </>
            )}
          </>
        }
        action={
          <Button variant="outline" onClick={() => void recheck()} isLoading={checking}>{t('environment.recheck')}</Button>
        }
        className="mb-8"
      />

      {/* ── agent-box update ─────────────────────────────────────── */}
      <Section title={t('environment.section.agentBox')}>
        <Card>
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Agent Box</h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {updateChecking && <TinySpinner />}
                {info
                  ? t('environment.versionInfo', { current: info.current, latest: info.latest })
                  : t('environment.versionChecking')}
              </p>
              {hasUpdate && info?.notes && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{info.notes.slice(0, 200)}</p>
              )}
            </div>
            {hasUpdate && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => void handleUpdate()} disabled={dlProgress?.status === 'downloading'}>
                  {t('environment.updateNow')}
                </Button>
                {info?.release_url && (
                  <Button variant="ghost" size="sm" onClick={() => void openExternal(info.release_url!)}>
                    {t('environment.openBrowser')}
                  </Button>
                )}
              </div>
            )}
          </div>
          {dlProgress?.status === 'downloading' && dlProgress.bytesTotal > 0 && (
            <div className="border-t border-border px-5 py-3">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{t('environment.downloading')}</span>
                <span className="font-mono">
                  {Math.min(100, Math.round((dlProgress.bytesWritten / dlProgress.bytesTotal) * 100))}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (dlProgress.bytesWritten / dlProgress.bytesTotal) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {dlReady && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <div className="text-sm text-foreground">{t('environment.updateReady')}</div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => void handleStartInstall()}>{t('environment.startInstall')}</Button>
                <Button size="sm" variant="ghost" onClick={handleInstallLater}>{t('environment.installLater')}</Button>
              </div>
            </div>
          )}
        </Card>
      </Section>

      {/* ── Agent binaries ───────────────────────────────────────── */}
      <Section
        title={t('environment.section.agents')}
        description={t('environment.agentsDesc')}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void updateAll()}
            disabled={updating.size > 0 || !agents.some((a) => a.installed && !a.broken && hasBinaryUpdate(a))}
          >
            {t('environment.updateAll')}
          </Button>
        }
      >
        <Card>
          {loading ? (
            <Loading className="py-10" />
          ) : (
            <div className="divide-y divide-border">
              {agents.map((b) => {
                const identity = resolveAgentIdentity(agentConfigs, b.agentType)
                return (
                  <div key={b.agentType}>
                    <div className="flex items-center gap-3 px-5 py-3.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden"
                      style={{ backgroundColor: `${identity.color}14` }}
                    >
                      {identity.logo ? (
                        <img src={identity.logo} alt={b.name} className="h-5 w-5 object-contain" />
                      ) : (
                        <span className="text-xs font-bold" style={{ color: identity.color }}>
                          {b.name[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{b.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground font-mono">
                        {checking && <TinySpinner className="mr-1.5 inline-block align-[-2px]" />}
                        {b.installed && b.broken
                          ? t('environment.broken')
                          : b.installed
                            ? (b.version ? `v${b.version}` : (b.path || '')) + (b.latestVersion ? ` · ${t('environment.latest', { version: b.latestVersion })}` : b.latestError ? ` · ${t('environment.latestError')}: ${b.latestError}` : '')
                            : t('environment.notInstalled')}
                      </div>
                    </div>
                    {b.installed && b.broken ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {t('environment.installed')}
                      </span>
                    ) : b.installed && hasBinaryUpdate(b) ? (
                      <>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {t('environment.updateAvailable', { version: b.latestVersion! })}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => void installOne(b)} isLoading={isUpdating(b.agentType)}>{t('environment.update')}</Button>
                      </>
                    ) : b.installed ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {t('environment.installed')}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => void installOne(b)} isLoading={isUpdating(b.agentType)}>{t('environment.install')}</Button>
                    )}
                  </div>
                    {installProg[b.agentType] && (
                      <div className="border-t border-border px-5 py-2 font-mono text-[11px]">
                        {installProg[b.agentType].status === 'error' ? (
                          <div className="text-red-600 dark:text-red-400">
                            {installProg[b.agentType].hint && (
                              <div className="font-sans">{installProg[b.agentType].hint}</div>
                            )}
                            <div className="mt-1 whitespace-pre-wrap break-all text-muted-foreground">
                              {installProg[b.agentType].error}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 text-muted-foreground">
                            <TinySpinner className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div>{t('environment.installingRuntime', { elapsed: installProg[b.agentType].elapsed })}</div>
                              {installProg[b.agentType].output.length > 0 && (
                                <div className="mt-0.5 whitespace-pre-wrap break-all text-muted-foreground/70">
                                  {installProg[b.agentType].output.slice(-2).join('\n')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </Section>

      {/* ── ACS (cc-switch) ───────────────────────────────────────── */}
      <Section title={t('environment.section.acs')} description={t('environment.acsDesc')}>
        <Card>
          <div className="flex items-center gap-3 p-5">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              acs?.installed && acs.broken
                ? 'bg-amber-500/10 text-amber-600'
                : acs?.installed
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-muted text-muted-foreground',
            )}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">cc-switch (ACS)</div>
              <div className="truncate text-[11px] text-muted-foreground font-mono">
                {checking && <TinySpinner className="mr-1.5 inline-block align-[-2px]" />}
                {acs?.installed && acs.broken
                  ? (acs.latestError || t('environment.broken'))
                  : acs?.installed
                    ? (acs.version ? `v${acs.version}` : (acs.path || t('environment.installed')))
                    : t('environment.notInstalled')}
              </div>
            </div>
            {acs?.installed && acs.broken ? (
              <Button size="sm" onClick={() => void handleInstallAcsDeps()} isLoading={acsDepsBusy}>{t('environment.installAcsDeps')}</Button>
            ) : acs?.installed ? (
              <Button size="sm" onClick={() => void handleAcsOpen()}>{t('environment.openAcs')}</Button>
            ) : (
              <Button size="sm" onClick={() => void installOne(acs!)} isLoading={isUpdating('acs')}>{t('environment.installAcs')}</Button>
            )}
          </div>
        </Card>
      </Section>
    </div>
  )
}

function TinySpinner({ className = '' }: { className?: string }) {
  return (
    <span className={cn('relative inline-block h-3 w-3 shrink-0', className)}>
      <span className="absolute inset-0 rounded-full border-2 border-muted" />
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
    </span>
  )
}

function parseVersion(v: string): number[] {
  return v.split('.').map((n) => parseInt(n, 10) || 0)
}

/** Is a newer version available? (latest > local, semver-ish) */
function hasBinaryUpdate(b: { version: string | null; latestVersion: string | null }): boolean {
  if (!b.version || !b.latestVersion) return false
  const cur = parseVersion(b.version)
  const latest = parseVersion(b.latestVersion)
  for (let i = 0; i < Math.max(cur.length, latest.length); i++) {
    const a = latest[i] ?? 0
    const c = cur[i] ?? 0
    if (a > c) return true
    if (a < c) return false
  }
  return false
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
