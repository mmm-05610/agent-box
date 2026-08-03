/**
 * Frontend config layer — agent display/editing facts.
 *
 * Pure data, no behavior: presentation lives here, file-format/apply
 * behavior lives in the Python registry.
 */
export { AGENT_CONFIG } from './agentConfig'
export type { AgentConfig } from './agentConfig'
export { AGENT_TYPE_COLORS, agentTypeColor } from './agentConfig'
export type { AgentColor } from './agentConfig'
export { PROVIDER_PRESETS } from './agentPresets'
