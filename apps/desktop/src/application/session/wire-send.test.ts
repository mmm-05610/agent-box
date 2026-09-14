import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WireUnavailableError, type WireV1Client } from '@/api/wire-v1-client'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { asRequestId, asWireId, type DraftMessage, type SessionRecord } from '@/types/wire/wire-v1'

import {
  type ContinueSendIntent,
  type CreateAndSendIntent,
  resolvePendingAgentBoxSend,
  sendAgentBoxMessage
} from './wire-send'

const requestId = asRequestId('request-fixed-0001')
const message: DraftMessage = { attachments: [], text: 'ship it' }

const session: SessionRecord = {
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Ship it',
  id: asWireId('session-1'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1')
}

const createIntent: CreateAndSendIntent = {
  intentKey: 'draft-version-7',
  kind: 'create',
  message,
  overrides: [],
  profileId: asWireId('profile-1'),
  scopeKey: 'workspace:workspace-1',
  workspaceId: asWireId('workspace-1')
}

const continueIntent: ContinueSendIntent = {
  intentKey: 'session-version-4',
  kind: 'continue',
  message,
  overrides: [],
  scopeKey: 'session:session-1',
  sessionId: session.id
}

function client(call: (method: string, params: unknown) => Promise<unknown>) {
  return { call: vi.fn(call) } as unknown as WireV1Client & { call: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  $pendingAgentBoxSends.set({ items: {}, version: 1 })
  $agentBoxSessions.set({})
})

describe('sendAgentBoxMessage', () => {
  it('adopts the server-created Session and clears the pending identity only after acceptance', async () => {
    const wire = client(async method => {
      expect(method).toBe('sessions.createAndSend')

      return { configVersion: 2, executionId: asWireId('execution-1'), outcome: 'accepted', session }
    })

    await expect(sendAgentBoxMessage(wire, createIntent, { createRequestId: () => requestId })).resolves.toMatchObject({
      executionId: 'execution-1',
      intentKey: 'draft-version-7',
      outcome: 'accepted',
      sessionId: 'session-1'
    })
    expect(wire.call).toHaveBeenCalledWith('sessions.createAndSend', expect.objectContaining({ requestId }))
    expect($agentBoxSessions.get()['session-1']).toEqual(session)
    expect($pendingAgentBoxSends.get().items).toEqual({})
  })

  it('queries the same request after an ambiguous transport failure and never resends it', async () => {
    const wire = client(async method => {
      if (method === 'sessions.send') {
        throw new WireUnavailableError('socket closed after dispatch')
      }

      return { outcome: 'unknown' }
    })

    await expect(sendAgentBoxMessage(wire, continueIntent, { createRequestId: () => requestId })).resolves.toMatchObject({
      outcome: 'unknown',
      requestId
    })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sessions.send', 'sendOutcome.query'])
    expect($pendingAgentBoxSends.get().items[continueIntent.scopeKey]).toEqual({
      intentKey: continueIntent.intentKey,
      requestId
    })

    wire.call.mockResolvedValueOnce({
      configVersion: 2,
      executionId: asWireId('execution-2'),
      outcome: 'accepted',
      queueItemId: null,
      sessionId: session.id
    })

    await expect(sendAgentBoxMessage(wire, continueIntent)).resolves.toMatchObject({ outcome: 'accepted', requestId })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual([
      'sessions.send',
      'sendOutcome.query',
      'sendOutcome.query'
    ])
    expect($pendingAgentBoxSends.get().items).toEqual({})
  })

  it('resolves an older unknown request before allowing a changed draft to send', async () => {
    $pendingAgentBoxSends.set({
      items: { [continueIntent.scopeKey]: { intentKey: 'older-draft', requestId } },
      version: 1
    })
    const wire = client(async () => ({ outcome: 'unknown' }))

    await expect(sendAgentBoxMessage(wire, { ...continueIntent, intentKey: 'newer-draft' })).resolves.toEqual({
      intentKey: 'older-draft',
      outcome: 'unknown',
      requestId
    })
    expect(wire.call).toHaveBeenCalledTimes(1)
    expect(wire.call).toHaveBeenCalledWith('sendOutcome.query', { requestId })
    expect($pendingAgentBoxSends.get().items[continueIntent.scopeKey]?.intentKey).toBe('older-draft')
  })

  it('clears a definitively rejected request while preserving its reason', async () => {
    const wire = client(async () => ({ outcome: 'rejected_before_accept', reason: 'profile unavailable' }))

    await expect(sendAgentBoxMessage(wire, continueIntent, { createRequestId: () => requestId })).resolves.toEqual({
      intentKey: continueIntent.intentKey,
      outcome: 'rejected',
      reason: 'profile unavailable',
      requestId
    })
    expect($pendingAgentBoxSends.get().items).toEqual({})
  })
})

describe('resolvePendingAgentBoxSend', () => {
  it('returns null without touching the transport when the scope has nothing outstanding', async () => {
    const wire = client(async () => {
      throw new Error('must not call')
    })

    await expect(resolvePendingAgentBoxSend(wire, continueIntent.scopeKey)).resolves.toBeNull()
    expect(wire.call).not.toHaveBeenCalled()
  })

  it('settles an outstanding send by its own requestId and intent key', async () => {
    $pendingAgentBoxSends.set({
      items: { [continueIntent.scopeKey]: { intentKey: 'older-draft', requestId } },
      version: 1
    })
    const wire = client(async () => ({ outcome: 'unknown' }))

    await expect(resolvePendingAgentBoxSend(wire, continueIntent.scopeKey)).resolves.toEqual({
      intentKey: 'older-draft',
      outcome: 'unknown',
      requestId
    })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query'])
    expect(wire.call).toHaveBeenCalledWith('sendOutcome.query', { requestId })
  })
})
