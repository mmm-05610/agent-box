/**
 * useAgentIdentity — resolve an agent's brand identity (accent color, logo)
 * from the backend registry.
 *
 * Colors and logos are served by the backend agent_types.json (identity.color
 * / identity.logo) — the frontend only renders what the backend points at,
 * holding no agent→asset mapping. Falls back to neutral values while the
 * registry loads or for unknown types.
 */

import { useMemo } from 'react'
import { useAgentConfigs } from './useAgentConfigs'
import type { AgentTypeConfig } from '@/api'

export interface AgentIdentity {
  color: string
  logo: string
}

const FALLBACK: AgentIdentity = { color: '#888', logo: '' }

/** Pure resolver — usable inside map callbacks (not a hook). */
export function resolveAgentIdentity(
  agentConfigs: Record<string, AgentTypeConfig> | null | undefined,
  agentType: string,
): AgentIdentity {
  const identity = agentConfigs?.[agentType]?.identity
  if (!identity?.color && !identity?.logo) return FALLBACK
  return {
    color: identity.color ?? FALLBACK.color,
    logo: identity.logo ?? '',
  }
}

/** Hook form for components (uses the module-level registry cache). */
export function useAgentIdentity(agentType: string): AgentIdentity {
  const { agentConfigs } = useAgentConfigs()
  return useMemo(() => resolveAgentIdentity(agentConfigs, agentType), [agentConfigs, agentType])
}
