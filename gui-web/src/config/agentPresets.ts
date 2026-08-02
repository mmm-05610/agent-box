/**
 * Per-agent provider default values.
 *
 * Extracted from the current provider form layer:
 *   - claude   → ProviderFormFields.defaultFormValues() env keys
 *                (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL)
 *   - codex    → defaultCodexToml() + codex config.toml template
 *                (model_provider = "custom", [model_providers.custom] wire_api = "responses")
 *   - hermes   → useAgentProviderDraft / readProviderEditorDraft
 *                (apiMode 'openai_compatible', empty models)
 *   - opencode → readProviderEditorDraft (empty options / models)
 *
 * Used to seed default values when opening a new provider form.
 */
export const PROVIDER_PRESETS = {
  claude: {
    env: {
      ANTHROPIC_BASE_URL: '',
      ANTHROPIC_AUTH_TOKEN: '',
      ANTHROPIC_MODEL: '',
    },
  },
  codex: {
    modelProviders: { custom: { wireApi: 'responses' } },
    modelProvider: 'custom',
  },
  hermes: {
    apiMode: 'openai_compatible',
    models: [],
  },
  opencode: {
    options: {},
    models: {},
  },
}
