import type { ResourceScope } from '@ordessa/extension-api'
import type { AgentConnections, AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'

/** Thin delegate facade: client holding, selection, and reconnection live in the connections
 * service workspace (P2-1 extraction); session operations project through its selected client.
 * Semantics preserved verbatim from the former owning model (connect-research §1.2/§1.5). */
export function createAgentSessions(lifetime: ResourceScope, connections: AgentConnections): AgentSessions {
  void lifetime // workspace ownership moved to the connections service scope (P2-1)
  const workspace = connections.workspace
  return {
    getSnapshot: workspace.getSnapshot,
    subscribe: workspace.subscribe,
    selectConnection: workspace.selectConnection,
    reconnect: workspace.reconnect,
    refreshSessions: () => workspace.selected().refreshSessions(),
    newSession: () => workspace.selected().newSession().then(() => undefined),
    openSession: id => workspace.selected().openSession(id),
    send: text => {
      const client = workspace.selected(), sessionId = client.getSnapshot().selectedSessionId
      if (!sessionId) throw Error('No Agent session selected')
      return client.send(sessionId, text)
    },
    stop: runId => {
      const client = workspace.selected(), run = client.getSnapshot().runs[runId]
      if (!run) throw Error('Agent run unavailable')
      return client.stop(run.sessionId, runId)
    },
    respond: (id, answer) => workspace.selected().respond(id, answer),
    setOption: (id, value) => workspace.selected().setOption(id, value),
  }
}
