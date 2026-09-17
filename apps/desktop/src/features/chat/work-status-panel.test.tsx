// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkStatusPanel } from './work-status-panel'

afterEach(cleanup)

describe('WorkStatusPanel', () => {
  it('renders collapsed line with busy + timer + queue for a running turn', () => {
    const { container } = render(<WorkStatusPanel busy elapsedSeconds={249} queueCount={2} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Running')
    expect(text).toContain('4:09')
    expect(text).toContain('Queue: 2')
    expect(container.querySelector('[data-work-status-panel]')).toBeTruthy()
  })

  it('renders nothing when idle with no queue and no elapsed time', () => {
    const { container } = render(<WorkStatusPanel busy={false} elapsedSeconds={0} queueCount={0} />)
    expect(container.querySelector('[data-work-status-panel]')).toBeNull()
  })

  it('shows pulse dot only when busy', () => {
    const busy = render(<WorkStatusPanel busy elapsedSeconds={0} queueCount={0} />)
    expect(busy.container.querySelector('.animate-pulse')).toBeTruthy()
    cleanup()
    const idle = render(<WorkStatusPanel busy={false} elapsedSeconds={0} queueCount={0} />)
    expect(idle.container.querySelector('.animate-pulse')).toBeNull()
  })
})
