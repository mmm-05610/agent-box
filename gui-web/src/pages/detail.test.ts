/**
 * Tab-set tests for the registry-driven detail page.
 *
 * Tabs are derived from the backend registry's `resources` keys (the
 * support declaration), cross-referenced with the frontend RESOURCES
 * registry. Meta/Storage are added by the page around these.
 */
import { describe, expect, it } from 'vitest'
import { RESOURCES } from '@/domains'
import { resolveResourceTabs } from './detail'

const registry = RESOURCES as Record<string, import('@/domains').ResourceDef>

/** Mock of the backend registry resources — matches core/agent_types.json. */
type AgentKey = 'claude' | 'codex' | 'hermes' | 'opencode'
const BACKEND_RESOURCES: Record<AgentKey, string[]> = {
  claude: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'permissions', 'plugins'],
  codex: ['provider', 'mcp', 'prompt', 'skills', 'rules'],
  hermes: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'memories'],
  opencode: ['provider', 'mcp', 'prompt', 'skills', 'instructions'],
}

const EXPECTED_RESOURCE_TABS: Record<string, string[]> = {
  claude: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'permissions', 'plugins'],
  codex: ['provider', 'mcp', 'prompt', 'skills', 'rules'],
  hermes: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'memories'],
  opencode: ['provider', 'mcp', 'prompt', 'skills', 'instructions'],
}

const EXPECTED_PROMPT_LABELS: Record<string, string> = {
  claude: 'tab.prompt.claude',
  codex: 'tab.prompt.codex',
  hermes: 'tab.prompt.hermes',
  opencode: 'tab.prompt.opencode',
}

describe('resolveResourceTabs', () => {
  for (const agentType of ['claude', 'codex', 'hermes', 'opencode'] as const) {
    it(`derives ${agentType} tabs from backend resources + RESOURCES`, () => {
      const tabs = resolveResourceTabs(agentType, BACKEND_RESOURCES[agentType], registry)
      expect(tabs.map((t) => t.key)).toEqual(EXPECTED_RESOURCE_TABS[agentType])
      // Prompt tab keeps the per-agent prompt-file label key
      const prompt = tabs.find((t) => t.key === 'prompt')
      expect(prompt?.label).toBe(EXPECTED_PROMPT_LABELS[agentType])
      // Shared resource tabs keep their label keys (only when present
      // in the backend resources — e.g. codex/opencode have no hooks).
      expect(tabs.find((t) => t.key === 'provider')?.label).toBe('tab.provider')
      expect(tabs.find((t) => t.key === 'mcp')?.label).toBe('tab.mcp')
      expect(tabs.find((t) => t.key === 'skills')?.label).toBe('tab.skill')
      if (tabs.some((t) => t.key === 'hooks')) {
        expect(tabs.find((t) => t.key === 'hooks')?.label).toBe('tab.hook')
      }
    })
  }

  it('only renders resources present in the backend dict', () => {
    // codex has no hooks resource in the backend registry
    const tabs = resolveResourceTabs('codex', BACKEND_RESOURCES.codex, registry)
    const keys = tabs.map((t) => t.key)
    expect(keys).not.toContain('hooks')
    expect(keys).toContain('rules')
    expect(keys).toContain('skills')
  })

  it('skips backend resource keys without a frontend RESOURCES entry', () => {
    const tabs = resolveResourceTabs('claude', [...BACKEND_RESOURCES.claude, 'unknown-resource'], registry)
    expect(tabs.some((t) => t.key === 'unknown-resource')).toBe(false)
  })

  it('an empty backend dict yields no resource tabs', () => {
    const tabs = resolveResourceTabs('claude', [], registry)
    expect(tabs).toEqual([])
  })
})
