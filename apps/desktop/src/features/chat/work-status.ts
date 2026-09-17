import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import type { QueueItem } from '@/types/wire/wire-v1'

/**
 * P20 work-status facts → what the panel may show. Pure: the panel invents
 * nothing. A dimension with no service fact (git, goals, sub-agents, background
 * processes) has no entry here at all — the work order's honesty boundary.
 */

export type WorkStatusActivity = 'active' | 'idle'

export interface WorkStatusFacts {
  execution: WireSessionProjection['execution']
  queue: QueueItem[]
}

export interface WorkStatusLineParts {
  activity: WorkStatusActivity
  /** Display parts in reference order: state word, queue count, duration. */
  parts: string[]
}

export interface WorkStatusLabels {
  queuedCount: (count: number) => string
  stateLabel: (state: string) => string
}

/** Seconds the execution has been in its current state, or null when the
 *  service gave no stamp. `now` is injected so this stays pure and testable. */
export function workStatusElapsedSeconds(execution: WireSessionProjection['execution'], now: number): null | number {
  if (!execution?.since) {
    return null
  }

  const since = Date.parse(execution.since)

  if (Number.isNaN(since)) {
    return null
  }

  return Math.max(0, Math.floor((now - since) / 1000))
}

/** `m:ss`; minutes are unbounded — an hour-long run reads `60:00`. */
export function formatWorkStatusElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)

  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/** States that mean work is happening right now — the pulsing dot and the
 *  ticking clock belong to these alone. */
const ACTIVE_STATES = new Set(['queued', 'running', 'stopping'])

export function workStatusIsBusy(execution: WireSessionProjection['execution']): boolean {
  return execution !== null && ACTIVE_STATES.has(execution.state)
}

/** Queue items that still represent work the service holds (the same set the
 *  composer's queue panel acts on; terminal items are history, not queue). */
export function workStatusPendingQueue(queue: QueueItem[]): QueueItem[] {
  return queue.filter(item => item.state === 'pending' || item.state === 'paused' || item.state === 'dispatched')
}

/** The collapsed line's content: assembled by availability, never padded with
 *  a zero or a dash for a dimension that has no fact. */
export function workStatusLineParts(
  facts: WorkStatusFacts,
  labels: WorkStatusLabels,
  now: number
): WorkStatusLineParts | null {
  const busy = workStatusIsBusy(facts.execution)
  const pending = workStatusPendingQueue(facts.queue)
  const elapsed = workStatusElapsedSeconds(facts.execution, now)
  const parts: string[] = []

  if (facts.execution) {
    parts.push(labels.stateLabel(facts.execution.state))
  }

  if (pending.length > 0) {
    parts.push(labels.queuedCount(pending.length))
  }

  if (elapsed !== null) {
    parts.push(formatWorkStatusElapsed(elapsed))
  }

  if (parts.length === 0) {
    return null
  }

  return { activity: busy ? 'active' : 'idle', parts }
}

/** The panel's one card with real facts today. The four reference cards
 *  without a data source are deliberately absent, not stubbed:
 *  - Git: wire v1 has no git face; the backend-order contract is the field
 *    list `branch` `changedFiles` `additions` `deletions` `ahead` `behind`.
 *  - Goals: harness plan/todo facts (backend order 52).
 *  - Sub-agents: "profile calls profile" (adjudicated, no order yet).
 *  - Background: in-sandbox process list (no face).
 *  Each becomes a named card here when its face lands — never before. */
export interface WorkStatusProcessFacts {
  execution: WireSessionProjection['execution']
  pending: QueueItem[]
}

export function workStatusProcessFacts(facts: WorkStatusFacts): WorkStatusProcessFacts | null {
  const pending = workStatusPendingQueue(facts.queue)

  if (!facts.execution && pending.length === 0) {
    return null
  }

  return { execution: facts.execution, pending }
}
