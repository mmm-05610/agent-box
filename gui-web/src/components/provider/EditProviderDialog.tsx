/**
 * EditProviderDialog — modal for editing an existing provider.
 *
 * On open, fetches the provider's current settings_config and seeds the
 * form. On save, merges form values back via settingsFromFormValues so
 * fields the form doesn't expose (codex TOML block, opencode models map,
 * etc.) are preserved.
 *
 * Backdrop click and ESC are intentionally non-dismissing (see AddProviderDialog).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, ConfirmDialog } from '@/components/ui'
import { fetchProviderDetail, saveProvider, type AgentType } from '@/api'
import {
  defaultFormValues,
  type ProviderFormValues,
} from './ProviderFormFields'
import { readProviderEditorDraft, writeProviderEditorDraft } from './serialization'
import { ClaudeProviderForm } from './forms/ClaudeProviderForm'
import { CodexProviderForm, readCodexCatalogModels, type CodexCatalogModel, type CodexChatReasoning } from './forms/CodexProviderForm'
import { HermesProviderForm, readHermesModels, type HermesApiMode, type HermesModel } from './forms/HermesProviderForm'
import { OpenCodeProviderForm, type OpenCodeNpmPackage } from './forms/OpenCodeProviderForm'
import { useAgentProviderDraft } from './forms/hooks/useAgentProviderDraft'
import { ProviderAdvancedConfig, CommonConfigEditor } from './forms/shared'

export interface EditProviderDialogProps {
  open: boolean
  onClose: () => void
  agentType: AgentType
  providerId: string
  onSaved: () => void
  toast: (msg: { type: 'success' | 'error' | 'warning'; message: string }) => void
}

export function EditProviderDialog({
  open,
  onClose,
  agentType,
  providerId,
  onSaved,
  toast,
}: EditProviderDialogProps) {
  const [formValues, setFormValues] = useState<ProviderFormValues>(defaultFormValues())
  const {
    codexConfig, setCodexConfig,
    codexCatalogModels, setCodexCatalogModels,
    codexReasoning, setCodexReasoning,
    codexProxyHeaders, setCodexProxyHeaders,
    codexProxyBody, setCodexProxyBody,
    claudeProxyHeaders, setClaudeProxyHeaders,
    claudeProxyBody, setClaudeProxyBody,
    claudeSettingsJson, setClaudeSettingsJson,
    modelsJson, setModelsJson,
    hermesApiMode, setHermesApiMode,
    hermesModels, setHermesModels,
    hermesRateLimit, setHermesRateLimit,
    opencodeExtraOptions, setOpencodeExtraOptions,
    opencodeNpm, setOpencodeNpm,
    resetAgentDraft,
  } = useAgentProviderDraft()
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [originalSettings, setOriginalSettings] = useState<Record<string, unknown>>({})
  const [providerName, setProviderName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [softIssues, setSoftIssues] = useState<string[] | null>(null)

  // Load on open; reset on close
  useEffect(() => {
    if (!open) {
      setFormValues(defaultFormValues())
      resetAgentDraft()
      setOriginalSettings({})
      setProviderName('')
      setError(null)
      setSoftIssues(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchProviderDetail(agentType, providerId)
      .then((detail) => {
        if (cancelled) return
        const settings = (detail?.settings ?? {}) as Record<string, unknown>
        const draft = readProviderEditorDraft(agentType, settings)
        setOriginalSettings(settings)
        setFormValues(draft.values)
        setProviderName((detail?.name as string | undefined) ?? providerId)
        setCategory(detail?.category)
        setCodexConfig(draft.codex.config)
        setCodexCatalogModels(draft.codex.catalogModels)
        setCodexReasoning(draft.codex.reasoning)
        setCodexProxyHeaders(draft.codex.proxyHeaders)
        setCodexProxyBody(draft.codex.proxyBody)
        setModelsJson(draft.opencode.modelsJson)
        setOpencodeExtraOptions(draft.opencode.extraOptions)
        setOpencodeNpm(draft.opencode.npm)
        setHermesApiMode(draft.hermes.apiMode)
        setHermesModels(draft.hermes.models)
        setHermesRateLimit(draft.hermes.rateLimitDelay)
        setClaudeProxyHeaders(draft.claude.proxyHeaders)
        setClaudeProxyBody(draft.claude.proxyBody)
        setClaudeSettingsJson(draft.claude.settingsJson)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load provider')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, agentType, providerId, resetAgentDraft])

  if (!open) return null

  const handleSave = async () => {
    // Hard errors — block save
    if (!formValues.name.trim()) {
      setError('Provider name is required')
      return
    }

    // Soft warnings — user can choose to save anyway
    const issues: string[] = []
    if (!formValues.baseUrl.trim() && !formValues.authValue.trim()) {
      issues.push('No endpoint or API key configured — provider may not work')
    } else if (!formValues.baseUrl.trim()) {
      issues.push('API endpoint is empty — provider may not work')
    } else if (!formValues.authValue.trim()) {
      issues.push('API key / auth token is empty — provider may not work')
    }

    if (issues.length > 0) {
      setSoftIssues(issues)
      return
    }

    await performSave()
  }

  const performSave = async () => {
    setSaving(true)
    setError(null)
    setSoftIssues(null)
    try {
      const settings = writeProviderEditorDraft(agentType, originalSettings, {
        values: formValues,
        claude: { proxyHeaders: claudeProxyHeaders, proxyBody: claudeProxyBody, settingsJson: claudeSettingsJson },
        codex: { config: codexConfig, catalogModels: codexCatalogModels, reasoning: codexReasoning, proxyHeaders: codexProxyHeaders, proxyBody: codexProxyBody },
        hermes: { apiMode: hermesApiMode, models: hermesModels, rateLimitDelay: hermesRateLimit },
        opencode: { npm: opencodeNpm, modelsJson, extraOptions: opencodeExtraOptions },
      })
      settings.name = formValues.name
      await saveProvider(agentType, providerId, JSON.stringify(settings))
      toast({ type: 'success', message: 'Provider saved' })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Provider"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-[680px] max-h-[90vh] flex flex-col rounded-xl bg-card shadow-xl">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground truncate">
            Edit {providerName || providerId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : (
            <AgentTypeForm
              agentType={agentType}
              category={category}
              values={formValues}
              onChange={setFormValues}
              codexConfig={codexConfig}
              onCodexConfigChange={setCodexConfig}
              catalogModels={codexCatalogModels}
              onCatalogModelsChange={setCodexCatalogModels}
              codexReasoning={codexReasoning}
              onCodexReasoningChange={setCodexReasoning}
              codexProxyHeaders={codexProxyHeaders}
              onCodexProxyHeadersChange={setCodexProxyHeaders}
              codexProxyBody={codexProxyBody}
              onCodexProxyBodyChange={setCodexProxyBody}
              claudeProxyHeaders={claudeProxyHeaders}
              onClaudeProxyHeadersChange={setClaudeProxyHeaders}
              claudeProxyBody={claudeProxyBody}
              onClaudeProxyBodyChange={setClaudeProxyBody}
              claudeSettingsJson={claudeSettingsJson}
              onClaudeSettingsJsonChange={setClaudeSettingsJson}
              modelsJson={modelsJson}
              onModelsJsonChange={setModelsJson}
              hermesApiMode={hermesApiMode}
              onHermesApiModeChange={setHermesApiMode}
              hermesModels={hermesModels}
              onHermesModelsChange={setHermesModels}
              hermesRateLimit={hermesRateLimit}
              onHermesRateLimitChange={setHermesRateLimit}
              opencodeExtraOptions={opencodeExtraOptions}
              onOpencodeExtraOptionsChange={setOpencodeExtraOptions}
              opencodeNpm={opencodeNpm}
              onOpencodeNpmChange={setOpencodeNpm}
            />
          )}
        </div>

        {/* ── Provider-wide advanced (Test + Billing + Common Config) ─── */}
        {!loading && (
          <div className="border-t border-border px-5 py-3 space-y-3">
            <ProviderAdvancedConfig
              testConfigEnabled={formValues.testConfigEnabled}
              testTimeout={formValues.testTimeout}
              testDegradedThreshold={formValues.testDegradedThreshold}
              testMaxRetries={formValues.testMaxRetries}
              pricingConfigEnabled={formValues.pricingConfigEnabled}
              costMultiplier={formValues.costMultiplier}
              pricingModelSource={formValues.pricingModelSource}
              onTestConfigEnabledChange={(enabled) => setFormValues({ ...formValues, testConfigEnabled: enabled })}
              onTestTimeoutChange={(value) => setFormValues({ ...formValues, testTimeout: value })}
              onTestDegradedThresholdChange={(value) => setFormValues({ ...formValues, testDegradedThreshold: value })}
              onTestMaxRetriesChange={(value) => setFormValues({ ...formValues, testMaxRetries: value })}
              onPricingConfigEnabledChange={(enabled) => setFormValues({ ...formValues, pricingConfigEnabled: enabled })}
              onCostMultiplierChange={(value) => setFormValues({ ...formValues, costMultiplier: value })}
              onPricingModelSourceChange={(value) => setFormValues({ ...formValues, pricingModelSource: value })}
            />
            {agentType === 'claude' && (
              <CommonConfigEditor
                value={claudeSettingsJson}
                onChange={setClaudeSettingsJson}
              />
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-border px-5 py-3 space-y-2">
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleSave} disabled={loading}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={softIssues !== null && softIssues.length > 0}
        title="配置存在以下问题"
        description={
          <>
            {softIssues?.map((issue, i) => (
              <p key={i} className="text-sm">• {issue}</p>
            ))}
            <p className="text-sm text-muted-foreground mt-2">仍要保存吗？保存后切换此供应商时可能失败，可以之后再补全。</p>
          </>
        }
        confirmLabel="仍要保存"
        cancelLabel="取消"
        busy={saving}
        onConfirm={performSave}
        onCancel={() => setSoftIssues(null)}
      />
    </div>,
    document.body,
  )
}

// ── Agent-type form picker ─────────────────────────────────────────────

function AgentTypeForm(props: {
  agentType: AgentType
  category?: string
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  codexConfig: string
  onCodexConfigChange: (s: string) => void
  catalogModels: CodexCatalogModel[]
  onCatalogModelsChange: (models: CodexCatalogModel[]) => void
  codexReasoning: CodexChatReasoning
  onCodexReasoningChange: (next: CodexChatReasoning) => void
  codexProxyHeaders: string
  onCodexProxyHeadersChange: (next: string) => void
  codexProxyBody: string
  onCodexProxyBodyChange: (next: string) => void
  claudeProxyHeaders: string
  onClaudeProxyHeadersChange: (next: string) => void
  claudeProxyBody: string
  onClaudeProxyBodyChange: (next: string) => void
  claudeSettingsJson: string
  onClaudeSettingsJsonChange: (next: string) => void
  modelsJson: string
  onModelsJsonChange: (s: string) => void
  hermesApiMode?: HermesApiMode
  onHermesApiModeChange?: (mode: HermesApiMode) => void
  hermesModels?: HermesModel[]
  onHermesModelsChange?: (models: HermesModel[]) => void
  hermesRateLimit?: number
  onHermesRateLimitChange?: (delay: number | undefined) => void
  opencodeExtraOptions?: Record<string, unknown>
  onOpencodeExtraOptionsChange?: (next: Record<string, unknown>) => void
  opencodeNpm: OpenCodeNpmPackage
  onOpencodeNpmChange: (next: OpenCodeNpmPackage) => void
}): ReactNode {
  switch (props.agentType) {
    case 'claude':
      return (
        <ClaudeProviderForm
          values={props.values}
          onChange={props.onChange}
          presetApiKeyUrl={props.values.websiteUrl || undefined}
          category={props.category}
          localProxyHeadersOverride={props.claudeProxyHeaders}
          onLocalProxyHeadersOverrideChange={props.onClaudeProxyHeadersChange}
          localProxyBodyOverride={props.claudeProxyBody}
          onLocalProxyBodyOverrideChange={props.onClaudeProxyBodyChange}
        />
      )
    case 'codex':
      return (
        <CodexProviderForm
          values={props.values}
          onChange={props.onChange}
          codexConfig={props.codexConfig}
          onCodexConfigChange={props.onCodexConfigChange}
          catalogModels={props.catalogModels}
          onCatalogModelsChange={props.onCatalogModelsChange}
          codexChatReasoning={props.codexReasoning}
          onCodexChatReasoningChange={props.onCodexReasoningChange}
          localProxyHeadersOverride={props.codexProxyHeaders}
          onLocalProxyHeadersOverrideChange={props.onCodexProxyHeadersChange}
          localProxyBodyOverride={props.codexProxyBody}
          onLocalProxyBodyOverrideChange={props.onCodexProxyBodyChange}
        />
      )
    case 'hermes':
      return (
        <HermesProviderForm
          values={props.values}
          onChange={props.onChange}
          apiMode={props.hermesApiMode}
          onApiModeChange={props.onHermesApiModeChange}
          models={props.hermesModels}
          onModelsChange={props.onHermesModelsChange}
          rateLimitDelay={props.hermesRateLimit}
          onRateLimitDelayChange={props.onHermesRateLimitChange}
        />
      )
    case 'opencode':
      return (
        <OpenCodeProviderForm
          values={props.values}
          onChange={props.onChange}
          modelsJson={props.modelsJson}
          onModelsJsonChange={props.onModelsJsonChange}
          extraOptions={props.opencodeExtraOptions}
          onExtraOptionsChange={props.onOpencodeExtraOptionsChange}
          npm={props.opencodeNpm}
          onNpmChange={props.onOpencodeNpmChange}
        />
      )
  }
}
