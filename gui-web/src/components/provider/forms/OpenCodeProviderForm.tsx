/**
 * OpenCodeProviderForm — agent-type specific form for OpenCode providers.
 *
 * OpenCode stores its config under `options`:
 *   { options: { baseURL, apiKey, ... }, npm, models }
 *
 * Fields (top to bottom):
 *   Basic:  Name, Notes, Website URL
 *   Auth:   API Key (options.apiKey)
 *   Endpoint: Base URL (options.baseURL)
 *   Advanced: Models JSON (options.models — full JSON object, freeform)
 */

import { Input, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'

export interface OpenCodeProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  /** Raw options.models JSON — separate from the unified form values
   *  since the form only lifts baseURL + apiKey out of options. */
  modelsJson: string
  onModelsJsonChange: (next: string) => void
}

export function OpenCodeProviderForm({
  values,
  onChange,
  readOnly,
  modelsJson,
  onModelsJsonChange,
}: OpenCodeProviderFormProps) {
  const set = (patch: Partial<ProviderFormValues>) => onChange({ ...values, ...patch })

  let modelsError: string | null = null
  if (modelsJson.trim().length > 0) {
    try {
      JSON.parse(modelsJson)
    } catch {
      modelsError = 'Invalid JSON'
    }
  }

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
        <label className="text-xs text-muted-foreground block mb-1">API Key (options.apiKey)</label>
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
        <label className="text-xs text-muted-foreground block mb-1">Base URL (options.baseURL)</label>
        <Input
          value={values.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder="https://api.opencode.example.com"
          className="text-sm font-mono"
          disabled={readOnly}
        />
      </div>

      {/* ── Models JSON (advanced) ─────────────────────────────────── */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Models (options.models — JSON)
        </label>
        <Textarea
          value={modelsJson}
          onChange={(e) => onModelsJsonChange(e.target.value)}
          rows={8}
          placeholder={'{\n  "claude-opus": { "name": "Opus" }\n}'}
          className="font-mono text-xs"
          disabled={readOnly}
        />
        {modelsError && (
          <p className="mt-1 text-[10px] text-destructive">⚠ {modelsError}</p>
        )}
      </div>
    </div>
  )
}
