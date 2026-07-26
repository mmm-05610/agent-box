/**
 * Hermes Provider Editor — cc-switch style (Profile side).
 *
 * Mirrors ProviderEditor (Claude) with three sections:
 *   1. Apply from Library — fetchProviders(hermes) + base_url match + Apply
 *   2. Provider Settings — HermesProviderForm (base_url + api_key)
 *   3. Save — writes config.yaml + .env via saveFile using line-based YAML +
 *      .env patches.
 *
 * Hermes stores model settings under the ``model:`` block of config.yaml:
 *   model:
 *     default: <model>
 *     base_url: <url>
 *     api_key: <key>           # may be a literal or ${HERMES_API_KEY} env ref
 *
 * The actual key lives in .env at HERMES_API_KEY=. When the user types a key
 * in the form, we mirror it to BOTH places — config.yaml (so it shows up in
 * `model.api_key`) and .env (so hermes-agent can read it).
 *
 * Library matching: compare ``model.base_url`` line in current YAML vs the
 * library provider's settings.base_url.
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
  HermesProviderForm,
} from '@/components/provider/forms/HermesProviderForm'
import {
  defaultFormValues,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import type { AgentType, Provider } from '@/api'
import {
  extractHermesApiKey,
  extractHermesModelFields,
  patchHermesApiKey,
  patchHermesBaseUrl,
  patchHermesEnv,
  patchHermesModelDefault,
  patchHermesModels,
  patchHermesApiMode,
} from './providerFileWriters'

interface HermesProviderViewerProps {
  configYaml: string
  envContent: string
  configDir: string
  profileName: string
  onRefresh: () => void
}

type MatchStatus = 'active' | 'modified' | 'none'

interface CurrentFields {
  baseUrl: string
  apiKey: string
  defaultModel: string | null
  hasYaml: boolean
}

function readCurrent(configYaml: string, envContent: string): CurrentFields {
  const fields = extractHermesModelFields(configYaml)
  // api_key in YAML is often a literal, but template uses ${HERMES_API_KEY}.
  // Prefer the .env value if the YAML references an env var (template default).
  let apiKey = fields.apiKey ?? ''
  const isEnvRef = !!apiKey && /^\$\{.+\}$/.test(apiKey)
  if (isEnvRef) apiKey = extractHermesApiKey(envContent)
  return {
    baseUrl: fields.baseUrl ?? '',
    apiKey,
    defaultModel: fields.defaultModel,
    hasYaml: configYaml.trim().length > 0,
  }
}

function libraryBaseUrl(provider: Provider): string | null {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const v = settings.base_url
  const env = (settings.env as Record<string, string> | undefined) ?? {}
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof env.base_url === 'string') return env.base_url
  return null
}

function libraryApiKey(provider: Provider): string {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const v = settings.api_key
  const env = (settings.env as Record<string, string> | undefined) ?? {}
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof env.api_key === 'string') return env.api_key
  return ''
}

function libraryApiMode(provider: Provider): string | null {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const mode = settings.api_mode as string | undefined
  if (typeof mode === 'string' && mode.trim()) return mode.trim()
  return null
}

function buildHermesYamlFromProvider(provider: Provider): string {
  const s = (provider.settings ?? {}) as Record<string, unknown>
  const baseUrl = (s.base_url as string) ?? ''
  const apiKey = (s.api_key as string) ?? ''
  const apiMode = (s.api_mode as string) ?? 'openai_compatible'
  const envApiKey = ((s.env as Record<string, string> | undefined) ?? {}).api_key

  // Map ACS api_mode to Hermes config format
  const modeMap: Record<string, string> = {
    'chat_completions': 'openai_compatible',
    'openai_compatible': 'openai_compatible',
    'anthropic': 'anthropic',
    'codex_responses': 'codex_responses',
  }
  const mappedMode = modeMap[apiMode] ?? apiMode

  const lines: string[] = []
  lines.push(`base_url: "${baseUrl}"`)
  lines.push(`api_key: "${apiKey || envApiKey || ''}"`)
  lines.push(`api_mode: "${mappedMode}"`)

  const models = s.models as Array<Record<string, unknown>> | undefined
  if (Array.isArray(models) && models.length > 0) {
    const first = models[0]
    const defaultModel = (first.id ?? first.model ?? '') as string
    if (defaultModel) lines.push(`default: "${defaultModel}"`)
    lines.push('models:')
    for (const m of models) {
      const id = (m.id ?? m.model ?? '') as string
      const name = (m.name ?? m.id ?? m.model ?? '') as string
      const ctx = (m.context_length ?? m.contextLength) as number | undefined
      if (id) {
        lines.push(`  - id: "${id}"`)
        lines.push(`    name: "${name}"`)
        if (ctx) lines.push(`    context_length: ${ctx}`)
      }
    }
  } else {
    const defaultModel = (s.default_model as string) ?? ''
    if (defaultModel) lines.push(`default: "${defaultModel}"`)
  }

  return lines.join('\n')
}

function libraryDefaultModel(provider: Provider): string | null {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  // ACS-style structured models array
  const models = settings.models as Array<Record<string, unknown>> | undefined
  if (Array.isArray(models) && models.length > 0) {
    return (models[0].id as string) ?? (models[0].model as string) ?? null
  }
  const config = typeof settings.config === 'string' ? (settings.config as string) : null
  if (config) {
    const fields = extractHermesModelFields(config)
    if (fields.defaultModel) return fields.defaultModel
  }
  if (typeof settings.default_model === 'string') return settings.default_model as string
  return null
}

function libraryModels(provider: Provider): Array<{ id: string; name: string; context_length?: number }> {
  const settings = (provider.settings ?? {}) as Record<string, unknown>
  const models = settings.models as Array<Record<string, unknown>> | undefined
  if (Array.isArray(models) && models.length > 0) {
    return models.map((m) => ({
      id: (m.id ?? m.model ?? '') as string,
      name: (m.name ?? m.id ?? m.model ?? '') as string,
      context_length: (m.context_length ?? m.contextLength) as number | undefined,
    })).filter((m) => m.id)
  }
  return []
}

function matchStatus(provider: Provider, current: CurrentFields): MatchStatus {
  const libBase = libraryBaseUrl(provider)
  const curBase = current.baseUrl
  if (!libBase || !curBase) return 'none'
  if (libBase !== curBase) return 'none'
  if (libraryApiKey(provider) !== current.apiKey) return 'modified'
  return 'active'
}

export function HermesProviderViewer({
  configYaml, envContent, configDir, profileName, onRefresh,
}: HermesProviderViewerProps) {
  const [configYamlOverride, setConfigYamlOverride] = useState<string | null>(null)
  const [envContentOverride, setEnvContentOverride] = useState<string | null>(null)
  const effectiveYaml = configYamlOverride ?? configYaml
  const effectiveEnv = envContentOverride ?? envContent
  const current = useMemo(() => readCurrent(effectiveYaml, effectiveEnv), [effectiveYaml, effectiveEnv])

  const [values, setValues] = useState<ProviderFormValues>(() =>
    defaultFormValues(
      { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
      current.defaultModel ?? undefined,
      undefined,
    ),
  )
  const [saving, setSaving] = useState(false)
  const [libraryProviders, setLibraryProviders] = useState<Provider[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    setValues(
      defaultFormValues(
        { ANTHROPIC_BASE_URL: current.baseUrl, ANTHROPIC_AUTH_TOKEN: current.apiKey },
        current.defaultModel ?? undefined,
        undefined,
      ),
    )
  }, [current.baseUrl, current.apiKey, current.defaultModel])

  useEffect(() => {
    fetchProviders('hermes' as AgentType).then(setLibraryProviders).catch(() => {})
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Patch in order: default model, then base_url, then api_key (literal
      // since we're writing both files). Other YAML sections untouched.
      let nextYaml = effectiveYaml
      if (values.fallbackModel) nextYaml = patchHermesModelDefault(nextYaml, values.fallbackModel)
      nextYaml = patchHermesBaseUrl(nextYaml, values.baseUrl)
      // When the user explicitly types a key, write a literal in YAML and
      // mirror to .env. An empty key falls back to the env-reference shape.
      if (values.authValue) {
        nextYaml = patchHermesApiKey(nextYaml, values.authValue)
      }
      const nextEnv = values.authValue
        ? patchHermesEnv(effectiveEnv, values.authValue)
        : effectiveEnv

      const ok1 = await saveFile(`${configDir}/config.yaml`, nextYaml)
      const ok2 = await saveFile(`${configDir}/.env`, nextEnv)
      if (!ok1 || !ok2) throw new Error('Failed to save Hermes files')

      setConfigYamlOverride(nextYaml)
      setEnvContentOverride(nextEnv)
      onRefresh()
      toast({ type: 'success', message: 'Hermes provider saved' })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save Hermes provider' })
    } finally {
      setSaving(false)
    }
  }, [effectiveYaml, effectiveEnv, values, configDir, onRefresh, toast])

  const handleApplyFromLibrary = useCallback(async (providerId: string) => {
    const provider = libraryProviders.find((p) => p.id === providerId)
    if (!provider) return
    setApplyingId(providerId)
    try {
      // Build complete YAML from ACS provider settings (full overwrite)
      const nextYaml = buildHermesYamlFromProvider(provider)
      const libApiKey = libraryApiKey(provider)
      const nextEnv = libApiKey
        ? patchHermesEnv(effectiveEnv, libApiKey)
        : effectiveEnv

      const [ok1, ok2] = await Promise.all([
        saveFile(`${configDir}/config.yaml`, nextYaml),
        saveFile(`${configDir}/.env`, nextEnv),
      ])
      if (!ok1 || !ok2) {
        console.warn('Hermes file write returned false — changes may still be applied')
      }

      // Persist provider metadata for form restoration
      await saveFile(`${configDir}/_provider.json`, JSON.stringify({
        id: provider.id, name: provider.name,
        notes: provider.settings?.notes ?? '', website_url: provider.website_url ?? '',
        icon: (provider as any).icon, icon_color: (provider as any).icon_color,
        category: provider.category,
      }, null, 2))

      setConfigYamlOverride(nextYaml)
      setEnvContentOverride(nextEnv)
      onRefresh()
      toast({ type: 'success', message: `${provider.name} applied to ${profileName}` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply provider' })
    } finally {
      setApplyingId(null)
    }
  }, [libraryProviders, effectiveYaml, effectiveEnv, configDir, profileName, onRefresh, toast])

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
          <HermesProviderForm values={values} onChange={setValues} mode="library" category="official" />
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
  const model = libraryDefaultModel(provider) ?? ''
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
