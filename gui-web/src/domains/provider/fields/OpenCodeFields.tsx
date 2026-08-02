/**
 * OpenCodeFields — OpenCode-specific provider inputs.
 *
 * Extracted from the old OpenCodeProviderForm. Keeps the OpenCode-only
 * pieces: npm package selector, baseURL endpoint (with speed test), custom
 * headers, extra SDK options, the models editor (attributes + SDK options +
 * token limits) and the settings.json editor. The shared identity block now
 * lives in the ProviderForm frame.
 */
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FetchedModel } from '@/api/models'
import { Button, Input, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '@/components/provider/ProviderFormFields'
import {
  Field, ApiKeySection, EndpointField, ModelFetchActions,
  KeyValueEditor, ModelIdInput,
  LinkIcon, ChevronIcon, PlusIcon, TrashIcon,
} from '@/components/provider/forms/shared'
import { useFetchedModels } from '@/components/provider/forms/hooks/useFetchedModels'
import type { ProviderFieldsProps } from './types'

export type OpenCodeNpmPackage =
  | '@ai-sdk/openai'
  | '@ai-sdk/openai-compatible'
  | '@ai-sdk/anthropic'
  | '@ai-sdk/amazon-bedrock'
  | '@ai-sdk/google'

export const OPENCODE_NPM_PACKAGES: Array<{ value: OpenCodeNpmPackage; label: string }> = [
  { value: '@ai-sdk/openai', label: 'providerForm.opencode.npmOption.openai' },
  { value: '@ai-sdk/openai-compatible', label: 'providerForm.opencode.npmOption.openaiCompatible' },
  { value: '@ai-sdk/anthropic', label: 'providerForm.opencode.npmOption.anthropic' },
  { value: '@ai-sdk/amazon-bedrock', label: 'providerForm.opencode.npmOption.bedrock' },
  { value: '@ai-sdk/google', label: 'providerForm.opencode.npmOption.google' },
]

export interface OpenCodeModel {
  name?: string
  options?: Record<string, unknown>
  [key: string]: unknown
}
export type OpenCodeModels = Record<string, OpenCodeModel>

const selectClassName =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50'
const MODEL_RESERVED_KEYS = new Set(['name', 'options'])

export function OpenCodeFields(props: ProviderFieldsProps) {
  const { t } = useTranslation()
  const {
    values, onChange, readOnly,
    modelsJson = '', onModelsJsonChange,
    npm: npmProp, onNpmChange,
    opencodeModels: models, onOpencodeModelsChange: onModelsChange,
    extraOptions = {}, onExtraOptionsChange,
    mode = 'library',
    endpointCandidates = [],
    npmPackage, onNpmPackageChange,
    settingsJson = '', onSettingsJsonChange,
    headers = {}, onHeadersChange,
  } = props

  // Back-compat: accept either `npm`/`onNpmChange` or the newer `npmPackage`/`onNpmPackageChange`
  const npm = npmPackage ?? npmProp ?? '@ai-sdk/openai-compatible'
  const setNpm = onNpmPackageChange ?? onNpmChange

  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})
  const { models: fetchedModels, fetching, error: fetchError, fetch: handleFetchModels } = useFetchedModels(values.baseUrl, values.authValue)
  const lastSentSettingsJsonRef = useRef(settingsJson)
  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  const parsedModels = useMemo<OpenCodeModels>(() => {
    if (models) return models
    if (!modelsJson.trim()) return {}
    try {
      const parsed: unknown = JSON.parse(modelsJson)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as OpenCodeModels : {}
    } catch { return {} }
  }, [models, modelsJson])

  const modelsError = !models && modelsJson.trim() && Object.keys(parsedModels).length === 0 ? t('providerForm.opencode.modelsJsonError') : ''
  const emitModels = (next: OpenCodeModels) => {
    onModelsChange?.(next)
    onModelsJsonChange?.(JSON.stringify(next, null, 2))
  }

  const handleModelIdChange = (oldId: string, newId: string) => {
    if (oldId === newId || !newId || parsedModels[newId]) return
    emitModels(Object.fromEntries(Object.entries(parsedModels).map(([id, config]) => [id === oldId ? newId : id, config])))
    setExpandedModels((current) => ({ ...current, [newId]: current[oldId] ?? true }))
  }
  const updateModel = (id: string, patch: Partial<OpenCodeModel>) => emitModels({ ...parsedModels, [id]: { ...parsedModels[id], ...patch } })

  // Live preview JSON — derived from the structured fields above.
  // Shown in the settings.json textarea when the parent doesn't supply one
  // (i.e. the form is being used standalone / as a read-only preview).
  const previewSettingsJson = useMemo(() => {
    const settings: Record<string, unknown> = {}
    if (values.name) settings.name = values.name
    if (values.notes) settings.notes = values.notes
    if (values.websiteUrl) settings.website_url = values.websiteUrl
    if (npm) settings.npm = npm
    const options: Record<string, unknown> = {}
    if (values.baseUrl) options.baseURL = values.baseUrl
    if (values.authValue) options.apiKey = values.authValue
    for (const [key, val] of Object.entries(extraOptions)) {
      if (val === undefined || val === '') continue
      options[key] = val
    }
    if (Object.keys(options).length > 0) settings.options = options
    if (Object.keys(parsedModels).length > 0) settings.models = parsedModels
    return JSON.stringify(settings, null, 2)
  }, [values.name, values.notes, values.websiteUrl, values.baseUrl, values.authValue, npm, extraOptions, parsedModels])

  const parentProvided = Boolean(onSettingsJsonChange)
  const effectiveSettingsJson = parentProvided ? settingsJson : (settingsJson || previewSettingsJson)
  const setSettingsJson = (next: string) => {
    if (onSettingsJsonChange) {
      if (next === lastSentSettingsJsonRef.current) return
      lastSentSettingsJsonRef.current = next
      onSettingsJsonChange(next)
    }
    // No parent onChange: read-only preview only (matches the old behavior).
  }

  return (
    <div className="space-y-4">
      <ApiKeySection value={values.authValue} onChange={(value) => set({ authValue: value })} readOnly={readOnly} />

      <Field label={t('providerForm.opencode.npmPackage')}>
        <select value={npm} onChange={(event) => setNpm?.(event.target.value as OpenCodeNpmPackage)} className={selectClassName} disabled={readOnly}>
          {OPENCODE_NPM_PACKAGES.map((pkg) => <option key={pkg.value} value={pkg.value}>{t(pkg.label)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{t('providerForm.opencode.npmHint')}</p>
      </Field>

      <EndpointField
        value={values.baseUrl}
        onChange={(baseUrl) => set({ baseUrl })}
        candidates={endpointCandidates}
        label={t('providerForm.opencode.endpointLabel')}
        readOnly={readOnly}
        hint={<div className="mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700"><LinkIcon /><span>{t('providerForm.opencode.endpointHint')}</span></div>}
      />

      {/* Headers */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-medium">{t('providerForm.opencode.headersTitle')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('providerForm.opencode.headersHint')}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => onHeadersChange?.({ ...headers, [`header-${Date.now()}`]: '' })} disabled={readOnly || !onHeadersChange} className="h-7 gap-1">
            <PlusIcon />{t('common.add')}
          </Button>
        </div>
        <div className="mt-3">
          <KeyValueEditor
            value={headers as Record<string, unknown>}
            onChange={(v) => onHeadersChange?.(v as Record<string, string>)}
            readOnly={readOnly}
            emptyLabel={t('providerForm.opencode.noHeaders')}
            keyPlaceholder="X-Title"
            valuePlaceholder="CC Switch"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-medium">{t('providerForm.opencode.extraOptionsTitle')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('providerForm.opencode.extraOptionsHint')}</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => onExtraOptionsChange?.({ ...extraOptions, [`option-${Date.now()}`]: '' })} disabled={readOnly || !onExtraOptionsChange} className="h-7 gap-1">
            <PlusIcon />{t('common.add')}
          </Button>
        </div>
        <div className="mt-3">
          <KeyValueEditor
            value={extraOptions}
            onChange={onExtraOptionsChange}
            readOnly={readOnly}
            emptyLabel={t('providerForm.opencode.noExtraOptions')}
            showColumnHeader
            hideAddButton
            addLabel={t('common.add')}
            keyPlaceholder="timeout"
            valuePlaceholder="600000"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t('providerForm.opencode.extraOptionsHint2')}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-medium">{t('providerForm.opencode.modelsTitle')}</h4>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{t('providerForm.opencode.modelsDesc')}</p>
          </div>
          <ModelFetchActions
            fetching={fetching}
            onFetch={handleFetchModels}
            fetchDisabled={readOnly}
            addDisabled={readOnly || (!onModelsChange && !onModelsJsonChange)}
            onAdd={() => {
              let id = 'new-model'
              let suffix = 2
              while (parsedModels[id]) id = `new-model-${suffix++}`
              emitModels({ ...parsedModels, [id]: { name: '' } })
              setExpandedModels((current) => ({ ...current, [id]: true }))
            }}
          />
        </div>
        {(fetchError || modelsError) && <p className="mt-2 text-xs text-red-500">{fetchError || modelsError}</p>}
        {Object.keys(parsedModels).length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t('providerForm.emptyModels')}
          </p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
            {Object.entries(parsedModels).map(([id, config], index) => (
              <ModelRowView
                key={id}
                id={id}
                config={config}
                isFirst={index === 0}
                readOnly={readOnly}
                canEdit={Boolean(onModelsChange || onModelsJsonChange)}
                fetchedModels={fetchedModels}
                expanded={Boolean(expandedModels[id])}
                onToggle={() => setExpandedModels((current) => ({ ...current, [id]: !current[id] }))}
                onIdChange={(newId) => handleModelIdChange(id, newId)}
                onNameChange={(name) => updateModel(id, { name })}
                onRemove={() => emitModels(Object.fromEntries(Object.entries(parsedModels).filter(([modelId]) => modelId !== id)))}
                onAttributesChange={(next) => updateModel(id, next as Partial<OpenCodeModel>)}
                onOptionsChange={(next) => updateModel(id, { options: next })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-medium">{t('providerForm.settingsEditor.title')}</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {parentProvided
                ? t('providerForm.opencode.settingsHintEditable')
                : t('providerForm.settingsEditor.hintPreview')}
            </p>
          </div>
          {!parentProvided && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t('providerForm.settingsEditor.livePreview')}</span>
          )}
        </div>
        <Textarea
          value={effectiveSettingsJson}
          onChange={(event) => setSettingsJson(event.target.value)}
          rows={Math.min(16, Math.max(6, effectiveSettingsJson.split('\n').length + 1))}
          readOnly={!parentProvided}
          className="mt-3 font-mono text-sm"
          disabled={readOnly && !parentProvided}
          placeholder='{"npm": "@ai-sdk/openai-compatible", "options": {"baseURL": "..."}}'
        />
      </div>

      {mode === 'profile' && <p className="text-xs text-muted-foreground">{t('providerForm.profileModeHint', { agent: 'OpenCode' })}</p>}
    </div>
  )
}

// ── ModelRowView (OpenCode-specific) ──────────────────────────────────

function ModelRowView({
  id, config, isFirst, readOnly, canEdit, expanded, fetchedModels, onToggle, onIdChange, onNameChange, onRemove, onAttributesChange, onOptionsChange,
}: {
  id: string
  config: OpenCodeModel
  isFirst: boolean
  readOnly?: boolean
  canEdit: boolean
  expanded: boolean
  fetchedModels: FetchedModel[]
  onToggle: () => void
  onIdChange: (newId: string) => void
  onNameChange: (name: string) => void
  onRemove: () => void
  onAttributesChange: (next: Record<string, unknown>) => void
  onOptionsChange: (next: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const attributes = Object.fromEntries(Object.entries(config).filter(([key]) => !MODEL_RESERVED_KEYS.has(key)))
  const options = config.options && typeof config.options === 'object' && !Array.isArray(config.options) ? config.options : {}
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium ${isFirst ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
          {isFirst ? t('providerForm.modelBadge.default') : t('providerForm.modelBadge.fallback')}
        </span>
        <ModelIdInput
          value={id}
          models={fetchedModels}
          onChange={onIdChange}
          disabled={readOnly || !canEdit}
          renameOnBlur
        />
        <Input
          value={typeof config.name === 'string' ? config.name : ''}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t('providerForm.displayNameOptional')}
          className="min-w-0 text-sm"
          disabled={readOnly || !canEdit}
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground"
          title={expanded ? t('providerForm.advancedToggle.collapse') : t('providerForm.advancedToggle.expand')}
          disabled={readOnly}
        >
          <ChevronIcon open={expanded} />
          <span>{t('providerForm.advancedOptions')}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={readOnly || !canEdit}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
          title={t('providerForm.deleteModel')}
        >
          <TrashIcon />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {/* Token Limits */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('providerForm.opencode.contextLimit')} hint={t('providerForm.opencode.contextLimitHint')}>
              <Input
                value={(config.limit as Record<string, unknown>)?.context as string ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '')
                  const limit = { ...(config.limit as Record<string, unknown> || {}) }
                  if (v) limit.context = parseInt(v, 10); else delete limit.context
                  onAttributesChange({ ...attributes, limit: Object.keys(limit).length > 0 ? limit : undefined })
                }}
                placeholder="1048576"
                className="font-mono text-sm"
                disabled={readOnly}
              />
            </Field>
            <Field label={t('providerForm.opencode.outputLimit')} hint={t('providerForm.opencode.outputLimitHint')}>
              <Input
                value={(config.limit as Record<string, unknown>)?.output as string ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '')
                  const limit = { ...(config.limit as Record<string, unknown> || {}) }
                  if (v) limit.output = parseInt(v, 10); else delete limit.output
                  onAttributesChange({ ...attributes, limit: Object.keys(limit).length > 0 ? limit : undefined })
                }}
                placeholder="131072"
                className="font-mono text-sm"
                disabled={readOnly}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h5 className="text-xs font-medium">{t('providerForm.opencode.modelAttributes')}</h5>
              <KeyValueEditor
                value={attributes}
                onChange={(next) => onAttributesChange({ ...Object.fromEntries(Object.keys(attributes).map((key) => [key, undefined])), ...next })}
                readOnly={readOnly}
                emptyLabel={t('providerForm.opencode.noModelAttributes')}
              />
            </div>
            <div className="space-y-2">
              <h5 className="text-xs font-medium">{t('providerForm.opencode.sdkOptions')}</h5>
              <KeyValueEditor value={options as Record<string, unknown>} onChange={onOptionsChange} readOnly={readOnly} emptyLabel={t('providerForm.opencode.noSdkOptions')} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
