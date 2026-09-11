/**
 * process/budget.ts
 *
 * Bounded retry budgets. Every supervising loop in this app needs one, and each
 * one is the same shape twice over:
 *
 *  - **failure streak** — consecutive failures for a scope within a window;
 *    crossing the limit resets the streak so recovery is not permanently
 *    poisoned, and a success clears it immediately. Used where the question is
 *    "is this resource actually dead".
 *  - **attempt window** — how many attempts happened in the last N ms. Used
 *    where the question is "am I in a crash loop".
 *
 * Bounded and self-evicting by construction: neither can grow without limit, and
 * neither latches. A budget that never resets turns one bad minute into a
 * permanently dead feature, which is the failure mode these exist to prevent.
 */

export interface FailureStreak {
  failures: number
  shouldReset: boolean
}

export interface FailureStreakBudget {
  /** Forgets every scope. */
  clear(): void
  /** Records a failure for `scope` and reports the resulting streak. */
  recordFailure(scope: string): FailureStreak
  /** A success for `scope` clears its streak. */
  recordSuccess(scope: string): void
}

export interface FailureStreakBudgetOptions {
  /** Consecutive failures that trip `shouldReset`. */
  failureLimit: number
  /** Failures further apart than this do not count as consecutive. */
  failureWindowMs: number
  now?: () => number
}

export function createFailureStreakBudget({
  failureLimit,
  failureWindowMs,
  now = Date.now
}: FailureStreakBudgetOptions): FailureStreakBudget {
  if (!Number.isInteger(failureLimit) || failureLimit < 1) {
    throw new Error('Failure limit must be a positive integer.')
  }

  if (!Number.isFinite(failureWindowMs) || failureWindowMs < 1) {
    throw new Error('Failure window must be positive.')
  }

  const failuresByScope = new Map<string, { failures: number; lastFailureAt: number }>()

  return {
    clear() {
      failuresByScope.clear()
    },

    recordFailure(scope: string): FailureStreak {
      const at = now()
      const previous = failuresByScope.get(scope)
      // `<=` (not `<`): a failure exactly one window later is still part of the
      // same streak when the observation cadence matches the window.
      const withinWindow = previous && at - previous.lastFailureAt <= failureWindowMs
      const failures = (withinWindow ? previous.failures : 0) + 1
      const shouldReset = failures >= failureLimit

      if (shouldReset) {
        failuresByScope.delete(scope)
      } else {
        failuresByScope.set(scope, { failures, lastFailureAt: at })
      }

      return { failures, shouldReset }
    },

    recordSuccess(scope: string) {
      failuresByScope.delete(scope)
    }
  }
}

/**
 * Drop timestamps older than `windowMs`. Mutates nothing; returns the retained
 * list so callers can keep it as their own state.
 *
 * Exclusive by default (`now - t < windowMs`), which is the semantics every
 * attempt-window caller here relies on.
 */
export function pruneWindowTimestamps(times: number[], now: number, windowMs: number): number[] {
  return times.filter(timestamp => now - timestamp < windowMs)
}

/** Record an attempt timestamp. Mutates and returns. */
export function recordWindowTimestamp(times: number[], now: number): number[] {
  times.push(now)

  return times
}
