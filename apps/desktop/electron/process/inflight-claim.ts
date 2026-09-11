/**
 * process/inflight-claim.ts
 *
 * Single-flight claim by key: the first caller for a key runs the work, every
 * concurrent caller for the same key awaits and receives that first result.
 *
 * Why a main-process claim is needed at all when each renderer already has its
 * own in-flight lock (#90812): a per-window lock only dedupes INSIDE one window.
 * Two windows (main + a session pop-out) racing the same wake both invoke the
 * main-process dial, and the loser of the race can spawn a duplicate child. The
 * main process is the single owner of child lifecycles, so the claim lives here.
 *
 * Bounded by construction: a claim exists only while its promise is unsettled —
 * both outcomes release it, so a failed attempt is never cached and the next
 * attempt runs fresh (fail closed, not latched).
 *
 * Keyed and untyped by design: it knows nothing about what the work is, only
 * that two callers asking for the same key must share one attempt.
 */
export class InFlightClaims {
  readonly #inflightByKey = new Map<string, Promise<unknown>>()

  /** Whether work for this key is currently in flight (test/diagnostic seam). */
  inFlight(key: string): boolean {
    return this.#inflightByKey.has(key)
  }

  run<T>(key: string, work: () => Promise<T> | T): Promise<T> {
    const existing = this.#inflightByKey.get(key) as Promise<T> | undefined

    if (existing) {
      return existing
    }

    // Start the work eagerly so the first caller's spawn is already in flight
    // when a concurrent caller arrives; a synchronously-throwing work function
    // is converted into a rejection of THIS claim so it cannot bypass the seam.
    let pending: Promise<T>

    try {
      pending = Promise.resolve(work())
    } catch (error) {
      pending = Promise.reject(error)
    }

    const release = () => {
      if (this.#inflightByKey.get(key) === pending) {
        this.#inflightByKey.delete(key)
      }
    }

    this.#inflightByKey.set(key, pending)
    // Release on both outcomes without creating an unhandled rejected branch.
    void pending.then(release, release)

    return pending
  }
}
