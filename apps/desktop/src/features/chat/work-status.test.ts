import { describe, expect, it } from 'vitest'

import { asWireId, type QueueItem } from '@/types/wire/wire-v1'

import {
  formatWorkStatusElapsed,
  workStatusElapsedSeconds,
  workStatusIsBusy,
  workStatusLineParts,
  workStatusPendingQueue,
  workStatusProcessFacts
} from './work-status'

const NOW = Date.parse('2026-09-18T12:00:00Z')

const execution = (state: string, since?: string) => ({ executionId: 'exec-1', reason: null, since, state }) as NonNullable<
  Parameters<typeof workStatusIsBusy>[0]
>

const queueItem = (state: QueueItem['state'], itemId = 'item-1'): QueueItem =>
  ({
    configVersion: 1,
    itemId: asWireId(itemId),
    message: { attachments: [], text: `queued text ${itemId}` },
    profileId: asWireId('profile-1'),
    state,
    submittedAt: '2026-09-18T11:59:00Z',
    version: 1
  })

const labels = {
  queuedCount: (count: number) => `Queue: ${count}`,
  stateLabel: (state: string) => state.toUpperCase()
}

describe('workStatusElapsedSeconds', () => {
  it('measures from the service stamp', () => {
    expect(workStatusElapsedSeconds(execution('running', '2026-09-18T11:59:51Z'), NOW)).toBe(9)
  })

  it('is null when the state has no service stamp and never guessed', () => {
    expect(workStatusElapsedSeconds(execution('running'), NOW)).toBeNull()
    expect(workStatusElapsedSeconds(null, NOW)).toBeNull()
  })

  it('clamps a stamp from the future instead of counting negative', () => {
    expect(workStatusElapsedSeconds(execution('running', '2026-09-18T12:00:10Z'), NOW)).toBe(0)
  })
})

describe('formatWorkStatusElapsed', () => {
  it('renders m:ss with padded seconds', () => {
    expect(formatWorkStatusElapsed(249)).toBe('4:09')
  })

  it('lets minutes grow unbounded', () => {
    expect(formatWorkStatusElapsed(3600)).toBe('60:00')
  })
})

describe('workStatusIsBusy', () => {
  it('is busy only while work is happening', () => {
    expect(workStatusIsBusy(execution('running'))).toBe(true)
    expect(workStatusIsBusy(execution('queued'))).toBe(true)
    expect(workStatusIsBusy(execution('stopping'))).toBe(true)
    expect(workStatusIsBusy(execution('completed'))).toBe(false)
    expect(workStatusIsBusy(null)).toBe(false)
  })
})

describe('workStatusPendingQueue', () => {
  it('keeps the items the service still holds and drops terminal ones', () => {
    const pending = workStatusPendingQueue([
      queueItem('pending', 'a'),
      queueItem('dispatched', 'b'),
      queueItem('paused', 'c'),
      queueItem('withdrawn', 'd'),
      queueItem('completed', 'e')
    ])

    expect(pending.map(item => item.itemId)).toEqual(['a', 'b', 'c'])
  })
})

describe('workStatusLineParts', () => {
  it('assembles state, queue and duration when all facts exist', () => {
    const line = workStatusLineParts(
      { execution: execution('running', '2026-09-18T11:59:51Z'), queue: [queueItem('pending')] },
      labels,
      NOW
    )

    expect(line).toEqual({ activity: 'active', parts: ['RUNNING', 'Queue: 1', '0:09'] })
  })

  it('omits every dimension without a fact — no zeros, no dashes', () => {
    expect(workStatusLineParts({ execution: null, queue: [] }, labels, NOW)).toBeNull()
    expect(workStatusLineParts({ execution: null, queue: [queueItem('pending')] }, labels, NOW)?.parts).toEqual([
      'Queue: 1'
    ])
    expect(workStatusLineParts({ execution: execution('completed'), queue: [] }, labels, NOW)?.parts).toEqual([
      'COMPLETED'
    ])
  })

  it('an idle state with facts shows a static dot', () => {
    const line = workStatusLineParts({ execution: execution('failed'), queue: [] }, labels, NOW)

    expect(line?.activity).toBe('idle')
  })
})

describe('workStatusProcessFacts', () => {
  it('exists when there is an execution or pending queue work', () => {
    expect(workStatusProcessFacts({ execution: execution('running'), queue: [] })).not.toBeNull()
    expect(workStatusProcessFacts({ execution: null, queue: [queueItem('pending')] })).not.toBeNull()
  })

  it('is null with nothing to show — the card does not render an empty shell', () => {
    expect(workStatusProcessFacts({ execution: null, queue: [] })).toBeNull()
  })
})
