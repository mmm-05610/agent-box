/**
 * ClaudeProviderForm — agent-type specific form for Claude providers.
 *
 * Fields (top to bottom):
 *   Basic:  Name, Notes, Website URL, Get API Key link
 *   Auth:   Auth Token (or API Key toggle)
 *   Endpoint: Base URL
 *   Advanced (collapsible): API Format, Model Mapping (4 roles with Quick Set + 1M),
 *     Default Model, Effort, Timeout, checkboxes, Custom User-Agent
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Input, Button, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'
import { getSoftWarnings } from '../ProviderFormFields'
import { EndpointSpeedTest } from '../EndpointSpeedTest'
import type { FetchedModel } from '@/api'
import { ApiKeySection, ProviderIdentityFields } from './shared'
import { useFetchedModels } from './hooks/useFetchedModels'

// ── 1M marker helpers ──────────────────────────────────────────────────

const ONE_M_MARKER = '[1M]'

function hasOneMMarker(model: string): boolean {
  return model.trimEnd().toLowerCase().endsWith('[1m]')
}

function stripOneMMarker(model: string): string {
  const trimmed = model.trimEnd()
  if (!trimmed.toLowerCase().endsWith('[1m]')) return model
  return trimmed.slice(0, -ONE_M_MARKER.length).trimEnd()
}

function setOneMMarker(model: string, enabled: boolean): string {
  const base = stripOneMMarker(model).trim()
  if (!base) return ''
  return enabled ? `${base} ${ONE_M_MARKER}` : base
}

// ── Model role row ─────────────────────────────────────────────────────

interface ModelRoleRow {
  role: string
  label: string
  modelField: string
  nameField: string
  supportsOneM: boolean
}
const MODEL_ROLES: ModelRoleRow[] = [
  { role: 'sonnet', label: 'Sonnet', modelField: 'ANTHROPIC_DEFAULT_SONNET_MODEL', nameField: 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME', supportsOneM: true },
  { role: 'opus',   label: 'Opus',   modelField: 'ANTHROPIC_DEFAULT_OPUS_MODEL',   nameField: 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',   supportsOneM: true },
  { role: 'fable',  label: 'Fable',  modelField: 'ANTHROPIC_DEFAULT_FABLE_MODEL',  nameField: 'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',  supportsOneM: true },
  { role: 'haiku',  label: 'Haiku',  modelField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',  nameField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',  supportsOneM: false },
]

// ── Component ──────────────────────────────────────────────────────────

export interface ClaudeProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  presetApiKeyUrl?: string
  endpointCandidates?: string[]
  mode?: 'library' | 'profile'
  settingsJson?: string
  onSettingsJsonChange?: (next: string) => void
}

export function ClaudeProviderForm({ values, onChange, readOnly, presetApiKeyUrl, endpointCandidates, mode = 'library', settingsJson = '', onSettingsJsonChange }: ClaudeProviderFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Object.values(values.roleModels).some((r) => r.model || r.name) ||
    !!values.fallbackModel || !!values.apiFormat || values.enableToolSearch || values.includeCoAuthoredBy,
  )
  const { models: fetchedModels, fetching: fetchingModels, error: fetchError, fetch: handleFetchModels } = useFetchedModels(values.baseUrl, values.authValue, values.isFullUrl)
  const [settingsJsonLocal, setSettingsJsonLocal] = useState(settingsJson)
  const lastSentSettingsJsonRef = useRef(settingsJson)

  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  useEffect(() => {
    setSettingsJsonLocal((current) => settingsJson === current ? current : settingsJson)
  }, [settingsJson])

  // Live preview JSON — mirrors applyClaudeEdits so the user can see exactly
  // what the saved config will look like.
  const previewSettingsJson = useMemo(() => {
    const env: Record<string, string> = {
      ...(((values as unknown) as Record<string, unknown>)?.env as Record<string, string> | undefined ?? {}),
    }
    if (values.baseUrl) env.ANTHROPIC_BASE_URL = values.baseUrl
    env[values.useApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'] = values.authValue
    if (values.fallbackModel) env.ANTHROPIC_MODEL = values.fallbackModel
    for (const [role, rm] of Object.entries(values.roleModels ?? {})) {
      const ROLE_FIELD: Record<string, { modelField: string; nameField: string }> = {
        opus: { modelField: 'ANTHROPIC_DEFAULT_OPUS_MODEL', nameField: 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME' },
        sonnet: { modelField: 'ANTHROPIC_DEFAULT_SONNET_MODEL', nameField: 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME' },
        haiku: { modelField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', nameField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME' },
      }
      const fields = ROLE_FIELD[role]
      if (!fields) continue
      if (rm.model) env[fields.modelField] = rm.model
      if (rm.name) env[fields.nameField] = rm.name
    }
    if (values.timeoutMs) env.API_TIMEOUT_MS = values.timeoutMs
    if (values.disableAutoUpdates) env.DISABLE_AUTOUPDATER = '1'
    for (const k of Object.keys(env)) if (!env[k]) delete env[k]
    const settings: Record<string, unknown> = {}
    if (Object.keys(env).length > 0) settings.env = env
    if (values.apiFormat && values.apiFormat !== 'anthropic') settings.apiFormat = values.apiFormat
    if (values.effortLevel) settings.effortLevel = values.effortLevel
    if (values.includeCoAuthoredBy) settings.includeCoAuthoredBy = true
    if (values.enableToolSearch) settings.ENABLE_TOOL_SEARCH = true
    if (values.skipWebFetchPreflight) settings.skipWebFetchPreflight = true
    if (values.customUserAgent) settings.customUserAgent = values.customUserAgent
    return JSON.stringify(settings, null, 2)
  }, [values.baseUrl, values.authValue, values.useApiKey, values.fallbackModel, values.roleModels, values.timeoutMs, values.disableAutoUpdates, values.apiFormat, values.effortLevel, values.includeCoAuthoredBy, values.enableToolSearch, values.skipWebFetchPreflight, values.customUserAgent])

  const parentProvided = Boolean(onSettingsJsonChange)
  const effectiveSettingsJson = parentProvided ? settingsJson : (settingsJson || previewSettingsJson)
  const setSettingsJson = (next: string) => {
    if (onSettingsJsonChange) {
      if (next === lastSentSettingsJsonRef.current) return
      lastSentSettingsJsonRef.current = next
      onSettingsJsonChange(next)
    } else {
      setSettingsJsonLocal(next)
    }
  }
  const warnings = getSoftWarnings(values)

  // Quick Set: pick first non-empty model and apply to all roles
  const handleQuickSet = () => {
    const source = values.fallbackModel
      || values.roleModels['sonnet']?.model
      || values.roleModels['opus']?.model
      || values.roleModels['fable']?.model
      || values.roleModels['haiku']?.model
    if (!source) return
    const next = { ...values.roleModels }
    for (const row of MODEL_ROLES) {
      const model = row.supportsOneM ? source : stripOneMMarker(source)
      next[row.role] = {
        name: stripOneMMarker(model),
        model,
      }
    }
    set({ roleModels: next })
  }

  // 1M toggle for a role
  const handleOneMToggle = (row: ModelRoleRow, enabled: boolean) => {
    if (!row.supportsOneM) return
    const current = values.roleModels[row.role]?.model ?? ''
    const newModel = setOneMMarker(current, enabled)
    const oldBase = stripOneMMarker(current)
    const newName = values.roleModels[row.role]?.name === oldBase || !values.roleModels[row.role]?.name
      ? stripOneMMarker(newModel)
      : values.roleModels[row.role]?.name
    set({
      roleModels: {
        ...values.roleModels,
        [row.role]: { name: newName, model: newModel },
      },
    })
  }

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ── Basic ──────────────────────────────────────────────────── */}
      <ProviderIdentityFields name={values.name} notes={values.notes} websiteUrl={values.websiteUrl} onChange={set} readOnly={readOnly} apiKeyUrl={presetApiKeyUrl} namePlaceholder="Provider name" />

      {/* ── Auth ───────────────────────────────────────────────────── */}
      <ApiKeySection
        label={values.useApiKey ? 'API Key (ANTHROPIC_API_KEY)' : 'Auth Token (ANTHROPIC_AUTH_TOKEN)'}
        value={values.authValue}
        onChange={(v) => set({ authValue: v })}
        placeholder={values.useApiKey ? 'sk-ant-api03-...' : 'your-auth-token'}
        readOnly={readOnly}
      />

      {/* ── Endpoint ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">API Endpoint (ANTHROPIC_BASE_URL)</label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={values.isFullUrl}
              onChange={(e) => set({ isFullUrl: e.target.checked })}
              className="rounded"
              disabled={readOnly}
            />
            Full URL
          </label>
        </div>
        <Input
          value={values.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder="https://api.anthropic.com"
          className="text-sm font-mono"
          disabled={readOnly}
        />
        {endpointCandidates && endpointCandidates.length > 1 && (
          <div className="mt-2">
            <EndpointSpeedTest
              endpoints={endpointCandidates}
              selected={values.baseUrl}
              onSelect={(url) => set({ baseUrl: url })}
            />
          </div>
        )}
      </div>

      {/* ── Advanced ────────────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:opacity-70"
        >
          <span>{advancedOpen ? '▾' : '▸'}</span> Advanced Options
        </button>

        {advancedOpen && (
          <div className="space-y-4 pt-3 ml-4">
            {/* API Format */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">API Format</label>
              <select
                value={values.apiFormat}
                onChange={(e) => set({ apiFormat: e.target.value })}
                className="w-full h-9 rounded-md bg-muted px-3 text-sm text-foreground"
                disabled={readOnly}
              >
                <option value="anthropic">Anthropic Messages (原生)</option>
                <option value="openai_chat">OpenAI Chat Completions (需转换)</option>
                <option value="openai_responses">OpenAI Responses API (需转换)</option>
                <option value="gemini_native">Gemini Native generateContent (需转换)</option>
              </select>
            </div>

            {/* Auth field selector */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.useApiKey}
                onChange={(e) => set({ useApiKey: e.target.checked })}
                className="rounded"
                disabled={readOnly}
              />
              <span className="text-xs text-muted-foreground">Use ANTHROPIC_API_KEY instead of ANTHROPIC_AUTH_TOKEN</span>
            </label>

            {/* Model mapping grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Model Mapping (per-role)</label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleFetchModels}
                    disabled={readOnly || fetchingModels}
                    className="h-7 gap-1 text-xs"
                    title="从 API 拉取可用模型列表"
                  >
                    {fetchingModels ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    )}
                    拉取模型
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleQuickSet}
                    disabled={readOnly || (!values.fallbackModel && !Object.values(values.roleModels).some((r) => r.model))}
                    className="h-7 gap-1 text-xs"
                    title="将当前已有模型名一键应用到所有角色"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h.01" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" />
                    </svg>
                    一键设置
                  </Button>
                </div>
              </div>
              {fetchError && (
                <p className="text-xs text-red-500 mt-1">{fetchError}</p>
              )}
              <div className="space-y-2">
                {MODEL_ROLES.map((row) => {
                  const roleModel = values.roleModels[row.role]?.model ?? ''
                  const usesOneM = row.supportsOneM && hasOneMMarker(roleModel)
                  return (
                    <div key={row.role} className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr_auto] gap-2 items-center">
                      <div className="flex h-9 items-center rounded-md bg-muted border border-border px-3 text-xs font-medium text-muted-foreground">
                        {row.label}
                      </div>
                      <Input
                        value={values.roleModels[row.role]?.name ?? ''}
                        onChange={(e) =>
                          set({
                            roleModels: {
                              ...values.roleModels,
                              [row.role]: { ...values.roleModels[row.role], name: e.target.value },
                            },
                          })
                        }
                        placeholder="Display name"
                        className="text-sm font-mono"
                        disabled={readOnly}
                      />
                      <ModelDropdown
                        value={roleModel}
                        onChange={(v) =>
                          set({
                            roleModels: {
                              ...values.roleModels,
                              [row.role]: { ...values.roleModels[row.role], model: v },
                            },
                          })
                        }
                        models={fetchedModels}
                        placeholder={row.modelField}
                        disabled={readOnly}
                      />
                      {row.supportsOneM ? (
                        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={usesOneM}
                            onChange={(e) => handleOneMToggle(row, e.target.checked)}
                            className="rounded"
                            disabled={readOnly}
                          />
                          1M
                        </label>
                      ) : (
                        <div className="hidden md:block" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Default Model */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Default Model (ANTHROPIC_MODEL)</label>
              <Input
                value={values.fallbackModel}
                onChange={(e) => set({ fallbackModel: e.target.value })}
                placeholder="claude-opus-4-8"
                className="text-sm font-mono"
                disabled={readOnly}
              />
            </div>

            {/* Effort + Timeout */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Effort Level</label>
                <Input
                  value={values.effortLevel}
                  onChange={(e) => set({ effortLevel: e.target.value })}
                  placeholder="medium"
                  className="text-sm font-mono"
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Timeout (ms)</label>
                <Input
                  value={values.timeoutMs}
                  onChange={(e) => set({ timeoutMs: e.target.value })}
                  placeholder="60000"
                  className="text-sm font-mono"
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.includeCoAuthoredBy}
                  onChange={(e) => set({ includeCoAuthoredBy: e.target.checked })}
                  className="rounded"
                  disabled={readOnly}
                />
                <span className="text-xs text-muted-foreground">Include co-authored-by attribution</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.enableToolSearch}
                  onChange={(e) => set({ enableToolSearch: e.target.checked })}
                  className="rounded"
                  disabled={readOnly}
                />
                <span className="text-xs text-muted-foreground">Enable tool search (ENABLE_TOOL_SEARCH)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.skipWebFetchPreflight}
                  onChange={(e) => set({ skipWebFetchPreflight: e.target.checked })}
                  className="rounded"
                  disabled={readOnly}
                />
                <span className="text-xs text-muted-foreground">Skip WebFetch preflight check</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={values.disableAutoUpdates}
                  onChange={(e) => set({ disableAutoUpdates: e.target.checked })}
                  className="rounded"
                  disabled={readOnly}
                />
                <span className="text-xs text-muted-foreground">Disable auto-updates</span>
              </label>
            </div>

            {/* Custom User-Agent */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Custom User-Agent</label>
              <Input
                value={values.customUserAgent}
                onChange={(e) => set({ customUserAgent: e.target.value })}
                placeholder="Optional"
                className="text-sm font-mono"
                disabled={readOnly}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-medium">settings.json (JSON)</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {parentProvided
                ? '该供应商的完整 settings_config JSON（env + apiFormat + effortLevel 等）；修改后会被原样写入 Claude Code 配置。普通编辑请使用上方结构化字段。'
                : '上方结构化字段对应的 settings_config JSON 预览（只读）；保存时由结构化字段自动生成。'}
            </p>
          </div>
          {!parentProvided && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">实时预览</span>
          )}
        </div>
        <Textarea
          value={effectiveSettingsJson}
          onChange={(event) => setSettingsJson(event.target.value)}
          rows={Math.min(16, Math.max(6, effectiveSettingsJson.split('\n').length + 1))}
          readOnly={!parentProvided}
          className="mt-3 font-mono text-sm"
          disabled={readOnly && !parentProvided}
        />
      </div>

      {mode === 'profile' && <p className="text-xs text-muted-foreground">Profile 模式保存到当前 Claude Code 配置文件。</p>}
    </div>
  )
}

// ── Model dropdown ─────────────────────────────────────────────────────

function ModelDropdown({
  value,
  onChange,
  models,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  models: FetchedModel[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Group by vendor
  const grouped: Record<string, FetchedModel[]> = {}
  for (const m of models) {
    const vendor = m.owned_by || 'Other'
    if (!grouped[vendor]) grouped[vendor] = []
    grouped[vendor].push(m)
  }
  const vendors = Object.keys(grouped).sort()

  return (
      <div ref={containerRef} className="relative">
      <div className="flex gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => models.length > 0 && setOpen(true)}
          className="text-sm font-mono flex-1 h-9 rounded-md bg-input px-3 text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:border-foreground/30 hover:border-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={disabled || models.length === 0}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && vendors.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {vendors.map((vendor) => (
            <div key={vendor}>
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-muted/50 sticky top-0">
                {vendor}
              </div>
              {grouped[vendor].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id)
                    setOpen(false)
                  }}
                  className={[
                    'w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer',
                    m.id === value
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/40',
                  ].join(' ')}
                >
                  {m.id}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Auth input ─────────────────────────────────────────────────────────
