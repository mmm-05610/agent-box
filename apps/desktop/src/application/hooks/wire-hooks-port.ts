import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, asWireId, type HookModel, type HookTriggerView, type HookView, type RequestId } from '@/types/wire/wire-v1'

export interface HooksPort {
  /** `UNAVAILABLE` means the deployment composed no hook ledger — the surface
   *  says so instead of drawing an empty list that reads as "none defined". */
  list(): Promise<HookView[]>
  create(intent: { family: string; model: HookModel; name: string; source?: string }): Promise<HookView>
  setEnabled(intent: { enabled: boolean; hookId: string }): Promise<HookView>
  /** Deleting a hook drops its trigger history with it; the answer says how
   *  many rows went. */
  remove(hookId: string): Promise<{ deleted: boolean; triggersRemoved: number }>
  triggers(intent?: { hookId?: string; limit?: number }): Promise<HookTriggerView[]>
}

export interface WireHooksOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/** Order 59: the managed hooks. A hook is created DISABLED (the service decides
 *  that, not the client), carries the exact commands it would run, and its
 *  enable state is a separate, explicit write. */
export function wireHooksPort(client: WireV1Client, options: WireHooksOptions = {}): HooksPort {
  const requestId = options.createRequestId ?? defaultRequestId

  return {
    async create(intent) {
      const result = await client.call('hooks.create', {
        family: intent.family,
        model: intent.model,
        name: intent.name,
        requestId: requestId(),
        ...(intent.source === undefined ? {} : { source: intent.source })
      })

      return result.hook
    },
    async list() {
      const result = await client.call('hooks.list', { requestId: requestId() })

      return result.hooks
    },
    async remove(hookId) {
      const result = await client.call('hooks.delete', { hookId: asWireId(hookId), requestId: requestId() })

      return { deleted: result.deleted, triggersRemoved: result.triggersRemoved }
    },
    async setEnabled(intent) {
      const result = await client.call('hooks.setEnabled', {
        enabled: intent.enabled,
        hookId: asWireId(intent.hookId),
        requestId: requestId()
      })

      return result.hook
    },
    async triggers(intent = {}) {
      const result = await client.call('hooks.triggers', {
        ...(intent.hookId === undefined ? {} : { hookId: asWireId(intent.hookId) }),
        ...(intent.limit === undefined ? {} : { limit: intent.limit }),
        requestId: requestId()
      })

      return result.triggers
    }
  }
}
