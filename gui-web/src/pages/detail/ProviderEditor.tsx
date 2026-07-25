/**
 * Provider Editor — cc-switch style (Profile side).
 * Uses shared ProviderFormFields + Library apply cards.
 *
 * Library cards show per-provider status (Active / Modified / —) computed
 * from the current settings.json env so users can see at a glance which
 * library provider is in effect, and which has been edited on top.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { applyProviderToProfile, fetchProviders } from '@/api/providers'
import { patchJsonFile } from '@/api/files'
import { ClaudeProviderForm } from '@/components/provider/forms/ClaudeProviderForm'
import {
  defaultFormValues,
  formValuesToEnv,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import type { AgentType, Provider } from '@/api'

type MatchStatus = 'active' | 'modified' | 'none'

interface ParsedSettings {
  env: Record<string, string>
  model?: string
  effortLevel?: string
  providerMeta?: {
    id?: string
    name?: string
    notes?: string
    website_url?: string
    icon?: string
    icon_color?: string
    category?: string
    apiFormat?: string
  }
}

function parseSettings(content: string): ParsedSettings {
  try {
    const data = JSON.parse(content)
    return {
      env: data.env ?? {},
      model: data.model,
      effortLevel: data.effortLevel,
      providerMeta: data._provider,
    }
  } catch {
    return { env: {} }
  }
}

/**
 * Compare a library provider's env against the currently applied settings.
 * - base_url fully matches + model matches → 'active'
 * - base_url matches but model diverges (or other key diffs) → 'modified'
 * - base_url differs → 'none'
 */
function matchStatus(provider: Provider, current: ParsedSettings): MatchStatus {
  const libEnv = provider.settings?.env ?? {}
  const libBase = libEnv.ANTHROPIC_BASE_URL
  const curBase = current.env.ANTHROPIC_BASE_URL
  if (!libBase || !curBase) return 'none'
  if (libBase !== curBase) return 'none'

  // base_url matches — check model + a couple of other env keys for "modified".
  const libModel = libEnv.ANTHROPIC_MODEL ?? ''
  const curModel = current.env.ANTHROPIC_MODEL ?? current.model ?? ''
  if (libModel && curModel && libModel !== curModel) return 'modified'

  // spot-check a few other commonly-edited env keys
  const watchKeys = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'API_TIMEOUT_MS']
  for (const key of watchKeys) {
    const libVal = libEnv[key] ?? ''
    const curVal = current.env[key] ?? ''
    if (libVal !== curVal) return 'modified'
  }
  return 'active'
}

export function ProviderEditor({
  path, content, onRefresh, agentType,
}: {
  path: string; content: string; onRefresh: () => void
  agentType: string
}) {
  // Local override of `content` so Apply can take effect instantly without
  // waiting for a parent re-fetch. This is the root-cause fix for the
  // "Apply doesn't refresh" bug.
  const [contentOverride, setContentOverride] = useState<string | null>(null)
  const effectiveContent = contentOverride ?? content
  const parsed = useMemo(() => parseSettings(effectiveContent), [effectiveContent])

  const [values, setValues] = useState<ProviderFormValues>(() => {
    const def = defaultFormValues(parsed.env, parsed.model, parsed.effortLevel)
    // Merge _provider metadata into form values
    const meta = parsed.providerMeta
    if (meta) {
      if (meta.name) def.name = meta.name
      if (meta.notes) def.notes = meta.notes
      if (meta.website_url) def.websiteUrl = meta.website_url
      if (meta.apiFormat) def.apiFormat = meta.apiFormat
    }
    return def
  })
  const [saving, setSaving] = useState(false)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const { toast } = useToast()

  // Sync form values when the underlying parsed settings change
  // (e.g. after onRefresh brings new content, or after a library apply).
  useEffect(() => {
    const def = defaultFormValues(parsed.env, parsed.model, parsed.effortLevel)
    const meta = parsed.providerMeta
    if (meta) {
      if (meta.name) def.name = meta.name
      if (meta.notes) def.notes = meta.notes
      if (meta.website_url) def.websiteUrl = meta.website_url
      if (meta.apiFormat) def.apiFormat = meta.apiFormat
    }
    setValues(def)
  }, [parsed.env, parsed.model, parsed.effortLevel, parsed.providerMeta?.id])

  useEffect(() => {
    if (agentType !== 'claude') return
    fetchProviders(agentType as AgentType).then(setLibraryProviders).catch(() => {})
  }, [agentType])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const newEnv = formValuesToEnv(values)
      await patchJsonFile(path, 'env', newEnv)
      if (values.fallbackModel !== (parsed.model ?? '')) await patchJsonFile(path, 'model', values.fallbackModel)
      if (values.effortLevel !== (parsed.effortLevel ?? '')) await patchJsonFile(path, 'effortLevel', values.effortLevel)
      onRefresh()
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save provider settings' })
    } finally {
      setSaving(false)
    }
  }, [path, values, parsed.model, parsed.effortLevel, onRefresh, toast])

  const handleApplyFromLibrary = useCallback(async (providerId: string) => {
    const provider = libraryProviders.find((p) => p.id === providerId)
    if (!provider) return

    setApplyingId(providerId)
    try {
      const parts = path.split('/profiles/')
      if (parts.length !== 2) {
        toast({ type: 'error', message: 'Could not resolve profile name from path' })
        return
      }
      const profileName = parts[1].split('/')[0]
      await applyProviderToProfile(profileName, providerId)

      // Local state update — fixes the "must exit and re-enter" bug.
      // We mirror what the server-side apply just wrote so the UI reflects
      // the change immediately, without waiting for a re-fetch.
      const libEnv = provider.settings?.env ?? {}
      const nextEnv = { ...parsed.env, ...libEnv }
      const nextModel = libEnv.ANTHROPIC_MODEL ?? parsed.model
      const nextContent = JSON.stringify({
        ...(JSON.parse(effectiveContent || '{}') as Record<string, unknown>),
        env: nextEnv,
        model: nextModel,
      })
      setContentOverride(nextContent)

      onRefresh()
      toast({ type: 'success', message: `${provider.name} applied to profile` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [path, libraryProviders, parsed.env, parsed.model, effectiveContent, onRefresh, toast])

  return (
    <div className="space-y-4">
      {libraryProviders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Apply from Library</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {libraryProviders.map((p) => (
              <LibraryProviderRow
                key={p.id}
                provider={p}
                status={matchStatus(p, parsed)}
                applying={applyingId === p.id}
                disabled={applyingId !== null}
                onApply={() => handleApplyFromLibrary(p.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Provider Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ClaudeProviderForm values={values} onChange={setValues} />
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Provider Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Library provider row ───────────────────────────────────────────────

function statusDotClass(status: MatchStatus): string {
  if (status === 'active') return 'bg-success'
  if (status === 'modified') return 'bg-warning'
  return 'bg-muted-foreground/30'
}

function statusBadge(status: MatchStatus) {
  if (status === 'active') return { variant: 'success' as const, label: 'Active' }
  if (status === 'modified') return { variant: 'warning' as const, label: 'Modified' }
  return null
}

function LibraryProviderRow({
  provider, status, applying, disabled, onApply,
}: {
  provider: Provider
  status: MatchStatus
  applying: boolean
  disabled: boolean
  onApply: () => void
}) {
  const env = provider.settings?.env ?? {}
  const model = env.ANTHROPIC_MODEL ?? ''
  const baseUrl = env.ANTHROPIC_BASE_URL ?? ''
  const isApplied = status === 'active'
  const badge = statusBadge(status)

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 ring-1 ring-border/60">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(status)}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{provider.name}</span>
            {provider.category && (
              <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{provider.category}</Badge>
            )}
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {model && (
              <span className="font-mono">
                <span className="text-muted-foreground/70">model</span> {model}
              </span>
            )}
            {baseUrl && (
              <span className="truncate font-mono" title={baseUrl}>{baseUrl}</span>
            )}
          </div>
        </div>
      </div>
      <Button
        variant={isApplied ? 'ghost' : 'ghost'}
        size="sm"
        disabled={isApplied || disabled}
        onClick={onApply}
        className={isApplied ? 'text-muted-foreground' : ''}
      >
        {applying ? '...' : isApplied ? 'Applied' : 'Apply'}
      </Button>
    </div>
  )
}
