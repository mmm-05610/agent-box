import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asWireId, type QueueItem } from '@/types/wire/wire-v1'

import { AgentBoxQueuePanel } from './agentbox-queue-panel'

const mocks = vi.hoisted(() => ({
  withdraw: vi.fn(async (_client: unknown, _input: unknown) => ({ outcome: 'withdrawn' }))
}))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({ id: 'client' }) }))
vi.mock('@/application/session/wire-session-control', () => ({
  withdrawAgentBoxQueueItem: (client: unknown, input: unknown) => mocks.withdraw(client, input)
}))

const item: QueueItem = {
  configVersion: 3,
  itemId: asWireId('queue-1'),
  message: { attachments: [], text: 'do this next' },
  profileId: asWireId('profile-1'),
  state: 'pending',
  submittedAt: '2026-09-14T00:00:00.000Z',
  version: 4
}

afterEach(() => {
  cleanup()
  mocks.withdraw.mockClear()
})

describe('AgentBox server queue panel', () => {
  it('offers only server withdraw for a pending item', async () => {
    render(<AgentBoxQueuePanel items={[item]} sessionId={asWireId('session-1')} />)

    expect(screen.getByText('do this next')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(mocks.withdraw).toHaveBeenCalledWith(
        { id: 'client' },
        { expectedVersion: 4, itemId: 'queue-1', sessionId: 'session-1' }
      )
    )
  })
})
