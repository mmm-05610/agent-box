// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkStatusPanel } from './work-status-panel'

afterEach(cleanup)

describe('WorkStatusPanel', () => {
  it('renders collapsed single line with running state and timer', () => {
    render(<WorkStatusPanel busy elapsedSeconds={249} queueCount={2} />)

    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('4:09')).toBeTruthy()
    expect(screen.getByText(/Queue: 2/)).toBeTruthy()
  })

  it('hides everything when idle with no queue', () => {
    const { container } = render(<WorkStatusPanel busy={false} elapsedSeconds={0} queueCount={0} />)
    expect(container.querySelector('[data-work-status-panel]')).toBeNull()
  })

  it('expands to show details when clicked', () => {
    render(<WorkStatusPanel busy elapsedSeconds={249} queueCount={2} />)

    fireEvent.click(screen.getByText('Running'))

    expect(screen.getByText(/Details expand here/)).toBeTruthy()
  })

  it('collapses back when clicked again', () => {
    render(<WorkStatusPanel busy elapsedSeconds={249} queueCount={2} />)

    fireEvent.click(screen.getByText('Running'))
    expect(screen.getByText(/Details expand here/)).toBeTruthy()

    fireEvent.click(screen.getByText('Running'))
    expect(screen.queryByText(/Details expand here/)).toBeNull()
  })
})
