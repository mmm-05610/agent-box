import type { ProviderFormValues } from '../ProviderFormFields'
import { getInitialFormValues, patchCodexBaseUrl, settingsFromFormValues } from '../perAgentSettings'
import { readCodexCatalogModels, type CodexCatalogModel } from '../forms/CodexProviderForm'
import { readHermesModels, type HermesApiMode, type HermesModel } from '../forms/HermesProviderForm'
import type { CodexChatReasoning } from '../forms/CodexProviderForm'
import type { OpenCodeNpmPackage } from '../forms/OpenCodeProviderForm'

export interface ProviderEditorDraft {
  values: ProviderFormValues
  codex: { config: string; catalogModels: CodexCatalogModel[]; reasoning: CodexChatReasoning; proxyHeaders: string; proxyBody: string }
  hermes: { apiMode: HermesApiMode; models: HermesModel[]; rateLimitDelay?: number }
  opencode: { npm: OpenCodeNpmPackage; modelsJson: string; extraOptions: Record<string, unknown> }
}

export function readProviderEditorDraft(agentType: string, settings: Record<string, unknown> = {}): ProviderEditorDraft {
  const options = settings.options && typeof settings.options === 'object' && !Array.isArray(settings.options)
    ? settings.options as Record<string, unknown>
    : {}
  const extraOptions = Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'baseURL' && key !== 'apiKey'))
  const apiMode = settings.api_mode
  return {
    values: getInitialFormValues(agentType, settings),
    codex: {
      config: typeof settings.config === 'string' ? settings.config : '',
      catalogModels: readCodexCatalogModels(settings),
      reasoning: settings.codexChatReasoning && typeof settings.codexChatReasoning === 'object' ? settings.codexChatReasoning as CodexChatReasoning : {},
      proxyHeaders: typeof settings.localProxyHeadersOverride === 'string' ? settings.localProxyHeadersOverride : '',
      proxyBody: typeof settings.localProxyBodyOverride === 'string' ? settings.localProxyBodyOverride : '',
    },
    hermes: {
      apiMode: apiMode === 'anthropic' || apiMode === 'codex_responses' || apiMode === 'bedrock_converse' ? apiMode : 'openai_compatible',
      models: readHermesModels(settings),
      rateLimitDelay: typeof settings.rate_limit_delay === 'number' ? settings.rate_limit_delay : undefined,
    },
    opencode: {
      npm: typeof settings.npm === 'string' ? settings.npm as OpenCodeNpmPackage : '@ai-sdk/openai-compatible',
      modelsJson: settings.models === undefined ? '' : JSON.stringify(settings.models, null, 2),
      extraOptions,
    },
  }
}

function patchTopLevelTomlModel(config: string, model: string): string {
  const escaped = model.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const lines = config.split(/\r?\n/)
  const firstSection = lines.findIndex((line) => /^\s*\[/.test(line))
  const topEnd = firstSection < 0 ? lines.length : firstSection
  const index = lines.slice(0, topEnd).findIndex((line) => /^\s*model\s*=/.test(line))
  if (!model.trim()) {
    if (index >= 0) lines.splice(index, 1)
    return lines.join('\n')
  }
  if (index >= 0) lines[index] = `model = "${escaped}"`
  else lines.unshift(`model = "${escaped}"`)
  return lines.join('\n')
}

export function writeProviderEditorDraft(agentType: string, original: Record<string, unknown>, draft: ProviderEditorDraft): Record<string, unknown> {
  const next = settingsFromFormValues(agentType, original, draft.values, undefined, {
    hermes: draft.hermes,
    opencode: { extraOptions: draft.opencode.extraOptions },
  })
  if (agentType === 'codex') {
    const defaultModel = draft.codex.catalogModels[0]?.model.trim() ?? ''
    next.config = patchTopLevelTomlModel(patchCodexBaseUrl(draft.codex.config, draft.values.baseUrl), defaultModel)
    if (draft.codex.catalogModels.length) next.modelCatalog = { models: draft.codex.catalogModels }
    else delete next.modelCatalog
    if (Object.keys(draft.codex.reasoning).length) next.codexChatReasoning = draft.codex.reasoning
    else delete next.codexChatReasoning
    if (draft.codex.proxyHeaders.trim()) next.localProxyHeadersOverride = draft.codex.proxyHeaders
    else delete next.localProxyHeadersOverride
    if (draft.codex.proxyBody.trim()) next.localProxyBodyOverride = draft.codex.proxyBody
    else delete next.localProxyBodyOverride
  }
  if (agentType === 'opencode') {
    next.npm = draft.opencode.npm
    if (draft.opencode.modelsJson.trim()) next.models = JSON.parse(draft.opencode.modelsJson) as Record<string, unknown>
    else delete next.models
  }
  return next
}
