/**
 * Hooks Editor — JSON editor with expandable per-event summary.
 *
 * Reads/writes settings.json → hooks key.
 *
 * The JSON shape is too nested to form-edit, so we keep a single textarea
 * as the single source of truth. Above it, each configured event is a
 * collapsible row that shows its matchers and hook commands in read-only
 * detail, so users can see what each event actually does without leaving
 * the page.
 */

import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@/components/feedback/toast'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { patchJsonFile } from '@/api/files'

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

export function HooksEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const parsed = useMemo(() => {
    try { return JSON.parse(content)?.hooks ?? {} } catch { return {} }
  }, [content])
  const [hooksJson, setHooksJson] = useState(JSON.stringify(parsed, null, 2))
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  // Live summary from the textarea contents so it updates as the user edits.
  const summary = useMemo(() => {
    try { return summarize(JSON.parse(hooksJson)) } catch { return { events: [], total: 0 } }
  }, [hooksJson])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const next = JSON.parse(hooksJson)
      if (typeof next !== 'object' || Array.isArray(next) || next === null) {
        throw new Error('Hooks must be a JSON object')
      }
      await patchJsonFile(path, 'hooks', next)
      onRefresh()
      toast({ type: 'success', message: 'Hooks saved' })
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast({ type: 'error', message: `Invalid JSON: ${error.message}` })
      } else {
        toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save hooks' })
      }
    } finally {
      setSaving(false)
    }
  }, [path, hooksJson, onRefresh, toast])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Hooks{' '}
          <span className="text-muted-foreground font-normal">
            ({summary.total} {summary.total === 1 ? 'hook' : 'hooks'} across {summary.events.length} {summary.events.length === 1 ? 'event' : 'events'})
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each top-level key is a Claude Code event name. Values are arrays of matcher objects.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <EventsSummaryCard events={summary.events} />

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Raw JSON</h4>
          <p className="text-xs text-muted-foreground">
            Edit below or switch to Storage → settings.json for raw editing.
          </p>
          <Textarea
            value={hooksJson}
            onChange={(e) => setHooksJson(e.target.value)}
            rows={16}
            className="text-sm font-mono"
            placeholder={`{\n  "PostToolUse": [\n    {\n      "matcher": "Edit|Write",\n      "hooks": [\n        {"type": "command", "command": "npx biome format --write $FILE_PATH"}\n      ]\n    }\n  ]\n}`}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Hooks'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Events summary card ────────────────────────────────────────────────

function EventsSummaryCard({ events }: { events: EventSummary[] }) {
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
            <h4 className="font-medium text-foreground">No hooks configured</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add event keys like <code className="font-mono">PostToolUse</code>,{' '}
              <code className="font-mono">PreToolUse</code>, or <code className="font-mono">Notification</code>.
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
            Configured Events <span className="text-muted-foreground">({events.length})</span>
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Click an event to see its matchers and the commands each one runs.
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
            {event.matcherCount} {event.matcherCount === 1 ? 'matcher' : 'matchers'}
          </Badge>
          <span className="text-xs text-muted-foreground">·</span>
          <Badge variant="primary">
            {event.hookCount} {event.hookCount === 1 ? 'hook' : 'hooks'}
          </Badge>
        </div>
      </button>
      {expanded && (
        <div
          id={`event-detail-${event.name}`}
          className="space-y-3 border-t border-border/40 bg-muted/20 px-4 py-3"
        >
          {event.matchers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No matchers in this event.</p>
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
  return (
    <div className="rounded-md bg-background/60 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          matcher {index + 1}
        </span>
        {matcher.matcher === '*' ? (
          <Badge variant="info">all tools</Badge>
        ) : (
          <code className="truncate font-mono text-xs text-foreground/90" title={matcher.matcher}>
            {matcher.matcher}
          </code>
        )}
      </div>
      {matcher.hookDescriptions.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No hooks in this matcher.</p>
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
