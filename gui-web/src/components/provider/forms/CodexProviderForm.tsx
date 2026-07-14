/**
 * CodexProviderForm — agent-type specific form for Codex providers.
 *
 * Fields (top to bottom):
 *   Basic:  Name, Notes, Website URL
 *   Auth:   API Key (auth.OPENAI_API_KEY)
 *   Endpoint: Base URL (lifted from active [model_providers.<X>] TOML block)
 *   Config:  full TOML textarea (so users can edit the rest of the config)
 *
 * The baseUrl field stays in sync with the active model_providers block in
 * the TOML (via perAgentSettings.patchCodexBaseUrl at save time). Saving
 * with both fields unchanged round-trips the existing TOML; the user can
 * freely edit additional keys in the textarea.
 */

import { Input, Textarea } from '@/components/ui'
import type { ProviderFormValues } from '../ProviderFormFields'

export interface CodexProviderFormProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  /** Raw Codex config.toml body — separate from the unified form values
   *  since the form only lifts base_url out of it. */
  codexConfig: string
  onCodexConfigChange: (next: string) => void
}

export function CodexProviderForm({
  values,
  onChange,
  readOnly,
  codexConfig,
  onCodexConfigChange,
}: CodexProviderFormProps) {
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
        <label className="text-xs text-muted-foreground block mb-1">API Key (auth.OPENAI_API_KEY)</label>
        <Input
          value={values.authValue}
          onChange={(e) => set({ authValue: e.target.value })}
          placeholder="sk-..."
          className="text-sm font-mono"
          type="password"
          disabled={readOnly}
        />
      </div>

      {/* ── Endpoint (lifted from active model_providers block) ────── */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Base URL (active <code className="font-mono">[model_providers.&lt;X&gt;]</code>)
        </label>
        <Input
          value={values.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder="https://api.openai.com/v1"
          className="text-sm font-mono"
          disabled={readOnly}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Editing this updates the <code className="font-mono">base_url</code> in the TOML below. Other TOML keys are preserved.
        </p>
      </div>

      {/* ── Full Config TOML ───────────────────────────────────────── */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Config (TOML)</label>
        <Textarea
          value={codexConfig}
          onChange={(e) => onCodexConfigChange(e.target.value)}
          rows={10}
          placeholder={'model_provider = "custom"\n\n[model_providers.custom]\nbase_url = "..."\n'}
          className="font-mono text-xs"
          disabled={readOnly}
        />
      </div>
    </div>
  )
}
