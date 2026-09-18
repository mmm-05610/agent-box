import { describe, expect, it } from 'vitest'

import { asWireId, type QueueItem } from '@/types/wire/wire-v1'

import {
  formatWorkStatusElapsed,
  workStatusElapsedSeconds,
  workStatusExecutionRows,
  workStatusGitRows,
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

describe('workStatusGitRows (order 62)', () => {
  const gitLabels = {
    additions: 'Additions',
    ahead: 'Ahead',
    behind: 'Behind',
    branch: 'Branch',
    changedFiles: 'Changed files',
    deletions: 'Deletions',
    unavailable: (reason: null | string) => `Not obtainable (${reason ?? 'unknown'})`
  }

  it('shows the reason for every field the service could not obtain', () => {
    const rows = workStatusGitRows(
      { additions: null, ahead: null, behind: null, branch: null, changedFiles: null, deletions: null, reason: 'GIT_UNAVAILABLE' },
      gitLabels
    )

    expect(rows).toHaveLength(6)
    expect(rows.every(row => row.value === 'Not obtainable (GIT_UNAVAILABLE)')).toBe(true)
    expect(rows.some(row => row.value === '0')).toBe(false)
  })

  it('keeps a real zero and an obtained value beside a null sibling', () => {
    const rows = workStatusGitRows(
      { additions: null, ahead: 0, behind: null, branch: 'main', changedFiles: 0, deletions: null, reason: 'GIT_BINARY_DIFF' },
      gitLabels
    )

    const value = (label: string) => rows.find(row => row.label === label)?.value

    expect(value('Branch')).toBe('main')
    expect(value('Changed files')).toBe('0')
    expect(value('Ahead')).toBe('0')
    expect(value('Additions')).toBe('Not obtainable (GIT_BINARY_DIFF)')
  })
})

describe('workStatusExecutionRows (order 64)', () => {
  const labels = {
    pid: 'PID',
    pidUnknown: (reason: null | string) => `Not reported (${reason ?? 'reason not reported'})`,
    stateLabel: (state: string) => state.toUpperCase()
  }

  const row = (overrides: Partial<Parameters<typeof workStatusExecutionRows>[0][number]> = {}) =>
    ({
      adapterPid: null,
      adapterPidReason: 'ADAPTER_PID_NOT_REPORTED',
      executionId: asWireId('execution_1'),
      harness: 'opaque-alpha',
      pid: 4242,
      pidReason: null,
      placement: 'wsl',
      profile: 'Builder',
      profileId: asWireId('profile_1'),
      queueItemId: null,
      sessionId: asWireId('session_1'),
      startedAt: '2026-09-18T00:00:00.000Z',
      state: 'running',
      turnId: asWireId('turn_1'),
      workspace: 'fixture',
      workspaceId: asWireId('workspace_1'),
      ...overrides
    }) as Parameters<typeof workStatusExecutionRows>[0][number]

  it('reports a real pid as a number', () => {
    const [facts] = workStatusExecutionRows([row()], labels)

    expect(facts?.pid).toBe('4242')
    expect(facts?.pidIsReason).toBe(false)
  })

  it('reports an absent pid as its typed reason, never as 0', () => {
    const [facts] = workStatusExecutionRows([row({ pid: null, pidReason: 'PID_NOT_REPORTED' })], labels)

    expect(facts?.pid).toBe('Not reported (PID_NOT_REPORTED)')
    expect(facts?.pidIsReason).toBe(true)
    expect(facts?.pid).not.toBe('0')
  })
})
