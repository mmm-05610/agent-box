import type { PluginContext, ResourceScope } from '@ordessa/extension-api'
import { WorkbenchToken, type Workbench } from '@extensions/ordessa.contracts/contract.js'
import { AgentConnectionsToken, type AgentConnections, type AgentConnector } from '@extensions/ordessa.agent-contracts/contract.js'
import { registry } from '../shared/registry'
import { createConnectionWorkspace } from './workspace'
import { ConnectionStatus } from './status'

export function createAgentConnections(lifetime: ResourceScope): AgentConnections {
  const connectors = registry<AgentConnector>(lifetime)
  let source = connectors.getSnapshot()
  let snapshot: readonly Pick<AgentConnector, 'id' | 'title'>[] = source.map(({ id, title }) => ({ id, title }))
  const registryFacade = {
    getSnapshot: () => {
      const current = connectors.getSnapshot()
      if (current !== source) {
        source = current
        snapshot = current.map(({ id, title }) => ({ id, title }))
      }
      return snapshot
    },
    subscribe: connectors.subscribe,
    connect: async (id: string) => {
      const connector = connectors.getSnapshot().find(item => item.id === id)
      if (!connector || lifetime.isDisposed) throw Error(`Agent connection unavailable: ${id}`)
      return connector.connect()
    },
  }
  const service: AgentConnections = {
    getSnapshot: registryFacade.getSnapshot,
    subscribe: registryFacade.subscribe,
    forScope: scope => ({ add: connector => connectors.add(scope, connector) }),
    connect: registryFacade.connect,
    // One workspace per service, owned by the service scope; consumers share the same instance.
    workspace: createConnectionWorkspace(lifetime, registryFacade),
  }
  return service
}
export default function createPlugin() {
  return { id: 'ordessa.agent-connections', autoStart: true, requires: [WorkbenchToken], provides: AgentConnectionsToken,
    activate: (context: PluginContext, workbench: Workbench) => {
      const service = createAgentConnections(context.resources)
      workbench.forScope(context.resources).addUI({ id: 'agent.connections.status', kind: 'component', slot: 'statusbar',
        component: () => <ConnectionStatus workspace={service.workspace} /> })
      return service
    } }
}
