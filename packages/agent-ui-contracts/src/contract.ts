import { Token, type IDisposable, type ResourceScope } from '@ordessa/extension-api'

export type Availability = 'supported' | 'unsupported' | 'unknown' | 'unavailable'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type RunStatus = 'running' | 'stop-requested' | 'completed' | 'cancelled' | 'failed' | 'unknown'

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
  runs: Readonly<Record<string, { id: string; sessionId: string; status: RunStatus }>>
  interactions: readonly AgentInteraction[]
  options: readonly AgentOption[]
  diagnostic?: string
}
export type InteractionAnswer =
  | { kind: 'choice'; choiceId: string }
  | { kind: 'confirm'; confirmed: boolean }
  | { kind: 'text'; value: string }
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
export interface AgentConnections {
  getSnapshot(): readonly Pick<AgentConnector, 'id' | 'title'>[]
  subscribe(listener: () => void): () => void
  forScope(scope: ResourceScope): { add(connector: AgentConnector): IDisposable }
  connect(id: string): Promise<AgentClient>
}
export const AgentConnectionsToken = new Token<AgentConnections>('ordessa.agent.connections.v1')
