import { expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../extensions/agent-connections/src/entry'
import { createAgentSessions } from '../../../extensions/agent-sessions/src/model'
import type { AgentClient, AgentSnapshot } from '../../../packages/agent-ui-contracts/src/contract'

function client(id: string) {
  let snapshot: AgentSnapshot = { connection: { id, title: id, status: 'connected', capabilities: {
    history: 'supported', reasoning: 'unknown', tools: 'unknown', stop: 'supported', interactions: 'unknown', models: 'unknown', modes: 'unknown',
  } }, sessions: [], sessionList: 'ready', messages: {}, runs: {}, interactions: [], options: [] }
  let disposed = false
  const calls: string[] = [], listeners = new Set<() => void>()
  const value: AgentClient = {
    get isDisposed() { return disposed }, dispose() { disposed = true; listeners.clear() },
    getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refreshSessions() { calls.push('refresh') },
    async newSession() { calls.push('new'); return 'S' },
    async openSession(session) { calls.push(`open:${session}`); snapshot = { ...snapshot, selectedSessionId: session }; listeners.forEach(fn => fn()) },
    async send(session, text) { calls.push(`send:${session}:${text}`) },
    async stop(session, run) { calls.push(`stop:${session}:${run}`) },
    async respond() { calls.push('respond') }, async setOption() { calls.push('option') },
  }
  return { value, calls }
}

it('keeps separate clients alive on selection changes and disposes them with the service scope', async () => {
  const registryScope = new OwnedResources(), sessionScope = new OwnedResources()
  const aScope = new OwnedResources(), bScope = new OwnedResources()
  const registry = createAgentConnections(registryScope)
  const a = client('A'), b = client('B')
  registry.forScope(aScope).add({ id: 'A', title: 'A', connect: async () => a.value })
  registry.forScope(bScope).add({ id: 'B', title: 'B', connect: async () => b.value })
  const sessions = createAgentSessions(sessionScope, registry)
  await sessions.selectConnection('A'); await sessions.openSession('one')
  await sessions.selectConnection('B'); await sessions.openSession('two')
  expect(a.value.isDisposed).toBe(false)
  expect(a.calls).toEqual(['open:one'])
  await sessions.selectConnection('A'); await sessions.send('hello')
  expect(a.calls).toEqual(['open:one', 'send:one:hello'])
  expect(sessions.getSnapshot().agent?.selectedSessionId).toBe('one')
  sessionScope.dispose()
  expect(a.value.isDisposed).toBe(true)
  expect(b.value.isDisposed).toBe(true)
  aScope.dispose(); bScope.dispose(); registryScope.dispose()
})
