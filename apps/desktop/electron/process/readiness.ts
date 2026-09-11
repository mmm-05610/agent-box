/**
 * process/readiness.ts
 *
 * Deadline-bounded readiness infrastructure for a spawned child: "tell me when
 * this child is ready, or tell me it died / ran out of time first."
 *
 * Two shapes cover every readiness wait in this app:
 *
 *  - `waitForLineAnnouncement` — the child prints a sentinel line on stdout
 *    (typically the port it bound). The clock starts at SPAWN, not at the
 *    listener, so any output the caller already buffered is scanned too; a
 *    sentinel that was flushed and consumed before this wait attached must not
 *    be lost to listener-attach ordering.
 *  - `waitForPolledValue` — readiness is published somewhere pollable (a ready
 *    file, a socket), so the value is read on an interval.
 *
 * Both tear down every listener on every terminal path — resolve, reject,
 * timeout — so repeated spawns cannot leak listener slots on the child. Neither
 * knows what the sentinel means or how to phrase a failure: the message
 * builders are supplied by the caller, which is the only party that knows what
 * kind of process this is.
 */

/** The stdout half of the child shape, structurally. */
export interface AnnouncingStream {
  off: (event: 'data', listener: (chunk: unknown) => void) => unknown
  on: (event: 'data', listener: (chunk: unknown) => void) => unknown
}

/** The event half of the child shape, structurally. */
export interface ObservableChild {
  off: (event: string, listener: (...args: any[]) => void) => unknown
  on: (event: string, listener: (...args: any[]) => void) => unknown
}

export interface AnnouncingChild extends ObservableChild {
  stdout: AnnouncingStream
}

export interface LineAnnouncementOptions {
  /**
   * Matched against each COMPLETE stdout line. Capture group 1 is the announced
   * value. The line scanner is what makes this robust against a sentinel that a
   * chatty child printed without a trailing newline floor.
   */
  linePattern: RegExp
  /**
   * Matched against the MERGED stdout+stderr snapshot the caller already
   * buffered. A separate pattern because the snapshot can splice the sentinel
   * onto a partial line, where a line-anchored pattern never lines up.
   */
  bufferedPattern?: RegExp
  /** Returns the child's output buffered since spawn. */
  bufferedOutput?: () => string
  /** Returns a formatted output-tail suffix for exit errors. */
  describeOutputTail?: () => string
  /** Builds the rejection message when the child exits first. Receives `signal || code`. */
  onExit: (detail: string) => string
  /** Builds the rejection message when the deadline passes. Receives the deadline. */
  onTimeout: (timeoutMs: number) => string
  timeoutMs: number
}

export function waitForLineAnnouncement(child: AnnouncingChild, options: LineAnnouncementOptions): Promise<string> {
  const { bufferedPattern, bufferedOutput, describeOutputTail = () => '', linePattern, onExit, onTimeout } = options

  return new Promise((resolve, reject) => {
    let buf = ''
    let done = false

    function cleanup() {
      if (done) {
        return
      }

      done = true
      clearTimeout(timer)
      child.stdout.off('data', onData)
      child.off('exit', onExitEvent)
      child.off('error', onError)
    }

    function onData(chunk: unknown) {
      buf += String(chunk)
      let nl

      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl)

        buf = buf.slice(nl + 1)
        const m = line.match(linePattern)

        if (m) {
          cleanup()
          resolve(m[1])

          return
        }
      }
    }

    function onExitEvent(code: unknown, signal: unknown) {
      cleanup()
      reject(new Error(onExit(`${signal || code}`)))
    }

    function onError(err: unknown) {
      cleanup()
      reject(err)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(onTimeout(options.timeoutMs)))
    }, options.timeoutMs)

    child.stdout.on('data', onData)
    child.on('exit', onExitEvent)
    child.on('error', onError)

    // Listener is live — now recover a sentinel that was already flushed and
    // consumed before this promise existed. The snapshot is taken AFTER the
    // listener attaches, so no chunk can fall between snapshot and listener.
    if (!done && bufferedPattern && bufferedOutput) {
      const alreadyBuffered = bufferedOutput()
      const m = alreadyBuffered ? alreadyBuffered.match(bufferedPattern) : null

      if (m) {
        cleanup()
        resolve(m[1])
      }
    }
  })
}

export interface PolledValueOptions<TValue> {
  /** Reads the current value, or null when it is not published yet. */
  read: () => TValue | null
  describeOutputTail?: () => string
  onExit: (detail: string) => string
  onTimeout: (timeoutMs: number) => string
  /** Poll interval. Defaults to 50ms, matching the interval this replaced. */
  pollMs?: number
  timeoutMs: number
}

export function waitForPolledValue<TValue>(
  child: ObservableChild,
  options: PolledValueOptions<TValue>
): Promise<TValue> {
  const { describeOutputTail: _describeOutputTail = () => '', onExit, onTimeout, pollMs = 50 } = options

  return new Promise((resolve, reject) => {
    let done = false
    let interval: ReturnType<typeof setInterval> | null = null

    function cleanup() {
      if (done) {
        return
      }

      done = true
      clearTimeout(timer)

      if (interval) {
        clearInterval(interval)
      }

      child.off('exit', onExitEvent)
      child.off('error', onError)
    }

    function check() {
      const value = options.read()

      if (value !== null) {
        cleanup()
        resolve(value)
      }
    }

    function onExitEvent(code: unknown, signal: unknown) {
      cleanup()
      reject(new Error(onExit(`${signal || code}`)))
    }

    function onError(err: unknown) {
      cleanup()
      reject(err)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(onTimeout(options.timeoutMs)))
    }, options.timeoutMs)

    child.on('exit', onExitEvent)
    child.on('error', onError)
    interval = setInterval(check, pollMs)

    if (typeof interval.unref === 'function') {
      interval.unref()
    }

    check()
  })
}
