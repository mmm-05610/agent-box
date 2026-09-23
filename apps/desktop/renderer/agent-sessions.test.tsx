// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'
import { createAgentSessions } from '../../../plugins/agent/sessions/src/model'
import { SessionBrowser } from '../../../plugins/agent/sessions/src/view'
import type { AgentClient, AgentSnapshot } from '../../../contracts/agent-ui/src/contract'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

/** The sessions view reads the `agent` slice through the thin facade only, so every group,
 *  badge and five-state input below is controlled without touching production code. */
async function openList(initial: Partial<AgentSnapshot> = {}) {
  let snapshot: AgentSnapshot = {
    connection: { id: 'A', title: 'A', status: 'connected', capabilities },
    sessions: [
      { id: 'P1', title: 'Project chat', workspaceId: '/home/u/proj-a' },
      { id: 'P2', title: 'Pinned chat', workspaceId: '/home/u/proj-a/', pinned: true },
      { id: 'S1', title: 'Standalone chat' },
    ],
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
    async newSession() { return 'S2' },
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
  const container = await mount(<SessionBrowser service={sessions} />)
  return { container, sessions, write, snapshot: () => snapshot }
}

const itemButton = (container: Element, title: string) =>
  [...container.querySelectorAll('.agent-session-list button')].find(node => node.querySelector('strong')?.textContent === title)

it('groups sessions by workspace with the standalone group last and pinned first (P2-3 grouping)', async () => {
  const { container } = await openList()
  // Reachability first: the section root and the unconditional list container are in the document.
  expect(container.querySelector('section.agent-sessions')).not.toBeNull()
  expect(container.querySelector('.agent-session-list')).not.toBeNull()
  const groups = [...container.querySelectorAll('.agent-session-group')].map(node => node.textContent)
  expect(groups).toEqual(['proj-a', 'Standalone sessions'])
  // Positive control before any positional claim: all three known items are in the list.
  for (const title of ['Project chat', 'Pinned chat', 'Standalone chat']) expect(itemButton(container, title)).toBeDefined()
  const items = [...container.querySelectorAll('.agent-session-list button strong')].map(node => node.textContent)
  // Pinned leads inside its group; the standalone group renders after all project groups.
  expect(items).toEqual(['Pinned chat', 'Project chat', 'Standalone chat'])
})

it('keeps the flat list shape while no session carries a workspace (single standalone group)', async () => {
  const { container } = await openList({ sessions: [{ id: 'S1', title: 'Only chat' }] })
  expect(itemButton(container, 'Only chat')).toBeDefined()
  // No group headers are inserted for a lone standalone group — the pre-P2-3 shape is preserved.
  expect(container.querySelectorAll('.agent-session-group')).toHaveLength(0)
})

it('badges every session by scanning all its runs and interactions, not only the last run (FC-0015 predicates)', async () => {
  const { container, write } = await openList({
    runs: {
      R1: { id: 'R1', sessionId: 'P1', status: 'completed' },
      R2: { id: 'R2', sessionId: 'P1', status: 'running' },
      R3: { id: 'R3', sessionId: 'S1', status: 'stop-requested' },
    },
    interactions: [
      { id: 'I1', sessionId: 'P2', kind: 'approval', title: 'Approve?', state: 'pending' },
      { id: 'I2', sessionId: 'P2', kind: 'input', title: 'Answer?', state: 'resolved' },
    ],
  })
  // Positive control: three known items rendered before asserting per-item badges.
  expect(container.querySelectorAll('.agent-session-list button')).toHaveLength(3)
  expect(itemButton(container, 'Project chat')?.querySelector('.agent-session-state[data-status=running]')?.textContent).toBe('Running')
  expect(itemButton(container, 'Standalone chat')?.querySelector('.agent-session-state[data-status=running]')?.textContent).toBe('Running')
  expect(itemButton(container, 'Pinned chat')?.querySelector('.agent-session-state[data-status=awaiting]')?.textContent).toBe('Awaiting answer')  // Badge state follows the live snapshot, not the last run only.
  await act(async () => { write({ runs: {
    R1: { id: 'R1', sessionId: 'P1', status: 'running' },
    R2: { id: 'R2', sessionId: 'P1', status: 'completed' },
    R3: { id: 'R3', sessionId: 'S1', status: 'failed' },
  } }) })
  expect(itemButton(container, 'Project chat')?.querySelector('.agent-session-state[data-status=running]')?.textContent).toBe('Running')
  expect(itemButton(container, 'Standalone chat')?.querySelector('.agent-session-state')).toBeNull()
  // Resolved interactions never badge; kind is not consulted.
  await act(async () => { write({ interactions: [{ id: 'I2', sessionId: 'P2', kind: 'input', title: 'Answer?', state: 'resolved' }] }) })
  expect(container.querySelectorAll('.agent-session-state[data-status=awaiting]')).toHaveLength(0)
})

it('renders the five list states with their existing copy (empty is a count, not a null container)', async () => {
  const { container, write } = await openList({ sessions: [] })
  // Empty means: the unconditional container is present with zero item buttons, plus the ready-empty line.
  expect(container.querySelector('.agent-session-list')).not.toBeNull()
  expect(container.querySelectorAll('.agent-session-list button')).toHaveLength(0)
  expect(container.querySelector('p.agent-empty')?.textContent).toBe('No sessions yet. Start one above.')
  await act(async () => { write({ sessionList: 'loading' }) })
  expect(container.querySelector('p[role=status].agent-empty')?.textContent).toBe('Loading sessions…')
  await act(async () => { write({ sessionList: 'partial' }) })
  expect(container.querySelector('p.agent-notice')?.textContent).toBe('Only part of the history is available.')
  await act(async () => { write({ sessionList: 'error' }) })
  const alerts = [...container.querySelectorAll('[role=alert]')]
  expect(alerts.some(node => node.textContent === 'Session list failed. Refresh to try again.')).toBe(true)
})
