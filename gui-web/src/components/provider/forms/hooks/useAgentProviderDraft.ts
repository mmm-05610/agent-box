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
  modelsJson: string
  hermesApiMode: HermesApiMode
  hermesModels: HermesModel[]
  hermesRateLimit?: number
  opencodeExtraOptions: Record<string, unknown>
  opencodeNpm: OpenCodeNpmPackage
}

const emptyAgentDraft = (): AgentProviderDraftState => ({
  codexConfig: '', codexCatalogModels: [], codexReasoning: {}, codexProxyHeaders: '', codexProxyBody: '',
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
    setModelsJson: setter('modelsJson'), setHermesApiMode: setter('hermesApiMode'), setHermesModels: setter('hermesModels'),
    setHermesRateLimit: setter('hermesRateLimit'), setOpencodeExtraOptions: setter('opencodeExtraOptions'), setOpencodeNpm: setter('opencodeNpm'),
    resetAgentDraft,
  }
}
