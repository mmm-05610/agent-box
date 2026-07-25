/**
 * OpenCode Provider Editor — cc-switch style (Profile side).
 *
 * Mirrors ProviderEditor (Claude) with three sections:
 *   1. Apply from Library — fetchProviders(opencode) + baseURL match + Apply
 *   2. Provider Settings — OpenCodeProviderForm (baseURL + apiKey + models JSON)
 *   3. Save — writes opencode.jsonc + auth.json via saveFile (JSON.parse +
 *      stringify with JSONC tolerance).
 *
 * Library matching: compare ``provider.<id>.options.baseURL`` lifted from
 * opencode.jsonc (current + library). Library side stores its baseURL under
 * settings.options.baseURL.
 *
 * JSONC tolerance: opencode.jsonc allows comments, but in practice the files
 * we ship are valid JSON. JSON.parse covers the common case; on parse error
 * the form's models textarea + raw file give the user enough escape hatches.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { fetchProviders } from '@/api/providers'
import { saveFile } from '@/api/files'
import {
  OpenCodeProviderForm,
  type OpenCodeNpmPackage,
} from '@/components/provider/forms/OpenCodeProviderForm'
import {
  defaultFormValues,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import type { AgentType, Provider } from '@/api'
import {
  extractOpenCodeApiKey,
  extractOpenCodeBaseUrl,
  parseOpenCodeJsonc,
  patchOpenCodeAuthJson,
  patchOpenCodeProvider,
} from './providerFileWriters'

interface OpenCodeProviderViewerProps {
  configJsonc: string
  authJson: string
  configDir: string
  dataDir: string
  profileName: string
  onRefresh: () => void
}

type MatchStatus = 'active' | 'modified' | 'none'

interface CurrentFields {
  /** First provider id in opencode.jsonc, or null. */
  providerId: string | null
  baseUrl: string
  apiKey: string
  hasConfig: boolean
  parseError: string | null
}

/** Pick the first provider id from opencode.jsonc — we display one provider at a time. */
function pickActiveProviderId(raw: string): string | null {
  const state = parseOpenCodeJsonc(raw)
  if (!state.parsed) return null
  const providerMap = state.parsed.provider as Record<string, unknown> | undefined
  if (!providerMap) return null
  const ids = Object.keys(providerMap).sort()
  return ids[0] ?? null
}

function readCurrent(configJsonc: string, authJson: string): CurrentFields {
  const state = parseOpenCodeJsonc(configJsonc)
  const providerId = pickActiveProviderId(configJsonc)
  const baseUrl = providerId ? (extractOpenCodeBaseUrl(configJsonc, providerId) ?? '') : ''
  const apiKeyFromConfig = providerId ? (extractOpenCodeApiKey(configJsonc, providerId) ?? '') : ''
  // Prefer the auth.json entry; fall back to the inline options.apiKey.
  let apiKeyFromAuth = ''
  if (authJson.trim()) {
    try {
      const parsed = JSON.parse(authJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && providerId) {
        const v = (parsed as Record<string, unknown>)[providerId]
        if (typeof v === 'string') apiKeyFromAuth = v
      }
    } catch {
      // ignore
    }
  }
  return {
    providerId,
    baseUrl,
    apiKey: apiKeyFromAuth || apiKeyFromConfig,
    hasConfig: configJsonc.trim().length > 0,
    parseError: state.parseError,
  }
}

function libraryBaseUrl(provider: Provider): string | null {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const options = (settings.options as Record<string, unknown> | undefined) ?? {}
  return typeof options.baseURL === 'string' ? options.baseURL : null
}

function libraryApiKey(provider: Provider): string {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const options = (settings.options as Record<string, unknown> | undefined) ?? {}
  const env = (settings.env as Record<string, string> | undefined) ?? {}
  if (typeof options.apiKey === 'string' && options.apiKey) return options.apiKey
  if (typeof env.api_key === 'string') return env.api_key
  return ''
}

/** Library side stores options.models as a JSON object; we render it as a string. */
function libraryModelsJson(provider: Provider): string {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const options = (settings.options as Record<string, unknown> | undefined) ?? {}
  const models = options.models
  if (!models) return ''
  try { return JSON.stringify(models, null, 2) } catch { return '' }
}

function matchStatus(provider: Provider, current: CurrentFields): MatchStatus {
  const libBase = libraryBaseUrl(provider)
  const curBase = current.baseUrl
  if (!libBase || !curBase) return 'none'
  if (libBase !== curBase) return 'none'
  if (libraryApiKey(provider) !== current.apiKey) return 'modified'
  return 'active'
}

/**
 * Library providers that share the same (baseURL, apiKey) are functionally
 * identical endpoints — collapse them so the Apply list doesn't show two
 * visually-similar rows for the same provider.
 *
 * When duplicates are found we keep the one with the longer / more descriptive
 * name (e.g. "Xiaomi MiMo Token Plan (China)" beats "MiMo" because the
 * extra tokens convey what kind of plan it is). Otherwise the first one wins.
 */
function dedupeOpenCodeProviders(providers: Provider[]): Provider[] {
  const groups = new Map<string, Provider[]>()
  for (const p of providers) {
    const base = libraryBaseUrl(p) ?? ''
    const key = libraryApiKey(p)
    // Only dedup when we have a meaningful baseURL — without one we can't
    // tell if two entries are really the same, so leave them alone.
    if (!base) {
      const fallbackKey = `id:${p.id}`
      const arr = groups.get(fallbackKey) ?? []
      arr.push(p)
      groups.set(fallbackKey, arr)
      continue
    }
    const k = `${base}\u0001${key}`
    const arr = groups.get(k) ?? []
    arr.push(p)
    groups.set(k, arr)
  }
  const out: Provider[] = []
  for (const arr of groups.values()) {
    if (arr.length === 1) { out.push(arr[0]!); continue }
    arr.sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0))
    out.push(arr[0]!)
  }
  return out
}

export function OpenCodeProviderViewer({
  configJsonc, authJson, configDir, dataDir, profileName, onRefresh,
}: OpenCodeProviderViewerProps) {
  const [configJsoncOverride, setConfigJsoncOverride] = useState<string | null>(null)
  const [authJsonOverride, setAuthJsonOverride] = useState<string | null>(null)
  const effectiveConfig = configJsoncOverride ?? configJsonc
  const effectiveAuth = authJsonOverride ?? authJson
  const current = useMemo(() => readCurrent(effectiveConfig, effectiveAuth), [effectiveConfig, effectiveAuth])

  const [values, setValues] = useState<ProviderFormValues>(() =>
    defaultFormValues(
      { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
      undefined,
      undefined,
    ),
  )
  // Extract provider.<id>.models from the active provider.
  const initialModels = useMemo(() => {
    const state = parseOpenCodeJsonc(effectiveConfig)
    if (!state.parsed || !current.providerId) return ''
    const providerMap = state.parsed.provider as Record<string, unknown> | undefined
    const provider = providerMap?.[current.providerId] as Record<string, unknown> | undefined
    if (!provider?.models) return ''
    try { return JSON.stringify(provider.models, null, 2) } catch { return '' }
  }, [effectiveConfig, current.providerId])
  const [modelsJson, setModelsJson] = useState<string>(initialModels)
  const activeProvider = useMemo(() => {
    const state = parseOpenCodeJsonc(effectiveConfig)
    const providers = state.parsed?.provider as Record<string, unknown> | undefined
    return current.providerId ? providers?.[current.providerId] as Record<string, unknown> | undefined : undefined
  }, [effectiveConfig, current.providerId])
  const [npmPackage, setNpmPackage] = useState<OpenCodeNpmPackage>(() => typeof activeProvider?.npm === 'string' ? activeProvider.npm as OpenCodeNpmPackage : '@ai-sdk/openai-compatible')
  const [extraOptions, setExtraOptions] = useState<Record<string, unknown>>(() => {
    const options = activeProvider?.options as Record<string, unknown> | undefined
    return Object.fromEntries(Object.entries(options ?? {}).filter(([key]) => key !== 'baseURL' && key !== 'apiKey'))
  })
  const [saving, setSaving] = useState(false)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    setValues(
      defaultFormValues(
        { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
        undefined,
        undefined,
      ),
    )
    setModelsJson(initialModels)
    setNpmPackage(typeof activeProvider?.npm === 'string' ? activeProvider.npm as OpenCodeNpmPackage : '@ai-sdk/openai-compatible')
    const options = activeProvider?.options as Record<string, unknown> | undefined
    setExtraOptions(Object.fromEntries(Object.entries(options ?? {}).filter(([key]) => key !== 'baseURL' && key !== 'apiKey')))
  }, [current.baseUrl, current.apiKey, initialModels, activeProvider])

  useEffect(() => {
    fetchProviders('opencode' as AgentType)
      .then((all) => setLibraryProviders(dedupeOpenCodeProviders(all)))
      .catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const providerName = current.providerId ?? 'custom'
      const nextConfig = patchOpenCodeProvider(effectiveConfig, providerName, values.baseUrl, values.authValue)
      // Merge provider.<id>.models into the same provider block.
      // in the right place. Only write when modelsJson is a valid object.
      let finalConfig = nextConfig
      {
        const state = parseOpenCodeJsonc(finalConfig)
        if (!state.parsed) throw new Error(`Invalid OpenCode config: ${state.parseError ?? 'parse error'}`)
        const providerMap = (state.parsed.provider as Record<string, unknown> | undefined) ?? {}
        const existing = (providerMap[providerName] as Record<string, unknown> | undefined) ?? {}
        const options: Record<string, unknown> = {}
        if (values.baseUrl) options.baseURL = values.baseUrl
        if (values.authValue) options.apiKey = values.authValue
        for (const [key, value] of Object.entries(extraOptions)) if (value !== '' && value !== undefined) options[key] = value
        providerMap[providerName] = { ...existing, npm: npmPackage, options }
        state.parsed.provider = providerMap
        finalConfig = JSON.stringify(state.parsed, null, 2) + '\n'
      }
      const trimmed = modelsJson.trim()
      if (trimmed.length > 0) {
        try {
          const parsedModels = JSON.parse(trimmed)
          if (parsedModels && typeof parsedModels === 'object' && !Array.isArray(parsedModels)) {
            const state = parseOpenCodeJsonc(finalConfig)
            if (state.parsed) {
              const providerMap = (state.parsed.provider as Record<string, unknown> | undefined) ?? {}
              const existing = (providerMap[providerName] as Record<string, unknown> | undefined) ?? {}
              providerMap[providerName] = { ...existing, models: parsedModels }
              state.parsed.provider = providerMap
              finalConfig = JSON.stringify(state.parsed, null, 2) + '\n'
            }
          } else {
            throw new Error('provider models must be a JSON object')
          }
        } catch (error) {
          throw new Error(`Invalid models JSON: ${error instanceof Error ? error.message : 'parse error'}`)
        }
      }
      const nextAuth = patchOpenCodeAuthJson(effectiveAuth, providerName, values.authValue)

      const ok1 = await saveFile(`${configDir}/opencode.jsonc`, finalConfig)
      const ok2 = await saveFile(`${dataDir}/auth.json`, nextAuth)
      if (!ok1 || !ok2) throw new Error('Failed to save OpenCode files')

      setConfigJsoncOverride(finalConfig)
      setAuthJsonOverride(nextAuth)
      onRefresh()
      toast({ type: 'success', message: 'OpenCode provider saved' })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save OpenCode provider' })
    } finally {
      setSaving(false)
    }
  }, [effectiveConfig, effectiveAuth, current.providerId, values, modelsJson, npmPackage, extraOptions, configDir, dataDir, onRefresh, toast])

  const handleApplyFromLibrary = useCallback(async (providerId: string) => {
    const provider = libraryProviders.find((p) => p.id === providerId)
    if (!provider) return
    setApplyingId(providerId)
    try {
      const libBaseUrl = libraryBaseUrl(provider) ?? ''
      const libApiKey = libraryApiKey(provider)
      const libModelsJson = libraryModelsJson(provider)
      const libProviderName = (provider.id || '').replace(/[^A-Za-z0-9_.-]/g, '_')

      const nextConfig = patchOpenCodeProvider(effectiveConfig, libProviderName, libBaseUrl, libApiKey)
      let finalConfig = nextConfig
      if (libModelsJson) {
        try {
          const parsedModels = JSON.parse(libModelsJson)
          if (parsedModels && typeof parsedModels === 'object' && !Array.isArray(parsedModels)) {
            const state = parseOpenCodeJsonc(finalConfig)
            if (state.parsed) {
              const providerMap = (state.parsed.provider as Record<string, unknown> | undefined) ?? {}
              const existing = (providerMap[libProviderName] as Record<string, unknown> | undefined) ?? {}
              providerMap[libProviderName] = { ...existing, models: parsedModels }
              state.parsed.provider = providerMap
              finalConfig = JSON.stringify(state.parsed, null, 2) + '\n'
            }
          }
        } catch {
          // Skip invalid models JSON rather than aborting the apply.
        }
      }
      const nextAuth = patchOpenCodeAuthJson(effectiveAuth, libProviderName, libApiKey)

      const ok1 = await saveFile(`${configDir}/opencode.jsonc`, finalConfig)
      const ok2 = await saveFile(`${dataDir}/auth.json`, nextAuth)
      if (!ok1 || !ok2) throw new Error('Failed to write OpenCode files')

      setConfigJsoncOverride(finalConfig)
      setAuthJsonOverride(nextAuth)
      onRefresh()
      toast({ type: 'success', message: `${provider.name} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [libraryProviders, effectiveConfig, effectiveAuth, configDir, dataDir, profileName, onRefresh, toast])

  return (
    <div className="space-y-4">
      {current.parseError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">Unable to parse opencode.jsonc</p>
          <p className="mt-1 text-xs text-destructive/80">{current.parseError}</p>
          <p className="mt-1 text-xs text-destructive/70">
            Fix the JSON manually via the Storage tab, then re-open this tab.
          </p>
        </div>
      )}

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
                status={matchStatus(p, current)}
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
          <OpenCodeProviderForm
            values={values}
            onChange={setValues}
            modelsJson={modelsJson}
            onModelsJsonChange={setModelsJson}
            npm={npmPackage}
            onNpmChange={setNpmPackage}
            extraOptions={extraOptions}
            onExtraOptionsChange={setExtraOptions}
          />
          <Button onClick={handleSave} disabled={saving || !!current.parseError} className="w-full">
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
  const baseUrl = libraryBaseUrl(provider) ?? ''
  const modelCount = useMemo(() => {
    const settings = (provider.settings ?? {}) as Record<string, unknown>
    const options = (settings.options as Record<string, unknown> | undefined) ?? {}
    const models = options.models
    if (models && typeof models === 'object' && !Array.isArray(models)) {
      return Object.keys(models).length
    }
    return 0
  }, [provider])
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
            {modelCount > 0 && (
              <span className="font-mono">
                <span className="text-muted-foreground/70">models</span> {modelCount}
              </span>
            )}
            {baseUrl && (
              <span className="truncate font-mono" title={baseUrl}>{baseUrl}</span>
            )}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
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
