import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { asWireId, type ConfigOverride, type ConfigResolveResult, type SessionRecord } from '@/types/wire/wire-v1'

import { prepareAgentBoxDraftMessage, submitAgentBoxComposer } from './agentbox-composer'

const session: SessionRecord = {
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Session',
  id: asWireId('session-1'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1')
}

function client(call: (method: string, params: unknown) => Promise<unknown>) {
  return { call: vi.fn(call) } as unknown as WireV1Client & { call: ReturnType<typeof vi.fn> }
}

const resolved = (effective: Array<{ controlId: string; value: unknown }> = []): ConfigResolveResult => ({
  effective,
  outcome: 'resolved'
})

/** A service that answers the effective-config check and the send verb it is
 *  actually asked about. */
function wireService(answers: Record<string, unknown>) {
  return client(async method => {
    if (method in answers) {
      return answers[method]
    }

    throw new Error(`unexpected method ${method}`)
  })
}

beforeEach(() => {
  $pendingAgentBoxSends.set({ items: {}, version: 1 })
  $agentBoxSessions.set({})
})

describe('AgentBox Composer application boundary', () => {
  it('creates a Session only on the first accepted send and uses the draft version as intent identity', async () => {
    const wire = client(async (method, params) => {
      if (method === 'config.resolve') {
        return resolved()
      }

      expect(params).toMatchObject({ workspaceId: 'workspace-1', profileId: 'profile-1' })

      return { configVersion: 1, executionId: asWireId('execution-1'), outcome: 'accepted', session }
    })

    const result = await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 7,
      overrides: [],
      profileId: 'profile-1',
      scopeKey: 'workspace:workspace-1',
      sessionId: null,
      text: 'start here',
      workspaceId: 'workspace-1'
    })

    expect(result).toMatchObject({ acceptedForDraft: true, decision: { intentKey: '7', sessionId: 'session-1' } })
    expect(wire.call).toHaveBeenCalledWith('sessions.createAndSend', expect.any(Object))
  })

  it('sends a busy follow-up directly to sessions.send and refreshes the server queue after acceptance', async () => {
    const wire = client(async method =>
      method === 'config.resolve'
        ? resolved()
        : {
            configVersion: 2,
            executionId: null,
            outcome: 'accepted',
            queueItemId: asWireId('queue-1')
          }
    )

    const refreshQueue = vi.fn(async () => undefined)

    const result = await submitAgentBoxComposer(
      wire,
      {
        attachments: [],
        draftVersion: 8,
        overrides: [],
        profileId: 'profile-1',
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'do this next',
        workspaceId: 'workspace-1'
      },
      { refreshQueue }
    )

    expect(result).toMatchObject({ acceptedForDraft: true, decision: { queueItemId: 'queue-1' } })
    expect(wire.call).toHaveBeenCalledWith('sessions.send', expect.any(Object))
    expect(refreshQueue).toHaveBeenCalledWith(wire, 'session-1')
  })

  it('keeps a newer draft when an older pending request is the outcome being resolved', async () => {
    $pendingAgentBoxSends.set({
      items: { 'session-1': { intentKey: '7', requestId: 'request-old' as never } },
      version: 1
    })

    const wire = client(async method =>
      method === 'config.resolve'
        ? resolved()
        : {
            configVersion: 1,
            executionId: asWireId('execution-old'),
            outcome: 'accepted',
            queueItemId: null,
            sessionId: asWireId('session-1')
          }
    )

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 8,
        overrides: [],
        profileId: 'profile-1',
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'newer text',
        workspaceId: 'workspace-1'
      })
    ).resolves.toMatchObject({ acceptedForDraft: false, decision: { intentKey: '7', outcome: 'accepted' } })
    expect(wire.call).toHaveBeenCalledWith('sendOutcome.query', { requestId: 'request-old' })
  })

  it('rejects unstaged attachments before transport and never serializes browser-local fields', async () => {
    const wire = client(async () => {
      throw new Error('must not call')
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [{ id: 'local', kind: 'image', label: 'local.png', previewUrl: 'data:image/png;base64,abc' }],
        draftVersion: 2,
        overrides: [],
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'inspect',
        workspaceId: 'workspace-1'
      })
    ).resolves.toEqual({ acceptedForDraft: false, outcome: 'invalid', reason: 'ATTACHMENT_NOT_STAGED' })
    expect(wire.call).not.toHaveBeenCalled()
  })

  it('maps only an opaque staged reference into the wire attachment', () => {
    expect(
      prepareAgentBoxDraftMessage('read it', [
        {
          id: 'doc',
          kind: 'file',
          label: 'notes.txt',
          path: 'C:\\Users\\alice\\notes.txt',
          previewUrl: 'data:text/plain;base64,c2VjcmV0',
          refText: '@file:.agentbox/staged/notes.txt'
        }
      ])
    ).toEqual({
      message: {
        attachments: [{ displayName: 'notes.txt', mediaKind: 'file', ref: '@file:.agentbox/staged/notes.txt' }],
        text: 'read it'
      },
      outcome: 'ready'
    })
  })
})

describe('AgentBox Composer effective-config boundary', () => {
  const overrides: ConfigOverride[] = [
    { controlId: 'primary_model', value: { modelId: 'vendor/family/model-v9', providerId: 'provider-a' } },
    { controlId: 'mode', value: 'fast' }
  ]

  it('resolves the exact snapshot before the first send and sends that same snapshot', async () => {
    const wire = wireService({
      'config.resolve': resolved([{ controlId: 'mode', value: 'fast' }]),
      'sessions.createAndSend': {
        configVersion: 3,
        executionId: asWireId('execution-1'),
        outcome: 'accepted',
        session
      }
    })

    const result = await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 9,
      overrides,
      profileId: 'profile-1',
      scopeKey: 'workspace:workspace-1',
      sessionId: null,
      text: 'ship it',
      workspaceId: 'workspace-1'
    })

    expect(result).toMatchObject({ acceptedForDraft: true, outcome: 'sent' })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['config.resolve', 'sessions.createAndSend'])
    expect(wire.call.mock.calls[0]?.[1]).toEqual({
      overrides,
      profileId: 'profile-1',
      workspaceId: 'workspace-1'
    })
    expect(wire.call.mock.calls[1]?.[1]).toMatchObject({ overrides })
    expect(wire.call.mock.calls[1]?.[1].overrides).toBe(wire.call.mock.calls[0]?.[1].overrides)
  })

  it('resolves with the existing Session identities before continuing it', async () => {
    const wire = wireService({
      'config.resolve': resolved(),
      'sessions.send': {
        configVersion: 4,
        executionId: null,
        outcome: 'accepted',
        queueItemId: null
      }
    })

    await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 10,
      overrides,
      // Production passes the Session's own service identities; a cwd or a
      // legacy SessionInfo never stands in for them.
      profileId: String(session.profileId),
      scopeKey: 'session-1',
      sessionId: String(session.id),
      text: 'continue',
      workspaceId: String(session.workspaceId)
    })

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['config.resolve', 'sessions.send'])
    expect(wire.call.mock.calls[0]?.[1]).toEqual({
      overrides,
      profileId: 'profile-1',
      workspaceId: 'workspace-1'
    })
    expect(wire.call.mock.calls[1]?.[1]).toMatchObject({ sessionId: 'session-1' })
  })

  it('refuses to send a rejected configuration and keeps the service reasons', async () => {
    const wire = wireService({
      'config.resolve': {
        invalidControls: [
          { controlId: 'mode', reason: 'UNSUPPORTED_VALUE' },
          { controlId: 'primary_model', reason: 'MODEL_NOT_AVAILABLE' }
        ],
        outcome: 'rejected'
      }
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 11,
        overrides,
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'ship it',
        workspaceId: 'workspace-1'
      })
    ).resolves.toEqual({
      acceptedForDraft: false,
      invalidControls: [
        { controlId: 'mode', reason: 'UNSUPPORTED_VALUE' },
        { controlId: 'primary_model', reason: 'MODEL_NOT_AVAILABLE' }
      ],
      outcome: 'invalid',
      reason: 'CONFIG_REJECTED'
    })

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['config.resolve'])
  })

  it('sends nothing when the effective-config check fails in transport', async () => {
    const wire = client(async method => {
      if (method === 'config.resolve') {
        throw new Error('OUTCOME_UNKNOWN')
      }

      throw new Error('must not send')
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 12,
        overrides,
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'ship it',
        workspaceId: 'workspace-1'
      })
    ).rejects.toThrow('OUTCOME_UNKNOWN')

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['config.resolve'])
  })

  it('requires the service identities for a continued Session instead of guessing them', async () => {
    const wire = client(async () => {
      throw new Error('must not call')
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 13,
        overrides: [],
        profileId: null,
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'continue',
        workspaceId: null
      })
    ).resolves.toEqual({ acceptedForDraft: false, outcome: 'invalid', reason: 'WORKSPACE_REQUIRED' })
    expect(wire.call).not.toHaveBeenCalled()
  })
})

describe('AgentBox Composer pending recovery precedence', () => {
  const overrides: ConfigOverride[] = [{ controlId: 'mode', value: 'fast' }]

  const pendingSend = (scopeKey: string, intentKey: string, requestId: string) =>
    $pendingAgentBoxSends.set({ items: { [scopeKey]: { intentKey, requestId: requestId as never } }, version: 1 })

  it('settles the outstanding request before any configuration work happens', async () => {
    pendingSend('workspace:workspace-1', '5', 'request-old-0001')

    const wire = client(async method => {
      if (method !== 'sendOutcome.query') {
        throw new Error(`must not call ${method}`)
      }

      return { outcome: 'unknown' }
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 9,
        overrides,
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'a newer intent',
        workspaceId: 'workspace-1'
      })
    ).resolves.toMatchObject({ acceptedForDraft: false, decision: { intentKey: '5', outcome: 'unknown' } })

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query'])
    expect(wire.call).toHaveBeenCalledWith('sendOutcome.query', { requestId: 'request-old-0001' })
  })

  it('recovers the outstanding request even when the current draft cannot be validated at all', async () => {
    pendingSend('session-1', '4', 'request-old-0002')

    const wire = client(async method => {
      if (method !== 'sendOutcome.query') {
        throw new Error(`must not call ${method}`)
      }

      return { outcome: 'unknown' }
    })

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [{ id: 'local', kind: 'image', label: 'local.png', previewUrl: 'data:image/png;base64,abc' }],
        draftVersion: 9,
        overrides,
        profileId: null,
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'different text',
        workspaceId: null
      })
    ).resolves.toMatchObject({ acceptedForDraft: false, decision: { outcome: 'unknown' } })

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query'])
  })

  it('keeps the newer draft when the recovered request was accepted under an older intent key', async () => {
    pendingSend('workspace:workspace-1', '5', 'request-old-0003')

    const wire = client(async () => ({
      configVersion: 2,
      executionId: asWireId('execution-old'),
      outcome: 'accepted',
      queueItemId: null,
      sessionId: session.id
    }))

    const result = await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 9,
      overrides,
      profileId: 'profile-1',
      scopeKey: 'workspace:workspace-1',
      sessionId: null,
      text: 'newer draft',
      workspaceId: 'workspace-1'
    })

    expect(result).toMatchObject({ acceptedForDraft: false, decision: { intentKey: '5', outcome: 'accepted' } })
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query'])
  })

  it('holds the same requestId while the outcome stays unknown, and never mints a new one', async () => {
    pendingSend('workspace:workspace-1', '5', 'request-old-0004')

    const wire = client(async () => ({ outcome: 'unknown' }))

    const submit = () =>
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 9,
        overrides,
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'newer draft',
        workspaceId: 'workspace-1'
      })

    await expect(submit()).resolves.toMatchObject({ decision: { outcome: 'unknown', requestId: 'request-old-0004' } })
    await expect(submit()).resolves.toMatchObject({ decision: { outcome: 'unknown', requestId: 'request-old-0004' } })

    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query', 'sendOutcome.query'])
    expect(
      wire.call.mock.calls.every(call => (call[1] as { requestId: string }).requestId === 'request-old-0004')
    ).toBe(true)
    expect($pendingAgentBoxSends.get().items['workspace:workspace-1']?.requestId).toBe('request-old-0004')
  })

  it('clears a definitively rejected request and only lets the NEXT submit start a new intent', async () => {
    pendingSend('workspace:workspace-1', '5', 'request-old-0005')

    const wire = client(async method =>
      method === 'sendOutcome.query'
        ? { outcome: 'rejected_before_accept', reason: 'profile unavailable' }
        : { effective: [], outcome: 'resolved' }
    )

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 9,
        overrides,
        profileId: 'profile-1',
        scopeKey: 'workspace:workspace-1',
        sessionId: null,
        text: 'newer draft',
        workspaceId: 'workspace-1'
      })
    ).resolves.toMatchObject({
      acceptedForDraft: false,
      decision: { intentKey: '5', outcome: 'rejected', reason: 'profile unavailable' }
    })

    expect($pendingAgentBoxSends.get().items['workspace:workspace-1']).toBeUndefined()
    expect(wire.call.mock.calls.map(call => call[0])).toEqual(['sendOutcome.query'])
  })
})
