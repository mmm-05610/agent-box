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

/** The backend's default agent type (config.DEFAULT_AGENT_TYPE). */
export async function fetchDefaultAgent(): Promise<string> {
  return call<string>((api) => api.get_default_agent!(), '')
}

/** The agent-box backend version (agent_box.__version__). */
export async function fetchVersion(): Promise<string> {
  return call<string>((api) => api.get_version!(), '')
}
