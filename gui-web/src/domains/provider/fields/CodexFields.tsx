/**
 * CodexFields — Codex-specific provider inputs.
 *
 * Extracted from the old CodexProviderForm. Keeps everything the form had
 * except the shared identity block (now in the ProviderForm frame):
 * auth.json / config.toml editors, upstream format + routing, Anthropic
 * upstream settings, prompt-cache routing, thinking ability, default model,
 * model_catalog.json mapping, custom User-Agent, local proxy overrides, and
 * the per-provider model test config.
 */
import { useEffect, useRef, useState } from 'react'
import type { FetchedModel } from '@/api/models'
import { Button, Input, Textarea } from '@/components/ui'
import { EndpointSpeedTest } from '@/components/provider/EndpointSpeedTest'
import type { ProviderFormValues } from '@/components/provider/ProviderFormFields'
import {
  Field, SwitchRow, AdvancedCard, Toggle, ApiKeySection, ModelFetchActions, ModelIdInput,
  LinkIcon, ZapIcon, BulbIcon, ChevronIcon, TrashIcon, FlaskIcon,
} from '@/components/provider/forms/shared'
import { useFetchedModels } from '@/components/provider/forms/hooks/useFetchedModels'
import type { ProviderFieldsProps } from './types'

export type CodexApiFormat = 'openai_responses' | 'openai_chat' | 'anthropic'
export type ClaudeApiKeyField = 'ANTHROPIC_AUTH_TOKEN' | 'ANTHROPIC_API_KEY'
export type PromptCacheRoutingMode = 'auto' | 'enabled' | 'disabled'
export interface CodexChatReasoning { supportsThinking?: boolean; supportsEffort?: boolean; effortParam?: string }
export interface CodexCatalogModel { model: string; displayName: string; contextWindow?: number | string }
type CatalogRow = CodexCatalogModel & { rowId: string }

export function readCodexCatalogModels(settings: Record<string, unknown> | undefined): CodexCatalogModel[] {
  const catalog = settings?.modelCatalog as Record<string, unknown> | undefined
  if (Array.isArray(catalog?.models)) {
    const models = catalog.models.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const value = item as Record<string, unknown>
      const model = typeof value.model === 'string' ? value.model : ''
      if (!model.trim()) return []
      return [{
        model,
        displayName: typeof value.displayName === 'string' ? value.displayName : typeof value.display_name === 'string' ? value.display_name : model,
        contextWindow: typeof value.contextWindow === 'string' || typeof value.contextWindow === 'number' ? value.contextWindow : typeof value.context_window === 'string' || typeof value.context_window === 'number' ? value.context_window : '',
      }]
    })
    if (models.length > 0) return models
  }

  const directModel = typeof settings?.model === 'string' ? settings.model.trim() : ''
  const config = typeof settings?.config === 'string' ? settings.config : ''
  const tomlModel = config.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1]?.trim() ?? ''
  const configuredModel = directModel || tomlModel
  return configuredModel ? [{ model: configuredModel, displayName: configuredModel, contextWindow: '' }] : []
}

const selectClassName = 'h-9 w-full rounded-md bg-muted px-3 text-sm text-foreground outline-none disabled:opacity-50'
const reasoningHint = '预设供应商已自动配置；自定义供应商会按名称/地址自动推断。仅当自动识别不准时才需展开手动覆盖。'
const thinkingHint = '上游 Chat Completions 接口支持开启或关闭 thinking 时启用。Kimi、GLM、Qwen 等通常属于这一类。'
const effortHint = '上游支持 low/high/max 等思考深度控制时启用。启用后会自动启用思考模式，并把 Codex 的 reasoning.effort 转成上游 Chat 参数。'

function makeRow(seed?: CodexCatalogModel): CatalogRow {
  return { rowId: crypto.randomUUID(), model: seed?.model ?? '', displayName: seed?.displayName ?? '', contextWindow: seed?.contextWindow ?? '' }
}
function sameModels(rows: CatalogRow[], models: CodexCatalogModel[]) {
  return rows.length === models.length && rows.every((row, index) => row.model === (models[index]?.model ?? '') && row.displayName === (models[index]?.displayName ?? '') && String(row.contextWindow ?? '') === String(models[index]?.contextWindow ?? ''))
}

export function CodexFields(props: ProviderFieldsProps) {
  const {
    values, onChange, readOnly, codexConfig = '', onCodexConfigChange,
    model = '', onModelChange,
    apiFormat = 'openai_responses', onApiFormatChange,
    codexChatReasoning = {}, onCodexChatReasoningChange,
    catalogModels = [], onCatalogModelsChange,
    customUserAgent, onCustomUserAgentChange,
    localProxyHeadersOverride = '', onLocalProxyHeadersOverrideChange,
    localProxyBodyOverride = '', onLocalProxyBodyOverrideChange,
    category, shouldShowSpeedTest = true, isFullUrl, onFullUrlChange,
    mode = 'library', endpointCandidates = [],
    codexModel = '', onCodexModelChange,
    anthropicAuthField = 'ANTHROPIC_AUTH_TOKEN', onAnthropicAuthFieldChange,
    impersonateClaudeCode = false, onImpersonateClaudeCodeChange,
    maxOutputTokens = '', onMaxOutputTokensChange,
    promptCacheRouting = 'auto', onPromptCacheRoutingChange,
  } = props
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(Boolean(values.testConfigEnabled || values.testTimeout || values.testDegradedThreshold || values.testMaxRetries))
  const [endpointToolsOpen, setEndpointToolsOpen] = useState(false)
  const { models: fetchedModels, fetching, error: fetchError, fetch: fetchCatalog } = useFetchedModels(values.baseUrl, values.authValue)
  const [localReasoning, setLocalReasoning] = useState(codexChatReasoning)
  const [localModels, setLocalModels] = useState(catalogModels)
  const effectiveReasoning = onCodexChatReasoningChange ? codexChatReasoning : localReasoning
  const effectiveModels = onCatalogModelsChange ? catalogModels : localModels
  const effectiveFormat = onApiFormatChange ? apiFormat : values.apiFormat === 'openai_chat' ? 'openai_chat' : 'openai_responses'
  const fullUrl = onFullUrlChange ? Boolean(isFullUrl) : values.isFullUrl
  const supportsThinking = effectiveReasoning.supportsThinking === true || effectiveReasoning.supportsEffort === true
  const supportsEffort = effectiveReasoning.supportsEffort === true
  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  const [rows, setRows] = useState<CatalogRow[]>(() => effectiveModels.map(makeRow))
  const lastSentModelsRef = useRef<CodexCatalogModel[]>(effectiveModels)

  useEffect(() => {
    setRows((current) => sameModels(current, effectiveModels) ? current : effectiveModels.map(makeRow))
    lastSentModelsRef.current = effectiveModels
  }, [effectiveModels])
  useEffect(() => {
    if (sameModels(rows, lastSentModelsRef.current)) return
    const next = rows.map(({ rowId: _rowId, ...rest }) => rest)
    lastSentModelsRef.current = next
    onCatalogModelsChange?.(next)
    if (!onCatalogModelsChange) setLocalModels(next)
  }, [rows, onCatalogModelsChange])

  const setFormat = (next: CodexApiFormat) => {
    onApiFormatChange?.(next)
    if (!onApiFormatChange) set({ apiFormat: next })
  }
  const setReasoning = (next: CodexChatReasoning) => {
    onCodexChatReasoningChange?.(next)
    if (!onCodexChatReasoningChange) setLocalReasoning(next)
  }
  const updateRow = (index: number, patch: Partial<CodexCatalogModel>) =>
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const authJson = JSON.stringify({ OPENAI_API_KEY: values.authValue }, null, 2)
  const updateAuthJson = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (typeof parsed.OPENAI_API_KEY === 'string') set({ authValue: parsed.OPENAI_API_KEY })
    } catch { /* keep editor permissive */ }
  }

  return <div className="space-y-4">
    <ApiKeySection value={values.authValue} onChange={(value) => set({ authValue: value })} readOnly={readOnly} />
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">API 请求地址</label>
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><LinkIcon />完整 URL</span>
            <Toggle checked={fullUrl} onChange={(checked) => { onFullUrlChange?.(checked); if (!onFullUrlChange) set({ isFullUrl: checked }) }} disabled={readOnly} />
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEndpointToolsOpen((open) => !open)} disabled={readOnly} className="h-7 gap-1 text-xs">
          <ZapIcon />{endpointToolsOpen ? '收起测速' : '管理与测速'}
        </Button>
      </div>
      <Input value={values.baseUrl} onChange={(event) => set({ baseUrl: event.target.value })} placeholder="https://api.example.com" className="text-sm font-mono" disabled={readOnly} />
      {endpointToolsOpen && (() => {
        const endpoints = Array.from(new Set([values.baseUrl, ...endpointCandidates].filter(Boolean)))
        return <div className="mt-2">
          {endpoints.length > 0
            ? <EndpointSpeedTest endpoints={endpoints} selected={values.baseUrl} onSelect={(url) => set({ baseUrl: url })} />
            : <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">请先填写 API 请求地址，再使用管理与测速功能。</p>}
        </div>
      })()}
      <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <BulbIcon /><span>填写兼容 OpenAI Responses 格式的服务端点地址</span>
      </div>
    </div>

    {category !== 'official' && <>
      {/* Upstream Format */}
      {shouldShowSpeedTest && (
        <div className="rounded-lg border border-border bg-card p-3">
          <Field label="上游请求格式 (Upstream Format)">
            <select value={effectiveFormat} onChange={(e) => setFormat(e.target.value as CodexApiFormat)} className={selectClassName} disabled={readOnly}>
              <option value="openai_responses">Responses（原生）</option>
              <option value="openai_chat">Chat Completions（需开启路由）</option>
              <option value="anthropic">Anthropic Messages（需开启路由）</option>
            </select>
          </Field>
          <p className="mt-2 text-xs text-muted-foreground">
            {effectiveFormat === 'anthropic'
              ? '将 Codex 的请求转换为 Anthropic Messages 格式发送到供应商；需在下方配置 Anthropic 认证字段。'
              : effectiveFormat === 'openai_chat'
                ? '将 Codex 的 Responses 请求转换为 Chat Completions 格式；需保持本地路由开启。'
                : 'Codex 原生 Responses API，无需格式转换；GPT 系列模型默认使用此格式。'}
          </p>
        </div>
      )}

      {/* Anthropic-specific settings */}
      {effectiveFormat === 'anthropic' && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <Field label="Anthropic 认证字段">
            <select value={anthropicAuthField} onChange={(e) => onAnthropicAuthFieldChange?.(e.target.value as ClaudeApiKeyField)} className={selectClassName} disabled={readOnly}>
              <option value="ANTHROPIC_AUTH_TOKEN">ANTHROPIC_AUTH_TOKEN</option>
              <option value="ANTHROPIC_API_KEY">ANTHROPIC_API_KEY</option>
            </select>
          </Field>
          <SwitchRow title="伪装为 Claude Code 客户端" hint="发送模拟 Claude Code 的 User-Agent / anthropic-beta / x-app 请求头。" checked={impersonateClaudeCode} onChange={(v) => onImpersonateClaudeCodeChange?.(v)} disabled={readOnly} />
          <Field label="最大输出 Token 数 (Max Output Tokens)" hint="覆盖默认 8192 输出上限；留空使用默认值。仅允许数字。">
            <Input value={maxOutputTokens} onChange={(e) => onMaxOutputTokensChange?.(e.target.value.replace(/\D/g, ''))} placeholder="8192" className="font-mono text-sm" disabled={readOnly} />
          </Field>
        </div>
      )}

      {/* Prompt Cache Routing (Chat format only) */}
      {effectiveFormat === 'openai_chat' && (
        <div className="rounded-lg border border-border bg-card p-3">
          <Field label="Prompt Cache 路由" hint="控制 prompt_cache_key 的缓存路由行为。auto 为自动决定；enabled 总启用缓存；disabled 禁用缓存路由。">
            <select value={promptCacheRouting} onChange={(e) => onPromptCacheRoutingChange?.(e.target.value as PromptCacheRoutingMode)} className={selectClassName} disabled={readOnly}>
              <option value="auto">auto（自动）</option>
              <option value="enabled">enabled（启用）</option>
              <option value="disabled">disabled（禁用）</option>
            </select>
          </Field>
        </div>
      )}

      {/* Thinking ability (Chat format) */}
      {effectiveFormat === 'openai_chat' && (
        <div className="rounded-lg border border-border bg-card">
          <button type="button" onClick={() => setReasoningOpen((open) => !open)} className="flex w-full items-start gap-2 p-3 text-left">
            <span className="mt-0.5 text-muted-foreground"><ChevronIcon open={reasoningOpen} /></span>
            <span><span className="block text-sm font-medium">思考能力（高级·通常自动识别）</span><span className="mt-1 block text-xs text-muted-foreground">{reasoningHint}</span></span>
          </button>
          {reasoningOpen && (
            <div className="space-y-4 border-t border-border p-3">
              <SwitchRow title="支持思考模式" hint={thinkingHint} checked={supportsThinking} onChange={(checked) => setReasoning({ ...effectiveReasoning, supportsThinking: checked, supportsEffort: checked ? effectiveReasoning.supportsEffort : false })} disabled={readOnly} />
              <div className="border-t border-border pt-3">
                <SwitchRow title="支持思考等级" hint={effortHint} checked={supportsEffort} onChange={(checked) => setReasoning({ ...effectiveReasoning, supportsThinking: checked ? true : effectiveReasoning.supportsThinking, supportsEffort: checked, effortParam: checked ? effectiveReasoning.effortParam ?? 'reasoning_effort' : 'none' })} disabled={readOnly} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Default Model */}
      <div className="rounded-lg border border-border bg-card p-3">
        <Field label="默认模型 (Default Model)" hint="config.toml 顶层 model 字段；当请求未指定模型时使用此值。">
          <div className="flex items-center gap-2">
            <Input value={codexModel} onChange={(e) => onCodexModelChange?.(e.target.value)} placeholder="例如 gpt-5.1" className="font-mono text-sm flex-1" disabled={readOnly} />
            {codexModel.trim() && !rows.some((r) => r.model.trim() === codexModel.trim()) && onCatalogModelsChange && (
              <Button size="sm" variant="ghost" onClick={() => { onCatalogModelsChange?.([...catalogModels, { model: codexModel.trim(), displayName: codexModel.trim() }]) }} disabled={readOnly}>
                + 加入映射
              </Button>
            )}
          </div>
        </Field>
      </div>
      <CatalogCard rows={rows} fetchedModels={fetchedModels} fetching={fetching} fetchError={fetchError} readOnly={readOnly} onFetch={fetchCatalog} onAdd={() => setRows((current) => [...current, makeRow()])} onUpdate={updateRow} onRemove={(index) => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} />
      <Field label="Custom User-Agent">
        <Input value={customUserAgent ?? values.customUserAgent} onChange={(event) => { onCustomUserAgentChange?.(event.target.value); if (!onCustomUserAgentChange) set({ customUserAgent: event.target.value }) }} placeholder="留空使用 Codex 默认 User-Agent" className="font-mono text-sm" disabled={readOnly} />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="代理请求 Headers (JSON)">
          <Textarea value={localProxyHeadersOverride} onChange={(event) => onLocalProxyHeadersOverrideChange?.(event.target.value)} rows={5} className="font-mono text-sm" placeholder='{"X-Custom-Header":"value"}' disabled={readOnly || !onLocalProxyHeadersOverrideChange} />
        </Field>
        <Field label="代理请求 Body (JSON)">
          <Textarea value={localProxyBodyOverride} onChange={(event) => onLocalProxyBodyOverrideChange?.(event.target.value)} rows={5} className="font-mono text-sm" placeholder='{"temperature":0.7}' disabled={readOnly || !onLocalProxyBodyOverrideChange} />
        </Field>
      </div>
    </>}

    <Field label="auth.json (JSON) *">
      <Textarea value={authJson} onChange={(event) => updateAuthJson(event.target.value)} rows={4} className="font-mono text-sm" disabled={readOnly} />
      <p className="mt-1 text-xs text-muted-foreground">Codex auth.json 配置内容</p>
    </Field>
    <Field label="config.toml (TOML)">
      <Textarea value={codexConfig} onChange={(event) => onCodexConfigChange?.(event.target.value)} rows={14} className="font-mono text-sm" disabled={readOnly} />
      <p className="mt-1 text-xs text-muted-foreground">Codex config.toml 配置内容</p>
    </Field>
    <AdvancedCard
      icon={<FlaskIcon />}
      title="模型测试配置"
      enabled={testOpen}
      onEnabledChange={(enabled) => {
        setTestOpen(enabled)
        set({ testConfigEnabled: enabled, ...(enabled ? {} : { testTimeout: '', testDegradedThreshold: '', testMaxRetries: '' }) })
      }}
    >
      <p className="text-sm text-muted-foreground">为此供应商配置单独的模型测试参数，不启用时使用全局配置。</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="测试模型">
          <Input value={model} onChange={(event) => onModelChange?.(event.target.value)} placeholder="留空使用全局配置" disabled={!testOpen || readOnly} />
        </Field>
        <Field label="超时时间（秒）">
          <Input type="number" value={values.testTimeout} onChange={(event) => set({ testTimeout: event.target.value })} placeholder="45" disabled={!testOpen || readOnly} />
        </Field>
        <Field label="降级阈值（毫秒）">
          <Input type="number" value={values.testDegradedThreshold} onChange={(event) => set({ testDegradedThreshold: event.target.value })} placeholder="6000" disabled={!testOpen || readOnly} />
        </Field>
        <Field label="最大重试次数">
          <Input type="number" value={values.testMaxRetries} onChange={(event) => set({ testMaxRetries: event.target.value })} placeholder="2" disabled={!testOpen || readOnly} />
        </Field>
      </div>
    </AdvancedCard>
    {mode === 'profile' && <p className="text-xs text-muted-foreground">Profile 模式保存到当前 Codex 配置文件。</p>}
  </div>
}

// ── CatalogCard + CatalogRowView (Codex-specific) ──────────────────────

function CatalogCard({ rows, fetchedModels, fetching, fetchError, readOnly, onFetch, onAdd, onUpdate, onRemove }: {
  rows: CatalogRow[]
  fetchedModels: FetchedModel[]
  fetching: boolean
  fetchError: string | null
  readOnly?: boolean
  onFetch: () => void
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<CodexCatalogModel>) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-medium">模型映射</h4>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">生成 Codex model_catalog.json，让 /model 命令显示这些第三方模型名；表中条目按填写内容原样保存。修改后需要重启 Codex 才能刷新模型列表。</p>
        </div>
        <ModelFetchActions fetching={fetching} onFetch={onFetch} onAdd={onAdd} fetchDisabled={readOnly} addDisabled={readOnly} />
      </div>
      {fetchError && <p className="mt-2 text-xs text-red-500">{fetchError}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">暂无模型，点击「获取模型列表」或「添加模型」。</p>
      ) : (
        <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
          {rows.map((row, index) => (
            <CatalogRowView
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

function CatalogRowView({ index, row, fetchedModels, readOnly, onUpdate, onRemove }: {
  index: number
  row: CatalogRow
  fetchedModels: FetchedModel[]
  readOnly?: boolean
  onUpdate: (index: number, patch: Partial<CodexCatalogModel>) => void
  onRemove: (index: number) => void
}) {
  const [contextOpen, setContextOpen] = useState(false)
  const isFirst = index === 0
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-medium ${isFirst ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
          {isFirst ? '默认模型' : '备选模型'}
        </span>
        <ModelIdInput value={row.model} models={fetchedModels} onChange={(value) => onUpdate(index, { model: value, displayName: row.displayName.trim() ? row.displayName : value })} disabled={readOnly} placeholder="实际请求模型 ID" />
        <Input value={row.displayName ?? ''} onChange={(event) => onUpdate(index, { displayName: event.target.value })} placeholder="显示名称（可选）" className="text-sm" disabled={readOnly} />
        <button type="button" onClick={() => setContextOpen((open) => !open)} className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:text-foreground" title={contextOpen ? '收起高级' : '展开高级'} disabled={readOnly}>
          <ChevronIcon open={contextOpen} /><span>高级选项</span>
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
          title="删除模型"
          disabled={readOnly}
        >
          <TrashIcon />
        </button>
      </div>
      {contextOpen && (
        <div className="mt-3 max-w-md border-t border-border pt-3">
          <Field label="上下文长度（tokens）">
            <Input type="number" min="1" value={row.contextWindow ?? ''} onChange={(event) => onUpdate(index, { contextWindow: event.target.value ? Number(event.target.value) : undefined })} placeholder="例如 200000" className="font-mono text-sm" disabled={readOnly} />
            <p className="mt-1 text-[11px] text-muted-foreground">覆盖自动推断的上下文窗口；留空使用模型默认值。</p>
          </Field>
        </div>
      )}
    </div>
  )
}
