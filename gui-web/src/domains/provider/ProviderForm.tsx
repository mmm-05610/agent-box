/**
 * ProviderForm — shared provider editing frame (Stage 4).
 *
 * One frame for all four agent types:
 *   - validate   : shared soft warnings (getSoftWarnings) — non-blocking
 *   - identity   : ProviderIdentityFields (name / notes / website URL)
 *   - per-agent  : <Fields> mounted from FIELD_REGISTRY[agentType] — each
 *                  agent's fields component owns its endpoint + agent-specific
 *                  inputs (Claude env mapping, Codex TOML/catalog, Hermes
 *                  models, OpenCode options)
 *   - save       : FormActions row (Save / Cancel), save handed back to the
 *                  caller via onSave (the caller owns the serialization —
 *                  perAgentSettings / writeProviderEditorDraft)
 *
 * The frame keeps the controlled `values`/`onChange` interface the rest of
 * the provider layer already uses, so behavior is preserved exactly. The zod
 * schemas in ./schema.ts mirror the same shapes for structural validation.
 */
import { useMemo, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import type { AgentType } from '@/api'
import { getSoftWarnings } from '@/components/provider/ProviderFormFields'
import { ProviderIdentityFields } from '@/components/provider/forms/shared'
import { DEFAULT_PROVIDER_FIELDS, FIELD_REGISTRY, type ProviderFieldsProps } from './fields'

// Per-agent name placeholder keys — matches what each old form passed to the
// shared identity fields.
const NAME_PLACEHOLDER_KEYS: Record<string, string> = {
  claude: 'providerForm.namePlaceholder.claude',
  codex: 'providerForm.namePlaceholder.codex',
  hermes: 'providerForm.namePlaceholder.hermes',
  opencode: 'providerForm.namePlaceholder.opencode',
}

export interface ProviderFormProps extends ProviderFieldsProps {
  agentType: AgentType
  saving?: boolean
  saveLabel?: string
  /** Persist the current draft. The caller owns serialization, so the frame
   *  just hands the submit event back. */
  onSave?: () => void
  onCancel?: () => void
  namePlaceholder?: string
}

export function ProviderForm({
  agentType,
  values,
  onChange,
  readOnly,
  mode = 'library',
  category,
  endpointCandidates,
  presetApiKeyUrl,
  saving = false,
  saveLabel,
  onSave,
  onCancel,
  namePlaceholder,
  ...fieldProps
}: ProviderFormProps) {
  const { t } = useTranslation()
  const Fields = FIELD_REGISTRY[agentType] ?? DEFAULT_PROVIDER_FIELDS

  const warnings = useMemo(() => getSoftWarnings(values), [values])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSave?.()
  }

  const identityOnChange = (patch: Partial<{ name: string; notes: string; websiteUrl: string }>) =>
    onChange({ ...values, ...patch })

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-agent-type={agentType}>
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <ProviderIdentityFields
        name={values.name}
        notes={values.notes}
        websiteUrl={values.websiteUrl}
        onChange={identityOnChange}
        readOnly={readOnly}
        apiKeyUrl={presetApiKeyUrl}
        namePlaceholder={namePlaceholder ?? t(NAME_PLACEHOLDER_KEYS[agentType] ?? 'providerForm.namePlaceholder.claude')}
      />

      <Fields
        values={values}
        onChange={onChange}
        readOnly={readOnly}
        mode={mode}
        category={category}
        endpointCandidates={endpointCandidates}
        presetApiKeyUrl={presetApiKeyUrl}
        {...fieldProps}
      />

      <div className="flex items-center gap-2 pt-1">
        {onSave && (
          <Button type="submit" disabled={saving || readOnly} className="flex-1">
            {saving ? t('common.saving') : (saveLabel ?? t('providerForm.saveSettings'))}
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}
