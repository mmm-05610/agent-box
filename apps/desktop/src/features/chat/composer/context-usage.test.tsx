// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ContextUsagePill } from './context-usage'

afterEach(cleanup)

// The backend declares no usage fact today, so the only honest rendering
// without data is "unknown". These tests lock that in: no number, no percent,
// no estimate derived from anything local — while a real service-supplied
// value still renders when the backend contract lands.
describe('ContextUsagePill', () => {
  it('reads unknown without data and never renders a number', () => {
    const { container } = render(<ContextUsagePill percent={null} />)

    const pill = container.querySelector('[data-slot="composer-context-usage"]')

    expect(pill?.getAttribute('data-context-usage')).toBe('unknown')
    expect(pill?.textContent).toContain('Unknown')
    expect(container.textContent).not.toMatch(/\d/)
    expect(container.textContent).not.toContain('%')
  })

  it('renders an exact service-supplied percentage and nothing else', () => {
    const { container } = render(<ContextUsagePill percent={42} />)

    expect(container.querySelector('[data-context-usage="known"]')).toBeTruthy()
    expect(screen.getByLabelText('Context usage: 42%')).toBeTruthy()
    expect(container.textContent).toContain('42%')
  })

  it('treats non-finite input as no data, not as zero', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const { container } = render(<ContextUsagePill percent={bad} />)

      expect(container.querySelector('[data-context-usage="unknown"]')).toBeTruthy()
      expect(container.textContent).not.toMatch(/\d/)

      cleanup()
    }
  })
})
