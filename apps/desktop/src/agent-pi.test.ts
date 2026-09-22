import { expect, it } from 'vitest'
import { PiClient } from '../../../extensions/agent-pi/src/client'
import type { AgentNativeBridge } from './agent-native'

const stateOf = (sessionId: string) => ({ sessionId, sessionFile: `/tmp/${sessionId}.jsonl`,
  model: { provider: 'anthropic', id: 'claude' }, thinkingLevel: 'medium' })

class Bridge implements AgentNativeBridge {
  sent: { instanceId: string; frame: any }[] = []
  closed: string[] = []
  exited = new Set<string>()
  listeners = new Set<(event: { instanceId: string; frame?: unknown; error?: string }) => void>()
  async open(id: string) { expect(id).toBe('ordessa.agent-pi'); return 'instance-1' }
  async close(id: string) { this.closed.push(id) }
  subscribe(listener: (event: { instanceId: string; frame?: unknown; error?: string }) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }
  emit(sessionId: string, event: Record<string, unknown>, instanceId = 'instance-1') {
    if (event.type === 'transport_exit') this.exited.add(sessionId) // Native drops the session process on exit.
    for (const listener of this.listeners) listener({ instanceId, frame: { method: 'pi/event', params: { sessionId, event } } })
  }
  async send(instanceId: string, frame: any) {
    this.sent.push({ instanceId, frame })
    if (this.exited.has(frame.params?.sessionId)) throw Error('Pi session is not open')
    switch (frame.method) {
      case 'list': return [
        { id: 'A', title: 'Alpha', updatedAt: '2026-09-01T00:00:00.000Z', detail: '/tmp' },
        { id: 'B', title: 'Beta', updatedAt: '2026-09-02T00:00:00.000Z', detail: '/tmp' },
      ]
      case 'new': return { sessionId: 'N', state: stateOf('N'), messages: [] }
      case 'open': return { sessionId: frame.params.sessionId, state: stateOf(frame.params.sessionId), messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'done' }] },
      ] }
      case 'models': return [{ provider: 'anthropic', id: 'claude' }, { provider: 'openai', id: 'gpt' }]
      case 'thinking-levels': return ['low', 'medium']
      case 'respond': return {}
      default: return {}
    }
  }
}

it('connects, loads server history and declared session options', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    expect(client.getSnapshot().connection).toMatchObject({ id: 'pi', status: 'connected' })
    await client.refreshSessions()
    expect(client.getSnapshot().sessions.map(item => item.id)).toEqual(['A', 'B'])
    await client.openSession('A')
    expect(bridge.sent.find(item => item.frame.method === 'open')?.frame.params).toEqual({ sessionId: 'A' })
    expect(client.getSnapshot().selectedSessionId).toBe('A')
    expect(client.getSnapshot().messages.A.map(item => [item.role, item.text])).toEqual([['user', 'hi'], ['assistant', 'done']])
    expect(client.getSnapshot().options.map(item => [item.id, item.value])).toEqual([['model', 'anthropic/claude'], ['thinking', 'medium']])
    await client.setOption('model', 'openai/gpt')
    expect(bridge.sent.at(-1)?.frame).toEqual({ method: 'set-model', params: { sessionId: 'A', provider: 'openai', modelId: 'gpt' } })
  } finally { client.dispose() }
  expect(bridge.closed).toEqual(['instance-1'])
})

it('runs sessions in parallel: switching never aborts and events stay routed', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    await client.openSession('A')
    await client.openSession('B')
    await client.send('A', 'one')
    await client.send('B', 'two')
    bridge.emit('A', { type: 'agent_start' })
    bridge.emit('B', { type: 'agent_start' })
    const runA = client.getSnapshot().runs['pi-run-1'], runB = client.getSnapshot().runs['pi-run-2']
    expect(runA).toMatchObject({ sessionId: 'A', status: 'running' })
    expect(runB).toMatchObject({ sessionId: 'B', status: 'running' })
    await client.openSession('A') // Switch selection while both run.
    expect(bridge.sent.some(item => item.frame.method === 'abort')).toBe(false)
    bridge.emit('A', { type: 'message_start', message: { role: 'assistant' } })
    bridge.emit('A', { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'for A ' } })
    bridge.emit('B', { type: 'message_start', message: { role: 'assistant' } })
    bridge.emit('B', { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'for B' } })
    expect(client.getSnapshot().messages.A.at(-1)?.text).toBe('for A ')
    expect(client.getSnapshot().messages.B.at(-1)?.text).toBe('for B')
    await expect(client.send('A', 'second while running')).rejects.toThrow('already running')
  } finally { client.dispose() }
})

it('keeps stop requested distinct from terminal confirmation', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    await client.openSession('A')
    await client.send('A', 'one')
    bridge.emit('A', { type: 'agent_start' })
    await client.stop('A', 'pi-run-1')
    expect(client.getSnapshot().runs['pi-run-1'].status).toBe('stop-requested')
    bridge.emit('A', { type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [] } })
    bridge.emit('A', { type: 'agent_settled' })
    expect(client.getSnapshot().runs['pi-run-1'].status).toBe('cancelled') // Requested stop wins without an aborted marker.
    bridge.emit('A', { type: 'agent_start' }) // Late event must not resurrect the run.
    expect(client.getSnapshot().runs['pi-run-1'].status).toBe('cancelled')
    bridge.emit('A', { type: 'agent_settled' })
    expect(client.getSnapshot().runs['pi-run-1'].status).toBe('cancelled')
  } finally { client.dispose() }
})

it('streams text, reasoning and tools with authoritative message_end', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    await client.openSession('A')
    await client.send('A', 'one')
    bridge.emit('A', { type: 'message_start', message: { role: 'assistant' } })
    bridge.emit('A', { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'pondering' } })
    bridge.emit('A', { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' } })
    bridge.emit('A', { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'world' } })
    const streamed = client.getSnapshot().messages.A.at(-1)!
    expect(streamed).toMatchObject({ text: 'Hello world', reasoning: 'pondering' })
    bridge.emit('A', { type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash', args: { command: 'ls' } })
    bridge.emit('A', { type: 'tool_execution_update', toolCallId: 't1', toolName: 'bash', partialResult: { content: [{ type: 'text', text: 'partial' }] } })
    expect(client.getSnapshot().messages.A.at(-1)?.tools?.[0]).toMatchObject({ id: 't1', status: 'running', result: { content: [{ type: 'text', text: 'partial' }] } })
    bridge.emit('A', { type: 'tool_execution_end', toolCallId: 't1', toolName: 'bash', result: { content: [{ type: 'text', text: 'full' }] }, isError: false })
    expect(client.getSnapshot().messages.A.at(-1)?.tools?.[0]).toMatchObject({ status: 'completed' })
    bridge.emit('A', { type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Hello world' }] } })
    const settled = client.getSnapshot().messages.A.find(item => item.id === streamed.id)!
    expect(settled).toMatchObject({ text: 'Hello world', status: 'completed' })
  } finally { client.dispose() }
})

it('marks disconnect outcome unknown without inventing success or failure', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    await client.openSession('A')
    await client.send('A', 'one')
    bridge.emit('A', { type: 'agent_start' })
    bridge.emit('A', { type: 'extension_ui_request', id: 'r0', method: 'input', title: 'Need text' })
    bridge.emit('A', { type: 'transport_exit' })
    expect(client.getSnapshot().runs['pi-run-1'].status).toBe('unknown')
    expect(client.getSnapshot().interactions[0].state).toBe('unknown')
    expect(client.getSnapshot().connection.status).toBe('connected') // Other session processes are unaffected.
    await expect(client.send('A', 'after exit')).rejects.toThrow('Pi session is not open') // Native no longer has the session open.
  } finally { client.dispose() }
})

it('binds one-shot extension UI answers to instance, session and request', async () => {
  const bridge = new Bridge(), client = await PiClient.connect(bridge)
  try {
    bridge.emit('A', { type: 'extension_ui_request', id: 'r1', method: 'select', title: 'Choose', options: ['Yes', 'No'] }, 'other-instance')
    expect(client.getSnapshot().interactions).toHaveLength(0)
    bridge.emit('A', { type: 'extension_ui_request', id: 'r1', method: 'select', title: 'Choose', options: ['Yes', 'No'] })
    expect(client.getSnapshot().interactions[0]).toMatchObject({ id: 'A:r1', kind: 'choice', state: 'pending' })
    await expect(client.respond('A:r1', { kind: 'choice', choiceId: 'Maybe' })).rejects.toThrow('Invalid Pi interaction answer')
    await client.respond('A:r1', { kind: 'choice', choiceId: 'Yes' })
    expect(bridge.sent.at(-1)?.frame).toEqual({ method: 'respond', params: { sessionId: 'A', requestId: 'r1',
      response: { type: 'extension_ui_response', id: 'r1', value: 'Yes' } } })
    await expect(client.respond('A:r1', { kind: 'choice', choiceId: 'Yes' })).rejects.toThrow('no longer pending')
    bridge.emit('A', { type: 'extension_ui_request', id: 'r2', method: 'confirm', title: 'Sure?' })
    await client.respond('A:r2', { kind: 'confirm', confirmed: false })
    expect(bridge.sent.at(-1)?.frame.params.response).toEqual({ type: 'extension_ui_response', id: 'r2', confirmed: false })
    bridge.emit('A', { type: 'extension_ui_request', id: 'r3', method: 'input', title: 'Text?' })
    bridge.emit('A', { type: 'extension_ui_expired', id: 'r3' })
    expect(client.getSnapshot().interactions.find(item => item.id === 'A:r3')?.state).toBe('expired')
    await expect(client.respond('A:r3', { kind: 'text', value: 'late' })).rejects.toThrow('no longer pending')
    bridge.emit('A', { type: 'extension_ui_request', id: 'r4', method: 'notify', message: 'noted' })
    expect(client.getSnapshot().interactions).toHaveLength(3) // Dialog requests only; notify is not an interaction.
    expect(client.getSnapshot().diagnostic).toBe('noted')
    bridge.emit('A', { type: 'brand_new_event' })
    expect(client.getSnapshot().diagnostic).toBe('Unknown Pi event: brand_new_event')
  } finally { client.dispose() }
})
