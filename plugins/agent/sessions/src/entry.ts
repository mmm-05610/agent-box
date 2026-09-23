import type { PluginContext } from '@ordessa/extension-api'
import { AgentConnectionsToken, AgentSessionsToken, type AgentConnections } from '@extensions/ordessa.agent-contracts/contract.js'
import { createAgentSessions } from './model'

export default function createPlugin() {
  return { id: 'ordessa.agent-sessions', autoStart: true, requires: [AgentConnectionsToken], provides: AgentSessionsToken,
    activate: (context: PluginContext, connections: AgentConnections) => createAgentSessions(context.resources, connections) }
}
