import {
  type AgentBoxWireEventSubscriber,
  createAgentBoxWireEventTransport
} from '../security/agentbox-wire-event-transport'
import {
  type AgentBoxWireDispatcher,
  type AgentBoxWireHostConnection,
  createAgentBoxWireHttpTransport
} from '../security/agentbox-wire-transport'

export interface AgentBoxServiceConnectionSlot {
  current(): AgentBoxWireHostConnection | null
  install(next: AgentBoxWireHostConnection | null): AgentBoxWireHostConnection | null
}

export interface AgentBoxServiceCompositionOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  onEventError?: (error: Error) => void
}

export interface AgentBoxServiceComposition {
  connectionSlot: AgentBoxServiceConnectionSlot
  requestWire: AgentBoxWireDispatcher
  subscribeWireEvents: AgentBoxWireEventSubscriber
}

export function createAgentBoxServiceComposition(
  options: AgentBoxServiceCompositionOptions = {}
): AgentBoxServiceComposition {
  let activeConnection: AgentBoxWireHostConnection | null = null

  const connectionSlot: AgentBoxServiceConnectionSlot = {
    current: () => activeConnection,
    install: next => {
      const previous = activeConnection
      activeConnection = next

      return previous
    }
  }

  return {
    connectionSlot,
    requestWire: createAgentBoxWireHttpTransport({
      connection: connectionSlot.current,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs
    }),
    subscribeWireEvents: createAgentBoxWireEventTransport({
      connection: connectionSlot.current,
      onError: options.onEventError
    })
  }
}

/** The main-process production seam starts disconnected until lifecycle boot installs a slot. */
export const agentBoxServiceComposition = createAgentBoxServiceComposition()
