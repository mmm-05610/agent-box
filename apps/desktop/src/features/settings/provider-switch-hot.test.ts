import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WireUnavailableError, type WireV1Client } from '@/api/wire-v1-client'
import { submitAgentBoxComposer } from '@/application/session/agentbox-composer'
import { emptyWireSessionProjection } from '@/application/session/wire-session-projection'
import { $agentBoxSessionProjections } from '@/store/agentbox-runtime'
import { $pendingAgentBoxSends } from '@/store/agentbox-send-intents'
import { asWireId, type ConfigOverride, type SessionRecord } from '@/types/wire/wire-v1'

/**
 * P11 G6 — the client half of the hot switch.
 *
 * Changing the provider/model for a draft is a per-turn fact: the NEXT send
 * carries the new model slot, and nothing about a session already running is
 * rewritten. There is no "restart", no config file write and no lifecycle call
 * anywhere on this path — the switch is data on the next materialization. What
 * the service then does with that (freeze the run's configuration, keep the
 * running one untouched) is backend 55/56's half and is NOT claimed here.
 */
const session = (id: string, state: 'running' | 'completed'): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: `Session ${id}`,
  id: asWireId(id),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1')
})

const modelOverride = (modelId: string): ConfigOverride => ({
  controlId: 'model',
  value: { modelId, providerId: 'provider-one' }
})

function client(call: (method: string, params: unknown) => Promise<unknown>) {
  return { call: vi.fn(call) } as unknown as WireV1Client & { call: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  $pendingAgentBoxSends.set({ items: {}, version: 1 })
})

describe('provider/model switch is per-turn', () => {
  it('carries the newly chosen model on the next send, with no restart call anywhere', async () => {
    const wire = client(async (method, params) => {
      if (method === 'config.resolve') {
        return { effective: [], outcome: 'resolved' }
      }

      if (method === 'sessions.createAndSend') {
        const request = (params as { overrides: ConfigOverride[] }).overrides

        return { configVersion: 1, messageId: asWireId('message-1'), requestId: asWireId('r-1'), session: session('session-new', 'running'), overrides: request }
      }

      throw new Error(`unexpected method ${method}`)
    })

    const result = await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 1,
      overrides: [modelOverride('model-v2')],
      profileId: 'profile-1',
      scopeKey: 'workspace:workspace-1',
      sessionId: null,
      text: 'next turn runs on the new model',
      workspaceId: 'workspace-1'
    })

    expect(result.outcome).toBe('sent')
    expect(wire.call).toHaveBeenCalledWith(
      'sessions.createAndSend',
      expect.objectContaining({ overrides: [modelOverride('model-v2')] })
    )
    // The whole path: resolve + one send. No lifecycle/restart verb exists here.
    expect(wire.call.mock.calls.map(call => call[0]).sort()).toEqual(['config.resolve', 'sessions.createAndSend'])
  })

  it('does not touch a session that is already running', async () => {
    const running = session('session-running', 'running')
    const before = {
      'session-running': {
        ...emptyWireSessionProjection('session-running'),
        execution: { executionId: 'exec-1', reason: null, state: 'running' as const },
        messageOrder: ['m-1'],
        messages: {
          'm-1': { displayKind: 'visible' as const, messageId: 'm-1', role: 'assistant' as const, text: 'working' }
        }
      }
    }

    $agentBoxSessionProjections.set(before)
    const snapshot = JSON.stringify($agentBoxSessionProjections.get())

    const wire = client(async (method, params) => {
      if (method === 'config.resolve') {
        return { effective: [], outcome: 'resolved' }
      }

      if (method === 'sessions.send') {
        return {
          configVersion: 2,
          messageId: asWireId('message-2'),
          requestId: asWireId('r-2'),
          session: { ...running, version: 2 },
          overrides: (params as { overrides: ConfigOverride[] }).overrides
        }
      }

      throw new Error(`unexpected method ${method}`)
    })

    await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 2,
      overrides: [modelOverride('model-v3')],
      profileId: 'profile-1',
      scopeKey: 'session:session-running',
      sessionId: 'session-running',
      text: 'switch while it runs',
      workspaceId: 'workspace-1'
    })

    // The running session's projection is exactly what it was: the switch is
    // an override on a following turn, never a rewrite of history or state.
    expect(JSON.stringify($agentBoxSessionProjections.get())).toBe(snapshot)
  })

  it('reports a rejected switch to the service instead of sending on a guess', async () => {
    const wire = client(async (method: string) => {
      if (method === 'config.resolve') {
        return { invalidControls: [{ controlId: 'model', reason: 'MODEL_NOT_STARTABLE' }], outcome: 'rejected' }
      }

      throw new WireUnavailableError('must not send')
    })

    const result = await submitAgentBoxComposer(wire, {
      attachments: [],
      draftVersion: 3,
      overrides: [modelOverride('model-missing')],
      profileId: 'profile-1',
      scopeKey: 'workspace:workspace-1',
      sessionId: null,
      text: 'this must not be sent',
      workspaceId: 'workspace-1'
    })

    expect(result).toMatchObject({ invalidControls: [{ controlId: 'model', reason: 'MODEL_NOT_STARTABLE' }], outcome: 'invalid' })
    expect(wire.call.mock.calls.some(call => call[0] === 'sessions.createAndSend')).toBe(false)
  })
})
