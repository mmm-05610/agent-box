import { useStore } from '@nanostores/react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useState } from 'react'

import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { ExecutionInventoryRow, QueueItem, WorkspaceGitStatus } from '@/types/wire/wire-v1'

import {
  formatWorkStatusElapsed,
  workStatusElapsedSeconds,
  workStatusExecutionRows,
  workStatusGitRows,
  workStatusIsBusy,
  workStatusLineParts,
  workStatusProcessFacts
} from './work-status'
import { $workStatusPanelMode, hydrateWorkStatusPanelMode, setWorkStatusPanelMode } from './work-status-pref'

/**
 * P20 work status panel: a floating top-left element over the chat area.
 * Collapsed by default to a single line assembled ONLY from service facts
 * (turn state, queue count, duration-in-state, the reported branch); clicking
 * expands it into the vertical card stack. P21 added the two cards whose
 * backend faces landed (Git, the execution inventory) — every other reference
 * card still has no data source and therefore does not render (see
 * work-status.ts for the field contracts awaiting their faces).
 *
 * Interaction logic only is learned from the reference projects; the visuals
 * are this app's own tokens, and the user's collapsed/expanded/closed choice
 * is remembered through the localStorage lease in work-status-pref.
 */

export interface WorkStatusPanelProps {
  execution: WireSessionProjection['execution']
  /** Order 64: the service's inventory, or null while it has not answered a
   *  read yet — null is "no fact", and an empty list is "none in flight". */
  executions?: ExecutionInventoryRow[] | null
  /** Why the inventory read failed — a refused read (over the row bound, say)
   *  is shown, never silently truncated to an empty list. */
  executionsError?: null | string
  /** Order 62: the workspace's Git answer, or null while unknown. */
  git?: WorkspaceGitStatus | null
  /** Why the Git read failed, if it did. */
  gitError?: null | string
  queue: QueueItem[]
  /** Re-reads the two read-only faces; nothing here writes anything. */
  onRefresh?: () => void
}

const TICK_MS = 1000

function useNowTicking(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) {
      return
    }

    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)

    return () => window.clearInterval(timer)
  }, [active])

  return now
}

export function WorkStatusPanel({
  execution,
  executions = null,
  executionsError = null,
  git = null,
  gitError = null,
  onRefresh,
  queue
}: WorkStatusPanelProps) {
  const { t } = useI18n()
  const copy = t.workStatus
  const mode = useStore($workStatusPanelMode)

  useEffect(() => {
    hydrateWorkStatusPanelMode()
  }, [])

  const busy = workStatusIsBusy(execution)
  const now = useNowTicking(busy)
  const process = workStatusProcessFacts({ execution, queue })
  const elapsedSeconds = workStatusElapsedSeconds(execution, now)

  const gitRows = git
    ? workStatusGitRows(git, {
        additions: copy.gitAdditions,
        ahead: copy.gitAhead,
        behind: copy.gitBehind,
        branch: copy.gitBranch,
        changedFiles: copy.gitChangedFiles,
        deletions: copy.gitDeletions,
        unavailable: reason => copy.gitFieldUnavailable(reason ?? copy.gitFieldUnknown)
      })
    : null

  const executionRows = executions
    ? workStatusExecutionRows(executions, {
        pid: copy.pid,
        pidUnknown: reason => copy.pidUnknown(reason ?? copy.pidReasonUnknown),
        stateLabel: copy.stateLabel
      })
    : []

  const gitFailed = gitError !== null
  const executionsFailed = executionsError !== null
  const hasCards = process !== null || gitRows !== null || executionRows.length > 0 || gitFailed || executionsFailed

  // The line is assembled from service facts; when the only facts are card
  // facts (a Git answer with no branch, say) the line names the card instead of
  // leaving the panel unreachable.
  const line =
    workStatusLineParts(
      {
        execution,
        gitBranch: git?.branch ?? null,
        queue
      },
      { queuedCount: copy.queuedCount, stateLabel: copy.stateLabel },
      now
    ) ??
    (hasCards
      ? {
          activity: 'idle' as const,
          parts: [
            process
              ? copy.processCard
              : gitRows || gitFailed
                ? copy.gitCard
                : copy.executionsCard
          ]
        }
      : null)

  if (mode === 'closed' || !line) {
    // Closed (or nothing to say): when the user closed it, a quiet ghost
    // affordance keeps the panel discoverable without occupying the corner
    // or faking activity; when there are simply no facts, render nothing.
    if (mode !== 'closed') {
      return null
    }

    return (
      <button
        aria-label={copy.openPanel}
        className="absolute left-2 top-2 z-20 grid size-5 place-items-center rounded-md text-(--ui-text-quaternary) hover:bg-(--ui-hover-background) hover:text-(--ui-text-secondary)"
        data-work-status-reopen=""
        onClick={() => setWorkStatusPanelMode('collapsed')}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16" width="12">
          <path d="M8 3v10M3 8h10" strokeLinecap="round" />
        </svg>
      </button>
    )
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="absolute left-2 top-2 z-20 overflow-hidden rounded-lg border border-(--ui-border) bg-(--ui-panel-background)/95 shadow-sm backdrop-blur-sm"
      data-work-status-panel=""
      data-work-status-panel-mode={mode}
      initial={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <div className="flex items-center gap-1">
        <button
          aria-expanded={mode === 'expanded'}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-[0.6875rem] text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
          data-work-status-toggle=""
          onClick={() => setWorkStatusPanelMode(mode === 'expanded' ? 'collapsed' : 'expanded')}
          type="button"
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-1.5 shrink-0 rounded-full',
              line.activity === 'active' ? 'animate-pulse bg-(--ui-accent)' : 'bg-(--ui-stroke-quaternary)'
            )}
          />
          {line.parts.map((part, index) => (
            <span className="shrink-0" key={index}>
              {part}
            </span>
          ))}
        </button>
        <button
          aria-label={copy.closePanel}
          className="mr-1 grid size-5 shrink-0 place-items-center rounded-md text-(--ui-text-quaternary) hover:bg-(--ui-hover-background) hover:text-(--ui-text-secondary)"
          data-work-status-close=""
          onClick={() => setWorkStatusPanelMode('closed')}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="10" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16" width="10">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {mode === 'expanded' && hasCards && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="border-t border-(--ui-stroke-tertiary)"
            data-work-status-cards=""
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {process && (
              <div className="px-2.5 py-1.5" data-work-status-card="process">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.625rem] uppercase tracking-wide text-(--ui-text-quaternary)">
                    {copy.processCard}
                  </span>
                  <span className="font-mono text-[0.625rem] text-(--ui-text-tertiary)">
                    {elapsedSeconds !== null ? formatWorkStatusElapsed(elapsedSeconds) : '—'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-(--ui-text-secondary)">
                  {process.execution ? copy.stateLabel(process.execution.state) : null}
                  {process.execution?.reason ? ` — ${process.execution.reason}` : null}
                </div>
                {process.pending.length > 0 && (
                  <div className="mt-1.5" data-work-status-queue="">
                    <div className="text-[0.625rem] text-(--ui-text-quaternary)">
                      {copy.queuedCount(process.pending.length)}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {process.pending.map(item => (
                        <li className="flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)" key={item.itemId}>
                          <span
                            aria-hidden="true"
                            className="inline-block size-1 shrink-0 rounded-full bg-(--ui-stroke-quaternary)"
                          />
                          <span className="truncate">{item.message.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {(gitRows || gitFailed) && (
              <div className="border-t border-(--ui-stroke-tertiary) px-2.5 py-1.5" data-work-status-card="git">
                <div className="text-[0.625rem] uppercase tracking-wide text-(--ui-text-quaternary)">{copy.gitCard}</div>
                {gitRows ? (
                  <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                    {gitRows.map(row => (
                      <Fragment key={row.label}>
                        <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{row.label}</dt>
                        <dd className="truncate text-right font-mono text-[0.6875rem] text-(--ui-text-secondary)">{row.value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : (
                  <div className="mt-1 text-[0.6875rem] italic text-(--ui-text-tertiary)" data-work-status-git-error="">
                    {gitError}
                  </div>
                )}
              </div>
            )}
            {(executionRows.length > 0 || executionsFailed) && (
              <div className="border-t border-(--ui-stroke-tertiary) px-2.5 py-1.5" data-work-status-card="executions">
                <div className="text-[0.625rem] uppercase tracking-wide text-(--ui-text-quaternary)">
                  {copy.executionsCard}
                </div>
                {executionsFailed ? (
                  <div className="mt-1 text-[0.6875rem] italic text-(--ui-text-tertiary)" data-work-status-executions-error="">
                    {executionsError}
                  </div>
                ) : null}
                <ul className="mt-1 space-y-1">
                  {executionRows.map(row => (
                    <li className="text-[0.6875rem] text-(--ui-text-secondary)" data-work-status-execution={row.executionId} key={row.executionId}>
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0">{row.state}</span>
                        <span className="truncate text-(--ui-text-tertiary)">{row.facts.join(' · ')}</span>
                      </div>
                      <div className="font-mono text-[0.625rem] text-(--ui-text-quaternary)">
                        {copy.pid}:{' '}
                        <span className={row.pidIsReason ? 'italic' : undefined}>{row.pid}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {onRefresh && (
              <div className="border-t border-(--ui-stroke-tertiary) px-2.5 py-1">
                <button
                  className="rounded px-1 text-[0.625rem] text-(--ui-text-quaternary) hover:bg-(--ui-hover-background) hover:text-(--ui-text-secondary)"
                  data-work-status-refresh=""
                  onClick={onRefresh}
                  type="button"
                >
                  {copy.refresh}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
