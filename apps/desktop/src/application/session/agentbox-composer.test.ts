import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

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

beforeEach(() => {
  $pendingAgentBoxSends.set({ items: {}, version: 1 })
  $agentBoxSessions.set({})
})

describe('AgentBox Composer application boundary', () => {
  it('creates a Session only on the first accepted send and uses the draft version as intent identity', async () => {
    const wire = client(async (_method, params) => {
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
    const wire = client(async () => ({
      configVersion: 2,
      executionId: null,
      outcome: 'accepted',
      queueItemId: asWireId('queue-1')
    }))

    const refreshQueue = vi.fn(async () => undefined)

    const result = await submitAgentBoxComposer(
      wire,
      {
        attachments: [],
        draftVersion: 8,
        overrides: [],
        profileId: null,
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'do this next',
        workspaceId: null
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

    const wire = client(async () => ({
      configVersion: 1,
      executionId: asWireId('execution-old'),
      outcome: 'accepted',
      queueItemId: null,
      sessionId: asWireId('session-1')
    }))

    await expect(
      submitAgentBoxComposer(wire, {
        attachments: [],
        draftVersion: 8,
        overrides: [],
        profileId: null,
        scopeKey: 'session-1',
        sessionId: 'session-1',
        text: 'newer text',
        workspaceId: null
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
