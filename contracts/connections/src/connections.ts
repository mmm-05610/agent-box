import { Token, type ResourceScope, type IDisposable } from '@ordessa/extension-api'
import type { AgentClient, AgentConnector } from '../../agent/src/agent'

export interface AgentConnections {
  getSnapshot(): readonly Pick<AgentConnector, 'id' | 'title'>[]
  subscribe(listener: () => void): () => void
  forScope(scope: ResourceScope): { add(connector: AgentConnector): IDisposable }
  connect(id: string): Promise<AgentClient>
}
export const AgentConnectionsToken = new Token<AgentConnections>('ordessa.agent.connections.v1')
