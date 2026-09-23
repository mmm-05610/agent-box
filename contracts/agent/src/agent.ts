import { Token, type IDisposable } from '@ordessa/extension-api'

export type Availability = 'supported' | 'unsupported' | 'unknown' | 'unavailable'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type RunStatus = 'starting' | 'running' | 'stop-requested' | 'completed' | 'cancelled' | 'failed' | 'unknown'

export interface AgentCapabilities {
  history: Availability
  reasoning: Availability
  tools: Availability
  stop: Availability
  interactions: Availability
  models: Availability
  modes: Availability
}
export interface AgentConnectionInfo {
  id: string
  title: string
  status: ConnectionStatus
  error?: string
  capabilities: AgentCapabilities
}
export interface AgentSessionInfo {
  id: string
  title: string
  updatedAt?: string
  detail?: string
}
export interface AgentToolCall {
  id: string
  name: string
  arguments?: unknown
  result?: unknown
  status: 'running' | 'completed' | 'failed' | 'unknown'
}
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  reasoning?: string
  tools?: readonly AgentToolCall[]
  status?: RunStatus
}
export interface AgentInteraction {
  id: string
  sessionId: string
  turnId?: string
  kind: 'approval' | 'choice' | 'confirm' | 'input' | 'editor'
  title: string
  detail?: string
  choices?: readonly { id: string; label: string }[]
  fields?: readonly { id: string; title: string; detail?: string; choices?: readonly { id: string; label: string }[]; secret?: boolean }[]
  state: 'pending' | 'responding' | 'resolved' | 'expired' | 'unknown'
}
export interface AgentOption {
  id: string
  title: string
  value?: string
  values?: readonly { id: string; title: string }[]
  availability: Availability
}
export interface AgentSnapshot {
  connection: AgentConnectionInfo
  sessions: readonly AgentSessionInfo[]
  sessionList: 'unknown' | 'loading' | 'ready' | 'partial' | 'error'
  selectedSessionId?: string
  messages: Readonly<Record<string, readonly AgentMessage[]>>
  runs: Readonly<Record<string, { id: string; sessionId: string; status: RunStatus; stoppable?: boolean }>>
  interactions: readonly AgentInteraction[]
  options: readonly AgentOption[]
  diagnostic?: string
}
export type InteractionAnswer =
  | { kind: 'choice'; choiceId: string }
  | { kind: 'confirm'; confirmed: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'answers'; answers: Readonly<Record<string, readonly string[]>> }
  | { kind: 'cancel' }

/** A live, authoritative adapter instance. Operations never imply a terminal run state. */
export interface AgentClient extends IDisposable {
  getSnapshot(): AgentSnapshot
  subscribe(listener: () => void): () => void
  refreshSessions(): Promise<void>
  newSession(): Promise<string>
  openSession(id: string): Promise<void>
  send(sessionId: string, text: string): Promise<void>
  stop(sessionId: string, runId: string): Promise<void>
  respond(interactionId: string, answer: InteractionAnswer): Promise<void>
  setOption(id: string, value: string): Promise<void>
}
export interface AgentConnector {
  id: string
  title: string
  connect(): Promise<AgentClient>
}

export interface AgentWorkspaceSnapshot {
  available: readonly Pick<AgentConnector, 'id' | 'title'>[]
  selectedConnectionId?: string
  connectingId?: string
  error?: string
  agent?: AgentSnapshot
}
/** Owns connected instances independently of mounted Workbench views. */
export interface AgentSessions {
  getSnapshot(): AgentWorkspaceSnapshot
  subscribe(listener: () => void): () => void
  selectConnection(id: string): Promise<void>
  reconnect(id: string): Promise<void>
  refreshSessions(): Promise<void>
  newSession(): Promise<void>
  openSession(id: string): Promise<void>
  send(text: string): Promise<void>
  stop(runId: string): Promise<void>
  respond(interactionId: string, answer: InteractionAnswer): Promise<void>
  setOption(id: string, value: string): Promise<void>
}
export const AgentSessionsToken = new Token<AgentSessions>('ordessa.agent.sessions.v1')
