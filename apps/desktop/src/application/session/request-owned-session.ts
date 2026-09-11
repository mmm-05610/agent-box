import { assertSessionOwnerResolved } from '@/store/session-owner-resolution'
import { knownOwnerForSession } from '@/store/session-states'

import { requestForSessionProfile } from './request-router'

/**
 * Dispatch a session-scoped RPC through the OWNER of `sessionId` (tile route →
 * hint → connection-tagged row / known profile). This is the client half of
 * #91684: approval.respond (and siblings) sent on the ambient socket land on
 * whatever backend is active, which for a cross-profile session is a backend
 * that never held the approval. An UNKNOWN owner fails closed with an explicit
 * SessionOwnerResolutionError unless the ambient gateway is provably the only
 * backend (legacy single-profile, no registry source).
 *
 * The two halves sit on opposite sides of the layer line on purpose: the owner
 * LADDER is a query over session state (`knownOwnerForSession`) and stays in the
 * store, while the fail-closed gate plus the actual send is an orchestration
 * over state and transport, so it lives here.
 */
export function requestForOwnedSession<T>(
  sessionId: null | string | undefined,
  ambientRequest: <R>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal
  ) => Promise<R>,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const owner = knownOwnerForSession(sessionId)

  try {
    assertSessionOwnerResolved(owner, { method, sessionId })
  } catch (error) {
    return Promise.reject(error)
  }

  return requestForSessionProfile<T>(owner, ambientRequest, method, params, timeoutMs, signal)
}
