import {
  AgentBoxWireEventError,
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

/**
 * The production diagnostic outlet for a stream the host could not serve.
 *
 * It records the stable category and nothing else. The endpoint and the session
 * token live in the lifecycle closure, which is the whole point of that
 * closure — so no message, cause or connection object is allowed near this
 * line, and a caller-supplied sink has to accept the same restriction.
 */
function reportEventStreamCategory(error: Error): void {
  const code = error instanceof AgentBoxWireEventError ? error.code : 'unknown'

  console.warn(`[agentbox-wire] event stream ${code}`)
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
      onError: options.onEventError ?? reportEventStreamCategory
    })
  }
}

/** The main-process production seam starts disconnected until lifecycle boot installs a slot. */
export const agentBoxServiceComposition = createAgentBoxServiceComposition()
