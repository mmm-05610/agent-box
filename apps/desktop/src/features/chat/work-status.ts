import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import type { ExecutionInventoryRow, QueueItem, WorkspaceGitStatus } from '@/types/wire/wire-v1'

/**
 * P20 work-status facts → what the panel may show. Pure: the panel invents
 * nothing. A dimension with no service fact (goals, sub-agents, background
 * processes) has no entry here at all — the work order's honesty boundary.
 * P21 added the two faces that landed (Git, the execution inventory); both
 * follow the same rule in the other direction: a null field shows its typed
 * reason, never a zero that would read as a measured value.
 */

export type WorkStatusActivity = 'active' | 'idle'

export interface WorkStatusFacts {
  execution: WireSessionProjection['execution']
  /** Order 62: the branch the service reported, when it reported one. */
  gitBranch?: null | string
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

  if (facts.gitBranch) {
    parts.push(facts.gitBranch)
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

/** The panel's cards with real facts today. The reference cards still without
 *  a data source are deliberately absent, not stubbed:
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

// ─── Git card (order 62) ─────────────────────────────────────────────────────

export interface WorkStatusGitLabels {
  additions: string
  ahead: string
  behind: string
  branch: string
  changedFiles: string
  deletions: string
  /** What a null field reads as: the service's typed reason (or the honest
   *  "unknown" when it sent none). Never a number. */
  unavailable: (reason: null | string) => string
}

export interface WorkStatusGitRow {
  label: string
  /** The value, or the reason the value is unknown. */
  value: string
}

/** Six rows, each independent. A field the service could not obtain shows its
 *  typed reason (`GIT_BINARY_DIFF` really does mean the line counts are not
 *  obtainable for those bytes) while the fields it DID obtain still show their
 *  values — including a true zero. */
export function workStatusGitRows(git: WorkspaceGitStatus, labels: WorkStatusGitLabels): WorkStatusGitRow[] {
  const value = (field: null | number | string): string =>
    field === null ? labels.unavailable(git.reason) : String(field)

  return [
    { label: labels.branch, value: value(git.branch) },
    { label: labels.changedFiles, value: value(git.changedFiles) },
    { label: labels.additions, value: value(git.additions) },
    { label: labels.deletions, value: value(git.deletions) },
    { label: labels.ahead, value: value(git.ahead) },
    { label: labels.behind, value: value(git.behind) }
  ]
}

/** The collapsed line's extra fact: the branch, when the service answered one. */
export function workStatusGitBranch(git: null | WorkspaceGitStatus): null | string {
  return git?.branch ?? null
}

// ─── Executions card (order 64) ──────────────────────────────────────────────

export interface WorkStatusExecutionLabels {
  pid: string
  /** What an absent pid reads as: the typed reason, never "0". */
  pidUnknown: (reason: null | string) => string
  stateLabel: (state: string) => string
}

export interface WorkStatusExecutionRow {
  executionId: string
  /** The rows a reader needs to tell two executions apart. */
  facts: string[]
  pid: string
  /** True when `pid` is the reason the pid is unknown, not a number — so the
   *  surface can style it as an absence rather than a value. */
  pidIsReason: boolean
  state: string
}

/** One row per in-flight execution, straight from the ledger. The pid is the
 *  place this is easiest to get wrong: a null pid is "the platform did not
 *  report one", which is a different fact from "process 0". */
export function workStatusExecutionRows(
  rows: readonly ExecutionInventoryRow[],
  labels: WorkStatusExecutionLabels
): WorkStatusExecutionRow[] {
  return rows.map(row => ({
    executionId: row.executionId,
    facts: [row.profile, row.harness, row.placement, row.workspace],
    pid: row.pid === null ? labels.pidUnknown(row.pidReason) : String(row.pid),
    pidIsReason: row.pid === null,
    state: labels.stateLabel(row.state)
  }))
}
