import { describe, expect, it } from 'vitest'

import { createLatestWins } from './latest-wins'

describe('createLatestWins', () => {
  it('keeps the newest turn current and marks earlier turns stale', () => {
    const guard = createLatestWins()
    const first = guard.begin()
    const second = guard.begin()

    expect(guard.isCurrent(second)).toBe(true)
    expect(guard.isCurrent(first)).toBe(false)
  })

  it('rejects results that arrive after a newer turn began', () => {
    // The exact wizard race: listing A is slow, the user navigates to B, and
    // A's response lands last. A must not overwrite B.
    const guard = createLatestWins()
    const turnA = guard.begin()

    const turnB = guard.begin()

    expect(guard.isCurrent(turnA)).toBe(false)
    expect(guard.isCurrent(turnB)).toBe(true)
  })

  it('a re-begun turn is current again', () => {
    const guard = createLatestWins()
    const first = guard.begin()

    guard.begin()
    const third = guard.begin()

    expect(guard.isCurrent(third)).toBe(true)
    expect(guard.isCurrent(first)).toBe(false)
  })
})
