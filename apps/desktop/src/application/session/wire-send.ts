import { WireUnavailableError, type WireV1Client } from '@/api/wire-v1-client'
import {
  forgetPendingAgentBoxSend,
  pendingAgentBoxSend,
  rememberPendingAgentBoxSend
} from '@/store/agentbox-send-intents'
import { upsertAgentBoxSession } from '@/store/agentbox-service'
import {
  asRequestId,
  type ConfigOverride,
  type DraftMessage,
  type RequestId,
  type WireId
} from '@/types/wire/wire-v1'

interface SendBase {
  intentKey: string
  message: DraftMessage
  overrides: ConfigOverride[]
  scopeKey: string
}

export interface CreateAndSendIntent extends SendBase {
  kind: 'create'
  profileId: WireId
  workspaceId: WireId
}

export interface ContinueSendIntent extends SendBase {
  kind: 'continue'
  sessionId: WireId
}

export type AgentBoxSendIntent = ContinueSendIntent | CreateAndSendIntent

export type AgentBoxSendDecision =
  | {
      outcome: 'accepted'
      executionId: null | WireId
      intentKey: string
      queueItemId: null | WireId
      requestId: RequestId
      sessionId: WireId
    }
  | { intentKey: string; outcome: 'rejected'; reason: string; requestId: RequestId }
  | { intentKey: string; outcome: 'unknown'; requestId: RequestId }

export interface SendAgentBoxMessageOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * One durable send intent. A transport failure is UNKNOWN, never rejection:
 * the same request id is persisted and queried on retry. A changed draft uses
 * a changed intentKey and therefore gets a new identity without overwriting
 * the unresolved older request.
 */
export async function sendAgentBoxMessage(
  client: WireV1Client,
  intent: AgentBoxSendIntent,
  options: SendAgentBoxMessageOptions = {}
): Promise<AgentBoxSendDecision> {
  const previous = pendingAgentBoxSend(intent.scopeKey)

  if (previous) {
    return queryAgentBoxSendOutcome(client, intent.scopeKey, previous.intentKey, previous.requestId)
  }

  const requestId = (options.createRequestId ?? defaultRequestId)()
  rememberPendingAgentBoxSend(intent.scopeKey, { intentKey: intent.intentKey, requestId })

  try {
    if (intent.kind === 'create') {
      const result = await client.call('sessions.createAndSend', {
        message: intent.message,
        overrides: intent.overrides,
        profileId: intent.profileId,
        requestId,
        workspaceId: intent.workspaceId
      })

      if (result.outcome === 'rejected_before_accept') {
        forgetPendingAgentBoxSend(intent.scopeKey, intent.intentKey)

        return { intentKey: intent.intentKey, outcome: 'rejected', reason: result.reason, requestId }
      }

      upsertAgentBoxSession(result.session)
      forgetPendingAgentBoxSend(intent.scopeKey, intent.intentKey)

      return {
        executionId: result.executionId,
        intentKey: intent.intentKey,
        outcome: 'accepted',
        queueItemId: null,
        requestId,
        sessionId: result.session.id
      }
    }

    const result = await client.call('sessions.send', {
      message: intent.message,
      overrides: intent.overrides,
      requestId,
      sessionId: intent.sessionId
    })

    if (result.outcome === 'rejected_before_accept') {
      forgetPendingAgentBoxSend(intent.scopeKey, intent.intentKey)

      return { intentKey: intent.intentKey, outcome: 'rejected', reason: result.reason, requestId }
    }

    forgetPendingAgentBoxSend(intent.scopeKey, intent.intentKey)

    return {
      executionId: result.executionId,
      intentKey: intent.intentKey,
      outcome: 'accepted',
      queueItemId: result.queueItemId,
      requestId,
      sessionId: intent.sessionId
    }
  } catch (error) {
    if (!(error instanceof WireUnavailableError)) {
      throw error
    }

    return queryAgentBoxSendOutcome(client, intent.scopeKey, intent.intentKey, requestId)
  }
}

async function queryAgentBoxSendOutcome(
  client: WireV1Client,
  scopeKey: string,
  intentKey: string,
  requestId: RequestId
): Promise<AgentBoxSendDecision> {
  try {
    const result = await client.call('sendOutcome.query', { requestId })

    if (result.outcome === 'unknown') {
      return { intentKey, outcome: 'unknown', requestId }
    }

    forgetPendingAgentBoxSend(scopeKey, intentKey)

    if (result.outcome === 'rejected_before_accept') {
      return { intentKey, outcome: 'rejected', reason: result.reason, requestId }
    }

    return {
      executionId: result.executionId,
      intentKey,
      outcome: 'accepted',
      queueItemId: null,
      requestId,
      sessionId: result.sessionId
    }
  } catch (error) {
    if (error instanceof WireUnavailableError) {
      return { intentKey, outcome: 'unknown', requestId }
    }

    throw error
  }
}
