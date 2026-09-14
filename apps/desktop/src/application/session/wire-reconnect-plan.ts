import {
  type HistorySnapshotParams,
  WIRE_EVENT_STREAM,
  type WireCursor,
  type WireId
} from '@/types/wire/wire-v1'

export interface WireReconnectPlan {
  eventStream: typeof WIRE_EVENT_STREAM
  snapshot: {
    method: 'history.snapshot'
    params: HistorySnapshotParams
  }
}

/** Reconnect only reads history. It never manufactures a send/dispatch call. */
export function planWireReconnect(sessionId: WireId, cursor: null | WireCursor): WireReconnectPlan {
  return {
    eventStream: WIRE_EVENT_STREAM,
    snapshot: {
      method: 'history.snapshot',
      params: { sessionId, ...(cursor ? { cursor } : {}) }
    }
  }
}
