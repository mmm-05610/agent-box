import { Token, type ResourceScope, type IDisposable } from '@ordessa/extension-api'
import type { AgentClient, AgentConnector, AgentSnapshot, AgentWorkspaceSnapshot } from '../../agent/src/agent'

export interface AgentConnections {
  getSnapshot(): readonly Pick<AgentConnector, 'id' | 'title'>[]
  subscribe(listener: () => void): () => void
  forScope(scope: ResourceScope): { add(connector: AgentConnector): IDisposable }
  connect(id: string): Promise<AgentClient>
  /** Connection workspace: client holding, selection, and reconnection (P2-1 extraction). */
  readonly workspace: AgentConnectionWorkspace
}
export const AgentConnectionsToken = new Token<AgentConnections>('ordessa.agent.connections.v1')

/** Owns connected client instances, selection, and reconnection independent of mounted views.
 * The instance is owned by the connections service; consumers share the same one. */
export interface AgentConnectionWorkspace {
  getSnapshot(): AgentWorkspaceSnapshot
  subscribe(listener: () => void): () => void
  selectConnection(id: string): Promise<void>
  reconnect(id: string): Promise<void>
  /** The connected client of the current selection; throws while nothing is connected. */
  selected(): AgentClient
  /** Live snapshot of every connected client — the input of the gate predicates. */
  clientSnapshots(): readonly AgentSnapshot[]
}

/** Layer-1 switch gate: any run still open on any connection. */
export function hasOpenRun(snapshots: readonly AgentSnapshot[]): boolean {
  return snapshots.some(snapshot => Object.values(snapshot.runs).some(run =>
    run.status === 'starting' || run.status === 'running' || run.status === 'stop-requested'))
}

/** Layer-1 switch gate: any approval/input still awaiting an answer on any connection. */
export function hasAwaitingInteraction(snapshots: readonly AgentSnapshot[]): boolean {
  return snapshots.some(snapshot => snapshot.interactions.some(interaction =>
    interaction.state === 'pending' || interaction.state === 'responding'))
}
