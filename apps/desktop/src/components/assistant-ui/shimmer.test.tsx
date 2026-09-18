// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Shimmer } from './shimmer'

afterEach(cleanup)

// The copy-in's own contract: one element, the caller's class names, the text.
// The animation itself is the repo's `.shimmer` class (see the file header), so
// a test that asserted keyframes here would be testing the CSS, not the shape.
describe('Shimmer', () => {
  it('renders a paragraph by default and carries the pause-aware shimmer class', () => {
    const { container } = render(<Shimmer>Thinking…</Shimmer>)
    const element = container.firstElementChild

    expect(element?.tagName).toBe('P')
    expect(element?.className).toContain('shimmer')
    expect(element?.textContent).toBe('Thinking…')
  })

  it('renders the element the caller asks for, keeping their class names', () => {
    const { container } = render(
      <Shimmer as="span" className="text-xs">
        Working
      </Shimmer>
    )
    const element = container.firstElementChild

    expect(element?.tagName).toBe('SPAN')
    expect(element?.className).toContain('shimmer')
    expect(element?.className).toContain('text-xs')
  })
})
