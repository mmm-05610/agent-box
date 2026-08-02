/**
 * Per-agent field props — the union of everything the 4 provider forms used
 * to accept. Each fields component reads only the slice it needs; the shared
 * ProviderForm frame passes the whole bag through untouched.
 *
 * Agent-specific state that is NOT part of ProviderFormValues (Codex TOML,
 * Hermes models, OpenCode options, …) travels through these props exactly
 * like it did in the old per-agent forms.
 */
import type { ProviderFormValues } from '@/components/provider/ProviderFormFields'
import type {
  CodexApiFormat,
  CodexCatalogModel,
  CodexChatReasoning,
  ClaudeApiKeyField,
  PromptCacheRoutingMode,
} from './CodexFields'
import type { HermesApiMode, HermesModel } from './HermesFields'
import type { OpenCodeModels, OpenCodeNpmPackage } from './OpenCodeFields'

export interface ProviderFieldsProps {
  values: ProviderFormValues
  onChange: (next: ProviderFormValues) => void
  readOnly?: boolean
  mode?: 'library' | 'profile'
  /** Provider category — controls Advanced/API Format visibility. */
  category?: string
  endpointCandidates?: string[]
  /** Claude: link shown next to the API-key section. */
  presetApiKeyUrl?: string

  // ── Claude + Codex: local proxy request overrides ─────────────────
  localProxyHeadersOverride?: string
  onLocalProxyHeadersOverrideChange?: (next: string) => void
  localProxyBodyOverride?: string
  onLocalProxyBodyOverrideChange?: (next: string) => void

  // ── Codex ─────────────────────────────────────────────────────────
  codexConfig?: string
  onCodexConfigChange?: (next: string) => void
  /** Test-model field inside the 模型测试配置 card. */
  model?: string
  onModelChange?: (next: string) => void
  apiFormat?: CodexApiFormat
  onApiFormatChange?: (next: CodexApiFormat) => void
  codexChatReasoning?: CodexChatReasoning
  onCodexChatReasoningChange?: (next: CodexChatReasoning) => void
  catalogModels?: CodexCatalogModel[]
  onCatalogModelsChange?: (next: CodexCatalogModel[]) => void
  customUserAgent?: string
  onCustomUserAgentChange?: (next: string) => void
  providerId?: string
  shouldShowSpeedTest?: boolean
  isFullUrl?: boolean
  onFullUrlChange?: (next: boolean) => void
  isEndpointModalOpen?: boolean
  onEndpointModalToggle?: (open?: boolean) => void
  autoSelect?: boolean
  onAutoSelectChange?: (next: boolean) => void
  canEditReasoning?: boolean
  /** Default model — config.toml top-level `model`. */
  codexModel?: string
  onCodexModelChange?: (next: string) => void
  anthropicAuthField?: ClaudeApiKeyField
  onAnthropicAuthFieldChange?: (next: ClaudeApiKeyField) => void
  impersonateClaudeCode?: boolean
  onImpersonateClaudeCodeChange?: (next: boolean) => void
  maxOutputTokens?: string
  onMaxOutputTokensChange?: (next: string) => void
  promptCacheRouting?: PromptCacheRoutingMode
  onPromptCacheRoutingChange?: (next: PromptCacheRoutingMode) => void

  // ── Hermes ────────────────────────────────────────────────────────
  apiMode?: HermesApiMode
  onApiModeChange?: (next: HermesApiMode) => void
  models?: HermesModel[]
  onModelsChange?: (next: HermesModel[]) => void
  rateLimitDelay?: number
  onRateLimitDelayChange?: (next: number | undefined) => void
  settingsJson?: string
  onSettingsJsonChange?: (next: string) => void

  // ── OpenCode ──────────────────────────────────────────────────────
  modelsJson?: string
  onModelsJsonChange?: (next: string) => void
  /** Back-compat alias for npmPackage. */
  npm?: OpenCodeNpmPackage
  onNpmChange?: (next: OpenCodeNpmPackage) => void
  /** Renamed from `models` to avoid clashing with Hermes' model list. */
  opencodeModels?: OpenCodeModels
  onOpencodeModelsChange?: (next: OpenCodeModels) => void
  extraOptions?: Record<string, unknown>
  onExtraOptionsChange?: (next: Record<string, unknown>) => void
  npmPackage?: OpenCodeNpmPackage
  onNpmPackageChange?: (next: OpenCodeNpmPackage) => void
  headers?: Record<string, string>
  onHeadersChange?: (next: Record<string, string>) => void
}
