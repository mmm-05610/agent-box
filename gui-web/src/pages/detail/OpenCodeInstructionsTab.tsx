/**
 * OpenCode Instructions Tab — read-only display of the `instructions` array
 * from opencode.jsonc. Each entry can be a local path, glob, or URL.
 *
 * For local-path entries we best-effort detect file existence via findFiles
 * on the parent directory. URLs and globs are always marked "URL / glob".
 *
 * Editing happens in the Storage tab.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { findFiles } from '@/api/files'

interface OpenCodeInstructionsTabProps {
  configJsonc: string
  profilePath: string
}

interface InstructionRow {
  raw: string
  kind: 'url' | 'glob' | 'absolute' | 'relative' | 'unknown'
  /** Best-effort file existence for local paths; null if not yet checked or not local. */
  exists: boolean | null
}

function classify(raw: string): InstructionRow['kind'] {
  const trimmed = raw.trim()
  if (!trimmed) return 'unknown'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return 'url'
  if (/[*?\[\]{}]/.test(trimmed)) return 'glob'
  if (trimmed.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(trimmed)) return 'absolute'
  return 'relative'
}

async function checkLocalExists(raw: string, profilePath: string): Promise<boolean | null> {
  // Resolve relative paths against the profile path so a config like
  // "./AGENTS.md" works.
  const isRelative = !raw.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(raw)
  const absolute = isRelative ? `${profilePath.replace(/\/+$/, '')}/${raw}` : raw
  const lastSlash = absolute.lastIndexOf('/')
  const parent = lastSlash > 0 ? absolute.slice(0, lastSlash) : '.'
  const base = absolute.slice(lastSlash + 1)
  if (!base) return null
  try {
    const found = await findFiles(parent)
    if (!Array.isArray(found)) return null
    return found.some((path) => path === absolute || path.endsWith(`/${base}`))
  } catch {
    return null
  }
}

function parseInstructions(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return []
    const value = (parsed as Record<string, unknown>).instructions
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    // Fall back to a defensive scan — pull out "..." tokens to avoid showing nothing
    // when the JSON is slightly malformed (e.g. trailing comma in JSONC).
    const matches = trimmed.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g) ?? []
    return matches.map((m) => m.slice(1, -1))
  }
}

export function OpenCodeInstructionsTab({ configJsonc, profilePath }: OpenCodeInstructionsTabProps) {
  const rawEntries = useMemo(() => parseInstructions(configJsonc), [configJsonc])
  const [existsMap, setExistsMap] = useState<Record<string, boolean | null>>({})

  useEffect(() => {
    let cancelled = false
    async function probe() {
      const updates: Record<string, boolean | null> = {}
      for (const raw of rawEntries) {
        const kind = classify(raw)
        if (kind === 'url' || kind === 'glob' || kind === 'unknown') continue
        updates[raw] = await checkLocalExists(raw, profilePath)
        if (cancelled) return
      }
      if (!cancelled) setExistsMap(updates)
    }
    void probe()
    return () => { cancelled = true }
  }, [rawEntries, profilePath])

  const rows: InstructionRow[] = rawEntries.map((raw) => ({
    raw,
    kind: classify(raw),
    exists: classify(raw) === 'url' || classify(raw) === 'glob' || classify(raw) === 'unknown'
      ? null
      : existsMap[raw] ?? null,
  }))

  const hasConfig = configJsonc.trim().length > 0
  const hasParseError = hasConfig && rawEntries.length === 0 && /^\s*\{/.test(configJsonc)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instructions</CardTitle>
        <p className="text-sm text-muted-foreground">
          Files, globs, and URLs referenced by the <code className="font-mono">instructions</code>{' '}
          array in <code className="font-mono">opencode.jsonc</code>. Read-only — edit the array in the Storage tab.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasConfig && (
          <p className="text-sm text-muted-foreground">
            No <code className="font-mono">opencode.jsonc</code> found for this profile.
          </p>
        )}

        {hasParseError && (
          <p className="text-sm text-destructive">
            Could not parse <code className="font-mono">opencode.jsonc</code> as JSON. Check the Storage tab.
          </p>
        )}

        {hasConfig && !hasParseError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No custom instructions configured. Add paths/globs/URLs to the{' '}
            <code className="font-mono">instructions</code> array in opencode.jsonc.
          </p>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-lg ring-1 ring-border/60">
            {rows.map((row, index) => (
              <li key={`${row.raw}-${index}`} className="flex items-start gap-3 p-3">
                <KindBadge kind={row.kind} />
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground/90" title={row.raw}>
                  {row.raw}
                </code>
                <ExistenceMark kind={row.kind} exists={row.exists} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function KindBadge({ kind }: { kind: InstructionRow['kind'] }) {
  switch (kind) {
    case 'url':
      return <Badge variant="info">URL</Badge>
    case 'glob':
      return <Badge variant="neutral">glob</Badge>
    case 'absolute':
      return <Badge variant="neutral">path</Badge>
    case 'relative':
      return <Badge variant="neutral">path</Badge>
    default:
      return <Badge variant="warning">unknown</Badge>
  }
}

function ExistenceMark({ kind, exists }: { kind: InstructionRow['kind']; exists: boolean | null }) {
  if (kind === 'url' || kind === 'glob') {
    return <span className="shrink-0 text-xs text-muted-foreground">—</span>
  }
  if (exists === null) {
    return <span className="shrink-0 text-xs text-muted-foreground">checking…</span>
  }
  if (exists) {
    return <Badge variant="success">exists</Badge>
  }
  return <Badge variant="warning">missing</Badge>
}
