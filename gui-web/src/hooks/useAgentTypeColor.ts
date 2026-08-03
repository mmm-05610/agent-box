/**
 * useAgentTypeColor — dynamically assign a badge color to an agent type.
 *
 * Colors are NOT bound to specific agent types (that would hardcode agent
 * knowledge). Instead they cycle through a palette by the agent's position
 * in the backend registry, so any agent type — known or future — gets a
 * consistent visual hue. Unknown types fall back to neutral.
 */

import { useCallback, useMemo } from 'react'
import { useAgentConfigs } from './useAgentConfigs'

export type AgentColor = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

/** Cycling palette — order is arbitrary, no agent is bound to a color. */
const PALETTE: AgentColor[] = ['warning', 'success', 'info', 'primary']

export function useAgentTypeColor() {
  const { agentConfigs } = useAgentConfigs()
  const order = useMemo(() => (agentConfigs ? Object.keys(agentConfigs) : []), [agentConfigs])

  return useCallback(
    (agentType: string): AgentColor => {
      const i = order.indexOf(agentType)
      // i % length is always in range — the index guard is for
      // noUncheckedIndexedAccess, not a real undefined case.
      return i === -1 ? 'neutral' : PALETTE[i % PALETTE.length]!
    },
    [order],
  )
}
