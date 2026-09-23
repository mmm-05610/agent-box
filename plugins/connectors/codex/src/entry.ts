import type { PluginContext } from '@ordessa/extension-api'
import { AgentConnectionsToken, type AgentConnections } from '@extensions/ordessa.agent-contracts/contract.js'
import { CodexClient } from './client'

export default function createPlugin() {
  return { id: 'ordessa.agent-codex', autoStart: true, requires: [AgentConnectionsToken],
    activate(context: PluginContext, connections: AgentConnections) {
      connections.forScope(context.resources).add({ id: 'codex', title: 'Codex', connect: () => CodexClient.connect(window.agentNative) })
    },
  }
}
