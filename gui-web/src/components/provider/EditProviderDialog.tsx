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
import { getInitialFormValues, settingsFromFormValues } from './perAgentSettings'
import { ClaudeProviderForm } from './forms/ClaudeProviderForm'
import { CodexProviderForm } from './forms/CodexProviderForm'
import { HermesProviderForm } from './forms/HermesProviderForm'
import { OpenCodeProviderForm } from './forms/OpenCodeProviderForm'

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
  const [codexConfig, setCodexConfig] = useState('')
  const [modelsJson, setModelsJson] = useState('')
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
      setCodexConfig('')
      setModelsJson('')
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
        setOriginalSettings(settings)
        setFormValues(getInitialFormValues(agentType, settings))
        setProviderName((detail?.name as string | undefined) ?? providerId)
        // Codex: keep raw TOML for the textarea
        if (agentType === 'codex') {
          setCodexConfig((settings?.config as string | undefined) ?? '')
        }
        // OpenCode / MiMoCode: keep raw models JSON
        if (agentType === 'opencode' || agentType === 'mimocode') {
          const models = settings?.models
          if (models !== undefined) {
            setModelsJson(JSON.stringify(models, null, 2))
          }
        }
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
  }, [open, agentType, providerId])

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
      const settings = settingsFromFormValues(agentType, originalSettings, formValues)
      if (agentType === 'codex') {
        settings.config = codexConfig
      }
      if ((agentType === 'opencode' || agentType === 'mimocode') && modelsJson.trim().length > 0) {
        try {
          settings.models = JSON.parse(modelsJson) as Record<string, unknown>
        } catch {
          setError('Models JSON is invalid')
          setSaving(false)
          return
        }
      }
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
              values={formValues}
              onChange={setFormValues}
              codexConfig={codexConfig}
              onCodexConfigChange={setCodexConfig}
              modelsJson={modelsJson}
              onModelsJsonChange={setModelsJson}
            />
          )}
        </div>

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
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  codexConfig: string
  onCodexConfigChange: (s: string) => void
  modelsJson: string
  onModelsJsonChange: (s: string) => void
}): ReactNode {
  switch (props.agentType) {
    case 'claude':
      return <ClaudeProviderForm values={props.values} onChange={props.onChange} presetApiKeyUrl={props.values.websiteUrl || undefined} />
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
      return <HermesProviderForm values={props.values} onChange={props.onChange} />
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
