// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'
import { createAgentSessions } from '../../../plugins/agent/sessions/src/model'
import { Conversation } from '../../../plugins/agent/conversation/src/view'
import type { AgentClient, AgentSnapshot } from '../../../contracts/agent-ui/src/contract'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no geometry; assistant-ui reads resize and scroll on mount.
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

const capabilities = { history: 'supported', reasoning: 'unknown', tools: 'unknown', stop: 'supported',
  interactions: 'unknown', models: 'unknown', modes: 'unknown' } as const

async function mount(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanup.push(async () => { await act(async () => root.unmount()); container.remove() })
  await act(async () => root.render(element))
  return container
}

/** The whole `agent` slice is read verbatim from the client snapshot (plugins/agent/sessions/src/model.ts),
 *  so every gate input below is controlled without adding any mechanism to production code. */
async function openConversation(initial: Partial<AgentSnapshot> = {}) {
  let snapshot: AgentSnapshot = {
    connection: { id: 'A', title: 'A', status: 'disconnected', capabilities },
    sessions: [{ id: 'S1', title: 'Session one' }, { id: 'S2', title: 'Session two' }],
    sessionList: 'ready', messages: {}, runs: {}, interactions: [], options: [], ...initial,
  }
  const listeners = new Set<() => void>()
  const write = (patch: Partial<AgentSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const client: AgentClient = {
    get isDisposed() { return false },
    dispose() { listeners.clear() },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refreshSessions() {},
    async newSession() { return 'S3' },
    async openSession(id) { write({ selectedSessionId: id }) },
    async send() {},
    async stop() {},
    async respond() {},
    async setOption() {},
  }
  const registryScope = new OwnedResources(), sessionScope = new OwnedResources(), connectorScope = new OwnedResources()
  cleanup.push(async () => { sessionScope.dispose(); connectorScope.dispose(); registryScope.dispose() })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add({ id: 'A', title: 'A', connect: async () => client })
  const sessions = createAgentSessions(sessionScope, registry)
  await sessions.selectConnection('A')
  await sessions.openSession('S1')
  const container = await mount(<Conversation service={sessions} />)
  return { container, sessions, write, snapshot: () => snapshot }
}

it('keeps an unknown run outcome distinct from a failure (gate 1)', async () => {
  const { container, write } = await openConversation({ runs: { R1: { id: 'R1', sessionId: 'S1', status: 'unknown' } } })
  const badge = container.querySelector('.agent-run-state')
  expect(badge?.getAttribute('data-status')).toBe('unknown')
  expect(badge?.textContent).toBe('unknown')
  // The disconnect notice and the "unknown outcome" notice are different elements with different roles.
  const notices = [...container.querySelectorAll('p[role=status].agent-notice')].map(node => node.textContent)
  expect(notices).toContain('Run outcome unknown after disconnect.')
  expect(container.querySelector('[data-status=failed]')).toBeNull()
  // Only rendered text may read as a failure: the stylesheet legitimately names a failed tool state.
  const section = container.querySelector('section.agent-conversation')!
  expect([...section.childNodes].filter(node => node.nodeName !== 'STYLE').map(node => node.textContent).join('')).not.toContain('failed')
  // A disconnected connection always renders the loss alert, so alert presence is asserted by its text, not by role count.
  await act(async () => { write({ connection: { id: 'A', title: 'A', status: 'connected', capabilities } }) })
  expect(container.querySelector('[role=alert].agent-error')).toBeNull()
  expect(container.querySelector('.agent-run-state')?.getAttribute('data-status')).toBe('unknown')
  await act(async () => { write({ connection: { id: 'A', title: 'A', status: 'error', error: 'socket closed', capabilities } }) })
  const alerts = [...container.querySelectorAll('[role=alert]')]
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent).toContain('The result of an active run is unknown.')
})

it('renders no model entry in the conversation while other options survive (gate 2)', async () => {
  const modelOption = { id: 'model', title: 'Model for next turn', value: 'gpt-5.6-luna', availability: 'supported' as const,
    values: [{ id: 'gpt-5.6-luna', title: 'Luna' }, { id: 'other', title: 'Other' }] }
  const probeOption = { id: 'probe', title: 'Response style', value: 'brief', availability: 'supported' as const,
    values: [{ id: 'brief', title: 'Brief' }] }
  const { container, snapshot } = await openConversation({ options: [modelOption, probeOption] })
  // Reachability first: the thread renders only after connection, agent snapshot and session selection are all present.
  expect(container.querySelector('section.agent-conversation .agent-thread')).not.toBeNull()
  // Counting happens inside the conversation section, never inside .agent-thread (its sibling holds the options).
  const section = container.querySelector('section.agent-conversation')!
  const selects = [...section.querySelectorAll('select')]
  expect(selects).toHaveLength(1)
  expect(selects[0].closest('label')?.textContent).toContain('Response style')
  expect(section.textContent).not.toContain('Model for next turn')
  // The suppression is UI-only: the contract still carries the model option.
  expect(snapshot().options.map(option => option.id)).toContain('model')
})

it('hides thinking and effort alongside the model while a supported option survives (gate 3)', async () => {
  const option = (id: string, title: string) => ({ id, title, value: 'a', availability: 'supported' as const, values: [{ id: 'a', title: 'A' }] })
  const { container } = await openConversation({ options: [option('model', 'Model'), option('thinking', 'Thinking budget'),
    option('effort', 'Reasoning effort'), option('style', 'Response style')] })
  const section = container.querySelector('section.agent-conversation')!
  const selects = [...section.querySelectorAll('select')]
  expect(selects).toHaveLength(1)
  // Positive control in the same render: an unrelated supported option really does reach this surface.
  expect(selects[0].closest('label')?.textContent).toContain('Response style')
  for (const hidden of ['Model', 'Thinking budget', 'Reasoning effort']) expect(section.textContent).not.toContain(hidden)
})

it('labels each tool outcome with the state the connector reported (gate 4)', async () => {
  const tool = (id: string, status: 'running' | 'completed' | 'failed' | 'unknown', result?: string) => ({ id, name: `tool-${id}`, arguments: { path: id }, result, status })
  const message = { id: 'm1', role: 'assistant' as const, text: 'Working', status: 'running' as const,
    tools: [tool('t1', 'running'), tool('t2', 'completed', 'ok'), tool('t3', 'failed', 'denied'), tool('t4', 'unknown')] }
  const { container } = await openConversation({ messages: { S1: [message] } })
  const states = [...container.querySelectorAll('.agent-tool')].map(node => node.getAttribute('data-tool-state'))
  expect(states).toEqual(['running', 'completed', 'failed', 'unknown'])
  // A tool whose outcome is unknown must not read as still running, and a failed one must not read as a result.
  const summaries = [...container.querySelectorAll('.agent-tool summary')].map(node => node.textContent)
  expect(summaries).toEqual(['tool-t1 · Running', 'tool-t2 · Result', 'tool-t3 · Failed', 'tool-t4 · Outcome unknown'])
  expect(container.querySelector('.agent-tool[data-tool-state=unknown] pre')?.textContent).toContain('"path": "t4"')
})

/** Draft-mode harness: the same F2 facade and registry, with a project-capable fake client whose
 *  createAndSend answers however the individual gate needs. */
type Create = (workspaceId: string, text: string, requestId: string) => Promise<{ sessionId: string }>
async function openDraft(initial: Partial<AgentSnapshot> = {}, create?: Create) {
  let snapshot: AgentSnapshot = {
    connection: { id: 'A', title: 'A', status: 'connected', capabilities: { ...capabilities, workspaces: 'supported' } },
    sessions: [{ id: 'S1', title: 'Session one' }],
    sessionList: 'ready', messages: {}, runs: {}, interactions: [], options: [],
    workspaces: { state: 'ready', items: [{ id: 'W1', normalizedPath: '/srv/project' }] }, ...initial,
  }
  const calls = { newSession: 0, create: [] as { workspaceId: string; text: string; requestId: string }[], send: [] as string[] }
  const listeners = new Set<() => void>()
  const write = (patch: Partial<AgentSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const client: AgentClient = {
    get isDisposed() { return false },
    dispose() { listeners.clear() },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refreshSessions() {},
    async newSession() { calls.newSession++; throw Error('the draft surface must not create a backend session') },
    async openSession(id) { write({ selectedSessionId: id }) },
    async send(_sessionId, text) { calls.send.push(text) },
    async stop() {},
    async respond() {},
    async setOption() {},
    async refreshWorkspaces() {},
    async openWorkspace(id) {
      write({ workspaces: { ...snapshot.workspaces!, selectedWorkspaceId: id } })
      return { id, normalizedPath: '/srv/project' }
    },
    createAndSend: async (workspaceId, text, requestId) => {
      calls.create.push({ workspaceId, text, requestId })
      if (create) return create(workspaceId, text, requestId)
      // Default: the Server accepts and the snapshot confirms the real id, selected and bound to the project.
      write({ sessions: [...snapshot.sessions, { id: 'S9', title: 'Draft run', workspaceId: 'W1' }], selectedSessionId: 'S9' })
      return { sessionId: 'S9' }
    },
  }
  const registryScope = new OwnedResources(), sessionScope = new OwnedResources(), connectorScope = new OwnedResources()
  cleanup.push(async () => { sessionScope.dispose(); connectorScope.dispose(); registryScope.dispose() })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add({ id: 'A', title: 'A', connect: async () => client })
  const sessions = createAgentSessions(sessionScope, registry)
  await sessions.selectConnection('A')
  const container = await mount(<Conversation service={sessions} />)
  const field = () => container.querySelector<HTMLTextAreaElement>('textarea[aria-label=Message]')!.value
  const typeText = async (value: string) => {
    await act(async () => {
      const input = container.querySelector('textarea[aria-label=Message]')!
      // React tracks the node's value, so only the native setter makes the change look user-made.
      const nativeValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
      nativeValue.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const clickSend = async () => { await act(async () => { container.querySelector<HTMLButtonElement>('.agent-compose button[type=submit]')!.click() }) }
  return { container, sessions, write, calls, field, typeText, clickSend }
}

it('opens a readable draft without touching the client, and blocks send until a project is valid (gate 5)', async () => {
  const { container, sessions, calls, typeText, clickSend, field } = await openDraft()
  // Negative control for reachability: no session and no draft is still the "choose a session" placeholder.
  expect(container.querySelector('section.agent-conversation')).toBeNull()
  expect(container.textContent).toContain('Choose a session')
  await act(async () => { sessions.startDraft?.() })
  expect(container.querySelector('section.agent-conversation')).not.toBeNull()
  expect(container.querySelector('textarea[aria-label=Message]')).not.toBeNull()
  expect(container.textContent).toContain('Nothing has been sent yet')
  expect(calls.newSession).toBe(0)
  expect(calls.create).toEqual([])
  // No project revalidated: the composer says why and points at Sessions, and a click reaches nothing.
  const block = container.querySelector('p[role=status].agent-compose-block')
  expect(block?.textContent).toContain('No project is selected')
  expect(block?.textContent).toContain('Sessions')
  await typeText('summarise the failing test')
  expect(container.querySelector<HTMLButtonElement>('.agent-compose button[type=submit]')!.disabled).toBe(true)
  await clickSend()
  expect(calls.create).toEqual([])
  expect(field()).toBe('summarise the failing test')
})

it('sends a draft once through createAndSend and clears only on snapshot confirmation (gate 6)', async () => {
  const { container, sessions, calls, typeText, clickSend, field } = await openDraft()
  await act(async () => { sessions.startDraft?.() })
  await act(async () => { await sessions.selectWorkspace?.('W1') })
  expect(container.querySelector('p.agent-compose-block')).toBeNull()
  await typeText('start the run')
  expect(container.querySelector<HTMLButtonElement>('.agent-compose button[type=submit]')!.disabled).toBe(false)
  await clickSend()
  expect(calls.create).toEqual([{ workspaceId: 'W1', text: 'start the run', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }])
  expect(field()).toBe('')
  // The draft hands over to the confirmed real session instead of staying an unsent form.
  expect(container.querySelector('.agent-conversation-head h2')?.textContent).toBe('Draft run')
})

it('keeps the rejected text verbatim and resends only on an explicit second press (gate 7)', async () => {
  const { container, sessions, calls, typeText, clickSend, field } = await openDraft({}, async () => { throw Error('server refused') })
  await act(async () => { sessions.startDraft?.() })
  await act(async () => { await sessions.selectWorkspace?.('W1') })
  await typeText('refactor the parser\nsecond line')
  await clickSend()
  expect(container.querySelector('[role=alert].agent-error')?.textContent).toContain('server refused')
  expect(field()).toBe('refactor the parser\nsecond line')
  expect(calls.create).toHaveLength(1)
  // No auto-retry: the second attempt exists only because the user pressed Send again, and it reuses the id.
  await clickSend()
  expect(calls.create).toHaveLength(2)
  expect(calls.create[1].text).toBe('refactor the parser\nsecond line')
  expect(calls.create[1].requestId).toBe(calls.create[0].requestId)
})

it('continues an existing session under its own project while the draft gate is closed (gate 8)', async () => {
  const { sessions, calls, typeText, clickSend, container } = await openDraft({ selectedSessionId: 'S1' })
  await typeText('follow up on this run')
  await clickSend()
  expect(calls.send).toEqual(['follow up on this run'])
  expect(calls.create).toEqual([])
  expect(container.querySelector('p.agent-compose-block')).toBeNull()
  expect(container.querySelector('.agent-conversation-head small')?.textContent).toBe('SESSION')
  // The draft gate stays closed underneath: the follow-up is not silently unlocking a first send.
  expect(sessions.getSnapshot().draft?.canSend).toBe(false)
})
