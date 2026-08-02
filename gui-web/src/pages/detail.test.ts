/**
 * Tab-set tests for the registry-driven detail page (Stage 5).
 *
 * Verifies each agent's resource-tab set from AGENT_CONFIG.tabs + RESOURCES
 * + the agent-specific fallback map — the behavior the old hardcoded tab
 * lists provided. Meta/Storage are added by the page around these.
 */
import { describe, expect, it } from 'vitest'
import { AGENT_TYPE_CONFIGS } from '@/api'
import { RESOURCES } from '@/domains'
import { AGENT_CONFIG } from '@/config'
import { resolveResourceTabs } from './detail'

const registry = RESOURCES as Record<string, import('@/domains').ResourceDef>

const EXPECTED_RESOURCE_TABS: Record<string, string[]> = {
  claude: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'permissions', 'plugins'],
  codex: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'rules'],
  hermes: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'memories'],
  opencode: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'instructions'],
}

const EXPECTED_PROMPT_LABELS: Record<string, string> = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  hermes: 'SOUL.md',
  opencode: 'AGENTS.md',
}

describe('resolveResourceTabs', () => {
  for (const agentType of ['claude', 'codex', 'hermes', 'opencode'] as const) {
    it(`resolves ${agentType} tabs from AGENT_CONFIG + RESOURCES`, () => {
      const tabs = resolveResourceTabs(agentType, AGENT_CONFIG[agentType].tabs, registry, AGENT_TYPE_CONFIGS[agentType].features)
      expect(tabs.map((t) => t.key)).toEqual(EXPECTED_RESOURCE_TABS[agentType])
      // Prompt tab keeps the old per-agent file label (CLAUDE.md / AGENTS.md / SOUL.md)
      const prompt = tabs.find((t) => t.key === 'prompt')
      expect(prompt?.label).toBe(EXPECTED_PROMPT_LABELS[agentType])
      // Shared resource tabs keep their old labels
      expect(tabs.find((t) => t.key === 'provider')?.label).toBe('Provider')
      expect(tabs.find((t) => t.key === 'mcp')?.label).toBe('MCP')
      expect(tabs.find((t) => t.key === 'skill')?.label).toBe('Skills')
      expect(tabs.find((t) => t.key === 'hook')?.label).toBe('Hooks')
    })
  }

  it('hides agent-specific tabs when the agent feature is missing', () => {
    const tabs = resolveResourceTabs('claude', AGENT_CONFIG.claude.tabs, registry, [])
    const keys = tabs.map((t) => t.key)
    expect(keys).toContain('provider')
    expect(keys).not.toContain('permissions')
    expect(keys).not.toContain('plugins')
  })
})
