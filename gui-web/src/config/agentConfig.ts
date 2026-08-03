/**
 * Agent display config — single source of truth for how each agent is
 * shown/edited in the UI (name, icon, resource tabs).
 *
 * Behavior (file format, apply strategy, paths) lives in the Python
 * registry (src/agent_box/core/library.py); this layer only carries
 * presentation data. See workspace/specs/frontend-architecture/05-config-boundary.md.
 */
export interface AgentConfig {
  id: string
  /** i18n key — literal string until the i18n stage lands. */
  nameKey: string
  icon: string
}

/** Badge accent used to display an agent type (unknown → neutral). */
export type AgentColor = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

/** Agent badge colors — pure presentation, with unknown-agent fallback. */
export const AGENT_TYPE_COLORS: Record<string, AgentColor> = {
  claude: 'warning',    // orange
  codex: 'success',     // green
  hermes: 'info',       // blue
  opencode: 'primary',  // neutral
}

/** Badge color for an agent type; unknown types fall back to neutral. */
export function agentTypeColor(agentType: string): AgentColor {
  return AGENT_TYPE_COLORS[agentType] ?? 'neutral'
}

export const AGENT_CONFIG: Record<string, AgentConfig> = {
  claude: {
    id: 'claude',
    nameKey: 'agent.claude',
    icon: 'claude',
  },
  codex: {
    id: 'codex',
    nameKey: 'agent.codex',
    icon: 'codex',
  },
  hermes: {
    id: 'hermes',
    nameKey: 'agent.hermes',
    icon: 'hermes',
  },
  opencode: {
    id: 'opencode',
    nameKey: 'agent.opencode',
    icon: 'opencode',
  },
}
