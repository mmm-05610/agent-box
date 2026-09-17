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
  queue = []
}: {
  execution?: null | { executionId: string; reason: null | string; since?: string; state: string }
  queue?: { itemId: string; message: { text: string }; state: string }[]
}) =>
  render(
    <I18nProvider localePreference={null}>
      <WorkStatusPanel
        execution={execution as never}
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
