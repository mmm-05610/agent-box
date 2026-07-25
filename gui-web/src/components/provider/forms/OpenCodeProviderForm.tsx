import { useEffect, useMemo, useRef, useState } from 'react'
import type { FetchedModel } from '@/api/models'
import { Button, Input, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'
import {
  Field, ProviderIdentityFields, ApiKeySection, EndpointField, ModelFetchActions,
  KeyValueEditor, ModelIdInput,
  LinkIcon, ChevronIcon, PlusIcon, TrashIcon,
} from './shared'
import { useFetchedModels } from './hooks/useFetchedModels'

export type OpenCodeNpmPackage =
  | '@ai-sdk/openai'
  | '@ai-sdk/openai-compatible'
  | '@ai-sdk/anthropic'
  | '@ai-sdk/amazon-bedrock'
  | '@ai-sdk/google'

export const OPENCODE_NPM_PACKAGES: Array<{ value: OpenCodeNpmPackage; label: string }> = [
  { value: '@ai-sdk/openai', label: '@ai-sdk/openai (OpenAI Responses)' },
  { value: '@ai-sdk/openai-compatible', label: '@ai-sdk/openai-compatible (OpenAI Compatible)' },
  { value: '@ai-sdk/anthropic', label: '@ai-sdk/anthropic (Anthropic)' },
  { value: '@ai-sdk/amazon-bedrock', label: '@ai-sdk/amazon-bedrock (Bedrock)' },
  { value: '@ai-sdk/google', label: '@ai-sdk/google (Gemini)' },
]

export interface OpenCodeModel {
  name?: string
  options?: Record<string, unknown>
  [key: string]: unknown
}
export type OpenCodeModels = Record<string, OpenCodeModel>

export interface OpenCodeProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  modelsJson?: string
  onModelsJsonChange?: (next: string) => void
  npm?: OpenCodeNpmPackage
  onNpmChange?: (next: OpenCodeNpmPackage) => void
  models?: OpenCodeModels
  onModelsChange?: (next: OpenCodeModels) => void
  extraOptions?: Record<string, unknown>
  onExtraOptionsChange?: (next: Record<string, unknown>) => void
  category?: string
  mode?: 'library' | 'profile'
  endpointCandidates?: string[]
  npmPackage?: OpenCodeNpmPackage
  onNpmPackageChange?: (next: OpenCodeNpmPackage) => void
  settingsJson?: string
  onSettingsJsonChange?: (next: string) => void
}

const selectClassName =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-50'
const MODEL_RESERVED_KEYS = new Set(['name', 'options'])


export function OpenCodeProviderForm(props: OpenCodeProviderFormProps) {
  const {
    values, onChange, readOnly,
    modelsJson = '', onModelsJsonChange,
    npm: npmProp, onNpmChange,
    models, onModelsChange,
    extraOptions = {}, onExtraOptionsChange,
    mode = 'library',
    endpointCandidates = [],
    npmPackage, onNpmPackageChange,
    settingsJson = '', onSettingsJsonChange,
  } = props

  // Back-compat: accept either `npm`/`onNpmChange` or the newer `npmPackage`/`onNpmPackageChange`
  const npm = npmPackage ?? npmProp ?? '@ai-sdk/openai-compatible'
  const setNpm = onNpmPackageChange ?? onNpmChange

  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({})
  const { models: fetchedModels, fetching, error: fetchError, fetch: handleFetchModels } = useFetchedModels(values.baseUrl, values.authValue)
  const [settingsJsonLocal, setSettingsJsonLocal] = useState(settingsJson)
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

  const modelsError = !models && modelsJson.trim() && Object.keys(parsedModels).length === 0 ? 'JSON 无效或为空对象' : ''
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

  // settingsJson local fallback
  useEffect(() => {
    setSettingsJsonLocal((current) => settingsJson === current ? current : settingsJson)
  }, [settingsJson])
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

  return (
    <div className="space-y-4">
      <ProviderIdentityFields name={values.name} notes={values.notes} websiteUrl={values.websiteUrl} onChange={set} readOnly={readOnly} />
      <ApiKeySection value={values.authValue} onChange={(value) => set({ authValue: value })} readOnly={readOnly} />

      <Field label="NPM Package">
        <select value={npm} onChange={(event) => setNpm?.(event.target.value as OpenCodeNpmPackage)} className={selectClassName} disabled={readOnly}>
          {OPENCODE_NPM_PACKAGES.map((pkg) => <option key={pkg.value} value={pkg.value}>{pkg.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">选择驱动该供应商的 AI SDK 包；预设供应商已自动配置，自定义供应商请按上游协议选择。</p>
      </Field>

      <EndpointField value={values.baseUrl} onChange={(baseUrl) => set({ baseUrl })} candidates={endpointCandidates} label="API 请求地址 (options.baseURL)" readOnly={readOnly} hint={<div className="mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700"><LinkIcon /><span>OpenCode 通过 options.baseURL 读取请求地址；不同 npm 包要求的路径格式可能不同。</span></div>} />

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-medium">Extra Options</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">除 baseURL/apiKey 外传给 SDK 的其他选项。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onExtraOptionsChange?.({ ...extraOptions, [`option-${Date.now()}`]: '' })} disabled={readOnly || !onExtraOptionsChange} className="h-7 gap-1">
            <PlusIcon />添加
          </Button>
        </div>
        <div className="mt-3">
          <KeyValueEditor
            value={extraOptions}
            onChange={onExtraOptionsChange}
            readOnly={readOnly}
            emptyLabel="暂无 extra 选项"
            showColumnHeader
            hideAddButton
            addLabel="添加"
            keyPlaceholder="timeout"
            valuePlaceholder="600000"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">配置额外的 SDK 选项，如 timeout、setCacheKey 等；value 会自动尝试解析为 JSON，失败则按字符串处理。</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-medium">Models</h4>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">每个模型可配置显示名、SDK 选项（如 temperature / maxTokens）以及其他任意字段；首条作为默认模型写入 <span className="font-mono">model.default</span>。</p>
          </div>
          <ModelFetchActions fetching={fetching} onFetch={handleFetchModels} fetchDisabled={readOnly} addDisabled={readOnly || (!onModelsChange && !onModelsJsonChange)} onAdd={() => {
              let id = 'new-model'; let suffix = 2
              while (parsedModels[id]) id = `new-model-${suffix++}`
              emitModels({ ...parsedModels, [id]: { name: '' } })
              setExpandedModels((current) => ({ ...current, [id]: true }))
            }} />
        </div>
        {(fetchError || modelsError) && <p className="mt-2 text-xs text-red-500">{fetchError || modelsError}</p>}
        {Object.keys(parsedModels).length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            暂无模型，点击「获取模型列表」或「添加模型」。
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
            <h4 className="text-base font-medium">settings.json (JSON)</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {parentProvided
                ? '该供应商的完整 settings_config JSON；修改后会被原样写入 OpenCode 配置。普通编辑请使用上方结构化字段。'
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
          placeholder='{"npm": "@ai-sdk/openai-compatible", "options": {"baseURL": "..."}}'
        />
      </div>

      {mode === 'profile' && <p className="text-xs text-muted-foreground">Profile 模式保存到当前 OpenCode 配置文件。</p>}
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
  const attributes = Object.fromEntries(Object.entries(config).filter(([key]) => !MODEL_RESERVED_KEYS.has(key)))
  const options = config.options && typeof config.options === 'object' && !Array.isArray(config.options) ? config.options : {}
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium ${isFirst ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
          {isFirst ? '默认模型' : '备选模型'}
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
          placeholder="显示名称（可选）"
          className="min-w-0 text-sm"
          disabled={readOnly || !canEdit}
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground"
          title={expanded ? '收起高级' : '展开高级'}
          disabled={readOnly}
        >
          <ChevronIcon open={expanded} />
          <span>高级选项</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={readOnly || !canEdit}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
          title="删除模型"
        >
          <TrashIcon />
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-4 border-t border-border pt-3 md:grid-cols-2">
          <div className="space-y-2">
            <h5 className="text-xs font-medium">模型属性</h5>
            <KeyValueEditor value={attributes} onChange={(next) => onAttributesChange({ ...Object.fromEntries(Object.keys(attributes).map((key) => [key, undefined])), ...next })} readOnly={readOnly} emptyLabel="暂无模型属性" />
          </div>
          <div className="space-y-2">
            <h5 className="text-xs font-medium">SDK 选项</h5>
            <KeyValueEditor value={options as Record<string, unknown>} onChange={onOptionsChange} readOnly={readOnly} emptyLabel="暂无 SDK 选项" />
          </div>
        </div>
      )}
    </div>
  )
}
