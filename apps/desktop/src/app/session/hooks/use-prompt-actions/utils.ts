import type { AppendMessage } from '@assistant-ui/react'
import { JsonRpcGatewayError } from '@hermes/shared'

import { translateNow, type Translations } from '@/i18n'
import type { ChatMessage } from '@/lib/chat-messages'
import { type CommandsCatalogLike, filterDesktopCommandsCatalog } from '@/lib/desktop-slash-commands'
import { isProviderSetupErrorMessage } from '@/lib/provider-setup-errors'
import type { GatewayRequester } from '@/types/gateway'

export type GatewayRequest = GatewayRequester

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isSessionIdCandidate(value: string): boolean {
  const trimmed = value.trim()

  return /^\d{8}_\d{6}_[A-Fa-f0-9]{6}$/.test(trimmed) || /^[A-Fa-f0-9]{32}$/.test(trimmed)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error(translateNow('desktop.audioReadFailed')))
      }
    })
    reader.addEventListener('error', () => reject(reader.error || new Error(translateNow('desktop.audioReadFailed'))))
    reader.readAsDataURL(blob)
  })
}

export function isProviderSetupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  return isProviderSetupErrorMessage(message)
}

export function inlineErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback

  return (raw.match(/Error invoking remote method '[^']+': Error: (.+)$/)?.[1] ?? raw).replace(/^Error:\s*/, '').trim()
}

// The session-recovery core lives in application/session/recovery.ts so that
// below-app modules (the composer's attachment upload) can use it. Re-exported
// here because every current consumer of these names is app-side.
export {
  isGatewayTimeoutError,
  isSessionNotFoundError,
  resumeStoredRuntimeSession,
  SessionRecoveryAborted,
  withSessionNotFoundResume
} from '@/application/session/recovery'
export type { SessionRecoveryDeps } from '@/application/session/recovery'

/**
 * Is the session a prompt is about to run against currently mid-turn?
 *
 * The foreground `busyRef` is NOT the answer. It mirrors whatever chat is on
 * screen, while submit and slash both resolve their target through
 * `resolveTargetSessionId` — routinely a different session (a tile, a route
 * rebind, a session created by this very call). Reading the foreground flag
 * therefore gates one session's send on another session's turn: a stale
 * foreground `true` (a warm resume of a still-running chat leaves one behind)
 * blocks an IDLE target and reports "session busy" about a session doing
 * nothing, and the converse lets a background send fire mid-turn.
 *
 * The published per-session state is authoritative. A known target with no
 * slice yet is idle — never inherit another session's leftover foreground
 * flag (focusing B while A runs). Fall back to the foreground flag only for
 * a true draft (no session id), where that flag must be the focused view's
 * busy, not a process-global lock.
 */
export function isTargetSessionBusy(
  sessionStates: Record<string, { busy: boolean }>,
  sessionId: null | string,
  foregroundBusy: boolean
): boolean {
  if (!sessionId) {
    return foregroundBusy
  }

  return Boolean(sessionStates[sessionId]?.busy)
}

// The gateway refuses prompt.submit while a turn is running (4009 "session
// busy"). It's a transient concurrency guard, never a user-facing error: a
// submit racing the settle edge (or a rewind interrupting mid-turn) just waits
// a beat for the turn to wind down, then lands. Bounded so a genuinely stuck
// turn still surfaces eventually.
export const SESSION_BUSY_RETRY_TIMEOUT_MS = 6_000
export const SESSION_BUSY_RETRY_INTERVAL_MS = 150

export function isSessionBusyError(error: unknown): boolean {
  return /session busy/i.test(error instanceof Error ? error.message : String(error))
}

// prompt.submit refused because another surface (TUI, messaging gateway)
// holds this session's lease (4090 / SESSION_NOT_OWNED, #106217). The gateway
// stamps the machine reason in `error.data.reason`; the prose fallback covers
// backends older than that contract. Deterministic until the owner lets go —
// Retry reproduces it, so the card offers "Start new session" instead.
export function isSessionNotOwnedError(error: unknown): boolean {
  const reason = error instanceof JsonRpcGatewayError ? (error.data as { reason?: unknown } | undefined)?.reason : null

  return reason === 'SESSION_NOT_OWNED' || /already has a live owner/i.test(error instanceof Error ? error.message : '')
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Retry a gateway call across transient "session busy" so it never reaches the
// user — the turn settles within the deadline and the call lands.
export async function withSessionBusyRetry<T>(call: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + SESSION_BUSY_RETRY_TIMEOUT_MS

  for (;;) {
    try {
      return await call()
    } catch (err) {
      if (isSessionBusyError(err) && Date.now() < deadline) {
        await sleep(SESSION_BUSY_RETRY_INTERVAL_MS)

        continue
      }

      throw err
    }
  }
}

// After Stop, the renderer clears busy immediately while the gateway may still
// be winding down. Edit/restore that only checks busy then submits without
// interrupt-first and hits 4009 session busy. A short per-session cooldown
// keeps interrupt-first on for that window (#83855).
export const RECENT_INTERRUPT_COOLDOWN_MS = 3_000

const _recentlyInterruptedUntil = new Map<string, number>()

export function markSessionRecentlyInterrupted(sessionId: string, now = Date.now()): void {
  if (!sessionId) {
    return
  }

  _recentlyInterruptedUntil.set(sessionId, now + RECENT_INTERRUPT_COOLDOWN_MS)
}

export function isSessionRecentlyInterrupted(sessionId: string, now = Date.now()): boolean {
  const until = _recentlyInterruptedUntil.get(sessionId)

  if (until === undefined) {
    return false
  }

  if (now >= until) {
    _recentlyInterruptedUntil.delete(sessionId)

    return false
  }

  return true
}

export function clearSessionRecentlyInterrupted(sessionId?: string): void {
  if (sessionId) {
    _recentlyInterruptedUntil.delete(sessionId)

    return
  }

  _recentlyInterruptedUntil.clear()
}

/** Whether a rewind/edit should interrupt before submit — busy OR recent Stop. */
export function shouldInterruptBeforeRewind(opts: { busy: boolean; sessionId: string; now?: number }): boolean {
  return opts.busy || isSessionRecentlyInterrupted(opts.sessionId, opts.now)
}

// Hard guard: at most one prompt.submit in flight per session. Every submit
// path — user Enter, queue drain, busy-retry, slash fallthrough — funnels
// through submitPromptText. Without this, a stalled turn (e.g. a context-bloated
// session whose first call hangs) let the SAME prompt launch several real turns
// at once (the "message stacked 5×" bug). Keyed by stored/active session id.
// Entries expire so a hung submit cannot permanently block the session (#83855).
export const SUBMIT_IN_FLIGHT_TTL_MS = 30_000

const _submitInFlightAt = new Map<string, number>()

export function isSubmitInFlight(key: string, now = Date.now()): boolean {
  const acquiredAt = _submitInFlightAt.get(key)

  if (acquiredAt === undefined) {
    return false
  }

  if (now - acquiredAt >= SUBMIT_IN_FLIGHT_TTL_MS) {
    _submitInFlightAt.delete(key)

    return false
  }

  return true
}

/** Returns true when the lock was acquired; false when another fresh hold blocks. */
export function acquireSubmitInFlight(key: string, now = Date.now()): boolean {
  if (isSubmitInFlight(key, now)) {
    return false
  }

  _submitInFlightAt.set(key, now)

  return true
}

export function releaseSubmitInFlight(key: string): void {
  _submitInFlightAt.delete(key)
}

export function clearSubmitInFlight(): void {
  _submitInFlightAt.clear()
}

// The composer's attachment upload (and the read/error helpers it is built
// from) lives in application/session/upload-attachment.ts so that below-app
// callers — the message-edit composer — can use it without reaching into app/.
// Re-exported here because utils.test.ts still consumes these names through
// this path.
export {
  base64FromDataUrl,
  friendlyRemoteAttachError,
  imageFilenameFromPath,
  readFileDataUrlForAttach,
  readImageForRemoteAttach
} from '@/application/session/upload-attachment'

export function renderCommandsCatalog(catalog: CommandsCatalogLike, copy: Translations['desktop']): string {
  const desktopCatalog = filterDesktopCommandsCatalog(catalog)

  const sections = desktopCatalog.categories?.length
    ? desktopCatalog.categories
    : [{ name: copy.desktopCommands, pairs: desktopCatalog.pairs ?? [] }]

  const body = sections
    .filter(section => section.pairs.length > 0)
    .map(section => {
      const rows = section.pairs.map(([cmd, desc]) => `${cmd.padEnd(18)} ${desc}`)

      return [`${section.name}:`, ...rows].join('\n')
    })
    .join('\n\n')

  const tail = [
    desktopCatalog.skill_count ? copy.skillCommandsAvailable(desktopCatalog.skill_count) : '',
    desktopCatalog.warning ? copy.warningLine(desktopCatalog.warning) : ''
  ]
    .filter(Boolean)
    .join('\n')

  return [body || 'No desktop commands available.', tail].filter(Boolean).join('\n\n')
}

export function slashStatusText(command: string, output: string): string {
  return [`slash:${command}`, output.trim()].filter(Boolean).join('\n')
}

/**
 * Format the JSON reply from a gateway RPC surfaced as `kind: 'rpc'` in
 * desktop-slash-commands.ts. Kept here (instead of slash.ts) so it has no
 * React / store dependencies and can be unit-tested in isolation.
 *
 * The renderer follows the field conventions shared by the gateway handlers
 * we route to today:
 * - `session.compress`: { summary: { headline, token_line, note, noop } }
 *   (only used if /compress ever moves to `rpc`; it's an `action` today
 *   because it needs transcript replacement)
 * - `session.status`:   { output: "<multi-line plain text>" }
 * - `session.save`:     { file: "<absolute path>" }
 * - `session.usage`:    { calls, input, output, total, credits_lines? }
 * - `session.steer`:    { status: 'queued' | 'rejected', text }
 * - `process.stop`:     { killed: boolean }
 * - `agents.list`:      { processes: [{ session_id, command, status, uptime }] }
 *
 * Any RPC whose response doesn't match these shapes falls through to a
 * JSON.stringify dump so we never silently swallow data.
 */
export function renderRpcResult(response: unknown, name: string): string {
  if (!response || typeof response !== 'object') {
    return ''
  }

  const r = response as Record<string, unknown>

  const summary = r.summary as { headline?: string; token_line?: string; note?: string; noop?: boolean } | undefined

  if (summary && typeof summary === 'object' && typeof summary.headline === 'string' && summary.headline) {
    const lines: string[] = [`${summary.noop ? '' : '✓ '}${summary.headline}`]

    if (summary.token_line) {
      lines.push(`  ${summary.token_line}`)
    }

    if (summary.note) {
      lines.push(`  ${summary.note}`)
    }

    return lines.join('\n')
  }

  // session.steer — { status: 'queued' | 'rejected', text }
  if (r.status === 'queued' || r.status === 'rejected') {
    const text = typeof r.text === 'string' ? r.text : ''

    if (r.status === 'queued') {
      return text ? `Steered · "${text}" queued for next tool call` : 'Steered next tool call'
    }

    return 'Steer rejected — agent declined input'
  }

  // process.stop — { killed: number }
  if ('killed' in r && typeof r.killed === 'number') {
    return r.killed > 0
      ? `Stopped ${r.killed} background process${r.killed === 1 ? '' : 'es'}.`
      : 'No background processes to stop.'
  }

  // session.save — { file }
  if (typeof r.file === 'string' && r.file) {
    return `Saved transcript to ${r.file}`
  }

  // session.status — { output }
  if (typeof r.output === 'string' && r.output) {
    return r.output
  }

  // session.usage — { calls, input, output, total, credits_lines? }
  if ('total' in r || 'input' in r || 'output' in r || 'calls' in r) {
    const calls = Number(r.calls ?? 0)
    const input = Number(r.input ?? 0)
    const output = Number(r.output ?? 0)
    const total = Number(r.total ?? 0)

    const lines: string[] = [
      `Usage: ${calls.toLocaleString()} calls · ${input.toLocaleString()} in / ${output.toLocaleString()} out · ${total.toLocaleString()} total`
    ]

    if (Array.isArray(r.credits_lines)) {
      for (const credit of r.credits_lines) {
        if (typeof credit === 'string' && credit.trim()) {
          lines.push(credit.trim())
        }
      }
    }

    return lines.join('\n')
  }

  // agents.list — { processes: [{ session_id, command, status, uptime }] }
  if (Array.isArray(r.processes)) {
    if (r.processes.length === 0) {
      return 'No background tasks running.'
    }

    return r.processes
      .map(p => {
        if (!p || typeof p !== 'object') {
          return ''
        }

        const proc = p as Record<string, unknown>
        const status = typeof proc.status === 'string' ? proc.status : 'unknown'
        const command = typeof proc.command === 'string' ? proc.command : ''
        const sessionId = typeof proc.session_id === 'string' ? proc.session_id : ''
        const uptime = proc.uptime

        const meta: string[] = []

        if (typeof uptime === 'number' && uptime >= 0) {
          meta.push(`${uptime}s`)
        }

        if (sessionId) {
          meta.push(sessionId)
        }

        const tail = meta.length ? ` (${meta.join(' · ')})` : ''

        return `• [${status}] ${command}${tail}`
      })
      .filter(Boolean)
      .join('\n')
  }

  // Generic fallback — keeps us honest if the gateway adds new fields we
  // haven't shaped yet.
  return `/${name}: ${JSON.stringify(r)}`
}

export function appendText(message: AppendMessage): string {
  return message.content
    .map(part => ('text' in part ? part.text : ''))
    .join('')
    .trim()
}

/** The one visible-user filter every user-ordinal computation must share —
 *  truncate ordinals, ordinal→index resolution, and survivor-rowId rebinding
 *  all rely on counting exactly the same turns. */
export function isVisibleUserMessage(message: ChatMessage): boolean {
  return message.role === 'user' && !message.hidden
}

/**
 * A user turn whose submit failed: the optimistic bubble stayed in the
 * transcript (followed by an assistant error), but the turn never reached the
 * gateway, so it does not exist in backend history. Every backend-facing
 * user-turn count must skip these or every later ordinal overshoots the
 * gateway's index and the rewind mis-aims / gets refused (#41275, #86573).
 */
export function isFailedUserTurn(messages: readonly ChatMessage[], index: number): boolean {
  const next = messages[index + 1]

  return next?.role === 'assistant' && Boolean(next.error)
}

/**
 * Indices of the user turns the backend also knows about — visible AND not
 * failed. This is the ONE ordinal space shared with the gateway: truncate
 * ordinals, ordinal→index resolution, survivor-rowId rebinding, and durable
 * row-id resolution all iterate exactly this list.
 */
export function visibleUserMessageIndices(messages: readonly ChatMessage[]): number[] {
  const indices: number[] = []

  for (let index = 0; index < messages.length; index += 1) {
    if (isVisibleUserMessage(messages[index]) && !isFailedUserTurn(messages, index)) {
      indices.push(index)
    }
  }

  return indices
}

export function visibleUserOrdinal(messages: readonly ChatMessage[], end: number): number {
  return visibleUserMessageIndices(messages).filter(index => index < end).length
}

export function visibleUserIndexAtOrdinal(messages: readonly ChatMessage[], targetOrdinal: number): number {
  const indices = visibleUserMessageIndices(messages)

  return targetOrdinal >= 0 && targetOrdinal < indices.length ? indices[targetOrdinal] : -1
}

export type { SubmitTextOptions } from '@/types/composer'
