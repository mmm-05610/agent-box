/**
 * Codex Provider Editor — cc-switch style (Profile side).
 *
 * Mirrors ProviderEditor (Claude) with three sections:
 *   1. Apply from Library — fetchProviders(codex) + base_url match + Apply
 *   2. Provider Settings — CodexProviderForm (authValue + baseUrl + TOML)
 *   3. Save — patchJsonFile is unused here; Codex writes two distinct files
 *      (config.toml + auth.json) so the Save handler writes them via saveFile
 *      using per-line TOML patches + JSON patch.
 *
 * Library provider matching: compare base_url lifted from
 *   - current: config.toml (active [model_providers.<X>] block first, top-level fallback)
 *   - library: provider.settings.config (same extraction rule)
 *
 * Apply effect: write config.toml + auth.json, then mirror the change in local
 * state so the UI updates instantly without a parent re-fetch (same pattern as
 * Claude's ProviderEditor).
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
  CodexProviderForm,
  readCodexCatalogModels,
  type CodexCatalogModel,
  type CodexProviderFormProps,
} from '@/components/provider/forms/CodexProviderForm'
import {
  defaultFormValues,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import type { AgentType, Provider } from '@/api'
import {
  extractCodexBaseUrl,
  extractCodexModelProvider,
  patchCodexAuthJson,
  patchCodexBaseUrl,
  patchCodexModel,
} from './providerFileWriters'

interface CodexProviderViewerProps {
  configToml: string
  authJson: string
  configDir: string
  profileName: string
  onRefresh: () => void
}

type MatchStatus = 'active' | 'modified' | 'none'

interface CurrentFields {
  baseUrl: string
  model: string | null
  modelProvider: string | null
  apiKey: string
}

/** Read scalar fields from Codex auth.json (single OPENAI_API_KEY field). */
function parseCodexAuthJson(raw: string): { apiKey: string } {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const key = (parsed as Record<string, unknown>).OPENAI_API_KEY
      if (typeof key === 'string') return { apiKey: key }
    }
  } catch {
    // ignore
  }
  return { apiKey: '' }
}

/** Extract the top-level ``model = "..."`` line from Codex config.toml. */
function extractCodexModel(toml: string): string | null {
  const m = toml.match(/^\s*model\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)')\s*(?:#.*)?$/m)
  if (!m) return null
  return (m[1] ?? m[2] ?? '').trim() || null
}

/** Read all fields the form needs from the current profile files. */
function readCurrent(configToml: string, authJson: string): CurrentFields {
  const baseUrl = extractCodexBaseUrl(configToml) ?? ''
  const model = extractCodexModel(configToml)
  const modelProvider = extractCodexModelProvider(configToml)
  const apiKey = parseCodexAuthJson(authJson).apiKey
  return { baseUrl, model, modelProvider, apiKey }
}

/**
 * Resolve the base_url of a library provider. Codex stores it inside
 * settings.config (TOML body), so we run the same extractor as the profile
 * side to keep the comparison apples-to-apples.
 */
function libraryBaseUrl(provider: Provider): string | null {
  const settings = provider.settings as Record<string, unknown> | undefined
  const config = typeof settings?.config === 'string' ? (settings.config as string) : null
  if (config) return extractCodexBaseUrl(config) ?? null
  // Fallback — unified env.base_url (mirrors provider settings shape used elsewhere)
  const env = (settings?.env as Record<string, string> | undefined) ?? {}
  return env.base_url ?? null
}

function libraryApiKey(provider: Provider): string {
  const settings = provider.settings as Record<string, unknown> | undefined
  const auth = (settings?.auth as Record<string, unknown> | undefined) ?? {}
  const env = (settings?.env as Record<string, string> | undefined) ?? {}
  if (typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY) return auth.OPENAI_API_KEY
  if (typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY) return env.OPENAI_API_KEY
  if (typeof env.api_key === 'string') return env.api_key
  return ''
}

function libraryModel(provider: Provider): string | null {
  const settings = provider.settings as Record<string, unknown> | undefined
  const config = typeof settings?.config === 'string' ? (settings.config as string) : null
  if (config) return extractCodexModel(config)
  return null
}

/**
 * Compare a library provider against the profile's current Codex state.
 * - base_url matches + model matches → 'active'
 * - base_url matches but model differs (or auth.json differs) → 'modified'
 * - base_url differs → 'none'
 */
function matchStatus(provider: Provider, current: CurrentFields): MatchStatus {
  const libBase = libraryBaseUrl(provider)
  const curBase = current.baseUrl
  if (!libBase || !curBase) return 'none'
  if (libBase !== curBase) return 'none'

  const libModel = libraryModel(provider)
  const curModel = current.model ?? ''
  if (libModel && curModel && libModel !== curModel) return 'modified'

  if (libraryApiKey(provider) !== current.apiKey) return 'modified'
  return 'active'
}

export function CodexProviderViewer({
  configToml, authJson, configDir, profileName, onRefresh,
}: CodexProviderViewerProps) {
  const [configTomlOverride, setConfigTomlOverride] = useState<string | null>(null)
  const [authJsonOverride, setAuthJsonOverride] = useState<string | null>(null)
  const effectiveToml = configTomlOverride ?? configToml
  const effectiveAuth = authJsonOverride ?? authJson
  const current = useMemo(() => readCurrent(effectiveToml, effectiveAuth), [effectiveToml, effectiveAuth])

  const [values, setValues] = useState<ProviderFormValues>(() =>
    defaultFormValues(
      { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
      current.model ?? undefined,
      undefined,
    ),
  )
  const [catalogModels, setCatalogModels] = useState<CodexCatalogModel[]>(() =>
    current.model ? [{ model: current.model, displayName: current.model, contextWindow: '' }] : [],
  )
  const [codexConfig, setCodexConfig] = useState<string>(effectiveToml)
  const [saving, setSaving] = useState(false)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const { toast } = useToast()

  // Reseed when the underlying files change from the parent (onRefresh / apply).
  useEffect(() => {
    setValues(
      defaultFormValues(
        { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
        current.model ?? undefined,
        undefined,
      ),
    )
    setCatalogModels(current.model ? [{ model: current.model, displayName: current.model, contextWindow: '' }] : [])
    setCodexConfig(effectiveToml)
  }, [current.baseUrl, current.apiKey, current.model, effectiveToml])

  const handleValuesChange = useCallback((next: ProviderFormValues) => {
    setValues(next)
    setCodexConfig((currentConfig) => patchCodexBaseUrl(currentConfig, next.baseUrl))
  }, [])

  const handleCatalogChange = useCallback((next: CodexCatalogModel[]) => {
    setCatalogModels(next)
    const defaultModel = next[0]?.model.trim()
    if (defaultModel) setCodexConfig((currentConfig) => patchCodexModel(currentConfig, defaultModel))
  }, [])

  const handleConfigChange = useCallback((next: string) => {
    setCodexConfig(next)
    const parsedBase = extractCodexBaseUrl(next) ?? ''
    const parsedModel = extractCodexModel(next) ?? ''
    setValues((currentValues) => ({ ...currentValues, baseUrl: parsedBase }))
    setCatalogModels((currentModels) => parsedModel
      ? currentModels.length > 0
        ? currentModels.map((item, index) => index === 0 ? { ...item, model: parsedModel, displayName: item.displayName || parsedModel } : item)
        : [{ model: parsedModel, displayName: parsedModel, contextWindow: '' }]
      : [])
  }, [])

  useEffect(() => {
    fetchProviders('codex' as AgentType).then(setLibraryProviders).catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Codex's "settings" are split across config.toml + auth.json — write
      // both files; authValue → auth.json, baseUrl → TOML's active block.
      const nextToml = patchCodexBaseUrl(
        patchCodexModel(codexConfig, catalogModels[0]?.model ?? ''),
        values.baseUrl,
      )
      const nextAuth = patchCodexAuthJson(effectiveAuth, values.authValue)
      const tomlPath = `${configDir}/config.toml`
      const authPath = `${configDir}/auth.json`
      const tomlOk = await saveFile(tomlPath, nextToml)
      const authOk = await saveFile(authPath, nextAuth)
      if (!tomlOk || !authOk) {
        throw new Error('Failed to save one of the Codex files')
      }
      setConfigTomlOverride(nextToml)
      setAuthJsonOverride(nextAuth)
      onRefresh()
      toast({ type: 'success', message: 'Codex provider saved' })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save Codex provider' })
    } finally {
      setSaving(false)
    }
  }, [codexConfig, catalogModels, values, configDir, effectiveAuth, onRefresh, toast])

  const handleApplyFromLibrary = useCallback(async (providerId: string) => {
    const provider = libraryProviders.find((p) => p.id === providerId)
    if (!provider) return
    setApplyingId(providerId)
    try {
      const libSettings = (provider.settings ?? {}) as Record<string, unknown>
      const libConfig = typeof libSettings.config === 'string' ? (libSettings.config as string) : ''
      const libApiKey = libraryApiKey(provider)
      const libBaseUrl = libraryBaseUrl(provider) ?? ''
      const libModel = libraryModel(provider)
      const libCatalog = readCodexCatalogModels(libSettings)

      const mergedToml = libConfig
        ? patchCodexBaseUrl(codexConfig || libConfig, libBaseUrl)
        : patchCodexBaseUrl(codexConfig, libBaseUrl)
      const finalToml = libModel ? patchCodexModel(mergedToml, libModel) : mergedToml
      const mergedAuth = patchCodexAuthJson(effectiveAuth, libApiKey)

      const tomlOk = await saveFile(`${configDir}/config.toml`, finalToml)
      const authOk = await saveFile(`${configDir}/auth.json`, mergedAuth)
      if (!tomlOk || !authOk) {
        console.warn('Codex file write returned false — changes may still be applied')
      }

      await saveFile(`${configDir}/_provider.json`, JSON.stringify({
        id: provider.id, name: provider.name,
        notes: provider.settings?.notes ?? '', website_url: provider.website_url ?? '',
        icon: (provider as any).icon, icon_color: (provider as any).icon_color,
        category: provider.category,
      }, null, 2))

      setConfigTomlOverride(finalToml)
      setAuthJsonOverride(mergedAuth)
      setCatalogModels(libCatalog.length > 0 ? libCatalog : libModel ? [{ model: libModel, displayName: libModel, contextWindow: '' }] : [])
      onRefresh()
      toast({ type: 'success', message: `${provider.name} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [libraryProviders, codexConfig, effectiveAuth, configDir, profileName, onRefresh, toast])

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
          <CodexProviderForm
            values={values}
            onChange={handleValuesChange}
            codexConfig={codexConfig}
            onCodexConfigChange={handleConfigChange}
            catalogModels={catalogModels}
            onCatalogModelsChange={handleCatalogChange}
            mode="profile"
          />
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
  const baseUrl = libraryBaseUrl(provider) ?? ''
  const model = libraryModel(provider) ?? ''
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

// Re-export so the unused-import lint stays quiet.
export type { CodexProviderFormProps }
