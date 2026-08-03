/**
 * Agent type registry API — the full agent-type config dict from the
 * Python registry (core/agent_types.json), via bridge get_agent_configs().
 *
 * The backend returns the complete registry with no frontend-specific
 * filtering; consumers read the fields they need (contract type).
 */
import { call } from '@/lib/bridge'
import type { AgentTypeConfig } from './types'

export async function fetchAgentConfigs(): Promise<Record<string, AgentTypeConfig>> {
  return call<Record<string, AgentTypeConfig>>((api) => api.get_agent_configs!(), {})
}
