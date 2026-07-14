/**
 * HermesProviderForm — agent-type specific form for Hermes providers.
 *
 * Hermes stores its config at the top level of settings_config:
 *   { base_url, api_key, ... }
 *
 * Fields (top to bottom):
 *   Basic:  Name, Notes, Website URL
 *   Auth:   API Key
 *   Endpoint: Base URL
 */

import { Input } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'

export interface HermesProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
}

export function HermesProviderForm({ values, onChange, readOnly }: HermesProviderFormProps) {
  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  return (
    <div className="space-y-4">
      {/* ── Basic ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Name</label>
          <Input
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Provider name"
            className="text-sm"
            disabled={readOnly}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Notes</label>
          <Input
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Optional notes"
            className="text-sm"
            disabled={readOnly}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Website URL</label>
        <Input
          value={values.websiteUrl}
          onChange={(e) => set({ websiteUrl: e.target.value })}
          placeholder="https://..."
          className="text-sm font-mono"
          disabled={readOnly}
        />
      </div>

      {/* ── Auth ───────────────────────────────────────────────────── */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">API Key (api_key)</label>
        <Input
          value={values.authValue}
          onChange={(e) => set({ authValue: e.target.value })}
          placeholder="your-api-key"
          className="text-sm font-mono"
          type="password"
          disabled={readOnly}
        />
      </div>

      {/* ── Endpoint ────────────────────────────────────────────────── */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Base URL (base_url)</label>
        <Input
          value={values.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder="https://api.hermes.example.com"
          className="text-sm font-mono"
          disabled={readOnly}
        />
      </div>
    </div>
  )
}
