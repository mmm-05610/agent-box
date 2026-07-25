import { useCallback, useState } from 'react'
import type { CodexCatalogModel, CodexChatReasoning } from '../CodexProviderForm'
import type { HermesApiMode, HermesModel } from '../HermesProviderForm'
import type { OpenCodeNpmPackage } from '../OpenCodeProviderForm'

interface AgentProviderDraftState {
  codexConfig: string
  codexCatalogModels: CodexCatalogModel[]
  codexReasoning: CodexChatReasoning
  codexProxyHeaders: string
  codexProxyBody: string
  /** Claude-only: outer-dialog state for the local proxy overrides UI. */
  claudeProxyHeaders: string
  claudeProxyBody: string
  /** Claude-only: outer-dialog state for the common-config (raw JSON) editor. */
  claudeSettingsJson: string
  modelsJson: string
  hermesApiMode: HermesApiMode
  hermesModels: HermesModel[]
  hermesRateLimit?: number
  opencodeExtraOptions: Record<string, unknown>
  opencodeNpm: OpenCodeNpmPackage
}

const emptyAgentDraft = (): AgentProviderDraftState => ({
  codexConfig: '', codexCatalogModels: [], codexReasoning: {}, codexProxyHeaders: '', codexProxyBody: '',
  claudeProxyHeaders: '', claudeProxyBody: '', claudeSettingsJson: '',
  modelsJson: '', hermesApiMode: 'openai_compatible', hermesModels: [], hermesRateLimit: undefined,
  opencodeExtraOptions: {}, opencodeNpm: '@ai-sdk/openai-compatible',
})

export function useAgentProviderDraft() {
  const [draft, setDraft] = useState<AgentProviderDraftState>(emptyAgentDraft)
  const setter = <K extends keyof AgentProviderDraftState>(key: K) => (value: AgentProviderDraftState[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const resetAgentDraft = useCallback(() => setDraft(emptyAgentDraft()), [])
  return {
    ...draft,
    setCodexConfig: setter('codexConfig'), setCodexCatalogModels: setter('codexCatalogModels'),
    setCodexReasoning: setter('codexReasoning'), setCodexProxyHeaders: setter('codexProxyHeaders'), setCodexProxyBody: setter('codexProxyBody'),
    setClaudeProxyHeaders: setter('claudeProxyHeaders'), setClaudeProxyBody: setter('claudeProxyBody'),
    setClaudeSettingsJson: setter('claudeSettingsJson'),
    setModelsJson: setter('modelsJson'), setHermesApiMode: setter('hermesApiMode'), setHermesModels: setter('hermesModels'),
    setHermesRateLimit: setter('hermesRateLimit'), setOpencodeExtraOptions: setter('opencodeExtraOptions'), setOpencodeNpm: setter('opencodeNpm'),
    resetAgentDraft,
  }
}
