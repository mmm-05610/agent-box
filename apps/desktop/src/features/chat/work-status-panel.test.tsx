// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'

import { WorkStatusPanel } from './work-status-panel'
import { $workStatusPanelMode, hydrateWorkStatusPanelMode, setWorkStatusPanelMode } from './work-status-pref'

afterEach(cleanup)

const RUNNING_SINCE = new Date(Date.now() - 249_000).toISOString()

const mount = ({
  execution = null,
  executions = null,
  executionsError = null,
  git = null,
  gitError = null,
  onRefresh,
  queue = []
}: {
  execution?: null | { executionId: string; reason: null | string; since?: string; state: string }
  executions?: null | Record<string, unknown>[]
  executionsError?: null | string
  git?: null | Record<string, unknown>
  gitError?: null | string
  onRefresh?: () => void
  queue?: { itemId: string; message: { text: string }; state: string }[]
}) =>
  render(
    <I18nProvider localePreference={null}>
      <WorkStatusPanel
        execution={execution as never}
        executions={executions as never}
        executionsError={executionsError}
        git={git as never}
        gitError={gitError}
        onRefresh={onRefresh}
        queue={queue as never}
      />
    </I18nProvider>
  )

describe('WorkStatusPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $workStatusPanelMode.set('collapsed')
  })

  it('renders the collapsed single line from real facts: state, queue, duration', () => {
    mount({
      execution: { executionId: 'e1', reason: null, since: RUNNING_SINCE, state: 'running' },
      queue: [{ itemId: 'q1', message: { text: 'Follow up' }, state: 'pending' }]
    })

    const panel = document.querySelector('[data-work-status-panel]')!

    expect(panel.getAttribute('data-work-status-panel-mode')).toBe('collapsed')
    expect(panel.textContent).toContain('Running')
    expect(panel.textContent).toContain('Queue: 1')
    expect(panel.textContent).toMatch(/\d:\d\d/)
  })

  it('renders nothing when there are no facts — no empty shell', () => {
    const { container } = mount({})
    expect(container.querySelector('[data-work-status-panel]')).toBeNull()
    expect(container.querySelector('[data-work-status-reopen]')).toBeNull()
  })

  it('expands into the process card on the line, and collapses again', () => {
    mount({
      execution: { executionId: 'e1', reason: null, since: RUNNING_SINCE, state: 'running' },
      queue: [{ itemId: 'q1', message: { text: 'Follow up' }, state: 'pending' }]
    })

    // collapsed: the queue list is a card fact, not part of the line
    expect(document.querySelector('[data-work-status-cards]')).toBeNull()
    expect(document.querySelector('[data-work-status-queue]')).toBeNull()

    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-work-status-toggle]')!)

    expect(document.querySelector('[data-work-status-cards]')).not.toBeNull()
    expect(document.querySelector('[data-work-status-card="process"]')).not.toBeNull()
    expect(document.querySelector('[data-work-status-queue]')?.textContent).toContain('Follow up')
  })

  it('the close control dismisses the panel and leaves a reopen ghost', () => {
    mount({ execution: { executionId: 'e1', reason: null, since: RUNNING_SINCE, state: 'running' }, queue: [] })

    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-work-status-close]')!)

    expect(document.querySelector('[data-work-status-panel]')).toBeNull()
    expect(document.querySelector('[data-work-status-reopen]')).not.toBeNull()
    expect($workStatusPanelMode.get()).toBe('closed')
    expect(window.localStorage.getItem('agentbox.work-status-panel')).toBe('closed')

    // The user's choice survives a remount (hydrate reads localStorage).
    cleanup()
    mount({})
    expect(document.querySelector('[data-work-status-reopen]')).not.toBeNull()
  })

  it('the reopen ghost restores the collapsed line', () => {
    setWorkStatusPanelMode('closed')
    mount({ execution: { executionId: 'e1', reason: null, since: RUNNING_SINCE, state: 'running' }, queue: [] })

    hydrateWorkStatusPanelMode()
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-work-status-reopen]')!)

    expect(document.querySelector('[data-work-status-panel]')).not.toBeNull()
  })

  it('remembers an expanded choice across remounts', () => {
    setWorkStatusPanelMode('expanded')
    mount({
      execution: { executionId: 'e1', reason: null, since: RUNNING_SINCE, state: 'running' },
      queue: []
    })

    expect(document.querySelector('[data-work-status-cards]')).not.toBeNull()
  })
})

describe('WorkStatusPanel P21 cards (orders 62/64)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $workStatusPanelMode.set('expanded')
  })

  const gitFact = (overrides: Record<string, unknown> = {}) => ({
    additions: null,
    ahead: null,
    behind: null,
    branch: null,
    changedFiles: null,
    deletions: null,
    reason: 'GIT_UNAVAILABLE',
    ...overrides
  })

  const executionFact = (overrides: Record<string, unknown> = {}) => ({
    adapterPid: null,
    adapterPidReason: 'ADAPTER_PID_NOT_REPORTED',
    executionId: 'execution_1',
    harness: 'opaque-alpha',
    pid: null,
    pidReason: 'PID_NOT_REPORTED',
    placement: 'wsl',
    profile: 'Builder',
    profileId: 'profile_1',
    queueItemId: null,
    sessionId: 'session_1',
    startedAt: '2026-09-18T00:00:00.000Z',
    state: 'running',
    turnId: 'turn_1',
    workspace: 'fixture',
    workspaceId: 'workspace_1',
    ...overrides
  })

  it('does not render the git card without a service answer', () => {
    mount({})

    expect(document.querySelector('[data-work-status-panel]')).toBeNull()
    expect(document.querySelector('[data-work-status-card="git"]')).toBeNull()
  })

  it('renders the six git fields and names the reason for each null', () => {
    mount({ git: gitFact({ branch: 'main', changedFiles: 0 }) })

    const card = document.querySelector('[data-work-status-card="git"]')

    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('main')
    expect(card?.textContent).toContain('Not obtainable (GIT_UNAVAILABLE)')
    // A null must never be rendered as a measured zero.
    expect(card?.textContent).not.toContain('Additions0')
  })

  it('renders an execution row with its pid reason instead of a zero', () => {
    mount({ executions: [executionFact()] })

    const card = document.querySelector('[data-work-status-card="executions"]')

    expect(card?.textContent).toContain('Not reported (PID_NOT_REPORTED)')
    expect(card?.textContent).not.toContain('PID: 0')
  })

  it('asks for a re-read when the refresh control is used', () => {
    let refreshed = 0

    mount({ executions: [executionFact()], onRefresh: () => (refreshed += 1) })
    fireEvent.click(document.querySelector<HTMLButtonElement>('[data-work-status-refresh]')!)

    expect(refreshed).toBe(1)
  })
})

describe('WorkStatusPanel P21 read failures (order 64: no silent truncation)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    $workStatusPanelMode.set('expanded')
  })

  it('shows the typed refusal of an over-bound inventory read instead of hiding the card', () => {
    mount({ executionsError: 'INVALID_REQUEST: INVENTORY_LIMIT_EXCEEDED: more than 200 executions are in flight' })

    const card = document.querySelector('[data-work-status-card="executions"]')

    expect(card).not.toBeNull()
    expect(document.querySelector('[data-work-status-executions-error]')?.textContent).toContain('INVENTORY_LIMIT_EXCEEDED')
  })

  it('says why the Git read failed rather than drawing six empty fields', () => {
    mount({ gitError: 'UNAVAILABLE: Pacthold service is unavailable' })

    expect(document.querySelector('[data-work-status-git-error]')?.textContent).toContain('UNAVAILABLE')
    expect(document.querySelector('[data-work-status-card="git"] dl')).toBeNull()
  })
})
