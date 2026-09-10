import type { MutableRefObject } from 'react'
import type { NavigateFunction } from 'react-router'

import type { ClientSessionState } from '../../../types'

/** The session-surface state and callbacks the session action hooks operate on. */
export interface SessionActionsOptions {
  activeSessionId: string | null
  activeSessionIdRef: MutableRefObject<string | null>
  busyRef: MutableRefObject<boolean>
  creatingSessionRef: MutableRefObject<boolean>
  ensureSessionState: (sessionId: string, storedSessionId?: string | null) => ClientSessionState
  getRouteToken: () => string
  getRoutedStoredSessionId: () => null | string
  holdSessionTranscriptView?: (runtimeId: string) => () => void
  navigate: NavigateFunction
  onFreshDraftRouteIntent?: () => void
  requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
  resetViewSync: () => void
  runtimeIdByStoredSessionIdRef: MutableRefObject<Map<string, string>>
  selectedStoredSessionId: string | null
  selectedStoredSessionIdRef: MutableRefObject<string | null>
  sessionStateByRuntimeIdRef: MutableRefObject<Map<string, ClientSessionState>>
  syncSessionStateToView: (sessionId: string, state: ClientSessionState) => void
  updateSessionState: (
    sessionId: string,
    updater: (state: ClientSessionState) => ClientSessionState,
    storedSessionId?: string | null
  ) => ClientSessionState
}
