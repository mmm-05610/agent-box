import type { ResourceScope } from '@ordessa/extension-api'
import { hasAwaitingInteraction, hasOpenRun, type AgentConnectionWorkspace, type AgentConnections } from '@extensions/ordessa.agent-contracts/contract.js'
import type { AgentClient, AgentSnapshot, AgentWorkspaceSnapshot } from '@extensions/ordessa.agent-contracts/contract.js'

/** The registry-facing surface the workspace needs; satisfied by the connections service. */
type ConnectorRegistry = Pick<AgentConnections, 'getSnapshot' | 'subscribe' | 'connect'>

/** Connection workspace: client holding, selection, and reconnection — extracted from the
 * former sessions model (P2-1). Behavior preserved verbatim except the layer-1 switch gate
 * on cross-connector selection (C-0016 Q2): switching connectors is refused while any run
 * is open or any interaction awaits an answer, on any connection. */
export function createConnectionWorkspace(lifetime: ResourceScope, connections: ConnectorRegistry): AgentConnectionWorkspace {
  const clients = new Map<string, AgentClient>()
  const clientSnapshots = new Map<string, AgentSnapshot>()
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
    subscriptions.clear(); clientSnapshots.clear(); listeners.clear()
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
      clientSnapshots.set(id, client.getSnapshot())
      subscriptions.set(id, client.subscribe(() => {
        clientSnapshots.set(id, client.getSnapshot())
        if (state.selectedConnectionId === id) publish()
      }))
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
      if (id !== state.selectedConnectionId) {
        const snapshots = [...clientSnapshots.values()]
        if (hasOpenRun(snapshots) || hasAwaitingInteraction(snapshots))
          throw Error('Agent switching is blocked while a run is open or an approval awaits an answer')
      }
      publish({ selectedConnectionId: id, error: undefined })
      await connect(id)
      publish()
    },
    async reconnect(id) {
      if (!connections.getSnapshot().some(item => item.id === id)) throw Error(`Agent connection unavailable: ${id}`)
      // Reconnect disposes the live client and moves the selection, so it needs the same
      // authority as selectConnection; otherwise a reconnection silently cancels an open run.
      const live = clients.get(id)
      const gated = id !== state.selectedConnectionId ? [...clientSnapshots.values()]
        : live ? [live.getSnapshot()] : []
      if (hasOpenRun(gated) || hasAwaitingInteraction(gated))
        throw Error('Agent reconnect is blocked while a run is open or an approval awaits an answer')
      if (inFlight.has(id)) await inFlight.get(id)
      subscriptions.get(id)?.(); subscriptions.delete(id)
      clients.get(id)?.dispose(); clients.delete(id); clientSnapshots.delete(id)
      publish({ selectedConnectionId: id })
      await connect(id)
      publish()
    },
    selected,
    clientSnapshots: () => [...clientSnapshots.values()],
  }
}
