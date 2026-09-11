import fs from 'node:fs'

import { waitForLineAnnouncement, waitForPolledValue } from '../process/readiness'

// `hermes serve` announces HERMES_BACKEND_READY; the legacy `hermes dashboard`
// backend announces HERMES_DASHBOARD_READY. Accept either so the desktop spawn
// works against both the headless backend and old/dashboard runtimes.
const _READY_RE = /^HERMES_(?:BACKEND|DASHBOARD)_READY port=(\d+)/m

// Same sentinel inside a MERGED stdout+stderr buffer (the spawn-time output tail, a remote
// `>> log 2>&1` file): uvicorn's stderr chunks end without a newline, so the sentinel can be
// spliced onto them (`...process [4711]HERMES_BACKEND_READY port=65238`) and `^` never lines up
// (#103792). Match on a token boundary instead; `port=<digits>` keeps prose mentions out.
export const READY_IN_MERGED_OUTPUT_RE = /(?<!\w)HERMES_(?:BACKEND|DASHBOARD)_READY port=(\d+)/

// The announcement clock starts the instant the backend process is spawned —
// before uvicorn binds its socket. On a cold install the child must first
// compile and import the whole `hermes_cli.main` → `web_server` → FastAPI/
// uvicorn chain, and on Windows real-time AV (Defender) scans every freshly
// written `.pyc`. That pre-bind cost can run 30-60s on a slow disk, so a tight
// 45s deadline kills a *healthy but still-starting* backend and respawns it,
// piling up orphaned processes (issue #50209). A roomier default absorbs the
// cold-start cost; a warm start still announces in well under a second.
const DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS = 90_000
// Never trust a deadline tighter than the warm-start path needs; floor at 45s
// (the historical default) so a malformed override can't reintroduce the loop.
const MIN_PORT_ANNOUNCE_TIMEOUT_MS = 45_000

/**
 * Resolve the port-announcement deadline. Honors the
 * HERMES_DESKTOP_PORT_ANNOUNCE_TIMEOUT_MS env override (for users on slow
 * disks / aggressive AV who need an even longer cold-start window), clamped
 * to a sane floor so a bad value can't make boot flakier than the default.
 */
function resolvePortAnnounceTimeoutMs(env = process.env) {
  const parsed = Number(env.HERMES_DESKTOP_PORT_ANNOUNCE_TIMEOUT_MS)

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(MIN_PORT_ANNOUNCE_TIMEOUT_MS, Math.round(parsed))
  }

  return DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS
}

function exitedMessage(describeOutputTail: () => string) {
  return (detail: string) =>
    `Hermes backend: exited before port announcement (${detail})${describeOutputTail()}`
}

function timedOutMessage(timeoutMs: number) {
  return `Timed out waiting for Hermes backend port announcement (${timeoutMs}ms)`
}

/**
 * Watch a child process's stdout for the `HERMES_(BACKEND|DASHBOARD)_READY
 * port=<N>` line that web_server.py prints after uvicorn binds its socket.
 *
 * Returns the parsed port. Rejects if the child exits before emitting the line,
 * emits an `error` event, or no line arrives within the timeout. The default
 * timeout is cold-start tolerant (see DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS) because
 * the clock starts before the backend has even bound its port.
 *
 * The deadline, the listener teardown and the already-buffered-sentinel recovery
 * are the generic `process/readiness.ts` concern; this function supplies what is
 * Hermes-specific: the sentinel pattern and the wording of a failure.
 */
function waitForDashboardPort(
  child,
  timeoutMs = resolvePortAnnounceTimeoutMs(),
  describeOutputTail = () => '',
  bufferedOutput: () => string = () => ''
) {
  return waitForLineAnnouncement(child, {
    bufferedOutput,
    bufferedPattern: READY_IN_MERGED_OUTPUT_RE,
    describeOutputTail,
    linePattern: _READY_RE,
    onExit: exitedMessage(describeOutputTail),
    onTimeout: timedOutMessage,
    timeoutMs
  }).then(raw => parseInt(raw, 10))
}

function readDashboardReadyFile(readyFile: fs.PathOrFileDescriptor) {
  if (!readyFile) {
    return null
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(readyFile, 'utf8'))
    const port = Number(parsed?.port)

    return Number.isInteger(port) && port > 0 ? port : null
  } catch {
    return null
  }
}

function waitForDashboardReadyFile(
  readyFile,
  child,
  timeoutMs = resolvePortAnnounceTimeoutMs(),
  describeOutputTail = () => ''
) {
  return waitForPolledValue(child, {
    describeOutputTail,
    onExit: exitedMessage(describeOutputTail),
    onTimeout: timedOutMessage,
    read: () => readDashboardReadyFile(readyFile),
    timeoutMs
  })
}

function waitForDashboardPortAnnouncement(
  child,
  options: {
    /**
     * Returns the child's output buffered since SPAWN (the output tail's
     * accumulated text, #60323). Scanned for an already-emitted READY
     * sentinel so attaching this wait AFTER other awaits (backend claim,
     * boot-progress IPC) can never lose the announcement: flowing-mode
     * stdout never replays chunks to late listeners.
     */
    bufferedOutput?: () => string
    /** Returns a formatted stdout/stderr tail suffix for exit errors (#93608). */
    describeOutputTail?: () => string
    readyFile?: fs.PathOrFileDescriptor | null
    timeoutMs?: number
  } = {}
) {
  const timeoutMs = options.timeoutMs ?? resolvePortAnnounceTimeoutMs()
  const describeOutputTail = options.describeOutputTail ?? (() => '')

  if (options.readyFile) {
    return waitForDashboardReadyFile(options.readyFile, child, timeoutMs, describeOutputTail)
  }

  return waitForDashboardPort(child, timeoutMs, describeOutputTail, options.bufferedOutput ?? (() => ''))
}

export {
  DEFAULT_PORT_ANNOUNCE_TIMEOUT_MS,
  MIN_PORT_ANNOUNCE_TIMEOUT_MS,
  readDashboardReadyFile,
  resolvePortAnnounceTimeoutMs,
  waitForDashboardPort,
  waitForDashboardPortAnnouncement,
  waitForDashboardReadyFile
}
