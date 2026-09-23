import { expect, it } from 'vitest'
import { CodexClient } from '../../../plugins/connectors/codex/src/client'
import type { AgentNativeBridge } from './agent-native'

class Bridge implements AgentNativeBridge {
  sent: { instanceId: string; frame: any }[] = []
  closed: string[] = []
  listeners = new Set<(event: { instanceId: string; frame?: unknown }) => void>()
  async open(id: string) { expect(id).toBe('ordessa.agent-codex'); return 'instance-1' }
  async close(id: string) { this.closed.push(id) }
  subscribe(listener: (event: { instanceId: string; frame?: unknown }) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }
  emit(frame: unknown, instanceId = 'instance-1') {
    for (const listener of this.listeners) listener({ instanceId, frame })
  }
  async send(instanceId: string, frame: any) {
    this.sent.push({ instanceId, frame })
    if (frame.id === undefined || !frame.method) return
    const result = frame.method === 'model/list' ? { data: [{ model: 'codex-test', displayName: 'Test model', hidden: false, isDefault: true,
      defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }] }], nextCursor: null }
      : frame.method === 'thread/list' ? { data: [
      { id: 'A', name: 'Alpha', preview: '', updatedAt: 1, cwd: '/tmp' },
      { id: 'B', name: 'Beta', preview: '', updatedAt: 2, cwd: '/tmp' },
    ], nextCursor: null } : frame.method === 'thread/resume' ? { thread: { id: frame.params.threadId, turns: [] } }
      : frame.method === 'thread/start' ? { thread: { id: 'C', turns: [], name: null, preview: '' } }
        : frame.method === 'turn/start' ? { turn: { id: 'run-1' } } : {}
    queueMicrotask(() => this.emit({ id: frame.id, result }))
  }
}

it('uses server history, keeps running state across view switches, and waits for terminal stop confirmation', async () => {
  const bridge = new Bridge(), client = await CodexClient.connect(bridge)
  try {
    expect(bridge.sent.map(item => item.frame.method).slice(0, 2)).toEqual(['initialize', 'initialized'])
    await client.refreshSessions()
    expect(client.getSnapshot().sessions.map(item => item.id)).toEqual(['A', 'B'])
    await client.openSession('A')
    await client.setOption('effort', 'high')
    await client.send('A', 'first')
    expect(bridge.sent.find(item => item.frame.method === 'turn/start')?.frame.params).toMatchObject({ model: 'codex-test', effort: 'high' })
    expect(client.getSnapshot().runs['run-1'].status).toBe('running')
    await client.openSession('B')
    expect(client.getSnapshot().selectedSessionId).toBe('B')
    expect(bridge.sent.some(item => item.frame.method === 'turn/interrupt')).toBe(false)
    bridge.emit({ method: 'item/agentMessage/delta', params: { threadId: 'A', turnId: 'run-1', itemId: 'm-1', delta: 'stream' } })
    expect(client.getSnapshot().messages.A[0].text).toBe('stream')
    expect(client.getSnapshot().messages.B).toEqual([])
    await client.stop('A', 'run-1')
    expect(client.getSnapshot().runs['run-1'].status).toBe('stop-requested')
    bridge.emit({ method: 'turn/completed', params: { threadId: 'A', turn: { id: 'run-1', status: 'interrupted' } } })
    expect(client.getSnapshot().runs['run-1'].status).toBe('cancelled')
    bridge.emit({ method: 'turn/started', params: { threadId: 'A', turn: { id: 'run-1' } } })
    expect(client.getSnapshot().runs['run-1'].status).toBe('cancelled')
  } finally { client.dispose() }
  expect(bridge.closed).toEqual(['instance-1'])
})

it('binds one-shot approvals to the instance and makes disconnect outcome unknown', async () => {
  const bridge = new Bridge(), client = await CodexClient.connect(bridge)
  try {
    bridge.emit({ method: 'turn/started', params: { threadId: 'A', turn: { id: 'run-2' } } })
    bridge.emit({ id: 7, method: 'item/commandExecution/requestApproval', params: {
      threadId: 'A', turnId: 'run-2', command: 'echo safe',
    } }, 'other-instance')
    expect(client.getSnapshot().interactions).toHaveLength(0)
    bridge.emit({ id: 7, method: 'item/commandExecution/requestApproval', params: {
      threadId: 'A', turnId: 'run-2', command: 'echo safe',
    } })
    await expect(client.respond('7', { kind: 'choice', choiceId: 'invented' })).rejects.toThrow('Invalid approval')
    await client.respond('7', { kind: 'choice', choiceId: 'decline' })
    expect(bridge.sent.at(-1)?.frame).toEqual({ id: 7, result: { decision: 'decline' } })
    await expect(client.respond('7', { kind: 'choice', choiceId: 'accept' })).rejects.toThrow('no longer pending')
    bridge.emit({ type: 'exit', code: 1 })
    expect(client.getSnapshot().runs['run-2'].status).toBe('unknown')
    expect(client.getSnapshot().connection.status).toBe('error')
  } finally { client.dispose() }
})
