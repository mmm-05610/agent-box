/**
 * AgentBox Desktop adapter — Phase 0 feasibility probe.
 *
 * Narrow transport + event projection that lets the frozen-protocol AgentBox
 * sidecar drive the EXISTING Hermes transcript UI. The backend stays the sole
 * Session/Turn/Execution authority; this adapter owns no durable state and no
 * second session machine. See docs/agentbox-desktop-phase0.md.
 */

export { AgentBoxClient, AgentBoxError, AgentBoxEventStream } from './client'
export type { AgentBoxStreamState, AgentBoxStreamStateHandler } from './client'
export { foldAgentBoxEvent, projectAgentBoxTranscript } from './event-adapter'
export type { AgentBoxTurnProjection } from './event-adapter'
export type {
  AgentBoxCancelResult,
  AgentBoxEndpointConfig,
  AgentBoxEvent,
  AgentBoxHealth,
  AgentBoxProject,
  AgentBoxReadiness,
  AgentBoxRemoteProject,
  AgentBoxSession,
  AgentBoxTranscript,
  AgentBoxTurnReceipt
} from './types'
