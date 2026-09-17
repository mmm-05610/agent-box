// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'

import { WorkStatusLine } from './work-status'

afterEach(cleanup)

const renderLine = (props: { busy: boolean; elapsedSeconds: number; queueCount: number }) =>
  render(
    <I18nProvider localePreference={null}>
      <WorkStatusLine {...props} />
    </I18nProvider>
  )

describe('WorkStatusLine', () => {
  it('renders nothing when idle with no queue', () => {
    const { container } = renderLine({ busy: false, elapsedSeconds: 0, queueCount: 0 })
    expect(container.querySelector('[data-work-status]')).toBeNull()
  })

  it('shows the running state when busy', () => {
    renderLine({ busy: true, elapsedSeconds: 0, queueCount: 0 })
    expect(screen.getByText(/Waiting for/)).toBeTruthy()
  })

  it('shows the queue count when items exist', () => {
    renderLine({ busy: false, elapsedSeconds: 0, queueCount: 3 })
    expect(screen.getByText(/3/)).toBeTruthy()
  })

  it('renders the elapsed time when running', () => {
    renderLine({ busy: true, elapsedSeconds: 249, queueCount: 0 })
    expect(screen.getByText('4:09')).toBeTruthy()
  })

  it('hides the elapsed time when not running', () => {
    renderLine({ busy: false, elapsedSeconds: 0, queueCount: 0 })
    expect(screen.queryByText(/:/)).toBeNull()
  })
})
