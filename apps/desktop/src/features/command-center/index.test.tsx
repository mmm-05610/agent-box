// @vitest-environment jsdom
//
// Command Center authority. Every legacy REST hook the legacy panels use is
// mocked (and WOULD answer if called), so a failure here is the call count —
// loudly — not a crash. Under `'agentbox'` none of them may run, whichever
// section is opened: sessions come from the AgentBox service cache, and a
// section the service has no wire equivalent for explains itself instead of
// reaching a Hermes endpoint. The `'hermes'` authority is exercised in
// isolation at the bottom to prove the legacy path is intact.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as configApi from '@/api/config'
import * as modelsApi from '@/api/models'
import * as systemApi from '@/api/system'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import type { SessionAuthority } from '@/features/chat/sidebar/sidebar-constants'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { $pinnedSessionIds } from '@/store/layout'
import { $sessions } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'
import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { type CommandCenterSection, CommandCenterView } from './index'

vi.mock('@/api/config', async importOriginal => ({
  ...(await importOriginal<typeof configApi>()),
  getLogs: vi.fn(() => Promise.resolve({ lines: ['agent boot line'] })),
  getStatus: vi.fn(() => Promise.resolve({ active_sessions: 4, gateway_running: true, version: '9.9.9' }))
}))
vi.mock('@/api/models', async importOriginal => ({
  ...(await importOriginal<typeof modelsApi>()),
  getUsageAnalytics: vi.fn(() => Promise.resolve({}))
}))
vi.mock('@/api/system', async importOriginal => ({
  ...(await importOriginal<typeof systemApi>()),
  getActionStatus: vi.fn(() => Promise.resolve({ exit_code: 0, lines: [], name: 'restart', pid: 1, running: false })),
  restartGateway: vi.fn(() => Promise.resolve({ name: 'restart', pid: 1, running: true })),
  updateHermes: vi.fn(() => Promise.resolve({ name: 'update', pid: 2, running: true }))
}))
vi.mock('@/store/session-export', () => ({ exportSession: vi.fn() }))
vi.mock('./maintenance', () => ({ MaintenancePanel: () => null }))

const EARLIER = '2026-09-13T08:00:00.000Z'
const RECENT = '2026-09-14T08:00:00.000Z'

function agentBoxSession(overrides: { id: string } & Omit<Partial<SessionRecord>, 'id'>): SessionRecord {
  const { id, ...rest } = overrides

  return {
    archivedAt: null,
    createdAt: EARLIER,
    displayName: `Session ${id}`,
    id: asWireId(id),
    pinned: false,
    profileId: null,
    updatedAt: EARLIER,
    version: 1,
    workspaceId: asWireId('workspace-1'),
    ...rest
  }
}

const LEGACY_SESSION: SessionInfo = {
  ended_at: null,
  id: 'sess-1',
  input_tokens: 0,
  is_active: false,
  last_active: 1_756_600_000,
  message_count: 3,
  model: null,
  output_tokens: 0,
  started_at: 1_756_500_000,
  title: 'Precious conversation'
} as SessionInfo

const legacyMocks = () => [
  vi.mocked(configApi.getStatus),
  vi.mocked(configApi.getLogs),
  vi.mocked(modelsApi.getUsageAnalytics),
  vi.mocked(systemApi.getActionStatus),
  vi.mocked(systemApi.restartGateway),
  vi.mocked(systemApi.updateHermes)
]

function renderCenter(
  authority: SessionAuthority,
  options: { initialSection?: CommandCenterSection; initialUrl?: string } = {}
) {
  const onDeleteSession = vi.fn(() => Promise.resolve())
  const onOpenSession = vi.fn()

  render(
    <MemoryRouter initialEntries={[options.initialUrl ?? '/command-center']}>
      <CommandCenterView
        authority={authority}
        initialSection={options.initialSection}
        onClose={() => {}}
        onDeleteSession={onDeleteSession}
        onOpenSession={onOpenSession}
      />
    </MemoryRouter>
  )

  return { onDeleteSession, onOpenSession }
}

beforeEach(() => {
  stubResizeObserver()
  stubMenuDomApis()

  for (const mock of legacyMocks()) {
    mock.mockClear()
  }

  $agentBoxSessions.set({})
  $pinnedSessionIds.set([])
  $sessions.set([])
})

afterEach(() => {
  cleanup()
  $agentBoxSessions.set({})
  $pinnedSessionIds.set([])
  $sessions.set([])
})

describe('CommandCenterView — AgentBox authority never touches the legacy data plane', () => {
  it.each(['sessions', 'system', 'usage', 'maintenance'] as const)(
    'makes no legacy API call when the %s section is opened',
    async section => {
      renderCenter('agentbox', { initialUrl: `/command-center?section=${section}` })

      await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))

      for (const mock of legacyMocks()) {
        expect(mock).not.toHaveBeenCalled()
      }
    }
  )

  it.each(['system', 'usage', 'maintenance'] as const)(
    'explains a deep-linked %s section instead of showing a legacy error',
    section => {
      renderCenter('agentbox', { initialUrl: `/command-center?section=${section}` })

      expect(screen.getByText('AgentBox does not provide this surface')).toBeTruthy()
      expect(screen.getByText(/legacy Hermes runtime/)).toBeTruthy()
      expect(screen.queryByText(/LEGACY_RUNTIME_DISABLED_FOR_PRODUCT/)).toBeNull()
    }
  )

  it('honours the initialSection prop with the same unavailable panel', () => {
    renderCenter('agentbox', { initialSection: 'usage' })

    expect(screen.getByText('AgentBox does not provide this surface')).toBeTruthy()
    expect(screen.queryByText(/LEGACY_RUNTIME_DISABLED_FOR_PRODUCT/)).toBeNull()
  })

  it('lists the service displayName, orders by updatedAt and opens with the service id', () => {
    $agentBoxSessions.set({
      'session-alpha': agentBoxSession({ displayName: 'Alpha notes', id: 'session-alpha', updatedAt: EARLIER }),
      'session-beta': agentBoxSession({ displayName: 'Beta notes', id: 'session-beta', updatedAt: RECENT })
    })

    const { onOpenSession } = renderCenter('agentbox')

    const rows = screen.getAllByRole('listitem')

    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Beta notes'),
      expect.stringContaining('Alpha notes')
    ])

    fireEvent.click(screen.getByRole('button', { name: /Alpha notes/ }))

    expect(onOpenSession).toHaveBeenCalledWith('session-alpha')
    expect(onOpenSession).toHaveBeenCalledTimes(1)
  })

  it('keeps a pinned service record ahead of a newer unpinned one', () => {
    $agentBoxSessions.set({
      'session-new': agentBoxSession({ displayName: 'Newer notes', id: 'session-new', updatedAt: RECENT }),
      'session-pinned': agentBoxSession({
        displayName: 'Pinned notes',
        id: 'session-pinned',
        pinned: true,
        updatedAt: EARLIER
      })
    })

    renderCenter('agentbox')

    const rows = screen.getAllByRole('listitem')

    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Pinned notes'),
      expect.stringContaining('Newer notes')
    ])
  })

  it('searches only the service displayName and id, case-insensitively', async () => {
    $agentBoxSessions.set({
      'session-alpha': agentBoxSession({ displayName: 'Alpha notes', id: 'session-alpha' }),
      'session-beta': agentBoxSession({ displayName: 'Beta notes', id: 'session-beta' })
    })

    renderCenter('agentbox')
    fireEvent.change(screen.getByPlaceholderText('Search sessions, views, and actions'), {
      target: { value: 'SESSION-ALPHA' }
    })

    expect(await screen.findByText('Alpha notes')).toBeTruthy()

    await waitFor(() => expect(screen.queryByText('Beta notes')).toBeNull())
  })

  it('does not match fields the service record does not index (workspaceId)', async () => {
    $agentBoxSessions.set({
      'session-alpha': agentBoxSession({ displayName: 'Alpha notes', id: 'session-alpha', workspaceId: asWireId('workspace-42') })
    })

    renderCenter('agentbox')
    fireEvent.change(screen.getByPlaceholderText('Search sessions, views, and actions'), {
      target: { value: 'workspace-42' }
    })

    expect(await screen.findByText('No matching results found.')).toBeTruthy()
  })

  it('never shows an archived service record in the ordinary list', () => {
    $agentBoxSessions.set({
      'session-ok': agentBoxSession({ displayName: 'Live notes', id: 'session-ok' }),
      'session-archived': agentBoxSession({
        archivedAt: '2026-09-14T06:00:00.000Z',
        displayName: 'Retired notes',
        id: 'session-archived',
        updatedAt: RECENT
      })
    })

    renderCenter('agentbox')

    expect(screen.getByText('Live notes')).toBeTruthy()
    expect(screen.queryByText('Retired notes')).toBeNull()
  })
})

describe('CommandCenterView authority="hermes" — the legacy path stays intact', () => {
  it('loads and renders the system status through the legacy API', async () => {
    renderCenter('hermes', { initialUrl: '/command-center?section=system' })

    expect(await screen.findByText('Messaging gateway running')).toBeTruthy()
    expect(vi.mocked(configApi.getStatus)).toHaveBeenCalled()
    expect(vi.mocked(configApi.getLogs)).toHaveBeenCalled()
  })

  it('renders $sessions rows and still confirms before deleting', async () => {
    $sessions.set([LEGACY_SESSION])

    const { onDeleteSession } = renderCenter('hermes')

    expect(await screen.findByText('Precious conversation')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(onDeleteSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onDeleteSession).toHaveBeenCalledWith('sess-1'))
  })
})
