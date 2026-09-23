import { expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'

it('lets independent adapters register and releases each with its own scope', async () => {
  const serviceScope = new OwnedResources()
  const a = new OwnedResources(), b = new OwnedResources()
  const service = createAgentConnections(serviceScope)
  let changes = 0
  const unsubscribe = service.subscribe(() => { changes++ })
  service.forScope(a).add({ id: 'codex', title: 'Codex', connect: async () => { throw Error('offline') } })
  service.forScope(b).add({ id: 'pi', title: 'Pi', connect: async () => { throw Error('offline') } })
  expect(service.getSnapshot().map(item => item.id)).toEqual(['codex', 'pi'])
  expect(service.getSnapshot()).toBe(service.getSnapshot())
  a.dispose()
  expect(service.getSnapshot().map(item => item.id)).toEqual(['pi'])
  await expect(service.connect('codex')).rejects.toThrow('unavailable')
  expect(changes).toBe(3)
  unsubscribe()
  b.dispose()
  serviceScope.dispose()
  expect(service.getSnapshot()).toEqual([])
  expect(() => service.forScope(b).add({ id: 'late', title: 'Late', connect: async () => { throw Error() } })).toThrow('closed')
})

import { hasAwaitingInteraction, hasOpenRun } from '../../../contracts/connections/src/connections'
import { createAgentSessions } from '../../../plugins/agent/sessions/src/model'
import type { AgentClient, AgentSnapshot } from '../../../contracts/agent-ui/src/contract'

function snapshotWith(overrides: Partial<AgentSnapshot>): AgentSnapshot {
  return { connection: { id: 'A', title: 'A', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown',
  } }, sessions: [], sessionList: 'ready', messages: {}, runs: {}, interactions: [], options: [], ...overrides }
}

it('gate predicates match run/interaction state only, across every connection', () => {
  expect(hasOpenRun([])).toBe(false)
  expect(hasOpenRun([snapshotWith({})])).toBe(false)
  for (const status of ['starting', 'running', 'stop-requested'] as const)
    expect(hasOpenRun([snapshotWith({ runs: { r: { id: 'r', sessionId: 's', status } } })])).toBe(true)
  for (const status of ['completed', 'cancelled', 'failed', 'unknown'] as const)
    expect(hasOpenRun([snapshotWith({ runs: { r: { id: 'r', sessionId: 's', status } } })])).toBe(false)
  expect(hasAwaitingInteraction([])).toBe(false)
  for (const state of ['pending', 'responding'] as const)
    expect(hasAwaitingInteraction([snapshotWith({ interactions: [{ id: 'i', sessionId: 's', kind: 'approval', title: 't', state }] })])).toBe(true)
  for (const state of ['resolved', 'expired', 'unknown'] as const)
    expect(hasAwaitingInteraction([snapshotWith({ interactions: [{ id: 'i', sessionId: 's', kind: 'approval', title: 't', state }] })])).toBe(false)
})

/** Reactive mock: workspace clientSnapshots track it only through its subscribe channel. */
function liveClient(id: string, initial: AgentSnapshot) {
  const box = { current: initial }
  const listeners = new Set<() => void>()
  const value: AgentClient = {
    isDisposed: false, dispose() { listeners.clear() },
    getSnapshot: () => box.current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    refreshSessions: async () => {}, newSession: async () => 's', openSession: async () => {},
    send: async () => {}, stop: async () => {}, respond: async () => {}, setOption: async () => {},
  }
  return { value, set(next: AgentSnapshot) { box.current = next; listeners.forEach(fn => fn()) } }
}

it('blocks cross-connector switching while a run is open or an approval awaits, and re-opens when cleared', async () => {
  const registryScope = new OwnedResources(), facadeScope = new OwnedResources(), connectorScope = new OwnedResources()
  const base = { sessions: [] as never, sessionList: 'ready' as const, messages: {} as never, options: [] as never }
  const codex = liveClient('codex', { connection: { id: 'codex', title: 'Codex', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: {}, interactions: [] })
  const pi = liveClient('pi', { connection: { id: 'pi', title: 'Pi', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: {}, interactions: [] })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add({ id: 'codex', title: 'Codex', connect: async () => codex.value })
  registry.forScope(connectorScope).add({ id: 'pi', title: 'Pi', connect: async () => pi.value })
  const sessions = createAgentSessions(facadeScope, registry)
  await sessions.selectConnection('codex')
  codex.set({ ...codex.value.getSnapshot(), runs: { t: { id: 't', sessionId: 's', status: 'running', stoppable: true } } })
  await expect(sessions.selectConnection('pi')).rejects.toThrow('blocked while a run is open')
  // A same-connector reselect is not a harness switch and stays available.
  await sessions.selectConnection('codex')
  // Clearing the run re-opens the switch.
  codex.set({ ...codex.value.getSnapshot(), runs: {} })
  await sessions.selectConnection('pi')
  expect(sessions.getSnapshot().selectedConnectionId).toBe('pi')
  // An awaiting approval on any connection gates again.
  pi.set({ ...pi.value.getSnapshot(), interactions: [{ id: 'i', sessionId: 's', kind: 'approval', title: 'Approve', state: 'pending' }] })
  await expect(sessions.selectConnection('codex')).rejects.toThrow('approval awaits')
  registryScope.dispose(); facadeScope.dispose(); connectorScope.dispose()
})

it('gates reconnect with the same authority as switching and restores it once live work clears', async () => {
  const registryScope = new OwnedResources(), facadeScope = new OwnedResources(), connectorScope = new OwnedResources()
  const base = { sessions: [] as never, sessionList: 'ready' as const, messages: {} as never, options: [] as never }
  const codex = liveClient('codex', { connection: { id: 'codex', title: 'Codex', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: {}, interactions: [] })
  const pi = liveClient('pi', { connection: { id: 'pi', title: 'Pi', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: {}, interactions: [] })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add({ id: 'codex', title: 'Codex', connect: async () => codex.value })
  registry.forScope(connectorScope).add({ id: 'pi', title: 'Pi', connect: async () => pi.value })
  const sessions = createAgentSessions(facadeScope, registry)
  await sessions.selectConnection('codex')
  // The selected connection's own open run blocks its reconnect, without cancelling the run.
  codex.set({ ...codex.value.getSnapshot(), runs: { t: { id: 't', sessionId: 's', status: 'running', stoppable: true } } })
  await expect(sessions.reconnect('codex')).rejects.toThrow('reconnect is blocked')
  expect(sessions.getSnapshot().selectedConnectionId).toBe('codex')
  expect(Object.keys(sessions.getSnapshot().agent?.runs ?? {})).toEqual(['t'])
  // A reconnect that would move the selection is gated by live work on any connection.
  pi.set({ ...pi.value.getSnapshot(), interactions: [{ id: 'i', sessionId: 's', kind: 'approval', title: 'Approve', state: 'pending' }] })
  await expect(sessions.reconnect('pi')).rejects.toThrow('reconnect is blocked')
  expect(sessions.getSnapshot().selectedConnectionId).toBe('codex')
  // Clearing live work restores the recovery path, and the reconnected client stays reactive.
  codex.set({ ...codex.value.getSnapshot(), runs: {} })
  pi.set({ ...pi.value.getSnapshot(), interactions: [] })
  await sessions.reconnect('pi')
  expect(sessions.getSnapshot().selectedConnectionId).toBe('pi')
  pi.set({ ...pi.value.getSnapshot(), runs: { u: { id: 'u', sessionId: 's', status: 'running', stoppable: true } } })
  expect(sessions.getSnapshot().agent?.runs.u?.status).toBe('running')
  // Reconnecting an unregistered id cannot leave the selection pointing at nothing.
  await expect(sessions.reconnect('stale')).rejects.toThrow('unavailable')
  expect(sessions.getSnapshot().selectedConnectionId).toBe('pi')
  registryScope.dispose(); facadeScope.dispose(); connectorScope.dispose()
})

/** Connector whose handshake is held by the test, so a connection can be mid-flight. */
function gatedClient(id: string, initial: AgentSnapshot) {
  const client = liveClient(id, initial)
  let release!: () => void
  const handshake = new Promise<void>(resolve => { release = resolve })
  return { client, connector: { id, title: id, connect: async () => { await handshake; return client.value } },
    settle() { release() } }
}

it('re-evaluates the gate once a held handshake lands, so reconnect cannot cancel a run started during it', async () => {
  const registryScope = new OwnedResources(), facadeScope = new OwnedResources(), connectorScope = new OwnedResources()
  const base = { sessions: [] as never, sessionList: 'ready' as const, messages: {} as never, options: [] as never }
  // The connector answers with a client that already has an open run.
  const pi = gatedClient('pi', { connection: { id: 'pi', title: 'Pi', status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: { t: { id: 't', sessionId: 's', status: 'running', stoppable: true } }, interactions: [] })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add(pi.connector)
  const sessions = createAgentSessions(facadeScope, registry)
  const connecting = sessions.selectConnection('pi')
  // Reconnect starts while the handshake is still held: the client is not in the map yet,
  // so a gate that reads state only once would wave it through and then dispose the run.
  const reconnecting = sessions.reconnect('pi')
  pi.settle()
  await connecting
  await expect(reconnecting).rejects.toThrow('reconnect is blocked')
  // The live run survives the refused reconnect instead of being silently cancelled.
  expect(sessions.getSnapshot().agent?.runs.t?.status).toBe('running')
  registryScope.dispose(); facadeScope.dispose(); connectorScope.dispose()
})

it('leaves the connecting indicator owned by the handshake that is still pending', async () => {
  const registryScope = new OwnedResources(), facadeScope = new OwnedResources(), connectorScope = new OwnedResources()
  const base = { sessions: [] as never, sessionList: 'ready' as const, messages: {} as never, options: [] as never }
  const empty = (id: string) => ({ connection: { id, title: id, status: 'connected', capabilities: {
    history: 'unknown', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown' } },
    ...base, runs: {}, interactions: [] }) as AgentSnapshot
  const codex = gatedClient('codex', empty('codex')), pi = gatedClient('pi', empty('pi'))
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add(codex.connector)
  registry.forScope(connectorScope).add(pi.connector)
  const sessions = createAgentSessions(facadeScope, registry)
  const first = sessions.selectConnection('codex')
  const second = sessions.reconnect('pi')
  // pi is the connection still handshaking and the one currently selected, so a codex
  // handshake landing first must not clear pi's indicator or make pi look idle.
  codex.settle()
  await first
  expect(sessions.getSnapshot().connectingId).toBe('pi')
  pi.settle()
  await second
  expect(sessions.getSnapshot().connectingId).toBeUndefined()
  registryScope.dispose(); facadeScope.dispose(); connectorScope.dispose()
})
