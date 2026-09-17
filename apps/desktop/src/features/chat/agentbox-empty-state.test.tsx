// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { AgentBoxEmptyState } from './agentbox-empty-state'

afterEach(cleanup)

const renderState = (props: Partial<React.ComponentProps<typeof AgentBoxEmptyState>> = {}) =>
  render(
    <I18nProvider localePreference={null}>
      <AgentBoxEmptyState canSend onPick={vi.fn()} {...props} />
    </I18nProvider>
  )

describe('AgentBoxEmptyState', () => {
  it('greets and offers starters that walk the real submit seam', () => {
    const onPick = vi.fn()
    renderState({ onPick })

    expect(screen.getByText('What are we building?')).toBeTruthy()
    const starter = screen.getByRole('button', { name: 'Explain this codebase' })

    fireEvent.click(starter)

    expect(onPick).toHaveBeenCalledWith('Explain this codebase')
  })

  it('offers no starters when a send is impossible, and says why instead', () => {
    const { container } = renderState({ canSend: false })

    expect(container.querySelector('[data-agentbox-empty-chips]')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelector('[data-agentbox-empty-blocked]')?.textContent).toContain('Choose a project')
  })

  it('waits for the service rather than claiming the setup is wrong', () => {
    const { container } = renderState({ canSend: false, waiting: true })

    expect(container.querySelector('[data-agentbox-empty-blocked]')?.textContent).toContain('Waiting for the AgentBox service')
  })

  it('renders only the product brand and its own copy — no legacy surface', () => {
    const { container } = renderState()

    expect(container.querySelector('[data-agentbox-empty-state]')).toBeTruthy()
    // No second composer: the surface offers chips and nothing that takes text.
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
