/**
 * MCP Tab — shows MCP servers applied to this profile.
 *
 * Pure display + delete component. Receives the parsed dot-claude.json
 * contents (`mcpJson`) and the library MCP list (`libraryMcp`) as props.
 * The parent is responsible for fetching and refreshing both.
 *
 * Removal writes back to `${profilePath}/dot-claude.json` via patchJsonFile.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { patchJsonFile } from '@/api/files'
import type { McpServer, McpServerConfig } from '@/api/types'

type McpType = McpServerConfig['type']

interface McpEntry {
  type: McpType | string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

interface McpTabProps {
  profileName: string
  /** Profile directory on disk — used to construct the patchJsonFile path. */
  profilePath: string
  /** Raw contents of dot-claude.json. Parent re-fetches this on refresh. */
  mcpJson: string
  /** Library records — entries are matched by id when provided. */
  libraryMcp?: McpServer[]
  /** Optional: navigate to the Library page (e.g. for empty-state CTA). */
  onNavigateLibrary?: () => void
}

function typeBadgeVariant(type: string): 'success' | 'info' | 'neutral' {
  if (type === 'stdio') return 'success'
  if (type === 'sse') return 'info'
  return 'neutral' // http + unknown
}

function summarizeEntry(entry: McpEntry): string {
  if (entry.command) {
    const args = entry.args?.length ? ` ${entry.args.join(' ')}` : ''
    return `${entry.command}${args}`
  }
  if (entry.url) return entry.url
  return '(no command or url)'
}

function parseMcpServers(raw: string): { servers: Record<string, McpEntry>; error: string | null } {
  try {
    const parsed = JSON.parse(raw || '{}')
    return { servers: parsed.mcpServers ?? {}, error: null }
  } catch (error) {
    return {
      servers: {},
      error: error instanceof Error ? error.message : 'Failed to parse dot-claude.json',
    }
  }
}

export function McpTab({
  profileName, profilePath, mcpJson, libraryMcp, onNavigateLibrary,
}: McpTabProps) {
  const mcpPath = `${profilePath}/dot-claude.json`
  const [servers, setServers] = useState<Record<string, McpEntry>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const libraryById = useMemo(() => {
    const map = new Map<string, McpServer>()
    for (const item of libraryMcp ?? []) map.set(item.id, item)
    return map
  }, [libraryMcp])

  // Sync `servers` whenever the parent-provided `mcpJson` changes
  // (e.g. after library apply triggers an `onRefresh` round-trip).
  useEffect(() => {
    const { servers: parsed, error } = parseMcpServers(mcpJson)
    setServers(parsed)
    setParseError(error)
  }, [mcpJson])

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmRemove = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    const { id } = pendingDelete
    try {
      const next = { ...servers }
      delete next[id]
      await patchJsonFile(mcpPath, 'mcpServers', next)
      setServers(next)
      setExpanded((current) => {
        const nextSet = new Set(current)
        nextSet.delete(id)
        return nextSet
      })
      toast({ type: 'success', message: `${id} removed from ${profileName}` })
      setPendingDelete(null)
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove MCP server' })
    } finally {
      setDeleting(false)
    }
  }

  const entries = Object.entries(servers)
  const canNavigate = typeof onNavigateLibrary === 'function'

  return (
    <Card>
      <CardHeader>
        <CardTitle>MCP Servers ({entries.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {parseError ? (
          <p className="text-sm text-destructive">Failed to parse dot-claude.json: {parseError}</p>
        ) : entries.length === 0 ? (
          <EmptyState canNavigate={canNavigate} onNavigate={onNavigateLibrary} />
        ) : (
          entries.map(([id, cfg]) => {
            const libraryMatch = libraryById.get(id)
            const displayName = libraryMatch?.name ?? id
            const description = libraryMatch?.description ?? ''
            const isExpanded = expanded.has(id)
            const summary = summarizeEntry(cfg)
            const envKeys = cfg.env ? Object.keys(cfg.env) : []
            const headerKeys = cfg.headers ? Object.keys(cfg.headers) : []
            const args = cfg.args ?? []

            return (
              <Card key={id} elevation="flat" className="ring-1 ring-border/60">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <rect x="3" y="4" width="18" height="6" rx="1.5" />
                      <rect x="3" y="14" width="18" height="6" rx="1.5" />
                      <circle cx="7" cy="7" r="1" fill="currentColor" />
                      <circle cx="7" cy="17" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-foreground">{displayName}</h4>
                      <Badge variant={typeBadgeVariant(cfg.type)}>{cfg.type || 'unknown'}</Badge>
                      {libraryMatch && (
                        <Badge variant="primary">library</Badge>
                      )}
                    </div>
                    {libraryMatch && libraryMatch.name !== id && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{id}</p>
                    )}
                    {description ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                    ) : (
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{summary}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(id)}
                    >
                      {isExpanded ? 'Hide details' : 'Details'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete({ id, label: displayName })}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-foreground">Type</p>
                        <code className="break-all text-xs text-muted-foreground">{cfg.type || 'unknown'}</code>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-foreground">Server ID</p>
                        <code className="break-all text-xs text-muted-foreground">{id}</code>
                      </div>
                    </div>
                    {cfg.command && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">Command</p>
                        <code className="break-all text-xs text-muted-foreground">{cfg.command}</code>
                      </div>
                    )}
                    {cfg.url && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">URL</p>
                        <code className="break-all text-xs text-muted-foreground">{cfg.url}</code>
                      </div>
                    )}
                    {cfg.type === 'stdio' && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">Args ({args.length})</p>
                        {args.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No arguments.</p>
                        ) : (
                          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
                            {args.map((arg, index) => (
                              <li key={`${index}-${arg}`} className="break-all">{arg}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {envKeys.length > 0 && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">Env vars ({envKeys.length})</p>
                        <p className="mb-1 text-xs text-muted-foreground">Keys only — values are hidden.</p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
                          {envKeys.map((key) => (
                            <li key={key} className="break-all">{key}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {headerKeys.length > 0 && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">Headers ({headerKeys.length})</p>
                        <p className="mb-1 text-xs text-muted-foreground">Keys only — values are hidden.</p>
                        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
                          {headerKeys.map((key) => (
                            <li key={key} className="break-all">{key}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {libraryMatch && (
                      <div>
                        <p className="mb-1 font-medium text-foreground">Library</p>
                        <p className="text-xs text-muted-foreground">
                          Matched library entry: <span className="font-mono">{libraryMatch.id}</span>
                          {libraryMatch.tags.length > 0 && ` · tags: ${libraryMatch.tags.join(', ')}`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })
        )}
      </CardContent>
      <ConfirmDialog
        open={pendingDelete != null}
        title="Remove MCP server?"
        description={pendingDelete ? `This will remove “${pendingDelete.label}” from mcpServers in ${profileName}.` : undefined}
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}

function EmptyState({ canNavigate, onNavigate }: { canNavigate: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
            <circle cx="7" cy="7" r="1" fill="currentColor" />
            <circle cx="7" cy="17" r="1" fill="currentColor" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">
            No MCP servers applied to this profile.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Apply one from the Library page, or edit{' '}
            <code className="font-mono">dot-claude.json</code> in the Storage tab.
          </p>
        </div>
      </div>
      {canNavigate ? (
        <Button size="sm" onClick={onNavigate}>Open Library</Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Use the sidebar to go to the Library page and apply an MCP server.
        </p>
      )}
    </div>
  )
}
