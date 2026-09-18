import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import type { WireV1Client } from '@/api/wire-v1-client'
import { routeSessionId } from '@/app/routes'
import { archiveAgentBoxSession, updateAgentBoxSession } from '@/application/session/wire-session-catalog'
import {
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  agentBoxCapabilitySupported,
  type AgentBoxServiceState
} from '@/store/agentbox-service'
import type { ServerHelloResult, SessionRecord } from '@/types/wire/wire-v1'

/** Why the current-session pin command refused to act on a session route.
 *  Every reason is fail-closed: no wire call, and never a substitution with
 *  the same-id legacy Hermes session or its renderer-local pin store. */
export type AgentBoxSessionPinFailure =
  | 'CAPABILITY_NOT_DECLARED'
  | 'SERVICE_NOT_READY'
  | 'SESSION_RECORD_NOT_ARRIVED'

export type AgentBoxSessionPinCommand =
  /** Not a session route — no AgentBox opinion; the legacy selection governs. */
  | { action: 'legacy' }
  /** A session route the service cannot prove yet. */
  | { action: 'fail-closed'; reason: AgentBoxSessionPinFailure }
  /** The service record on the current route, ready for the CAS flip. */
  | { action: 'wire'; record: SessionRecord }

export interface AgentBoxSessionPinInput {
  capabilitySupported: boolean
  pathname: string
  serviceReady: boolean
  sessions: Readonly<Record<string, SessionRecord>>
}

/**
 * The current-session pin decision, kept narrow and pure so the keybind, the
 * statusbar and the chat header all share one testable decision.
 *
 * The route id is the authority on a session route: only a SERVICE record may
 * act, and a record that has not arrived (or the service not being ready, or
 * `sessions.update` not declared) must never fall back to a same-id legacy
 * session — the command simply does nothing.
 */
export function decideAgentBoxSessionPin(input: AgentBoxSessionPinInput): AgentBoxSessionPinCommand {
  const routedSessionId = routeSessionId(input.pathname)

  if (!routedSessionId) {
    return { action: 'legacy' }
  }

  if (!input.serviceReady) {
    return { action: 'fail-closed', reason: 'SERVICE_NOT_READY' }
  }

  if (!input.capabilitySupported) {
    return { action: 'fail-closed', reason: 'CAPABILITY_NOT_DECLARED' }
  }

  const record = input.sessions[routedSessionId]

  if (!record) {
    return { action: 'fail-closed', reason: 'SESSION_RECORD_NOT_ARRIVED' }
  }

  return { action: 'wire', record }
}

/**
 * The one CAS entry both the sidebar row and the current-session command flip
 * `pinned` through, so the `sessions.update` payload cannot drift apart:
 * exact `expectedVersion` of the record shown, the inverted pin, a freshly
 * minted requestId, and only the returned record is adopted.
 */
export function toggleAgentBoxSessionPin(
  client: WireV1Client,
  current: Pick<SessionRecord, 'id' | 'pinned' | 'version'>
): Promise<SessionRecord> {
  return updateAgentBoxSession(client, {
    expectedVersion: current.version,
    pinned: !current.pinned,
    sessionId: current.id
  })
}

/** The wiring read: the live stores as the decision's input. */
export function readAgentBoxSessionPinInput(
  service: AgentBoxServiceState,
  hello: ServerHelloResult | null,
  sessions: Record<string, SessionRecord>,
  pathname: string
): AgentBoxSessionPinInput {
  return {
    capabilitySupported: agentBoxCapabilitySupported(hello, 'sessions.update'),
    pathname,
    serviceReady: service.phase === 'ready',
    sessions
  }
}

/** A live attempt: the intent's direction plus the CAS in flight, so the
 *  caller can phrase a failure the same way the sidebar does. */
export interface AgentBoxSessionPinAttempt {
  pinned: boolean
  promise: Promise<SessionRecord>
}

/** The production composition the wiring calls: decide from the live stores,
 *  flip through the shared seam. Returns null when the decision was not a
 *  wire command (legacy is the caller's business). */
export function toggleRoutedAgentBoxSessionPin(pathname: string): AgentBoxSessionPinAttempt | null {
  const decision = decideAgentBoxSessionPin(
    readAgentBoxSessionPinInput($agentBoxService.get(), $agentBoxHello.get(), $agentBoxSessions.get(), pathname)
  )

  if (decision.action !== 'wire') {
    return null
  }

  return {
    pinned: !decision.record.pinned,
    promise: toggleAgentBoxSessionPin(agentBoxRuntimeClient(), decision.record)
  }
}

/** Why the current-session archive command refused to act on a session route.
 *  Every reason is fail-closed: no wire call, no re-archive of a record the
 *  service already archived, and never a substitution with the same-id legacy
 *  Hermes session or its renderer-local archive. */
export type AgentBoxSessionArchiveFailure =
  | 'ALREADY_ARCHIVED'
  | 'CAPABILITY_NOT_DECLARED'
  | 'SERVICE_NOT_READY'
  | 'SESSION_RECORD_NOT_ARRIVED'

export type AgentBoxSessionArchiveCommand =
  /** Not a session route — no AgentBox opinion; the legacy archive governs. */
  | { action: 'legacy' }
  /** A session route the service cannot prove, or one already archived. */
  | { action: 'fail-closed'; reason: AgentBoxSessionArchiveFailure }
  /** The service record on the current route, ready for the CAS archive. */
  | { action: 'wire'; record: SessionRecord }

export interface AgentBoxSessionArchiveInput {
  capabilitySupported: boolean
  pathname: string
  serviceReady: boolean
  sessions: Readonly<Record<string, SessionRecord>>
}

/**
 * The current-session archive decision, kept narrow and pure so the sidebar
 * row and the command share one testable decision.
 *
 * The route id is the authority on a session route: only a SERVICE record may
 * be archived, and a record that has not arrived (or the service not being
 * ready, or `sessions.archive` not declared) must never fall back to a same-id
 * legacy session or the renderer-local archive — the command simply does
 * nothing. A record the service already archived is refused here too, so a
 * re-archive can never reach the wire.
 */
export function decideAgentBoxSessionArchive(input: AgentBoxSessionArchiveInput): AgentBoxSessionArchiveCommand {
  const routedSessionId = routeSessionId(input.pathname)

  if (!routedSessionId) {
    return { action: 'legacy' }
  }

  if (!input.serviceReady) {
    return { action: 'fail-closed', reason: 'SERVICE_NOT_READY' }
  }

  if (!input.capabilitySupported) {
    return { action: 'fail-closed', reason: 'CAPABILITY_NOT_DECLARED' }
  }

  const record = input.sessions[routedSessionId]

  if (!record) {
    return { action: 'fail-closed', reason: 'SESSION_RECORD_NOT_ARRIVED' }
  }

  if (record.archivedAt !== null) {
    return { action: 'fail-closed', reason: 'ALREADY_ARCHIVED' }
  }

  return { action: 'wire', record }
}

/**
 * The current-session command's CAS entry. The sidebar row archives through
 * the SAME application seam with the same three fields, so the
 * `sessions.archive` payload cannot drift apart between the two callers: the
 * exact `expectedVersion` of the record shown, its id, and a freshly minted
 * requestId (the application seam mints it).
 */
export function archiveAgentBoxSessionRecord(
  client: WireV1Client,
  current: Pick<SessionRecord, 'id' | 'version'>
): Promise<SessionRecord> {
  return archiveAgentBoxSession(client, {
    expectedVersion: current.version,
    sessionId: current.id
  })
}

/** The wiring read: the live stores as the archive decision's input. */
export function readAgentBoxSessionArchiveInput(
  service: AgentBoxServiceState,
  hello: ServerHelloResult | null,
  sessions: Record<string, SessionRecord>,
  pathname: string
): AgentBoxSessionArchiveInput {
  return {
    capabilitySupported: agentBoxCapabilitySupported(hello, 'sessions.archive'),
    pathname,
    serviceReady: service.phase === 'ready',
    sessions
  }
}

/** A live attempt: the CAS in flight, so the caller can phrase a failure the
 *  same way the sidebar does. */
export interface AgentBoxSessionArchiveAttempt {
  promise: Promise<SessionRecord>
}

/** The production composition the wiring calls: decide from the live stores,
 *  archive through the shared seam. Returns null when the decision was not a
 *  wire command — legacy is the caller's business, and a fail-closed route
 *  (including one already archived) simply does nothing. */
export function archiveRoutedAgentBoxSession(pathname: string): AgentBoxSessionArchiveAttempt | null {
  const decision = decideAgentBoxSessionArchive(
    readAgentBoxSessionArchiveInput($agentBoxService.get(), $agentBoxHello.get(), $agentBoxSessions.get(), pathname)
  )

  if (decision.action !== 'wire') {
    return null
  }

  return {
    promise: archiveAgentBoxSessionRecord(agentBoxRuntimeClient(), decision.record)
  }
}
