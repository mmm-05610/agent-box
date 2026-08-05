/**
 * Environment Page — WSL runtime health, binary detection + one-click install,
 * and the agent-box update check.
 *
 * Registry-driven: the backend reports which agent binaries / cc-switch exist
 * inside WSL and the one-line install command for each.  The frontend only
 * renders; it never hardcodes an agent name or install recipe.
 */

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
import { downloadUpdate, installBinary, launchAcs, openExternal } from '@/api/environment'
import type { BinaryInfo } from '@/api/environment'
import { cn } from '@/lib/utils'

export function EnvironmentPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const version = useVersion()
  const { agentConfigs } = useAgentConfigs()
  const { status } = useEnvironment()
  const { binaries, loading, refresh } = useBinaries()
  const { hasUpdate, info, refresh: refreshUpdate } = useAgentBoxUpdate()

  const agents = binaries.filter((b) => b.kind === 'agent')
  const acs = binaries.find((b) => b.kind === 'acs')

  const recheck = () => {
    void refresh()
    void refreshUpdate()
  }

  const handleInstall = async (b: BinaryInfo) => {
    try {
      await installBinary(b.agentType)
      toast({ type: 'success', message: t('environment.installStarted', { name: b.name }) })
    } catch (e) {
      toast({ type: 'error', message: t('environment.installFailed', { name: b.name }) })
    }
  }

  const handleAcsOpen = async () => {
    try {
      await launchAcs()
    } catch {
      toast({ type: 'error', message: t('environment.acsFailed') })
    }
  }

  const handleUpdate = async () => {
    if (!info?.asset_url) return
    try {
      await downloadUpdate()
      toast({ type: 'success', message: t('environment.updateStarted') })
    } catch {
      if (info.release_url) await openExternal(info.release_url)
      toast({ type: 'info', message: t('environment.updateBrowser') })
    }
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
          <Button variant="outline" onClick={recheck}>{t('environment.recheck')}</Button>
        }
        className="mb-8"
      />

      {/* ── agent-box update ─────────────────────────────────────── */}
      <Section title={t('environment.section.agentBox')}>
        <Card>
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Agent Box</h3>
              <p className="mt-1 text-xs text-muted-foreground">
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
                <Button size="sm" onClick={() => void handleUpdate()}>{t('environment.updateNow')}</Button>
                {info?.release_url && (
                  <Button variant="ghost" size="sm" onClick={() => void openExternal(info.release_url!)}>
                    {t('environment.openBrowser')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </Section>

      {/* ── Agent binaries ───────────────────────────────────────── */}
      <Section title={t('environment.section.agents')} description={t('environment.agentsDesc')}>
        <Card>
          {loading ? (
            <Loading className="py-10" />
          ) : (
            <div className="divide-y divide-border">
              {agents.map((b) => {
                const identity = resolveAgentIdentity(agentConfigs, b.agentType)
                return (
                  <div key={b.agentType} className="flex items-center gap-3 px-5 py-3.5">
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
                        {b.installed ? (b.version || b.path) : t('environment.notInstalled')}
                      </div>
                    </div>
                    {b.installed ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-success">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {t('environment.installed')}
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => void handleInstall(b)}>{t('environment.install')}</Button>
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
              acs?.installed ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground',
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
                {acs?.installed ? (acs.path || t('environment.installed')) : t('environment.notInstalled')}
              </div>
            </div>
            {acs?.installed ? (
              <Button size="sm" onClick={() => void handleAcsOpen()}>{t('environment.openAcs')}</Button>
            ) : (
              <Button size="sm" onClick={() => void handleInstall(acs!)}>{t('environment.installAcs')}</Button>
            )}
          </div>
        </Card>
      </Section>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
