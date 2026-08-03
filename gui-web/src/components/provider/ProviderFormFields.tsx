/**
 * Provider Form Fields — complete cc-switch style.
 *
 * Sections:
 *   Basic: name, notes, website URL
 *   Auth: API key / token with visibility toggle
 *   Endpoint: base URL with full-URL toggle
 *   Advanced (collapsible): API format, auth field, model mapping grid,
 *     fallback model, effort level, co-authored-by, tool search,
 *     skip web fetch preflight, disable auto-updates
 *   Model Test Config (collapsible)
 *   Billing Config (collapsible)
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Input } from '@/components/ui'

// ── Model role row ─────────────────────────────────────────────────────

interface ModelRoleRow { role: string; labelKey: string; modelField: string; nameField: string }
const MODEL_ROLES: ModelRoleRow[] = [
  { role: 'sonnet', labelKey: 'providerForm.role.sonnet', modelField: 'ANTHROPIC_DEFAULT_SONNET_MODEL', nameField: 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME' },
  { role: 'opus',   labelKey: 'providerForm.role.opus',   modelField: 'ANTHROPIC_DEFAULT_OPUS_MODEL',   nameField: 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME' },
  { role: 'fable',  labelKey: 'providerForm.role.fable',  modelField: 'ANTHROPIC_DEFAULT_FABLE_MODEL',  nameField: 'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME' },
  { role: 'haiku',    labelKey: 'providerForm.role.haiku',    modelField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',  nameField: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME' },
  { role: 'subagent', labelKey: 'providerForm.role.subagent', modelField: 'CLAUDE_CODE_SUBAGENT_MODEL',     nameField: 'CLAUDE_CODE_SUBAGENT_MODEL_NAME' },
]

// ── Types ──────────────────────────────────────────────────────────────

export interface ProviderFormValues {
  // Basic
  name: string
  notes: string
  websiteUrl: string
  // Auth
  useApiKey: boolean
  authValue: string
  // Endpoint
  baseUrl: string
  isFullUrl: boolean
  // Model mapping
  roleModels: Record<string, { model: string; name: string }>
  fallbackModel: string
  // Settings
  apiFormat: string       // anthropic | openai_chat | openai_responses | gemini_native
  effortLevel: string
  includeCoAuthoredBy: boolean
  enableToolSearch: boolean
  skipWebFetchPreflight: boolean
  disableAutoUpdates: boolean
  timeoutMs: string
  customUserAgent: string
  // Test config
  testConfigEnabled: boolean
  testTimeout: string
  testDegradedThreshold: string
  testMaxRetries: string
  // Billing
  pricingConfigEnabled: boolean
  costMultiplier: string
  pricingModelSource: string
}

export function defaultFormValues(
  env?: Record<string, string>,
  model?: string,
  effortLevel?: string,
  extra?: Record<string, unknown>,
): ProviderFormValues {
  const get = (k: string) => env?.[k] ?? ''
  const useApiKey = 'ANTHROPIC_API_KEY' in (env ?? {})
  const roles: Record<string, { model: string; name: string }> = {}
  for (const r of MODEL_ROLES) roles[r.role] = { model: get(r.modelField), name: get(r.nameField) }
  return {
    name: (extra?.name as string) ?? '',
    notes: (extra?.notes as string) ?? '',
    websiteUrl: (extra?.website_url as string) ?? (extra?.websiteUrl as string) ?? '',
    useApiKey,
    authValue: get(useApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'),
    baseUrl: get('ANTHROPIC_BASE_URL'),
    isFullUrl: (extra?.isFullUrl as boolean) ?? false,
    roleModels: roles,
    fallbackModel: get('ANTHROPIC_MODEL') || model || '',
    apiFormat: (extra?.apiFormat as string) ?? 'anthropic',
    effortLevel: effortLevel ?? (extra?.effortLevel as string) ?? '',
    includeCoAuthoredBy: (extra?.includeCoAuthoredBy as boolean) ?? false,
    enableToolSearch: (extra?.ENABLE_TOOL_SEARCH as boolean) ?? false,
    skipWebFetchPreflight: (extra?.skipWebFetchPreflight as boolean) ?? false,
    disableAutoUpdates: (extra?.disableAutoUpdates as boolean) ?? false,
    timeoutMs: get('API_TIMEOUT_MS'),
    customUserAgent: (extra?.customUserAgent as string) ?? '',
    testConfigEnabled: Boolean(extra?.testConfigEnabled) || Boolean(extra?.testTimeout) || Boolean(extra?.testDegradedThreshold) || Boolean(extra?.testMaxRetries),
    testTimeout: (extra?.testTimeout as string) ?? '',
    testDegradedThreshold: (extra?.testDegradedThreshold as string) ?? '',
    testMaxRetries: (extra?.testMaxRetries as string) ?? '',
    pricingConfigEnabled: Boolean(extra?.pricingConfigEnabled) || Boolean(extra?.costMultiplier) || Boolean((extra?.pricingModelSource as string) && (extra?.pricingModelSource as string) !== 'inherit'),
    costMultiplier: (extra?.costMultiplier as string) ?? '',
    pricingModelSource: (extra?.pricingModelSource as string) ?? 'inherit',
  }
}

export function formValuesToEnv(v: ProviderFormValues): Record<string, string> {
  const e: Record<string, string> = {}
  if (v.baseUrl) e.ANTHROPIC_BASE_URL = v.baseUrl
  if (v.authValue) e[v.useApiKey ? 'ANTHROPIC_API_KEY' : 'ANTHROPIC_AUTH_TOKEN'] = v.authValue
  if (v.fallbackModel) e.ANTHROPIC_MODEL = v.fallbackModel
  for (const r of MODEL_ROLES) {
    const rm = v.roleModels[r.role]
    if (rm?.model) e[r.modelField] = rm.model
    if (rm?.name) e[r.nameField] = rm.name
  }
  if (v.timeoutMs) e.API_TIMEOUT_MS = v.timeoutMs
  if (v.disableAutoUpdates) e.DISABLE_AUTOUPDATER = '1'
  return e
}

/** Build the full settings_config payload (env + non-env) for Library save. */
export function formValuesToSettings(v: ProviderFormValues): Record<string, unknown> {
  const s: Record<string, unknown> = { env: formValuesToEnv(v) }
  if (v.apiFormat && v.apiFormat !== 'anthropic') s.apiFormat = v.apiFormat
  if (v.effortLevel) s.effortLevel = v.effortLevel
  if (v.includeCoAuthoredBy) s.includeCoAuthoredBy = true
  if (v.enableToolSearch) s.ENABLE_TOOL_SEARCH = true
  if (v.skipWebFetchPreflight) s.skipWebFetchPreflight = true
  if (v.customUserAgent) s.customUserAgent = v.customUserAgent
  return s
}

// ── Component ──────────────────────────────────────────────────────────

/** Soft validation: returns warning messages, does not block save. */
export function getSoftWarnings(v: ProviderFormValues): string[] {
  const w: string[] = []
  if (!v.name.trim()) w.push(i18n.t('providerForm.warning.nameEmpty'))
  if (!v.baseUrl.trim() && !v.authValue.trim()) w.push(i18n.t('providerForm.warning.noEndpointOrKey'))
  else if (!v.baseUrl.trim()) w.push(i18n.t('providerForm.warning.endpointEmpty'))
  else if (!v.authValue.trim()) w.push(i18n.t('providerForm.warning.authEmpty'))
  return w
}

export function ProviderFormFields({
  values,
  onChange,
  readOnly,
  showBasicFields, // Library: true, Profile: false
  mode = 'library',
}: {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  showBasicFields?: boolean
  mode?: 'library' | 'profile'
}) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(
    Object.values(values.roleModels).some((r) => r.model || r.name) ||
    !!values.fallbackModel || !!values.apiFormat || values.enableToolSearch || values.includeCoAuthoredBy,
  )
  const [testOpen, setTestOpen] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)

  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })
  const warnings = getSoftWarnings(values)

  return (
    <div className="space-y-4">
      {/* Soft validation warnings */}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ── Basic Info (Library only) ───────────────────────────────── */}
      {showBasicFields && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.name')}</label>
              <Input value={values.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('providerForm.namePlaceholderBasic')} className="text-sm" disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.notes')}</label>
              <Input value={values.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={t('providerForm.notesPlaceholderOpt')} className="text-sm" disabled={readOnly} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.websiteUrl')}</label>
            <Input value={values.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder={t('providerForm.websiteUrlPlaceholderShort')} className="text-sm font-mono" disabled={readOnly} />
          </div>
        </>
      )}

      {/* ── Auth ────────────────────────────────────────────────────── */}
      <AuthInput
        label={values.useApiKey ? t('providerForm.authLabel.apiKey') : t('providerForm.authLabel.authToken')}
        value={values.authValue}
        onChange={(v) => set({ authValue: v })}
        placeholder={values.useApiKey ? t('providerForm.authPlaceholder.apiKey') : t('providerForm.authPlaceholder.authToken')}
        readOnly={readOnly}
      />

      {/* ── Endpoint ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">{t('providerForm.endpointLabel')} (ANTHROPIC_BASE_URL)</label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input type="checkbox" checked={values.isFullUrl} onChange={(e) => set({ isFullUrl: e.target.checked })} className="rounded" disabled={readOnly} />
            {t('providerForm.fullUrl')}
          </label>
        </div>
        <Input value={values.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={t('providerForm.endpointPlaceholder')} className="text-sm font-mono" disabled={readOnly} />
      </div>

      {/* ── Advanced ────────────────────────────────────────────────── */}
      <div>
        <button type="button" onClick={() => setAdvancedOpen(!advancedOpen)} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:opacity-70">
          <span>{advancedOpen ? '▾' : '▸'}</span> {t('providerForm.advancedOptions')}
        </button>

        {advancedOpen && (
          <div className="space-y-4 pt-3 ml-4">

            {/* API Format */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.apiFormat')}</label>
              <select
                value={values.apiFormat}
                onChange={(e) => set({ apiFormat: e.target.value })}
                className="w-full h-9 rounded-md bg-muted px-3 text-sm text-foreground"
                disabled={readOnly}
              >
                <option value="anthropic">{t('providerForm.apiFormatOption.anthropic')}</option>
                <option value="openai_chat">{t('providerForm.apiFormatOption.openaiChat')}</option>
                <option value="openai_responses">{t('providerForm.apiFormatOption.openaiResponses')}</option>
                <option value="gemini_native">{t('providerForm.apiFormatOption.geminiNative')}</option>
              </select>
            </div>

            {/* Auth field selector */}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={values.useApiKey} onChange={(e) => set({ useApiKey: e.target.checked })} className="rounded" disabled={readOnly} />
              <span className="text-xs text-muted-foreground">{t('providerForm.useApiKeyInstead')}</span>
            </label>

            {/* Model mapping grid */}
            <div>
              <label className="text-xs text-muted-foreground block mb-2">{t('providerForm.modelMapping')}</label>
              <div className="space-y-2">
                {MODEL_ROLES.map((row) => (
                  <div key={row.role} className="grid grid-cols-1 md:grid-cols-[80px_1fr_1fr] gap-2">
                    <div className="flex h-9 items-center rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground">{t(row.labelKey)}</div>
                    <Input value={values.roleModels[row.role]?.name ?? ''} onChange={(e) => set({ roleModels: { ...values.roleModels, [row.role]: { ...values.roleModels[row.role]!, name: e.target.value } } })} placeholder={t('providerForm.displayNamePlaceholder')} className="text-sm font-mono" disabled={readOnly} />
                    <Input value={values.roleModels[row.role]?.model ?? ''} onChange={(e) => set({ roleModels: { ...values.roleModels, [row.role]: { ...values.roleModels[row.role]!, model: e.target.value } } })} placeholder={row.modelField} className="text-sm font-mono" disabled={readOnly} />
                  </div>
                ))}
              </div>
            </div>

            {/* Fallback model */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.defaultModelLabel')}</label>
              <Input value={values.fallbackModel} onChange={(e) => set({ fallbackModel: e.target.value })} placeholder={t('providerForm.defaultModelPlaceholder')} className="text-sm font-mono" disabled={readOnly} />
            </div>

            {/* Effort + Timeout */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.effortLevel')}</label>
                <Input value={values.effortLevel} onChange={(e) => set({ effortLevel: e.target.value })} placeholder="medium" className="text-sm font-mono" disabled={readOnly} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.apiTimeout')}</label>
                <Input value={values.timeoutMs} onChange={(e) => set({ timeoutMs: e.target.value })} placeholder="60000" className="text-sm font-mono" disabled={readOnly} />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.includeCoAuthoredBy} onChange={(e) => set({ includeCoAuthoredBy: e.target.checked })} className="rounded" disabled={readOnly} />
                <span className="text-xs text-muted-foreground">{t('providerForm.includeCoAuthoredBy')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.enableToolSearch} onChange={(e) => set({ enableToolSearch: e.target.checked })} className="rounded" disabled={readOnly} />
                <span className="text-xs text-muted-foreground">{t('providerForm.enableToolSearch')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.skipWebFetchPreflight} onChange={(e) => set({ skipWebFetchPreflight: e.target.checked })} className="rounded" disabled={readOnly} />
                <span className="text-xs text-muted-foreground">{t('providerForm.skipWebFetchPreflight')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.disableAutoUpdates} onChange={(e) => set({ disableAutoUpdates: e.target.checked })} className="rounded" disabled={readOnly} />
                <span className="text-xs text-muted-foreground">{t('providerForm.disableAutoUpdates')}</span>
              </label>
            </div>

            {/* Custom User-Agent — hidden in profile mode (not serialized). */}
            {mode === 'library' && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.customUserAgent')}</label>
                <Input value={values.customUserAgent} onChange={(e) => set({ customUserAgent: e.target.value })} placeholder={t('providerForm.customUserAgentPlaceholder')} className="text-sm font-mono" disabled={readOnly} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Model Test Config (hidden in profile mode — not serialized) ── */}
      {mode === 'library' && (
      <CollapsibleSection title={t('providerForm.modelTestConfig')} open={testOpen} onToggle={setTestOpen}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.testTimeoutSec')}</label>
            <Input value={values.testTimeout} onChange={(e) => set({ testTimeout: e.target.value })} placeholder="8" className="text-sm" disabled={readOnly} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.testDegradedThresholdMs')}</label>
            <Input value={values.testDegradedThreshold} onChange={(e) => set({ testDegradedThreshold: e.target.value })} placeholder="6000" className="text-sm" disabled={readOnly} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.testMaxRetries')}</label>
            <Input value={values.testMaxRetries} onChange={(e) => set({ testMaxRetries: e.target.value })} placeholder="1" className="text-sm" disabled={readOnly} />
          </div>
        </div>
      </CollapsibleSection>

      )}
      {/* ── Billing Config (hidden in profile mode — not serialized) ──── */}
      {mode === 'library' && (
      <CollapsibleSection title={t('providerForm.billingConfig')} open={billingOpen} onToggle={setBillingOpen}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.costMultiplier')}</label>
            <Input value={values.costMultiplier} onChange={(e) => set({ costMultiplier: e.target.value })} placeholder="1.0" className="text-sm" disabled={readOnly} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t('providerForm.pricingModelSource')}</label>
            <select
              value={values.pricingModelSource}
              onChange={(e) => set({ pricingModelSource: e.target.value })}
              className="w-full h-9 rounded-md bg-muted px-3 text-sm text-foreground"
              disabled={readOnly}
            >
              <option value="inherit">{t('providerForm.pricing.inherit')}</option>
              <option value="request">{t('providerForm.pricing.request')}</option>
              <option value="response">{t('providerForm.pricing.response')}</option>
            </select>
          </div>
        </div>
      </CollapsibleSection>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function AuthInput({ label, value, onChange, placeholder, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; readOnly?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div className="relative">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="text-sm font-mono pr-14" type={visible ? 'text' : 'password'} disabled={readOnly} />
        <button type="button" onClick={() => setVisible(!visible)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" tabIndex={-1}>
          {visible ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

function CollapsibleSection({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: (v: boolean) => void; children: React.ReactNode
}) {
  return (
    <div>
      <button type="button" onClick={() => onToggle(!open)} className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:opacity-70">
        <span>{open ? '▾' : '▸'}</span> {title}
      </button>
      {open && <div className="space-y-4 pt-3 ml-4">{children}</div>}
    </div>
  )
}
