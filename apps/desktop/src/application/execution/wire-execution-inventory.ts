import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, type ExecutionInventoryRow, type RequestId } from '@/types/wire/wire-v1'

export interface ExecutionInventoryReadOptions {
  createRequestId?: () => RequestId
  /** Rows to ask for; the service refuses (typed) rather than truncating, so
   *  the caller's bound is also the honest ceiling. */
  limit?: number
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * Order 64: the in-flight executions of this service, straight from the
 * ledger. Read-only by construction — there is no cancellation surface here,
 * and an over-limit answer arrives as a typed failure instead of a shorter
 * list that would look complete.
 */
export async function loadExecutionInventory(
  client: WireV1Client,
  options: ExecutionInventoryReadOptions = {}
): Promise<ExecutionInventoryRow[]> {
  const result = await client.call('executions.list', {
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })

  return result.executions
}
