/**
 * application/workspace/latest-wins.ts — stale-response guard.
 *
 * The wizard races the user: a slow directory listing for path A must never
 * overwrite a newer listing for path B, and a late connect result must not
 * resurrect a cancelled step. Every async step begins a turn; only the most
 * recently begun turn may apply its result. Pure and testable off the UI.
 */

export interface LatestWins {
  /** Begin a new turn; older turns are immediately stale. */
  begin: () => number
  /** True when this turn is still the newest — its result may apply. */
  isCurrent: (turn: number) => boolean
}

export function createLatestWins(): LatestWins {
  let newest = 0

  return {
    begin: () => {
      newest += 1

      return newest
    },
    isCurrent: (turn: number) => turn === newest
  }
}
