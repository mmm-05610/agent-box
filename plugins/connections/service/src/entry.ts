import type { PluginContext, ResourceScope } from '@ordessa/extension-api'
import { AgentConnectionsToken, type AgentConnections, type AgentConnector } from '@extensions/ordessa.agent-contracts/contract.js'
import { registry } from '../shared/registry'

export function createAgentConnections(lifetime: ResourceScope): AgentConnections {
  const connectors = registry<AgentConnector>(lifetime)
  let source = connectors.getSnapshot()
  let snapshot: readonly Pick<AgentConnector, 'id' | 'title'>[] = source.map(({ id, title }) => ({ id, title }))
  return {
    getSnapshot: () => {
      const current = connectors.getSnapshot()
      if (current !== source) {
        source = current
        snapshot = current.map(({ id, title }) => ({ id, title }))
      }
      return snapshot
    },
    subscribe: connectors.subscribe,
    forScope: scope => ({ add: connector => connectors.add(scope, connector) }),
    async connect(id) {
      const connector = connectors.getSnapshot().find(item => item.id === id)
      if (!connector || lifetime.isDisposed) throw Error(`Agent connection unavailable: ${id}`)
      return connector.connect()
    },
  }
}
export default function createPlugin() {
  return { id: 'ordessa.agent-connections', autoStart: true, provides: AgentConnectionsToken,
    activate: (context: PluginContext) => createAgentConnections(context.resources) }
}
