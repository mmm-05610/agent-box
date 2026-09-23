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
  expect(container.textContent).not.toContain('failed')
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
