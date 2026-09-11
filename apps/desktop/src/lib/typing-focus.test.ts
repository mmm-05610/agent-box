import { describe, expect, it, vi } from 'vitest'

import { onReleaseTypingFocus, releaseTypingFocus } from './typing-focus'

describe('releaseTypingFocus', () => {
  it('notifies subscribers, and stops once unsubscribed', () => {
    const handler = vi.fn()
    const off = onReleaseTypingFocus(handler)

    releaseTypingFocus()
    expect(handler).toHaveBeenCalledTimes(1)

    off()
    releaseTypingFocus()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
