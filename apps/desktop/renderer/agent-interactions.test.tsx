// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { OwnedResources, type PluginContext, type IDisposable } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'
import { createAgentSessions } from '../../../plugins/agent/sessions/src/model'
import { Conversation } from '../../../plugins/agent/conversation/src/view'
import createInteractionsPlugin from '../../../plugins/agent/interactions/src/entry'
import createConversationPlugin from '../../../plugins/agent/conversation/src/entry'
import type { View, Workbench } from '../../../contracts/foundation/src/contract'
import type { AgentClient, AgentInteraction, AgentSessions, AgentSnapshot, Availability, InteractionAnswer } from '../../../contracts/agent-ui/src/contract'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

const capable = { history: 'supported', reasoning: 'unknown', tools: 'unknown', stop: 'supported',
  interactions: 'supported', models: 'unknown', modes: 'unknown' } as const

async function mount(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  cleanup.push(async () => { await act(async () => root.unmount()); container.remove() })
  await act(async () => root.render(element))
  return container
}

/** The `agent` slice is read verbatim from the client snapshot, so both sessions of a card pair and every
 *  failing response are fixture input: no production branch exists to make a gate pass. */
async function openConversation(interactions: readonly AgentInteraction[], options: { respondError?: string; failAfter?: number; interactions_capability?: Availability } = {}) {
  let snapshot: AgentSnapshot = {
    connection: { id: 'A', title: 'A', status: 'connected', capabilities: { ...capable, interactions: options.interactions_capability ?? capable.interactions } },
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
    async respond(interactionId, answer) {
      responds.push({ id: interactionId, answer })
      if (options.respondError && (!options.failAfter || responds.length > options.failAfter)) throw Error(options.respondError)
    },
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
  return { container, sessions, write, responds }
}

const approval = (id: string, sessionId: string, state: AgentInteraction['state']): AgentInteraction => ({
  id, sessionId, kind: 'approval', title: `Approve ${id}`, state,
  choices: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Decline' }] })
const cardsIn = (scope: Element) => [...scope.querySelectorAll('[data-interaction]')].map(card => card.getAttribute('data-interaction'))
const buttonsIn = (scope: Element) => [...scope.querySelectorAll<HTMLButtonElement>('[data-interaction=iP] button')]

it('shows only the selected session’s requests, inside the conversation (gate 1)', async () => {
  // The S1 card is terminal on purpose: a pending card can be re-labelled by selection paths, so its disappearance
  // alone would not prove the filter rather than the state machine.
  const { container, write, sessions } = await openConversation([approval('iA', 'S1', 'resolved'), approval('iB', 'S2', 'pending')])
  // The thread is keyed by connection and session, so each selection change replaces the section element.
  const thread = () => container.querySelector('section.agent-conversation')!
  expect(cardsIn(thread())).toEqual(['iA'])
  await act(async () => { write({ selectedSessionId: 'S2' }) })
  expect(cardsIn(thread())).toEqual(['iB'])
  await act(async () => { sessions.openSession('S1') })
  expect(cardsIn(thread())).toEqual(['iA'])
  expect(thread().querySelector('[data-interaction=iA]')?.textContent).toContain('Approve iA')
})

it('answers through the connector and surfaces a rejected response (gate 2)', async () => {
  const { container, responds } = await openConversation([approval('iP', 'S1', 'pending')], { respondError: 'the agent no longer accepts this request' })
  const card = container.querySelector('[data-interaction=iP]')!
  expect(card.querySelector('.agent-interaction-error')).toBeNull()
  await act(async () => { buttonsIn(card)[1].click() })
  expect(responds).toEqual([{ id: 'iP', answer: { kind: 'choice', choiceId: 'deny' } }])
  const error = card.querySelector('[role=alert].agent-interaction-error')
  expect(error?.textContent).toContain('the agent no longer accepts this request')
  await act(async () => { buttonsIn(card)[0].click() })
  expect(responds).toHaveLength(2)
})

it('keeps pending, responding and settled requests distinct (gate 3)', async () => {
  const { container, write, responds } = await openConversation([approval('iP', 'S1', 'pending')])
  expect(buttonsIn(container).map(button => button.textContent)).toEqual(['Approve', 'Decline'])
  await act(async () => { buttonsIn(container)[0].click() })
  // The connector reports the in-flight state itself; the card stays, becomes inert and never re-sends.
  await act(async () => { write({ interactions: [{ ...approval('iP', 'S1', 'pending'), state: 'responding' }] }) })
  expect(container.querySelector('[data-interaction=iP] header small')?.textContent).toBe('responding')
  expect(buttonsIn(container)).toHaveLength(0)
  await act(async () => { write({ interactions: [{ ...approval('iP', 'S1', 'pending'), state: 'resolved' }] }) })
  expect(cardsIn(container)).toEqual(['iP'])
  expect(container.querySelector('[data-interaction=iP] header small')?.textContent).toBe('resolved')
  expect(buttonsIn(container)).toHaveLength(0)
  await act(async () => {})
  expect(responds).toHaveLength(1)
})

it('does not offer an answer the connection cannot carry (gate 4)', async () => {
  const blocked = await openConversation([approval('iP', 'S1', 'pending')], { interactions_capability: 'unavailable' })
  expect(blocked.container.querySelector('[data-interaction=iP] button')).toBeNull()
  expect(blocked.container.querySelector('[data-interaction=iP] p[role=status]')?.textContent)
    .toContain('cannot receive a response over the current connection')
  expect(blocked.responds).toHaveLength(0)
  // Positive control: the same pending request is actionable once the connector reports the channel.
  const open = await openConversation([approval('iP', 'S1', 'pending')], { interactions_capability: 'supported' })
  expect(buttonsIn(open.container)).toHaveLength(2)
})

it('registers no right-region view while the conversation still registers its own (gate 5)', async () => {
  const added: View[] = []
  const owned = (): IDisposable => ({ dispose() {}, isDisposed: false })
  const workbench: Workbench = {
    forScope: () => ({ addView: (view: View) => { added.push(view); return owned() }, addUI: () => owned() }),
    open() {}, close() {},
  }
  const scope = new OwnedResources()
  cleanup.push(async () => { scope.dispose() })
  const context: PluginContext = { root: { mount: () => owned() }, resources: scope }
  // Lumino types `activate` as taking only the context, while the host injects each `requires` entry positionally
  // (platform/extension-host/src/runtime.ts); state the call shape the runtime really uses.
  type HostInjected = { activate(...args: unknown[]): unknown }
  const sessions = { subscribe: () => () => {}, getSnapshot: () => null } as unknown as AgentSessions
  ;(createInteractionsPlugin() as unknown as HostInjected).activate(context, workbench, sessions)
  expect(added).toHaveLength(0)
  // Positive control: the same fake workbench does receive the conversation view, so zero is not a stub artefact.
  ;(createConversationPlugin() as unknown as HostInjected).activate(context, workbench, sessions)
  expect(added.map(view => [view.id, view.presentation === 'region' ? view.region : 'full-page'])).toEqual([['agent.conversation', 'main']])
})
