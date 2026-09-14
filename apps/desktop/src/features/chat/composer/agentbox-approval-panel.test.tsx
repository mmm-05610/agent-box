import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ApprovalRequest, asWireId } from '@/types/wire/wire-v1'

import { AgentBoxApprovalPanel } from './agentbox-approval-panel'

const mocks = vi.hoisted(() => ({
  decide: vi.fn(async (_client: unknown, _input: unknown) => ({ decision: 'allow', outcome: 'recorded' }))
}))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({ id: 'client' }) }))
vi.mock('@/application/session/wire-session-control', () => ({
  decideAgentBoxApproval: (client: unknown, input: unknown) => mocks.decide(client, input)
}))

const approval: ApprovalRequest = {
  approvalId: asWireId('approval-1'),
  executionId: asWireId('execution-1'),
  expiresAt: null,
  operation: {
    detail: [
      { label: 'Target', value: 'src/app.ts' },
      { label: 'Change', value: 'write file' }
    ],
    title: 'Apply patch',
    tool: 'patch'
  },
  sessionId: asWireId('session-1'),
  version: 3
}

afterEach(() => {
  cleanup()
  mocks.decide.mockClear()
})

describe('AgentBox approval panel', () => {
  it('shows server-provided operation detail and sends a once-scoped decision without optimistic dismissal', async () => {
    render(<AgentBoxApprovalPanel approvals={[approval]} />)

    expect(screen.getByText('Apply patch')).toBeTruthy()
    expect(screen.getByText('src/app.ts')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() =>
      expect(mocks.decide).toHaveBeenCalledWith(
        { id: 'client' },
        {
          approvalId: 'approval-1',
          decision: 'allow',
          expectedVersion: 3,
          scope: { kind: 'once' }
        }
      )
    )
    // Only approval.settled may remove the card; the RPC reply is not that event.
    expect(screen.getByText('Apply patch')).toBeTruthy()
  })
})
