/**
 * AgentBox Desktop adapter — wire types.
 *
 * These mirror the FROZEN AgentBox `/api/v1` interface protocol
 * (`AGENTBOX_INTERFACE_PROTOCOL.md`, "APPROVED AND FROZEN") and the frozen
 * envelope shapes of the session event stream (§4.2). Field names are
 * snake_case on the wire, exactly as the sidecar emits them; the adapter is
 * the only place that translates them into renderer shapes.
 *
 * PHASE 0: synthetic-only validation. No credentials may live here — the
 * token is injected by the embedder (dev lab) and never logged, persisted,
 * or sent anywhere except the `Authorization` header / ws-ticket exchange.
 */

/** Typed error envelope (protocol §4.5) — every non-2xx sidecar response. */
export interface AgentBoxErrorEnvelope {
  error: {
    code: string
    message: string
    correlation_id: string
    details?: Array<{ field: string; issue: string }>
  }
}

export interface AgentBoxHealth {
  status: string
  service: string
}

/** GET /api/v1/readiness — component-level availability projection. */
export interface AgentBoxReadiness {
  session_store: { state: string; component_id?: string }
  workspace: { state: string; provider_id?: string }
  execution: {
    state: string
    providers: Array<{
      provider_id: string
      harness_type: string
      start_state: string
      capabilities: Record<string, unknown>
    }>
  }
  remote?: { host_bridge?: string }
}

/** GET /api/v1/capabilities — harness registry summary (readiness carries the
 * same projection; this endpoint is the cheap unauthenticated-off one). */
export interface AgentBoxCapabilities {
  service: string
  api_version: number
  session_store: { state: string }
  execution: { state: string; providers: Array<{ provider_id: string; harness_type: string }> }
}

export interface AgentBoxProject {
  project_id: string
  workspace_mode: string
  registered_at: string
}

export interface AgentBoxRemoteProject {
  connection_id?: string
  project_id: string
  display_name?: string
  root_path?: string
}

export interface AgentBoxSession {
  session_id: string
  work_id: string
  title: string
  status: string
  workspace_mode: string
  workspace_provider?: string
  project_id?: string
  watermark: number
  created_at: string
}

export interface AgentBoxTurnReceipt {
  session_id: string
  turn_id: string
  execution_id?: string
  status: string
  state?: string
  replayed: boolean
  run_phase?: string
}

/** POST .../turns/{turn_id}/cancel — returns the turn's honest post-cancel
 * state (a completed turn is NOT retroactively cancelled). */
export interface AgentBoxCancelResult {
  turn_id: string
  session_id: string
  state: string
  terminal_outcome?: string
  committed_watermark?: number
}

/** One durable transcript event (protocol §4.2 entry shape). */
export interface AgentBoxEvent {
  seq: number
  event_id: string
  event_type: string
  turn_id: string | null
  execution_id: string | null
  payload: Record<string, unknown>
  terminal: boolean
  created_at: string
}

export interface AgentBoxTurnSummary {
  turn_id: string
  input: string
  assistant_text?: string
  status: string
  usage?: unknown
}

export interface AgentBoxTranscript {
  session_id: string
  watermark: number
  events: AgentBoxEvent[]
  turns: AgentBoxTurnSummary[]
}

/** WS frame envelope (protocol §4.2). */
export type AgentBoxStreamFrame =
  | { type: 'replay'; events: AgentBoxEvent[]; watermark: number }
  | { type: 'events'; events: AgentBoxEvent[]; watermark: number }
  | { type: 'resync_required'; reason: string; current_watermark: number }
  | { type: 'invalid_cursor' }
  | { type: 'session_error' }

export interface AgentBoxWsTicket {
  ticket: string
  expires_in: number
  single_use: boolean
}

/** Adapter connection config. `token` is a synthetic dev token in Phase 0. */
export interface AgentBoxEndpointConfig {
  baseUrl: string
  token: string
}
