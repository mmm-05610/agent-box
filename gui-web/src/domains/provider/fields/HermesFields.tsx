/**
 * HermesFields — Hermes-specific provider inputs.
 *
 * Extracted from the old HermesProviderForm. Keeps the Hermes-only pieces:
 * API mode selector, base_url endpoint (with speed test + URL validation),
 * the models list, rate-limit delay advanced card, and the settings.json
 * editor (library mode) / default-model field (profile mode). The shared
 * identity block now lives in the ProviderForm frame.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FetchedModel } from '@/api/models'
import { Input, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '@/components/provider/ProviderFormFields'
import {
  Field, SwitchRow, AdvancedCard, ApiKeySection, EndpointField, ModelFetchActions,
  ModelIdInput,
  LinkIcon, ChevronIcon, TrashIcon, ClockIcon,
} from '@/components/provider/forms/shared'
import { useFetchedModels } from '@/components/provider/forms/hooks/useFetchedModels'
import type { ProviderFieldsProps } from './types'

export type HermesApiMode =
  | 'openai_compatible'
  | 'anthropic'
  | 'codex_responses'
  | 'bedrock_converse'

export const HERMES_API_MODE_OPTIONS: Array<{ value: HermesApiMode; label: string }> = [
  { value: 'openai_compatible', label: 'providerForm.hermes.apiModeOption.openaiCompatible' },
  { value: 'anthropic', label: 'providerForm.hermes.apiModeOption.anthropic' },
  { value: 'codex_responses', label: 'providerForm.hermes.apiModeOption.codexResponses' },
  { value: 'bedrock_converse', label: 'providerForm.hermes.apiModeOption.bedrockConverse' },
]

export interface HermesModel {
  id: string
  name?: string
  contextLength?: number
}

type ModelRow = HermesModel & { rowId: string }

export function readHermesModels(settings: Record<string, unknown> | undefined): HermesModel[] {
  const list = settings?.models
  if (!Array.isArray(list)) return []
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const id = typeof value.id === 'string' ? value.id : ''
    if (!id.trim()) return []
    return [{
      id,
      name: typeof value.name === 'string' ? value.name : undefined,
      contextLength: typeof value.context_length === 'number'
        ? value.context_length
        : typeof value.contextLength === 'number'
          ? value.contextLength
          : undefined,
    }]
  })
}

const selectClassName =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50'

function makeRow(seed?: HermesModel): ModelRow {
  return { rowId: crypto.randomUUID(), id: seed?.id ?? '', name: seed?.name ?? '', contextLength: seed?.contextLength }
}
function sameModels(rows: ModelRow[], models: HermesModel[]) {
  return rows.length === models.length && rows.every((row, index) => {
    const m = models[index]
    return row.id === (m?.id ?? '') && (row.name ?? '') === (m?.name ?? '') && (row.contextLength ?? '') === (m?.contextLength ?? '')
  })
}

export function HermesFields(props: ProviderFieldsProps) {
  const { t } = useTranslation()
  const {
    values, onChange, readOnly,
    apiMode = 'openai_compatible', onApiModeChange,
    models = [], onModelsChange,
    rateLimitDelay, onRateLimitDelayChange,
    mode = 'library',
    endpointCandidates = [],
    settingsJson = '', onSettingsJsonChange,
  } = props

  const { models: fetchedModels, fetching, error: fetchError, fetch: handleFetch } = useFetchedModels(values.baseUrl, values.authValue)
  const [rateLimitEnabled, setRateLimitEnabled] = useState(rateLimitDelay !== undefined)
  const [baseUrlTouched, setBaseUrlTouched] = useState(false)
  const [localMode, setLocalMode] = useState<HermesApiMode>(apiMode)
  const [localModels, setLocalModels] = useState<HermesModel[]>(models)
  const [localRateLimit, setLocalRateLimit] = useState<number | undefined>(rateLimitDelay)
  const lastSentSettingsJsonRef = useRef(settingsJson)

  const effectiveMode = onApiModeChange ? apiMode : localMode
  const effectiveModels = onModelsChange ? models : localModels
  const effectiveRateLimit = onRateLimitDelayChange ? rateLimitDelay : localRateLimit

  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  const [rows, setRows] = useState<ModelRow[]>(() => effectiveModels.map(makeRow))
  const lastSentModelsRef = useRef<HermesModel[]>(effectiveModels)

  useEffect(() => {
    setRows((current) => sameModels(current, effectiveModels) ? current : effectiveModels.map(makeRow))
    lastSentModelsRef.current = effectiveModels
  }, [effectiveModels])

  useEffect(() => {
    if (sameModels(rows, lastSentModelsRef.current)) return
    const next = rows.map(({ rowId: _rowId, ...rest }) => ({ ...rest, contextLength: rest.contextLength }))
    lastSentModelsRef.current = next
    if (onModelsChange) onModelsChange(next)
    else setLocalModels(next)
  }, [rows, onModelsChange])

  // Live preview JSON — mirrors applyHermesEdits so the user can see exactly
  // what the saved config will look like.
  const previewSettingsJson = useMemo(() => {
    const settings: Record<string, unknown> = {}
    if (values.baseUrl) settings.base_url = values.baseUrl.replace(/\/+$/, '')
    if (values.authValue) settings.api_key = values.authValue
    const effectiveApiMode = onApiModeChange ? apiMode : (apiMode ?? localMode)
    if (effectiveApiMode) settings.api_mode = effectiveApiMode
    const effectiveModels = onModelsChange ? models : (models ?? localModels)
    if (Array.isArray(effectiveModels) && effectiveModels.length > 0) {
      const out: Record<string, unknown>[] = []
      for (const m of effectiveModels) {
        const id = typeof m.id === 'string' ? m.id.trim() : ''
        if (!id) continue
        const item: Record<string, unknown> = { id }
        if (m.name && m.name.trim()) item.name = m.name.trim()
        if (typeof m.contextLength === 'number') item.context_length = m.contextLength
        out.push(item)
      }
      if (out.length > 0) settings.models = out
    }
    const effectiveDelay = onRateLimitDelayChange ? rateLimitDelay : (rateLimitDelay ?? localRateLimit)
    if (typeof effectiveDelay === 'number' && effectiveDelay > 0) settings.rate_limit_delay = effectiveDelay
    return JSON.stringify(settings, null, 2)
  }, [values.baseUrl, values.authValue, apiMode, localMode, models, localModels, rateLimitDelay, localRateLimit, onApiModeChange, onModelsChange, onRateLimitDelayChange])

  const parentProvided = Boolean(onSettingsJsonChange)
  const effectiveSettingsJson = parentProvided ? settingsJson : (settingsJson || previewSettingsJson)
  const setSettingsJson = (next: string) => {
    if (onSettingsJsonChange) {
      if (next === lastSentSettingsJsonRef.current) return
      lastSentSettingsJsonRef.current = next
      onSettingsJsonChange(next)
    }
    // No parent onChange: live preview only — edits are intentionally not
    // persisted (matches the old standalone form behavior).
  }

  const updateRow = (index: number, patch: Partial<HermesModel>) =>
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const setMode = (next: HermesApiMode) => {
    onApiModeChange?.(next)
    if (!onApiModeChange) setLocalMode(next)
  }

  return (
    <div className="space-y-4">
      <ApiKeySection value={values.authValue} onChange={(value) => set({ authValue: value })} readOnly={readOnly} />

      {mode === 'library' && <>
        <Field label={t('providerForm.hermes.apiMode')}>
          <select
            value={effectiveMode}
            onChange={(event) => setMode(event.target.value as HermesApiMode)}
            className={selectClassName}
            disabled={readOnly}
          >
            {HERMES_API_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.label)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">{t('providerForm.hermes.apiModeHint')}</p>
        </Field>

        <EndpointField
          value={values.baseUrl}
          onChange={(baseUrl) => { set({ baseUrl }); setBaseUrlTouched(true) }}
          candidates={endpointCandidates}
          label={t('providerForm.hermes.endpointLabel')}
          readOnly={readOnly}
          hint={<div className="mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700"><LinkIcon /><span>{t('providerForm.hermes.endpointHint')}</span></div>}
        />
        {baseUrlTouched && values.baseUrl.trim() === '' && (
          <p className="mt-1 text-xs text-destructive">{t('providerForm.hermes.baseUrlRequired')}</p>
        )}
        {baseUrlTouched && values.baseUrl.trim() !== '' && (() => {
          try {
            const u = new URL(values.baseUrl)
            if (!['http:', 'https:'].includes(u.protocol)) return <p className="mt-1 text-xs text-destructive">{t('providerForm.hermes.httpOnly')}</p>
          } catch {
            return <p className="mt-1 text-xs text-destructive">{t('providerForm.hermes.invalidUrl')}</p>
          }
          return null
        })()}

        <ModelsCard
          rows={rows}
          fetchedModels={fetchedModels}
          fetching={fetching}
          fetchError={fetchError}
          readOnly={readOnly}
          onFetch={handleFetch}
          onAdd={() => setRows((current) => [...current, makeRow()])}
          onUpdate={updateRow}
          onRemove={(index) => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
        />

        <AdvancedCard
          icon={<ClockIcon />}
          title={t('providerForm.hermes.advancedTitle')}
          enabled={rateLimitEnabled}
          onEnabledChange={(enabled) => {
            setRateLimitEnabled(enabled)
            if (!enabled) {
              onRateLimitDelayChange?.(undefined)
              if (!onRateLimitDelayChange) setLocalRateLimit(undefined)
            }
          }}
        >
          <SwitchRow
            title={t('providerForm.hermes.rateLimitDelay')}
            hint={t('providerForm.hermes.rateLimitHint')}
            checked={rateLimitEnabled}
            onChange={(checked) => {
              setRateLimitEnabled(checked)
              if (!checked) {
                onRateLimitDelayChange?.(undefined)
                if (!onRateLimitDelayChange) setLocalRateLimit(undefined)
              }
            }}
            disabled={readOnly}
          />
          <Field label={t('providerForm.hermes.delayLabel')}>
            <Input
              type="number"
              min="0"
              step="0.1"
              value={effectiveRateLimit ?? ''}
              onChange={(event) => {
                const value = event.target.value ? Number(event.target.value) : undefined
                onRateLimitDelayChange?.(value)
                if (!onRateLimitDelayChange) setLocalRateLimit(value)
              }}
              placeholder={t('providerForm.hermes.delayPlaceholder')}
              className="font-mono text-sm"
              disabled={!rateLimitEnabled || readOnly}
            />
          </Field>
        </AdvancedCard>
      </>}

      {mode === 'profile' && (
        <Field label={t('providerForm.modelBadge.default')}>
          <Input value={values.fallbackModel} onChange={(event) => set({ fallbackModel: event.target.value })} placeholder={t('providerForm.hermes.defaultModelPlaceholder')} className="font-mono text-sm" disabled={readOnly} />
        </Field>
      )}

      {mode === 'library' && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-medium">{t('providerForm.settingsEditor.title')}</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {parentProvided
                  ? t('providerForm.hermes.settingsHintEditable')
                  : t('providerForm.settingsEditor.hintPreview')}
              </p>
            </div>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {parentProvided ? t('providerForm.settingsEditor.editable') : t('providerForm.settingsEditor.livePreviewEditable')}
            </span>
          </div>
          <Textarea
            value={effectiveSettingsJson}
            onChange={(event) => setSettingsJson(event.target.value)}
            rows={Math.min(16, Math.max(6, effectiveSettingsJson.split('\n').length + 1))}
            className="mt-3 font-mono text-sm"
            disabled={readOnly}
          />
        </div>
      )}

      {mode === 'profile' && <p className="text-xs text-muted-foreground">{t('providerForm.profileModeHint', { agent: 'Hermes' })}</p>}
    </div>
  )
}

// ── ModelsCard + ModelRowView (Hermes-specific) ───────────────────────

function ModelsCard({
  rows, fetchedModels, fetching, fetchError, readOnly, onFetch, onAdd, onUpdate, onRemove,
}: {
  rows: ModelRow[]
  fetchedModels: FetchedModel[]
  fetching: boolean
  fetchError: string | null
  readOnly?: boolean
  onFetch: () => void
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<HermesModel>) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-medium">{t('providerForm.hermes.modelsTitle')}</h4>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{t('providerForm.hermes.modelsDesc')}</p>
        </div>
        <ModelFetchActions fetching={fetching} onFetch={onFetch} onAdd={onAdd} fetchDisabled={readOnly} addDisabled={readOnly} />
      </div>
      {fetchError && <p className="mt-2 text-xs text-red-500">{fetchError}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t('providerForm.emptyModels')}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {rows.map((row, index) => (
            <ModelRowView
              key={row.rowId}
              index={index}
              row={row}
              fetchedModels={fetchedModels}
              readOnly={readOnly}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ModelRowView({
  index, row, fetchedModels, readOnly, onUpdate, onRemove,
}: {
  index: number
  row: ModelRow
  fetchedModels: FetchedModel[]
  readOnly?: boolean
  onUpdate: (index: number, patch: Partial<HermesModel>) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  const [contextOpen, setContextOpen] = useState(false)
  const isDefault = index === 0
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium ${isDefault ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
          {isDefault ? t('providerForm.modelBadge.default') : t('providerForm.modelBadge.fallback')}
        </span>
        <ModelIdInput
          value={row.id}
          models={fetchedModels}
          onChange={(value) => onUpdate(index, { id: value, name: row.name?.trim() ? row.name : value })}
          disabled={readOnly}
        />
        <Input
          value={row.name ?? ''}
          onChange={(event) => onUpdate(index, { name: event.target.value })}
          placeholder={t('providerForm.displayNameOptional')}
          className="text-sm"
          disabled={readOnly}
        />
        <button
          type="button"
          onClick={() => setContextOpen((open) => !open)}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground"
          title={contextOpen ? t('providerForm.advancedToggle.collapse') : t('providerForm.advancedToggle.expand')}
          disabled={readOnly}
        >
          <ChevronIcon open={contextOpen} />
          <span>{t('providerForm.advancedOptions')}</span>
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
          title={t('providerForm.deleteModel')}
          disabled={readOnly}
        >
          <TrashIcon />
        </button>
      </div>
      {contextOpen && (
        <div className="mt-3 max-w-md border-t border-border pt-3">
          <Field label={t('providerForm.contextLength')}>
            <Input
              type="number"
              min="1"
              value={row.contextLength ?? ''}
              onChange={(event) => onUpdate(index, { contextLength: event.target.value ? Number(event.target.value) : undefined })}
              placeholder={t('providerForm.contextLengthPlaceholder')}
              className="font-mono text-sm"
              disabled={readOnly}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('providerForm.contextLengthHint')}</p>
          </Field>
        </div>
      )}
    </div>
  )
}
