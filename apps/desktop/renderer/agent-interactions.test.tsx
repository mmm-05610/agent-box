// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'
import { createAgentSessions } from '../../../plugins/agent/sessions/src/model'
import { createCommands } from '../../../plugins/commands/src/entry'
import { createWorkbench } from '../../../plugins/workbench/src/model'
import { WorkbenchShell } from '../../../plugins/workbench/src/shell'
import { InteractionPanel } from '../../../plugins/agent/interactions/src/view'
import type { AgentClient, AgentInteraction, AgentSnapshot, InteractionAnswer } from '../../../contracts/agent-ui/src/contract'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true })
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

const capabilities = { history: 'supported', reasoning: 'unknown', tools: 'unknown', stop: 'supported',
  interactions: 'supported', models: 'unknown', modes: 'unknown' } as const

async function mount(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanup.push(async () => { await act(async () => root.unmount()); container.remove() })
  await act(async () => root.render(element))
  return container
}

/** The `agent` slice is read verbatim from the client snapshot, so both sessions of a card pair are fixture input. */
async function connect(interactions: readonly AgentInteraction[]) {
  let snapshot: AgentSnapshot = {
    connection: { id: 'A', title: 'A', status: 'connected', capabilities },
    sessions: [{ id: 'S1', title: 'Session one' }, { id: 'S2', title: 'Session two' }],
    sessionList: 'ready', messages: {}, runs: {}, interactions, options: [], selectedSessionId: 'S1',
  }
  const listeners = new Set<() => void>()
  const write = (patch: Partial<AgentSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const responds: { id: string; answer: InteractionAnswer }[] = []
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
    async respond(interactionId, answer) { responds.push({ id: interactionId, answer }) },
    async setOption() {},
  }
  const registryScope = new OwnedResources(), sessionScope = new OwnedResources(), connectorScope = new OwnedResources()
  cleanup.push(async () => { sessionScope.dispose(); connectorScope.dispose(); registryScope.dispose() })
  const registry = createAgentConnections(registryScope)
  registry.forScope(connectorScope).add({ id: 'A', title: 'A', connect: async () => client })
  const sessions = createAgentSessions(sessionScope, registry)
  await sessions.selectConnection('A')
  await sessions.openSession('S1')
  return { sessions, write, responds }
}

const cardIds = (container: HTMLElement) => [...container.querySelectorAll('[data-interaction]')].map(card => card.getAttribute('data-interaction'))

it('shows only the selected session’s requests (gate 4)', async () => {
  // The card of session A is terminal on purpose: a pending card can be re-labelled by selection and
  // disconnect paths, so its disappearance could be read as "the filter works" without the filter existing.
  const a: AgentInteraction = { id: 'iA', sessionId: 'S1', kind: 'approval', title: 'Approve the run', state: 'resolved',
    choices: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Decline' }] }
  const b: AgentInteraction = { id: 'iB', sessionId: 'S2', kind: 'approval', title: 'Approve the other run', state: 'pending',
    choices: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Decline' }] }
  const { sessions, write } = await connect([a, b])
  const container = await mount(<InteractionPanel service={sessions} />)
  expect(container.querySelector('[data-interaction=iA]')).not.toBeNull()
  await act(async () => { write({ selectedSessionId: 'S2' }) })
  expect(cardIds(container)).toEqual(['iB'])
  await act(async () => sessions.openSession('S1'))
  expect(cardIds(container)).toEqual(['iA'])
  expect(container.querySelector('[data-interaction=iA]')?.textContent).toContain('Approve the run')
})

it('leaves a answered request in place and never re-sends it (gate 5)', async () => {
  const pending: AgentInteraction = { id: 'iP', sessionId: 'S1', kind: 'approval', title: 'Approve once', state: 'pending',
    choices: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Decline' }] }
  const { sessions, write, responds } = await connect([pending])
  const container = await mount(<InteractionPanel service={sessions} />)
  const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('[data-interaction=iP] button')]
  // Positive control: a pending card really is actionable, so "no buttons later" is not vacuously true.
  expect(buttons().map(button => button.textContent)).toEqual(['Approve', 'Decline'])
  await act(async () => { buttons()[0].click() })
  expect(responds).toEqual([{ id: 'iP', answer: { kind: 'choice', choiceId: 'approve' } }])
  // The connector moves the entry to a terminal state in place; the card stays and becomes inert.
  await act(async () => { write({ interactions: [{ ...pending, state: 'resolved' }] }) })
  expect(cardIds(container)).toEqual(['iP'])
  expect(container.querySelector('[data-interaction=iP] header small')?.textContent).toBe('resolved')
  expect(buttons()).toHaveLength(0)
  await act(async () => {})
  expect(responds).toHaveLength(1)
})

it('collapses the right region without closing the request panel (gate 3)', async () => {
  const { sessions } = await connect([])
  const owner = new OwnedResources()
  cleanup.push(async () => { owner.dispose() })
  const model = createWorkbench(owner), commands = createCommands(owner)
  // The fixture registers the panel itself: the product entry keeps its own region registration out of this gate.
  model.service.forScope(owner).addView({ id: 'agent.interactions', title: 'Requests', presentation: 'region', region: 'right',
    component: () => <InteractionPanel service={sessions} /> })
  model.service.open('agent.interactions')
  const container = await mount(<WorkbenchShell model={model} commands={commands} />)
  const right = () => container.querySelector('[data-region=right]')
  expect(right()?.textContent).toContain('Requests')
  expect(right()?.hasAttribute('inert')).toBe(false)
  await act(async () => model.collapse('right', true))
  expect(right()?.hasAttribute('inert')).toBe(true)
  // Collapse is not close: the selection survives and the portal-mounted instance keeps its content.
  expect(model.getSelection().right).toBe('agent.interactions')
  expect(right()?.textContent).toContain('Requests')
  await act(async () => model.collapse('right', false))
  expect(right()?.hasAttribute('inert')).toBe(false)
})
