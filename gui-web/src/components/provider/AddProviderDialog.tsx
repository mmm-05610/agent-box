/**
 * AddProviderDialog — modal for creating a new provider.
 *
 * Renders portal'd to document.body. Backdrop click and ESC are intentionally
 * non-dismissing so a half-filled form is never lost by accident.
 *
 * Layout (top → bottom):
 *   Header:  "Add Provider" + close X
 *   Body:    Provider ID input
 *            ProviderPresetSelector
 *            <AgentTypeForm agentType={agentType} ... />
 *   Footer:  Cancel + Add
 *
 * Submit: settingsFromFormValues → saveProvider → toast → onCreated → onClose
 */

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, ConfirmDialog, Input } from '@/components/ui'
import {
  fetchPresets,
  saveProvider,
  type AgentType,
  type ProviderPreset,
} from '@/api'
import {
  defaultFormValues,
  type ProviderFormValues,
} from './ProviderFormFields'
import { settingsFromFormValues } from './perAgentSettings'
import { ProviderPresetSelector } from './ProviderPresetSelector'
import { ClaudeProviderForm } from './forms/ClaudeProviderForm'
import { CodexProviderForm } from './forms/CodexProviderForm'
import { HermesProviderForm } from './forms/HermesProviderForm'
import { OpenCodeProviderForm } from './forms/OpenCodeProviderForm'

export interface AddProviderDialogProps {
  open: boolean
  onClose: () => void
  agentType: AgentType
  onCreated: () => void
  toast: (msg: { type: 'success' | 'error' | 'warning'; message: string }) => void
}

export function AddProviderDialog({
  open,
  onClose,
  agentType,
  onCreated,
  toast,
}: AddProviderDialogProps) {
  const [providerId, setProviderId] = useState('')
  const [presetId, setPresetId] = useState<string | null>(null)
  const [presetApiKeyUrl, setPresetApiKeyUrl] = useState<string | undefined>(undefined)
  const [endpointCandidates, setEndpointCandidates] = useState<string[]>([])
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [formValues, setFormValues] = useState<ProviderFormValues>(defaultFormValues())
  const [codexConfig, setCodexConfig] = useState('')
  const [modelsJson, setModelsJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [softIssues, setSoftIssues] = useState<string[] | null>(null)

  // Load presets when dialog opens
  useEffect(() => {
    if (!open) return
    fetchPresets(agentType).then(setPresets).catch(() => setPresets([]))
  }, [open, agentType])

  // Reset all state when the dialog closes
  useEffect(() => {
    if (open) return
    setProviderId('')
    setPresetId(null)
    setPresetApiKeyUrl(undefined)
    setEndpointCandidates([])
    setFormValues(defaultFormValues())
    setCodexConfig('')
    setModelsJson('')
    setSaving(false)
    setError(null)
    setSoftIssues(null)
  }, [open])

  if (!open) return null

  const handlePresetSelect = (id: string, preset: ProviderPreset | null) => {
    setPresetId(id)
    if (preset) {
      setFormValues(
        defaultFormValues(preset.env, undefined, undefined, {
          name: preset.name,
          websiteUrl: preset.url,
          apiFormat: preset.apiFormat,
        }),
      )
      setProviderId(preset.id)
      setPresetApiKeyUrl(preset.apiKeyUrl || (preset.cat !== 'official' ? preset.url : undefined))
      setEndpointCandidates(preset.endpointCandidates ?? [])
    } else {
      setFormValues(defaultFormValues())
      setProviderId('')
      setPresetApiKeyUrl(undefined)
      setEndpointCandidates([])
    }
  }

  const handleSubmit = async () => {
    const id = providerId.trim()
    if (!id) {
      setError('Provider ID is required')
      return
    }
    if (!formValues.name.trim()) {
      setError('Provider name is required')
      return
    }

    // Soft warnings
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

    await performSubmit()
  }

  const performSubmit = async () => {
    const id = providerId.trim()
    setSaving(true)
    setError(null)
    setSoftIssues(null)
    try {
      const settings = settingsFromFormValues(agentType, {}, formValues)
      if (agentType === 'codex') {
        if (codexConfig.trim().length > 0) {
          settings.config = codexConfig
        }
      }
      if ((agentType === 'opencode' || agentType === 'mimocode') && modelsJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(modelsJson) as Record<string, unknown>
          settings.models = parsed
        } catch {
          setError('Models JSON is invalid')
          setSaving(false)
          return
        }
      }
      settings.name = formValues.name || id
      await saveProvider(agentType, id, JSON.stringify(settings))
      toast({ type: 'success', message: 'Provider added' })
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Provider"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      // Intentionally NOT closing on backdrop click — see file header.
    >
      <div className="w-full max-w-[680px] max-h-[90vh] flex flex-col rounded-xl bg-card shadow-xl">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Provider</h2>
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

        {/* ── Body (scrollable) ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Provider ID</label>
            <Input
              placeholder="e.g. my-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="text-sm font-mono"
            />
          </div>

          <ProviderPresetSelector
            presets={presets}
            selectedId={presetId}
            onSelect={handlePresetSelect}
          />

          <AgentTypeForm
            agentType={agentType}
            values={formValues}
            onChange={setFormValues}
            codexConfig={codexConfig}
            onCodexConfigChange={setCodexConfig}
            modelsJson={modelsJson}
            onModelsJsonChange={setModelsJson}
            presetApiKeyUrl={presetApiKeyUrl}
            endpointCandidates={endpointCandidates}
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-border px-5 py-3 space-y-2">
          {error && <p className="text-xs text-destructive">⚠ {error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={handleSubmit}>
              Add
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
        onConfirm={performSubmit}
        onCancel={() => setSoftIssues(null)}
      />
    </div>,
    document.body,
  )
}

// ── Agent-type form picker ─────────────────────────────────────────────

function AgentTypeForm(props: {
  agentType: AgentType
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  codexConfig: string
  onCodexConfigChange: (s: string) => void
  modelsJson: string
  onModelsJsonChange: (s: string) => void
  presetApiKeyUrl?: string
  endpointCandidates?: string[]
}): ReactNode {
  switch (props.agentType) {
    case 'claude':
      return (
        <ClaudeProviderForm
          values={props.values}
          onChange={props.onChange}
          presetApiKeyUrl={props.presetApiKeyUrl}
          endpointCandidates={props.endpointCandidates}
        />
      )
    case 'codex':
      return (
        <CodexProviderForm
          values={props.values}
          onChange={props.onChange}
          codexConfig={props.codexConfig}
          onCodexConfigChange={props.onCodexConfigChange}
        />
      )
    case 'hermes':
      return (
        <HermesProviderForm
          values={props.values}
          onChange={props.onChange}
        />
      )
    case 'opencode':
    case 'mimocode':
      return (
        <OpenCodeProviderForm
          values={props.values}
          onChange={props.onChange}
          modelsJson={props.modelsJson}
          onModelsJsonChange={props.onModelsJsonChange}
        />
      )
  }
}
