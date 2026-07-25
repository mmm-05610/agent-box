/**
 * ClaudeProviderForm — agent-type specific form for Claude providers.
 *
 * Layout (top → bottom):
 *   Basic:  Name / Notes / Website URL / Get API Key link
 *   Auth:   Auth Token (or API Key selector)
 *   Endpoint: Base URL (+ full URL toggle + speed test)
 *   Advanced (collapsible, hidden when category === 'official'):
 *     - API Format (hidden when category === 'cloud_provider')
 *     - Auth Field Select (ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY)
 *     - Model Mapping grid (Sonnet/Opus/Fable/Haiku + 1M toggle)
 *     - Default Model + Effort + Timeout + checkboxes
 *     - Custom User-Agent
 *     - Local Proxy Request Overrides (Headers + Body JSON)
 *
 * Note: the `settings.json` raw editor is intentionally NOT in this form.
 * cc-switch exposes it as a separate "Common Config" editor rendered by the
 * outer dialog. We follow the same separation.
 */

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { Input } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'
import { getSoftWarnings } from '../ProviderFormFields'
import { ApiKeySection, ProviderIdentityFields, LocalProxyRequestOverridesField } from './shared'
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
  { role: 'haiku',    label: 'Haiku',    modelField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',    nameField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',    supportsOneM: false },
  { role: 'subagent', label: 'Subagent', modelField: 'CLAUDE_CODE_SUBAGENT_MODEL',       nameField: 'CLAUDE_CODE_SUBAGENT_MODEL_NAME',       supportsOneM: true },
]

// ── Auth field options ─────────────────────────────────────────────────

type AuthFieldOption = 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY'

const AUTH_FIELD_OPTIONS: ReadonlyArray<{ value: AuthFieldOption; label: string }> = [
  { value: 'ANTHROPIC_AUTH_TOKEN', label: 'ANTHROPIC_AUTH_TOKEN（默认）' },
  { value: 'ANTHROPIC_API_KEY', label: 'ANTHROPIC_API_KEY' },
]

// ── API format options ─────────────────────────────────────────────────

type ApiFormatOption = 'anthropic' | 'openai_chat' | 'openai_responses' | 'gemini_native'

const API_FORMAT_OPTIONS: ReadonlyArray<{ value: ApiFormatOption; label: string }> = [
  { value: 'anthropic', label: 'Anthropic Messages（原生）' },
  { value: 'openai_chat', label: 'OpenAI Chat Completions（需转换）' },
  { value: 'openai_responses', label: 'OpenAI Responses API（需转换）' },
  { value: 'gemini_native', label: 'Gemini Native generateContent（需转换）' },
]

// ── Props ──────────────────────────────────────────────────────────────

export interface ClaudeProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  presetApiKeyUrl?: string
  endpointCandidates?: string[]
  mode?: 'library' | 'profile'
  /** Provider category — controls Advanced/API Format visibility. */
  category?: string
  /** Local proxy headers override (advanced, JSON string). */
  localProxyHeadersOverride?: string
  onLocalProxyHeadersOverrideChange?: (next: string) => void
  localProxyBodyOverride?: string
  onLocalProxyBodyOverrideChange?: (next: string) => void
}

// ── Component ──────────────────────────────────────────────────────────

export function ClaudeProviderForm({
  values,
  onChange,
  readOnly,
  presetApiKeyUrl,
  endpointCandidates,
  category,
  localProxyHeadersOverride = '',
  onLocalProxyHeadersOverrideChange,
  localProxyBodyOverride = '',
  onLocalProxyBodyOverrideChange,
}: ClaudeProviderFormProps) {
  const { models: fetchedModels, fetching: fetchingModels, error: fetchError, fetch: handleFetchModels } = useFetchedModels(values.baseUrl, values.authValue, values.isFullUrl)
  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  // Auto-open advanced when there's any non-default value, so pre-filled
  // presets don't leave the user wondering where the mapping went.
  const [advancedOpen, setAdvancedOpen] = useState(
    Object.values(values.roleModels).some((r) => r.model || r.name) ||
    !!values.fallbackModel || !!values.apiFormat || values.enableToolSearch || values.includeCoAuthoredBy,
  )

  // cc-switch parity: hide entire Advanced Options when category === 'official'.
  // Hide just API Format when category === 'cloud_provider'.
  const showAdvanced = category !== 'official'
  const showApiFormat = category !== 'cloud_provider'

  const authFieldValue: AuthFieldOption = values.useApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'
  const handleAuthFieldChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      set({ useApiKey: event.target.value === 'ANTHROPIC_API_KEY' })
    },
    // set is recreated every render but is referentially stable across patches
    // when values don't change, so eslint is happy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set],
  )

  // Quick Set: pick first non-empty model and apply to all roles
  const handleQuickSet = () => {
    const source = values.fallbackModel
      || MODEL_ROLES.reduce((acc, row) => acc || values.roleModels[row.role]?.model, '' as string)
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

  const warnings = getSoftWarnings(values)

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
      <ProviderIdentityFields
        name={values.name}
        notes={values.notes}
        websiteUrl={values.websiteUrl}
        onChange={set}
        readOnly={readOnly}
        apiKeyUrl={presetApiKeyUrl}
        namePlaceholder="Provider name"
      />

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
          <p className="mt-1 text-xs text-muted-foreground">提供 {endpointCandidates.length} 个候选端点；上方按钮可触发速度测试。</p>
        )}
      </div>

      {/* ── Advanced ────────────────────────────────────────────────── */}
      {showAdvanced && (
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:opacity-70"
          >
            <span>{advancedOpen ? '▾' : '▸'}</span> Advanced Options
          </button>
          {!advancedOpen && (
            <p className="ml-1 mt-1 text-xs text-muted-foreground">
              包含 API 格式 / 模型映射 / 思考能力 / 自定义 User-Agent 等。
            </p>
          )}

          {advancedOpen && (
            <div className="ml-4 space-y-4 pt-3">
              {/* API Format */}
              {showApiFormat && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">API Format</label>
                  <select
                    value={values.apiFormat}
                    onChange={(e) => set({ apiFormat: e.target.value })}
                    disabled={readOnly}
                    className="w-full h-9 rounded-md bg-input px-3 text-sm text-foreground border border-border focus:border-foreground/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {API_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">选择供应商 API 的输入格式</p>
                </div>
              )}

              {/* Auth field selector (replaces the old checkbox) */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">认证字段</label>
                <select
                  value={authFieldValue}
                  onChange={handleAuthFieldChange}
                  disabled={readOnly}
                  className="w-full h-9 rounded-md bg-input px-3 text-sm text-foreground border border-border focus:border-foreground/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {AUTH_FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">选择写入配置的认证环境变量名</p>
              </div>

              {/* Model mapping grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">Model Mapping（per-role）</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={readOnly || fetchingModels}
                      className="h-7 gap-1 text-xs inline-flex items-center rounded-md border border-border bg-muted px-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickSet}
                      disabled={readOnly || (!values.fallbackModel && !Object.values(values.roleModels).some((r) => r.model))}
                      className="h-7 gap-1 text-xs inline-flex items-center rounded-md border border-border bg-muted px-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="将当前已有模型名一键应用到所有角色"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" /><path d="M17.8 11.8 19 13" /><path d="M15 9h.01" /><path d="M17.8 6.2 19 5" /><path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" />
                      </svg>
                      一键设置
                    </button>
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
                          onChange={(v) => {
                            const oldName = values.roleModels[row.role]?.name ?? ''
                            const oldModelBase = stripOneMMarker(values.roleModels[row.role]?.model ?? '')
                            const shouldSync = !oldName || oldName === oldModelBase
                            set({
                              roleModels: {
                                ...values.roleModels,
                                [row.role]: {
                                  ...values.roleModels[row.role],
                                  model: v,
                                  name: shouldSync ? stripOneMMarker(v) : oldName,
                                },
                              },
                            })
                          }}
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
                <p className="mt-2 text-xs text-muted-foreground">
                  选择模型角色后，CC Switch 会自动生成 Claude 兼容路由；菜单显示名可以填品牌模型名，实际请求模型按右侧填写内容发送。
                </p>
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
                <p className="mt-1 text-xs text-muted-foreground">
                  未明确落到 Sonnet/Opus/Fable/Haiku 角色的请求会使用此模型。使用第三方/中转端点时建议填写，否则这些请求会以原始 Claude 模型名透传给上游，可能因上游无此模型而报错。
                </p>
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
                <p className="mt-1 text-xs text-muted-foreground">
                  自定义 User-Agent。预设供应商已自动配置；自定义供应商会按名称/地址自动推断。仅当自动识别不准时才需手动覆盖。
                </p>
              </div>

              {/* Local Proxy Request Overrides */}
              {onLocalProxyHeadersOverrideChange && onLocalProxyBodyOverrideChange && (
                <LocalProxyRequestOverridesField
                  headersJson={localProxyHeadersOverride}
                  bodyJson={localProxyBodyOverride}
                  onHeadersJsonChange={onLocalProxyHeadersOverrideChange}
                  onBodyJsonChange={onLocalProxyBodyOverrideChange}
                  disabled={readOnly}
                />
              )}
            </div>
          )}
        </div>
      )}
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
  models: { id: string; owned_by?: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (!target.closest?.('[data-model-dropdown-root]')) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Group by vendor
  const grouped: Record<string, typeof models> = {}
  for (const m of models) {
    const vendor = m.owned_by || 'Other'
    if (!grouped[vendor]) grouped[vendor] = []
    grouped[vendor].push(m)
  }
  const vendors = Object.keys(grouped).sort()

  return (
    <div className="relative" data-model-dropdown-root>
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
