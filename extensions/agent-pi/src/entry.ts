import type { PluginContext } from '@ordessa/extension-api'
import { AgentConnectionsToken, type AgentConnections } from '@extensions/ordessa.agent-contracts/contract.js'
import { PiClient } from './client'

export default function createPlugin() {
  return { id: 'ordessa.agent-pi', autoStart: true, requires: [AgentConnectionsToken],
    activate(context: PluginContext, connections: AgentConnections) {
      connections.forScope(context.resources).add({ id: 'pi', title: 'Pi', connect: () => PiClient.connect(window.agentNative) })
    },
  }
}
