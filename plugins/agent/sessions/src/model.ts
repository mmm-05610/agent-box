import type { ResourceScope } from '@ordessa/extension-api'
import type { AgentClient, AgentConnections, AgentSessions, AgentWorkspaceSnapshot } from '@extensions/ordessa.agent-contracts/contract.js'

export function createAgentSessions(lifetime: ResourceScope, connections: AgentConnections): AgentSessions {
  const clients = new Map<string, AgentClient>()
  const subscriptions = new Map<string, () => void>()
  const inFlight = new Map<string, Promise<void>>()
  const listeners = new Set<() => void>()
  let state: AgentWorkspaceSnapshot = { available: connections.getSnapshot() }
  const publish = (patch: Partial<AgentWorkspaceSnapshot> = {}) => {
    if (lifetime.isDisposed) return
    state = { ...state, ...patch, available: connections.getSnapshot(),
      agent: clients.get(patch.selectedConnectionId ?? state.selectedConnectionId ?? '')?.getSnapshot() }
    for (const listener of listeners) listener()
  }
  const unsubscribeRegistry = connections.subscribe(() => publish())
  lifetime.add({ isDisposed: false, dispose() {
    unsubscribeRegistry()
    for (const unsubscribe of subscriptions.values()) unsubscribe()
    subscriptions.clear(); listeners.clear()
  } })
  const connect = (id: string): Promise<void> => {
    if (!connections.getSnapshot().some(item => item.id === id)) return Promise.reject(Error(`Agent connection unavailable: ${id}`))
    if (clients.has(id)) return Promise.resolve()
    const pending = inFlight.get(id)
    if (pending) return pending
    publish({ connectingId: id, error: undefined })
    const task = connections.connect(id).then(client => {
      lifetime.add(client)
      clients.set(id, client)
      subscriptions.set(id, client.subscribe(() => { if (state.selectedConnectionId === id) publish() }))
      publish({ connectingId: undefined })
    }).catch(error => {
      publish({ connectingId: undefined, error: String(error) })
      throw error
    }).finally(() => { inFlight.delete(id) })
    inFlight.set(id, task)
    return task
  }
  const selected = (): AgentClient => {
    const client = clients.get(state.selectedConnectionId ?? '')
    if (!client || client.isDisposed) throw Error('No connected Agent selected')
    return client
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async selectConnection(id) {
      if (!connections.getSnapshot().some(item => item.id === id)) throw Error(`Agent connection unavailable: ${id}`)
      publish({ selectedConnectionId: id, error: undefined })
      await connect(id)
      publish()
    },
    async reconnect(id) {
      if (inFlight.has(id)) await inFlight.get(id)
      subscriptions.get(id)?.(); subscriptions.delete(id)
      clients.get(id)?.dispose(); clients.delete(id)
      publish({ selectedConnectionId: id })
      await connect(id)
      publish()
    },
    refreshSessions: () => selected().refreshSessions(),
    async newSession() { await selected().newSession() },
    openSession: id => selected().openSession(id),
    send: text => {
      const client = selected(), sessionId = client.getSnapshot().selectedSessionId
      if (!sessionId) throw Error('No Agent session selected')
      return client.send(sessionId, text)
    },
    stop: runId => {
      const client = selected(), run = client.getSnapshot().runs[runId]
      if (!run) throw Error('Agent run unavailable')
      return client.stop(run.sessionId, runId)
    },
    respond: (id, answer) => selected().respond(id, answer),
    setOption: (id, value) => selected().setOption(id, value),
  }
}
