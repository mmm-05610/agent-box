/**
 * Provider form schemas — shared base + per-agent extend.
 *
 * `baseProviderSchema` mirrors the shared `ProviderFormValues` shape that
 * every agent form carries (identity / auth / endpoint / model mapping /
 * test + billing config). Each agent schema extends it with the extra state
 * that agent's fields editor owns (Codex TOML + catalog, Hermes models,
 * OpenCode options …).
 *
 * Defaults for a brand-new provider are seeded from the stage-1 fact source
 * (`config/agentPresets.ts`) via `providerPresetDefaults()`.
 */
import { z } from 'zod'
import type { AgentType } from '@/api'
import { PROVIDER_PRESETS } from '@/config'
import { defaultFormValues, type ProviderFormValues } from '@/components/provider/ProviderFormFields'
import type { HermesApiMode } from './fields/HermesFields'
import type { OpenCodeNpmPackage } from './fields/OpenCodeFields'

// ── Base schema (shared by every agent) ────────────────────────────────

export const baseProviderSchema = z.object({
  name: z.string(),
  notes: z.string(),
  websiteUrl: z.string(),
  useApiKey: z.boolean(),
  authValue: z.string(),
  baseUrl: z.string(),
  isFullUrl: z.boolean(),
  roleModels: z.record(z.object({ model: z.string(), name: z.string() })),
  fallbackModel: z.string(),
  apiFormat: z.string(),
  effortLevel: z.string(),
  includeCoAuthoredBy: z.boolean(),
  enableToolSearch: z.boolean(),
  skipWebFetchPreflight: z.boolean(),
  disableAutoUpdates: z.boolean(),
  timeoutMs: z.string(),
  customUserAgent: z.string(),
  testConfigEnabled: z.boolean(),
  testTimeout: z.string(),
  testDegradedThreshold: z.string(),
  testMaxRetries: z.string(),
  pricingConfigEnabled: z.boolean(),
  costMultiplier: z.string(),
  pricingModelSource: z.string(),
})

export type BaseProviderValues = z.infer<typeof baseProviderSchema>

// ── Per-agent extend ───────────────────────────────────────────────────

export const claudeSchema = baseProviderSchema.extend({
  localProxyHeadersOverride: z.string().optional(),
  localProxyBodyOverride: z.string().optional(),
})

export const codexSchema = baseProviderSchema.extend({
  codexConfig: z.string(),
  catalogModels: z.array(
    z.object({
      model: z.string(),
      displayName: z.string(),
      contextWindow: z.union([z.string(), z.number()]).optional(),
    }),
  ),
  codexChatReasoning: z.record(z.unknown()),
  codexModel: z.string().optional(),
  apiFormat: z.string().optional(),
  customUserAgent: z.string().optional(),
  localProxyHeadersOverride: z.string().optional(),
  localProxyBodyOverride: z.string().optional(),
})

export const hermesSchema = baseProviderSchema.extend({
  apiMode: z.string(),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      contextLength: z.number().optional(),
    }),
  ),
  rateLimitDelay: z.number().optional(),
  settingsJson: z.string().optional(),
})

export const opencodeSchema = baseProviderSchema.extend({
  npm: z.string(),
  modelsJson: z.string(),
  extraOptions: z.record(z.unknown()),
  headers: z.record(z.string()),
  settingsJson: z.string().optional(),
})

export const agentSchemaMap = {
  claude: claudeSchema,
  codex: codexSchema,
  hermes: hermesSchema,
  opencode: opencodeSchema,
} satisfies Record<AgentType, z.ZodType>

/** Look up the merged schema for an agent type. */
export function getAgentProviderSchema(agentType: AgentType): z.ZodType {
  return agentSchemaMap[agentType]
}

// ── Defaults from the stage-1 fact source ──────────────────────────────

export interface ProviderDraftDefaults {
  values: ProviderFormValues
  /** Codex: initial config.toml seeded from PROVIDER_PRESETS.codex. */
  codexConfig: string
  /** Hermes: initial api_mode from PROVIDER_PRESETS.hermes. */
  hermesApiMode: HermesApiMode
  /** OpenCode: initial npm package. */
  opencodeNpm: OpenCodeNpmPackage
}

/** Default state for opening a brand-new provider form, seeded from
 *  `PROVIDER_PRESETS` (config/agentPresets.ts). */
export function providerPresetDefaults(agentType: AgentType): ProviderDraftDefaults {
  switch (agentType) {
    case 'claude':
      return {
        values: defaultFormValues(PROVIDER_PRESETS.claude.env),
        codexConfig: '',
        hermesApiMode: 'openai_compatible',
        opencodeNpm: '@ai-sdk/openai-compatible',
      }
    case 'codex': {
      const preset = PROVIDER_PRESETS.codex
      const modelProvider = preset.modelProvider ?? 'custom'
      const codexConfig = `model_provider = "${modelProvider}"\n\n[model_providers.${modelProvider}]\nbase_url = ""\n`
      return {
        values: defaultFormValues(
          { ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' },
          undefined,
          undefined,
          { apiFormat: 'openai_responses' },
        ),
        codexConfig,
        hermesApiMode: 'openai_compatible',
        opencodeNpm: '@ai-sdk/openai-compatible',
      }
    }
    case 'hermes':
      return {
        values: defaultFormValues({ ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' }),
        codexConfig: '',
        hermesApiMode: PROVIDER_PRESETS.hermes.apiMode as HermesApiMode,
        opencodeNpm: '@ai-sdk/openai-compatible',
      }
    case 'opencode':
      return {
        values: defaultFormValues({ ANTHROPIC_BASE_URL: '', ANTHROPIC_AUTH_TOKEN: '' }),
        codexConfig: '',
        hermesApiMode: 'openai_compatible',
        opencodeNpm: '@ai-sdk/openai-compatible',
      }
  }
}
