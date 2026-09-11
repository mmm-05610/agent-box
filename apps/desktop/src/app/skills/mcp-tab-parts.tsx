// Extracted verbatim from mcp-tab.tsx (see docs/desktop-megafile-decomposition.md).

import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { LogTail } from '@/components/chat/log-tail'
import { PageLoader } from '@/components/page-loader'
import { AvatarChip } from '@/components/ui/avatar-chip'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tip } from '@/components/ui/tooltip'
import {
  getActionStatus,
  getLogs,
  installMcpCatalogEntry,
  type McpCatalogEntry,
  type ProfileScope
} from '@/hermes'
import { useI18n } from '@/i18n'
import { startCompletionPoll } from '@/lib/completion-poll'
import { brandFor } from '@/lib/mcp-brands'
import { type McpImportEntry, parseMcpImport } from '@/lib/mcp-import'
import { isToolEnabled } from '@/lib/mcp-tool-filter'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $activeGatewayProfile } from '@/store/profile'

import { ICON_BUTTON } from '../master-detail'
import { PanelEmpty } from '../overlays/panel'
import { prettyName } from '../settings/helpers'

import {
  capabilitySummary,
  type Probe,
  type ServerCost,
  serverEnabled,
  type ServerStatus,
  STATUS_DOT,
  statusOf,
} from './view-model'

export function ServerConfig({
  authing,
  cost,
  description,
  entry,
  name,
  onAuthenticate,
  onBack,
  onProbe,
  onRemove,
  onToggle,
  onToggleTool,
  probe,
  saved,
  saving
}: {
  authing: boolean
  cost?: ServerCost
  description: null | string
  entry: Record<string, unknown>
  name: string
  onAuthenticate: () => void
  onBack: () => void
  onProbe: () => void
  onRemove: () => void
  onToggle: (checked: boolean) => void
  onToggleTool: (toolName: string) => void
  probe: Probe | undefined
  saved: boolean
  saving: boolean
}) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const status = statusOf(entry, probe)

  // OAuth is only offered to servers that are actually OAuth-shaped. A server
  // with `headers` uses API-key/bearer auth — a 401 there means a bad key, NOT
  // "log in with OAuth"; routing it through the browser flow would wrongly
  // rewrite its config to `auth: oauth`. So: explicit `auth: oauth` can re-auth
  // on failure; an auth-less HTTP server may try OAuth on a 401; header servers
  // never do.
  const hasHeaderAuth = !!entry.headers && typeof entry.headers === 'object'

  const canAuth =
    typeof entry.url === 'string' &&
    !hasHeaderAuth &&
    (entry.auth === 'oauth' ? status === 'needs-auth' || status === 'error' : !entry.auth && status === 'needs-auth')

  const summary = probe && probe !== 'probing' && probe.ok ? capabilitySummary(m, probe, entry, cost) : null

  return (
    // p-2 matches the list view's container so flipping list ⇄ config keeps
    // content anchored at the same origin.
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable]">
      {/* Geometry cloned from McpRow so nothing jumps when flipping list ⇄
          config: items-start with per-element top margins that reproduce the
          row's h-11 centering exactly (h-5 controls → mt-3, size-6 avatar →
          mt-2.5, h-4 switch → mt-3.5) no matter how tall the text column gets. */}
      <div className="flex items-start gap-2 pr-1.5">
        <Tip label={m.allServers}>
          <Button
            aria-label={m.allServers}
            className={cn('mt-3', ICON_BUTTON)}
            onClick={onBack}
            size="icon"
            variant="ghost"
          >
            <Codicon name="chevron-left" size="0.8125rem" />
          </Button>
        </Tip>
        <McpAvatar className="mt-2.5" name={name} status={status} />
        <div className="min-w-0 flex-1 pt-1">
          <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">{prettyName(name)}</h3>
          <p className="mt-0.5 truncate text-[0.68rem] text-(--ui-text-tertiary)">
            {typeof entry.url === 'string' ? entry.url : [entry.command, ...((entry.args as string[]) ?? [])].join(' ')}
          </p>
          {summary && <p className="mt-0.5 text-[0.68rem] text-(--ui-text-tertiary)">{summary}</p>}
        </div>
        {saved && (
          // Direct row children (no wrapper): the icons↔switch gap must be the
          // row's own gap-2, byte-identical to McpRow.
          <>
            <ServerIconActions
              className="mt-3"
              onProbe={onProbe}
              onRemove={onRemove}
              probing={probe === 'probing'}
              saving={saving}
            />
            <ServerSwitch
              className="mt-3.5"
              disabled={saving}
              enabled={serverEnabled(entry)}
              name={name}
              onToggle={onToggle}
            />
          </>
        )}
      </div>

      {description && (
        <p className="mt-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {description}
        </p>
      )}

      {canAuth && saved && (
        <div className="mt-3 flex justify-end">
          <Button disabled={authing} onClick={onAuthenticate} size="xs">
            {authing ? m.waitingForBrowser : m.authenticate}
          </Button>
        </div>
      )}
      {!saved && <p className="mt-3 text-[0.68rem] text-muted-foreground/60">{m.unsavedConnect}</p>}

      {status === 'probing' && <PageLoader className="min-h-24" label={t.skills.loading} />}

      {/* No inline error dump — the status dot/line says "Error"/"Needs
          authentication", and the actual failure lands in the logs pane below
          (and the console). A big red block here just shouts the same thing. */}

      {probe && probe !== 'probing' && probe.ok && probe.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {/* Chip = a discovered tool; click to include/exclude it (struck
              through when excluded, so it won't register). The probe always
              lists every tool regardless of the filter. */}
          {probe.tools.map(tool => {
            const on = isToolEnabled(entry, tool.name)

            return (
              <button
                aria-pressed={on}
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary) hover:text-foreground',
                  saved ? 'cursor-pointer' : 'cursor-default',
                  on ? 'bg-(--ui-bg-quinary)' : 'line-through opacity-70'
                )}
                disabled={!saved}
                key={tool.name}
                onClick={() => onToggleTool(tool.name)}
                title={on ? m.disableTool(tool.name) : m.enableTool(tool.name)}
                type="button"
              >
                {tool.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ServerSwitch({
  className,
  disabled,
  enabled,
  name,
  onToggle
}: {
  className?: string
  disabled: boolean
  enabled: boolean
  name: string
  onToggle: (checked: boolean) => void
}) {
  return (
    <Switch
      aria-label={name}
      checked={enabled}
      className={cn('shrink-0 cursor-pointer', !enabled && 'opacity-60', className)}
      disabled={disabled}
      onCheckedChange={onToggle}
      size="xs"
      title={name}
    />
  )
}

export function ServerIconActions({
  className,
  onProbe,
  onRemove,
  probing,
  saving
}: {
  className?: string
  onProbe: () => void
  onRemove: () => void
  probing: boolean
  saving: boolean
}) {
  const { t } = useI18n()
  const m = t.settings.mcp

  return (
    <span className={cn('flex items-center gap-0.5', className)}>
      <Tip label={m.reload}>
        <Button
          aria-label={m.reload}
          className={ICON_BUTTON}
          disabled={probing}
          onClick={onProbe}
          size="icon"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.8125rem" spinning={probing} />
        </Button>
      </Tip>
      <Tip label={m.remove}>
        <Button
          aria-label={m.remove}
          className={cn(ICON_BUTTON, 'hover:text-destructive')}
          disabled={saving}
          onClick={onRemove}
          size="icon"
          variant="ghost"
        >
          <Codicon name="trash" size="0.8125rem" />
        </Button>
      </Tip>
    </span>
  )
}

export function McpImportButton({ disabled, onImport }: { disabled: boolean; onImport: (entries: McpImportEntry[]) => void }) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const entries = useMemo(() => parseMcpImport(text), [text])

  const reset = () => {
    setText('')
  }

  const confirm = () => {
    if (!entries) {
      return
    }

    onImport(entries)
    setOpen(false)
    reset()
  }

  return (
    <Popover
      onOpenChange={next => {
        setOpen(next)

        if (!next) {
          reset()
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button className="h-5 px-1 text-[0.68rem]" disabled={disabled} size="xs" variant="text">
          <Codicon name="clippy" size="0.75rem" />
          {m.importButton}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={m.importButton}
            autoFocus
            className="max-h-40 min-h-20 font-mono text-[0.68rem]"
            onChange={event => setText(event.currentTarget.value)}
            placeholder={m.importPlaceholder}
            value={text}
          />
          {entries ? (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {entries.map((entry, index) => (
                <div className="rounded-md bg-(--ui-bg-tertiary) px-2 py-1.5" key={`${entry.name}-${index}`}>
                  <span className="block truncate text-[0.72rem] font-medium text-foreground/85">{entry.name}</span>
                  <span className="block truncate font-mono text-[0.62rem] text-muted-foreground/60">
                    {typeof entry.config.url === 'string'
                      ? entry.config.url
                      : [entry.config.command, ...((entry.config.args as string[]) ?? [])].join(' ')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            text.trim() && <p className="px-0.5 text-[0.62rem] text-muted-foreground/60">{m.importNoMatch}</p>
          )}
          <div className="flex justify-end">
            <Button disabled={!entries} onClick={confirm} size="xs">
              {entries && entries.length > 1 ? m.importConfirmMany(entries.length) : m.importConfirm}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function CatalogTag({ children }: { children: string }) {
  return (
    <span className="rounded bg-(--ui-bg-tertiary) px-1.5 py-0.5 text-[0.6rem] text-(--ui-text-secondary)">
      {children}
    </span>
  )
}

export function McpCatalog({
  entries,
  loading,
  onInstalled,
  profile
}: {
  entries: McpCatalogEntry[]
  loading: boolean
  onInstalled: () => void
  profile?: ProfileScope
}) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const [installing, setInstalling] = useState<null | string>(null)
  const [envDrafts, setEnvDrafts] = useState<Record<string, Record<string, string>>>({})
  const [envOpenFor, setEnvOpenFor] = useState<null | string>(null)

  const install = async (entry: McpCatalogEntry) => {
    const required = entry.required_env.filter(env => env.required)
    const draft = envDrafts[entry.name] ?? {}

    // Reveal the credential prompt first; only error once it's shown and unfilled.
    if (required.some(env => !draft[env.name]?.trim())) {
      if (envOpenFor !== entry.name) {
        setEnvOpenFor(entry.name)

        return
      }

      notify({ kind: 'error', title: m.catalogEnvPrompt(entry.name), message: m.catalogEnvRequired })

      return
    }

    setInstalling(entry.name)

    try {
      const res = await installMcpCatalogEntry(entry.name, draft, profile ?? undefined)

      // Git-backed entries clone in the background — keep the row busy and poll
      // the action to completion before refetching / re-enabling, so a re-click
      // can't spawn a second install over the first's tracked process. A non-zero
      // exit is a real failure — surface it instead of a false success.
      if (res.background && res.action) {
        for (;;) {
          const status = await getActionStatus(res.action, 1, profile ?? undefined)

          if (!status.running) {
            if (status.exit_code !== 0) {
              throw new Error(m.catalogInstallFailed(entry.name))
            }

            break
          }

          await new Promise(resolve => setTimeout(resolve, CATALOG_INSTALL_POLL_MS))
        }
      }

      notify({ kind: 'success', title: m.catalogInstallStarted(entry.name), message: '' })
      setEnvOpenFor(null)
      onInstalled()
    } catch (err) {
      notifyError(err, m.catalogInstallFailed(entry.name))
    } finally {
      setInstalling(null)
    }
  }

  if (loading) {
    return <PageLoader className="min-h-24" label={m.catalogLoading} />
  }

  if (entries.length === 0) {
    return <PanelEmpty description={m.catalogEmpty} icon="plug" title={m.tabCatalog} />
  }

  return (
    <div className="flex flex-col">
      {entries.map(entry => {
        const draft = envDrafts[entry.name] ?? {}

        return (
          <div className="rounded-md px-2 py-2" key={entry.name}>
            <div className="flex items-start gap-2">
              {/* 2px nudge so the start-aligned avatar sits where McpRow's
                  center-aligned one does — no jump when flipping Servers⇄Catalog. */}
              <McpAvatar
                className="mt-0.5"
                name={entry.name}
                status={entry.installed ? (entry.enabled ? 'ok' : 'off') : 'unknown'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[0.78rem] font-medium text-foreground/85">
                    {prettyName(entry.name)}
                  </span>
                  <CatalogTag>{entry.transport}</CatalogTag>
                  {entry.auth_type === 'oauth' && <CatalogTag>OAuth</CatalogTag>}
                  {entry.auth_type === 'api_key' && <CatalogTag>API key</CatalogTag>}
                  {entry.needs_install && !entry.installed && <CatalogTag>{m.catalogNeedsInstall}</CatalogTag>}
                  {entry.installed && (
                    <span className="text-[0.6rem] text-emerald-400">
                      {entry.enabled ? m.catalogEnabled : m.catalogInstalled}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[0.68rem] text-muted-foreground/70">{entry.description}</p>
                {envOpenFor === entry.name && entry.required_env.length > 0 && (
                  <div className="mt-2 grid gap-2">
                    {entry.required_env.map(env => (
                      <label className="grid gap-1" key={env.name}>
                        <span className="text-[0.62rem] text-muted-foreground">
                          {env.prompt || env.name}
                          {env.required ? ' *' : ''}
                        </span>
                        <Input
                          className="h-7 text-xs"
                          onChange={event =>
                            setEnvDrafts(prev => ({
                              ...prev,
                              [entry.name]: { ...prev[entry.name], [env.name]: event.currentTarget.value }
                            }))
                          }
                          type="password"
                          value={draft[env.name] ?? ''}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Button
                className="mt-0.5 shrink-0"
                disabled={entry.installed || installing !== null}
                onClick={() => void install(entry)}
                size="xs"
                variant="text"
              >
                {installing === entry.name
                  ? m.catalogInstalling
                  : entry.installed
                    ? m.catalogInstalled
                    : m.catalogInstall}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const LOG_POLL_MS = 2000

export const CATALOG_INSTALL_POLL_MS = 1500

export const STDIO_MARKER_RE = /^===== \[.*\] starting MCP server '(.+)' =====$/

export function filterStdioSections(lines: string[], server: string): string[] {
  const out: string[] = []
  let inSection = false

  for (const line of lines) {
    const marker = STDIO_MARKER_RE.exec(line.trim())

    if (marker) {
      inSection = marker[1] === server
    }

    if (inSection) {
      out.push(line)
    }
  }

  return out
}

export function McpLogs({
  emptyLabel,
  server,
  source
}: {
  emptyLabel: string
  server: null | string
  source: 'stdio' | 'agent'
}) {
  const [lines, setLines] = useState<null | string[]>(null)
  // A profile switch reroutes getLogs to the new backend; keying the effect on
  // the active profile tears down the old poll (stop suppresses a late
  // publish) so profile A's logs never flash in B.
  const activeProfile = useStore($activeGatewayProfile)

  useEffect(() => {
    setLines(null)

    return startCompletionPoll({
      delayMs: LOG_POLL_MS,
      poll: async () => {
        const response =
          source === 'stdio'
            ? await getLogs({ file: 'mcp', lines: 500 })
            : await getLogs({ file: 'agent', lines: 300, search: server ?? 'mcp' })

        return source === 'stdio' && server ? filterStdioSections(response.lines, server) : response.lines
      },
      publish: setLines
    })
  }, [server, source, activeProfile])

  return <LogTail emptyLabel={emptyLabel} lines={lines} />
}

export function McpAvatar({ className, name, status }: { className?: string; name: string; status: ServerStatus }) {
  return (
    <AvatarChip
      brand={brandFor(name)}
      className={className}
      name={name}
      overlay={
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-(--ui-chat-surface-background)',
            STATUS_DOT[status]
          )}
        />
      }
    />
  )
}

export function McpRow({
  active,
  busy,
  enabled,
  name,
  onProbe,
  onRemove,
  onSelect,
  onToggle,
  status,
  statusText,
  unused
}: {
  active: boolean
  busy: boolean
  enabled: boolean
  name: string
  onProbe: () => void
  onRemove: () => void
  onSelect: () => void
  onToggle: (checked: boolean) => void
  status: ServerStatus
  statusText: string
  unused?: boolean
}) {
  const { t } = useI18n()
  const m = t.settings.mcp

  return (
    <div
      className={cn(
        'group/row row-hover flex h-11 w-full shrink-0 items-center gap-2 rounded-md pl-2 pr-1.5 hover:text-foreground',
        active ? 'bg-(--ui-row-active-background) text-foreground' : 'text-(--ui-text-secondary)'
      )}
      id={`mcp-server-${name}`}
    >
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        onClick={onSelect}
        type="button"
      >
        <McpAvatar name={name} status={status} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'min-w-0 truncate text-[0.78rem]',
                enabled ? 'font-medium text-foreground/85' : 'font-normal text-muted-foreground/60'
              )}
            >
              {prettyName(name)}
            </span>
            {/* Subtle "paying for schemas, not using them" hint — a muted pill,
                never a dialog. Shown only when the overlay KNOWS both halves:
                nonzero schema cost and zero 30-day uses. */}
            {unused && (
              <span className="shrink-0 rounded bg-(--ui-bg-tertiary) px-1 py-px text-[0.58rem] font-normal text-muted-foreground/60">
                {m.unusedPill}
              </span>
            )}
          </span>
          <span className="block truncate text-[0.62rem] text-muted-foreground/50">{statusText}</span>
        </span>
      </button>
      <ServerIconActions
        className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
        onProbe={onProbe}
        onRemove={onRemove}
        probing={status === 'probing'}
        saving={busy}
      />
      <ServerSwitch disabled={busy} enabled={enabled} name={name} onToggle={onToggle} />
    </div>
  )
}
