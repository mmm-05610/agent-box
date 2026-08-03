/**
 * JsonHooksEditor — JSON hooks editor for agents that store hooks in
 * settings.json → hooks (Claude / Codex / OpenCode). Selected by HookList
 * when the registry's resources.hooks.format is 'json'.
 *
 * The JSON shape is too nested to form-edit, so we keep a single textarea
 * as the single source of truth. Above it, each configured event is a
 * collapsible row that shows its matchers and hook commands in read-only
 * detail, so users can see what each event actually does without leaving
 * the page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useToast } from '@/components/feedback/toast'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { patchJsonFile, readFile } from '@/api/files'
import type { AgentType } from '@/api'
import { useAgentConfigs, useProfileConfigDir } from '@/hooks'

interface HookEntry {
  type?: string
  command?: string
  prompt?: string
  timeout?: number
  [key: string]: unknown
}

interface MatcherEntry {
  matcher?: string
  hooks?: HookEntry[]
}

interface EventSummary {
  name: string
  matcherCount: number
  hookCount: number
  matchers: MatcherSummary[]
}

interface MatcherSummary {
  matcher: string
  hookDescriptions: string[]
}

function describeHook(hook: HookEntry): string {
  if (typeof hook.command === 'string') return `command: ${hook.command}`
  if (typeof hook.prompt === 'string') return `prompt: ${hook.prompt}`
  if (hook.type) return `${hook.type}: ${JSON.stringify(hook).slice(0, 60)}`
  return JSON.stringify(hook).slice(0, 80)
}

function summarize(parsed: unknown): { events: EventSummary[]; total: number } {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { events: [], total: 0 }
  }
  const events: EventSummary[] = []
  let total = 0
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const matchers: MatcherSummary[] = []
    let hookCount = 0
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) continue
      const matcherEntry = entry as MatcherEntry
      const hooks = Array.isArray(matcherEntry.hooks) ? matcherEntry.hooks : []
      matchers.push({
        matcher: matcherEntry.matcher ?? '*',
        hookDescriptions: hooks.map(describeHook),
      })
      hookCount += hooks.length
    }
    events.push({
      name,
      matcherCount: matchers.length,
      hookCount,
      matchers,
    })
    total += hookCount
  }
  events.sort((left, right) => left.name.localeCompare(right.name))
  return { events, total }
}

export function JsonHooksEditor({ profileName, agentType }: { profileName: string; agentType?: AgentType }) {
  const { t } = useTranslation()
  const configDir = useProfileConfigDir(profileName)
  // File name comes from the backend registry (resources.hooks.config_file),
  // not hardcoded — the frontend doesn't own agent file knowledge.
  const { agentConfigs } = useAgentConfigs()
  const configFile = agentType ? agentConfigs?.[agentType]?.resources?.hooks?.config_file : undefined
  const path = configDir === null ? null : `${configDir}/${configFile ?? 'settings.json'}`

  const [content, setContent] = useState('{}')
  const parsed = useMemo(() => {
    try { return JSON.parse(content)?.hooks ?? {} } catch { return {} }
  }, [content])
  const [hooksJson, setHooksJson] = useState(JSON.stringify(parsed, null, 2))
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!path) return
    let cancelled = false
    readFile(path)
      .then((c) => { if (!cancelled) setContent(c) })
      .catch(() => { if (!cancelled) setContent('{}') })
    return () => { cancelled = true }
  }, [path])

  // Keep the textarea in sync when the underlying file (re)loads.
  useEffect(() => {
    setHooksJson(JSON.stringify(parsed, null, 2))
  }, [content])

  // Live summary from the textarea contents so it updates as the user edits.
  const summary = useMemo(() => {
    try { return summarize(JSON.parse(hooksJson)) } catch { return { events: [], total: 0 } }
  }, [hooksJson])

  const handleSave = useCallback(async () => {
    if (!path) return
    setSaving(true)
    try {
      const next = JSON.parse(hooksJson)
      if (typeof next !== 'object' || Array.isArray(next) || next === null) {
        throw new Error(t('hooks.mustBeObject'))
      }
      await patchJsonFile(path, 'hooks', next)
      const fresh = await readFile(path).catch(() => '')
      setContent(fresh)
      toast({ type: 'success', message: t('hooks.toast.saved') })
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast({ type: 'error', message: t('hooks.toast.invalidJson', { error: error.message }) })
      } else {
        toast({ type: 'error', message: error instanceof Error ? error.message : t('hooks.toast.failed') })
      }
    } finally {
      setSaving(false)
    }
  }, [path, hooksJson, toast])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('hooks.title')}{' '}
          <span className="text-muted-foreground font-normal">
            {t('hooks.count', { hooks: summary.total, events: summary.events.length })}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('hooks.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <EventsSummaryCard events={summary.events} />

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">{t('hooks.rawJson')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('hooks.rawHint')}
          </p>
          <Textarea
            value={hooksJson}
            onChange={(e) => setHooksJson(e.target.value)}
            rows={16}
            className="text-sm font-mono"
            placeholder={t('hooks.rawPlaceholder')}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('hooks.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Events summary card ────────────────────────────────────────────────

function EventsSummaryCard({ events }: { events: EventSummary[] }) {
  const { t } = useTranslation()
  if (events.length === 0) {
    return (
      <Card elevation="flat" className="ring-1 ring-border/60">
        <div className="flex items-start gap-3 p-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-foreground">{t('hooks.emptyTitle')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Trans
                i18nKey="hooks.emptyDesc"
                components={{ code: <code className="font-mono" /> }}
              />
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4 pb-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-foreground">
            {t('hooks.configuredEvents', { count: events.length })}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('hooks.clickHint')}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border/40 border-t border-border/60">
        {events.map((event) => (
          <EventRow key={event.name} event={event} />
        ))}
      </ul>
    </Card>
  )
}

function EventRow({ event }: { event: EventSummary }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={`event-detail-${event.name}`}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <code className="truncate font-mono text-sm text-foreground" title={event.name}>
            {event.name}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="neutral">
            {t('hooks.matcherBadge', { count: event.matcherCount })}
          </Badge>
          <span className="text-xs text-muted-foreground">·</span>
          <Badge variant="primary">
            {t('hooks.hookBadge', { count: event.hookCount })}
          </Badge>
        </div>
      </button>
      {expanded && (
        <div
          id={`event-detail-${event.name}`}
          className="space-y-3 border-t border-border/40 bg-muted/20 px-4 py-3"
        >
          {event.matchers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('hooks.noMatchers')}</p>
          ) : (
            event.matchers.map((matcher, index) => (
              <MatcherBlock key={`${event.name}-${index}-${matcher.matcher}`} matcher={matcher} index={index} />
            ))
          )}
        </div>
      )}
    </li>
  )
}

function MatcherBlock({ matcher, index }: { matcher: MatcherSummary; index: number }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md bg-background/60 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('hooks.matcherLabel', { count: index + 1 })}
        </span>
        {matcher.matcher === '*' ? (
          <Badge variant="info">{t('hooks.allTools')}</Badge>
        ) : (
          <code className="truncate font-mono text-xs text-foreground/90" title={matcher.matcher}>
            {matcher.matcher}
          </code>
        )}
      </div>
      {matcher.hookDescriptions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('hooks.noHooksInMatcher')}</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
          {matcher.hookDescriptions.map((description, idx) => (
            <li key={idx} className="break-all">
              <span className="mr-1 text-muted-foreground/60">[{idx + 1}]</span>
              {description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
