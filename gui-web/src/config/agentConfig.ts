/**
 * Agent display config — single source of truth for how each agent is
 * shown/edited in the UI (name, icon, resource tabs).
 *
 * Behavior (file format, apply strategy, paths) lives in the Python
 * registry (src/agent_box/core/library.py); this layer only carries
 * presentation data. See workspace/specs/frontend-architecture/05-config-boundary.md.
 */
import type { AgentType } from '@/api'

export interface AgentConfig {
  id: string
  /** i18n key — literal string until the i18n stage lands. */
  nameKey: string
  icon: string
  /** Resource tabs shown on the profile detail page, in display order. */
  tabs: string[]
}

export const AGENT_CONFIG: Record<AgentType, AgentConfig> = {
  claude: {
    id: 'claude',
    nameKey: 'agent.claude',
    icon: 'claude',
    tabs: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'permissions', 'plugins'],
  },
  codex: {
    id: 'codex',
    nameKey: 'agent.codex',
    icon: 'codex',
    tabs: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'rules'],
  },
  hermes: {
    id: 'hermes',
    nameKey: 'agent.hermes',
    icon: 'hermes',
    tabs: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'memories'],
  },
  opencode: {
    id: 'opencode',
    nameKey: 'agent.opencode',
    icon: 'opencode',
    tabs: ['provider', 'mcp', 'skill', 'hook', 'prompt', 'instructions'],
  },
}
