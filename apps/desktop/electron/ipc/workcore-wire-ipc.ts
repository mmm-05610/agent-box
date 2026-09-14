import { ipcMain, type IpcMainEvent, type WebContents } from 'electron'

import type { AgentBoxWireDispatcher } from '../security/agentbox-wire-transport'

interface WorkCoreWireRequest {
  body: unknown
  method: string
  path: `/wire/v1/${string}`
}

interface WireEventSubscription {
  cursor: string
  sessionId: string
}

interface WireEventSubscriptionRequest {
  cursor: string
  sessionId: string
  subscriptionId: string
}

export interface RegisterWorkCoreWireIpcDeps {
  requestWire: AgentBoxWireDispatcher
  /** Future lifecycle-owned stream source. The IPC layer only forwards opaque
   * frames; renderer schema validation owns business meaning. */
  subscribeWireEvents?: (input: WireEventSubscription, listener: (frame: unknown) => void) => () => void
}

const SUBSCRIBE_CHANNEL = 'agentbox:wire:events:subscribe'
const UNSUBSCRIBE_CHANNEL = 'agentbox:wire:events:unsubscribe'
const EVENT_CHANNEL = 'agentbox:wire:event'
const MAX_WIRE_EVENT_FIELD_LENGTH = 512

function parseSubscription(value: unknown): WireEventSubscriptionRequest {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Invalid AgentBox event subscription')
  }

  const candidate = value as Record<string, unknown>
  const fields = ['cursor', 'sessionId', 'subscriptionId'] as const

  if (fields.some(field => typeof candidate[field] !== 'string' || candidate[field].length === 0 || candidate[field].length > MAX_WIRE_EVENT_FIELD_LENGTH)) {
    throw new TypeError('Invalid AgentBox event subscription fields')
  }

  return {
    cursor: candidate.cursor as string,
    sessionId: candidate.sessionId as string,
    subscriptionId: candidate.subscriptionId as string
  }
}

function parseWorkCoreWireRequest(value: unknown): WorkCoreWireRequest {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Invalid AgentBox wire request')
  }

  const candidate = value as Record<string, unknown>
  const method = candidate.method

  if (typeof method !== 'string' || !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(method)) {
    throw new TypeError('Invalid AgentBox wire method')
  }

  const expectedPath = `/wire/v1/${method}`

  if (candidate.path !== expectedPath) {
    throw new TypeError('AgentBox wire path does not match method')
  }

  if (!candidate.body || typeof candidate.body !== 'object') {
    throw new TypeError('Invalid AgentBox wire envelope')
  }

  const body = candidate.body as Record<string, unknown>

  if (body.jsonrpc !== '2.0' || body.method !== method || !('id' in body) || !('params' in body)) {
    throw new TypeError('AgentBox wire envelope does not match method')
  }

  return { body, method, path: expectedPath as WorkCoreWireRequest['path'] }
}

export function registerWorkCoreWireIpc({ requestWire, subscribeWireEvents }: RegisterWorkCoreWireIpcDeps): () => void {
  const subscriptions = new Map<number, Map<string, { cleanup: () => void; sender: WebContents }>>()
  const destroyedListeners = new Map<number, () => void>()

  ipcMain.handle('agentbox:wire:request', (_event, value: unknown) => {
    const request = parseWorkCoreWireRequest(value)

    return requestWire({ body: request.body, path: request.path })
  })

  const removeSubscription = (sender: WebContents, subscriptionId: string) => {
    const owned = subscriptions.get(sender.id)
    const subscription = owned?.get(subscriptionId)

    if (!subscription) {
      return
    }

    owned?.delete(subscriptionId)

    if (owned?.size === 0) {
      subscriptions.delete(sender.id)
      destroyedListeners.get(sender.id)?.()
      destroyedListeners.delete(sender.id)
    }

    try {
      subscription.cleanup()
    } catch {
      // A source cleanup must not prevent other subscriptions or global
      // teardown from being released.
    }
  }

  const onSubscribe = (event: IpcMainEvent, value: unknown) => {
    let input: WireEventSubscriptionRequest

    try {
      input = parseSubscription(value)
    } catch {
      return
    }

    removeSubscription(event.sender, input.subscriptionId)

    if (!subscribeWireEvents) {
      return
    }

    const owned = subscriptions.get(event.sender.id) ?? new Map()
    subscriptions.set(event.sender.id, owned)

    if (!destroyedListeners.has(event.sender.id)) {
      const onDestroyed = () => {
        for (const subscriptionId of subscriptions.get(event.sender.id)?.keys() ?? []) {
          removeSubscription(event.sender, subscriptionId)
        }

        destroyedListeners.delete(event.sender.id)
      }

      event.sender.once('destroyed', onDestroyed)
      destroyedListeners.set(event.sender.id, () => event.sender.removeListener('destroyed', onDestroyed))
    }

    const entry = { cleanup: () => undefined, sender: event.sender }

    owned.set(input.subscriptionId, entry)

    try {
      const cleanup = subscribeWireEvents({ cursor: input.cursor, sessionId: input.sessionId }, frame => {
        const current = subscriptions.get(event.sender.id)?.get(input.subscriptionId)

        if (current?.sender !== event.sender || event.sender.isDestroyed()) {
          return
        }

        event.sender.send(EVENT_CHANNEL, { frame, subscriptionId: input.subscriptionId })
      })

      entry.cleanup = cleanup
    } catch {
      removeSubscription(event.sender, input.subscriptionId)
    }
  }

  const onUnsubscribe = (event: IpcMainEvent, value: unknown) => {
    if (!value || typeof value !== 'object' || typeof (value as Record<string, unknown>).subscriptionId !== 'string') {
      return
    }

    removeSubscription(event.sender, (value as { subscriptionId: string }).subscriptionId)
  }

  ipcMain.on(SUBSCRIBE_CHANNEL, onSubscribe)
  ipcMain.on(UNSUBSCRIBE_CHANNEL, onUnsubscribe)

  const cleanup = () => {
    for (const [senderId, owned] of subscriptions) {
      for (const subscriptionId of owned.keys()) {
        const sender = owned.get(subscriptionId)?.sender

        if (sender) {
          removeSubscription(sender, subscriptionId)
        }
      }

      subscriptions.delete(senderId)
    }

    for (const off of destroyedListeners.values()) {
      off()
    }

    destroyedListeners.clear()
    ipcMain.removeListener(SUBSCRIBE_CHANNEL, onSubscribe)
    ipcMain.removeListener(UNSUBSCRIBE_CHANNEL, onUnsubscribe)
  }

  return cleanup
}
