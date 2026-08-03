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
import type { ResourceConfig } from '@/api'

const registry = RESOURCES as Record<string, import('@/domains').ResourceDef>

/** Mock of the backend registry resources — matches core/agent_types.json. */
type AgentKey = 'claude' | 'codex' | 'hermes' | 'opencode'
const BACKEND_RESOURCES: Record<AgentKey, string[]> = {
  claude: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'permissions', 'plugins'],
  codex: ['provider', 'mcp', 'prompt', 'skills', 'permissions'],
  hermes: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'memories', 'permissions'],
  opencode: ['provider', 'mcp', 'prompt', 'skills', 'instructions', 'permissions'],
}

const EXPECTED_RESOURCE_TABS: Record<string, string[]> = {
  claude: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'permissions', 'plugins'],
  codex: ['provider', 'mcp', 'prompt', 'skills', 'permissions'],
  hermes: ['provider', 'mcp', 'hooks', 'prompt', 'skills', 'memories', 'permissions'],
  opencode: ['provider', 'mcp', 'prompt', 'skills', 'instructions', 'permissions'],
}

const EXPECTED_PROMPT_LABELS: Record<string, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  hermes: 'SOUL.md',
  opencode: 'AGENTS.md',
}

/** Mock of the backend registry resources per agent — the prompt tab
 *  label is `resources.prompt.file`, not a hardcoded map. */
const AGENT_RESOURCES: Record<AgentKey, Record<string, ResourceConfig>> = {
  claude: { prompt: { file: 'CLAUDE.md' } },
  codex: { prompt: { file: 'AGENTS.md' } },
  hermes: { prompt: { file: 'SOUL.md' } },
  opencode: { prompt: { file: 'AGENTS.md' } },
}

describe('resolveResourceTabs', () => {
  for (const agentType of ['claude', 'codex', 'hermes', 'opencode'] as const) {
    it(`derives ${agentType} tabs from backend resources + RESOURCES`, () => {
      const tabs = resolveResourceTabs(BACKEND_RESOURCES[agentType], registry, AGENT_RESOURCES[agentType])
      expect(tabs.map((t) => t.key)).toEqual(EXPECTED_RESOURCE_TABS[agentType])
      // Prompt tab label is the backend prompt file (e.g. CLAUDE.md)
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
    const tabs = resolveResourceTabs(BACKEND_RESOURCES.codex, registry, AGENT_RESOURCES.codex)
    const keys = tabs.map((t) => t.key)
    expect(keys).not.toContain('hooks')
    expect(keys).not.toContain('rules')   // rules merged into permissions
    expect(keys).toContain('permissions')
    expect(keys).toContain('skills')
  })

  it('skips backend resource keys without a frontend RESOURCES entry', () => {
    const tabs = resolveResourceTabs([...BACKEND_RESOURCES.claude, 'unknown-resource'], registry, AGENT_RESOURCES.claude)
    expect(tabs.some((t) => t.key === 'unknown-resource')).toBe(false)
  })

  it('an empty backend dict yields no resource tabs', () => {
    const tabs = resolveResourceTabs([], registry, AGENT_RESOURCES.claude)
    expect(tabs).toEqual([])
  })
})
