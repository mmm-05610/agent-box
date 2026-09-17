// @vitest-environment jsdom
//
// The command palette's session rows come from the AgentBox service cache and
// nothing else. The legacy enumeration the palette used to run on open is
// mocked (and WOULD answer with a row if asked) so these tests fail here —
// loudly, on the call count — if that query path ever comes back, instead of
// silently reaching for a Hermes HTTP endpoint the product build no longer
// serves. The rows themselves carry only SessionRecord facts: displayName
// names them, the service id opens them, and an empty cache is an empty list.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PALETTE_AREA } from '@/app/shell/layers/command-palette/contrib'
import * as sessionListsModule from '@/application/session-lists'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import type { SessionAuthority } from '@/features/chat/sidebar/sidebar-constants'
import { registry } from '@/lib/contributions'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { $commandPaletteOpen, $commandPalettePage, $commandPaletteSeed } from '@/store/command-palette'
import * as systemActionsModule from '@/store/system-actions'
import * as updatesModule from '@/store/updates'
import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { CommandPaletteBody } from './body'

vi.mock('@/application/session-lists', async importOriginal => ({
  ...(await importOriginal<typeof sessionListsModule>()),
  listAllProfileSessions: vi.fn(async () => ({
    sessions: [{ git_branch: 'legacy-branch', id: 'legacy-1', preview: 'legacy preview', title: 'Legacy Session' }]
  }))
}))

// The legacy shortcut actions are mocked to ANSWER, so an AgentBox assertion
// fails on the call count rather than on an unmocked crash.
vi.mock('@/store/system-actions', async importOriginal => ({
  ...(await importOriginal<typeof systemActionsModule>()),
  runGatewayRestart: vi.fn()
}))
vi.mock('@/store/updates', async importOriginal => ({
  ...(await importOriginal<typeof updatesModule>()),
  requestActiveUpdate: vi.fn()
}))

const session = (overrides: { id: string } & Omit<Partial<SessionRecord>, 'id'>): SessionRecord => {
  const { id, ...rest } = overrides

  return {
    archivedAt: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: `Session ${id}`,
    id: asWireId(id),
    pinned: false,
    profileId: null,
    updatedAt: '2026-09-14T00:00:00.000Z',
    version: 1,
    workspaceId: asWireId('workspace-1'),
    ...rest
  }
}

// Records the route AFTER mount so each test can read where the last open
// navigated, without freezing a snapshot of the router's whole history.
function RouteProbe({ paths }: { paths: string[] }) {
  const location = useLocation()

  useEffect(() => {
    paths.push(location.pathname)
  }, [location.pathname, paths])

  return null
}

function renderPalette(authority: SessionAuthority = 'agentbox') {
  const paths: string[] = []

  render(
    <MemoryRouter initialEntries={['/']}>
      <DialogPrimitive.Root open>
        <CommandPaletteBody authority={authority} onExited={() => {}} />
      </DialogPrimitive.Root>
      <RouteProbe paths={paths} />
    </MemoryRouter>
  )

  return { paths }
}

const searchFor = (value: string) => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } })
}

beforeEach(() => {
  stubResizeObserver()
  stubMenuDomApis()
  vi.mocked(sessionListsModule.listAllProfileSessions).mockClear()
  vi.mocked(systemActionsModule.runGatewayRestart).mockClear()
  vi.mocked(updatesModule.requestActiveUpdate).mockClear()
  $agentBoxSessions.set({})
  $commandPaletteOpen.set(false)
  $commandPalettePage.set(null)
  $commandPaletteSeed.set(null)
})

afterEach(() => {
  cleanup()
  $agentBoxSessions.set({})
  $commandPaletteOpen.set(false)
  $commandPalettePage.set(null)
  $commandPaletteSeed.set(null)
})

describe('CommandPaletteBody — sessions come from the AgentBox service', () => {
  it('opens without enumerating legacy sessions', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Alpha', id: 'session-1' }) })

    renderPalette()
    await act(async () => {})

    expect(vi.mocked(sessionListsModule.listAllProfileSessions)).not.toHaveBeenCalled()
  })

  it('shows the service displayName and opens the row with the service id', async () => {
    $agentBoxSessions.set({
      'session-alpha': session({ displayName: 'Alpha Product Notes', id: 'session-alpha' })
    })

    const { paths } = renderPalette()

    searchFor('alpha')

    const row = await screen.findByRole('option', { name: /Alpha Product Notes/ })
    fireEvent.click(row)
    await act(async () => {})

    expect(paths.at(-1)).toBe('/session-alpha')
    expect(vi.mocked(sessionListsModule.listAllProfileSessions)).not.toHaveBeenCalled()
  })

  it('leaves archived records out of the list', async () => {
    $agentBoxSessions.set({
      'session-archived': session({
        archivedAt: '2026-09-14T06:00:00.000Z',
        displayName: 'Retired Session',
        id: 'session-archived'
      })
    })

    renderPalette()
    searchFor('retired')

    expect(screen.queryByRole('option', { name: /Retired Session/ })).toBeNull()
  })

  it('shows no session row for an empty cache, even though the legacy list would answer', async () => {
    $agentBoxSessions.set({})

    renderPalette()
    searchFor('legacy')

    expect(screen.queryByRole('option', { name: /Legacy Session/ })).toBeNull()
    expect(vi.mocked(sessionListsModule.listAllProfileSessions)).not.toHaveBeenCalled()
  })
})

describe('CommandPaletteBody — legacy Hermes shortcuts follow the authority', () => {
  it('renders no system/usage/restart/update rows and calls neither action under AgentBox authority', async () => {
    renderPalette('agentbox')
    await act(async () => {})

    expect(screen.queryByRole('option', { name: /Restart gateway/ })).toBeNull()
    expect(screen.queryByRole('option', { name: /Update AgentBox/ })).toBeNull()
    expect(screen.queryByRole('option', { name: 'System' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Usage' })).toBeNull()

    expect(vi.mocked(systemActionsModule.runGatewayRestart)).not.toHaveBeenCalled()
    expect(vi.mocked(updatesModule.requestActiveUpdate)).not.toHaveBeenCalled()
  })

  it('still opens an AgentBox service session under AgentBox authority', async () => {
    $agentBoxSessions.set({
      'session-alpha': session({ displayName: 'Alpha Product Notes', id: 'session-alpha' })
    })

    const { paths } = renderPalette('agentbox')

    searchFor('alpha')

    const row = await screen.findByRole('option', { name: /Alpha Product Notes/ })
    fireEvent.click(row)
    await act(async () => {})

    expect(paths.at(-1)).toBe('/session-alpha')
    expect(vi.mocked(systemActionsModule.runGatewayRestart)).not.toHaveBeenCalled()
    expect(vi.mocked(updatesModule.requestActiveUpdate)).not.toHaveBeenCalled()
  })

  it('keeps the restart/update rows and runs them under Hermes authority', async () => {
    renderPalette('hermes')
    await act(async () => {})

    expect(screen.getByRole('option', { name: /Update AgentBox/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'System' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Usage' })).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: /Restart gateway/ }))
    await act(async () => {})

    expect(vi.mocked(systemActionsModule.runGatewayRestart)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updatesModule.requestActiveUpdate)).not.toHaveBeenCalled()
  })
})

// `Toggle logs` and the profile share rows are registry-contributed, not part
// of the hardcoded groups, so the authority split above cannot see them. They
// all reach the legacy Hermes runtime — the logs pane polls `GET /api/logs`,
// and profile sharing goes through `api/profiles.ts` with no wire-v1 Profile
// bundle method behind it — so under AgentBox authority none of them may be
// offered, by list or by search.
describe('CommandPaletteBody — contributed legacy shortcuts follow the authority', () => {
  const disposers: Array<() => void> = []

  const contribute = (id: string, label: string) => {
    const run = vi.fn()

    disposers.push(registry.register({ area: PALETTE_AREA, data: { id, label, run }, id }))

    return run
  }

  afterEach(() => {
    while (disposers.length > 0) {
      disposers.pop()?.()
    }
  })

  it('drops the legacy logs shortcut under AgentBox authority but keeps a plugin row', async () => {
    contribute('logs.toggle', 'Toggle logs')
    contribute('kanban.open', 'Kanban: Open board')

    renderPalette('agentbox')
    await act(async () => {})

    expect(screen.queryByRole('option', { name: 'Toggle logs' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Kanban: Open board' })).toBeTruthy()
  })

  it('keeps the legacy logs shortcut under Hermes authority', async () => {
    contribute('logs.toggle', 'Toggle logs')

    renderPalette('hermes')
    await act(async () => {})

    expect(screen.getByRole('option', { name: 'Toggle logs' })).toBeTruthy()
  })

  it('offers no profile share row under AgentBox authority, even by search', async () => {
    const exportRun = contribute('profile.export', 'Export profile…')
    const importRun = contribute('profile.import', 'Import profile…')

    renderPalette('agentbox')

    for (const query of ['export', 'import', 'profile']) {
      searchFor(query)
      await act(async () => {})

      expect(screen.queryByRole('option', { name: /Export profile/ })).toBeNull()
      expect(screen.queryByRole('option', { name: /Import profile/ })).toBeNull()
    }

    expect(exportRun).not.toHaveBeenCalled()
    expect(importRun).not.toHaveBeenCalled()
  })

  it('keeps the profile manager navigation row under AgentBox authority', async () => {
    // The capability the share rows are not allowed to stand in for — managing
    // profiles — still has its own door.
    renderPalette('agentbox')
    searchFor('profiles')
    await act(async () => {})

    expect(screen.getByRole('option', { name: /Profiles/ })).toBeTruthy()
  })

  it('keeps and runs both profile share rows under Hermes authority', async () => {
    const exportRun = contribute('profile.export', 'Export profile…')
    contribute('profile.import', 'Import profile…')

    renderPalette('hermes')
    await act(async () => {})

    expect(screen.getByRole('option', { name: /Import profile/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: /Export profile/ }))
    await act(async () => {})

    expect(exportRun).toHaveBeenCalledTimes(1)
  })
})

// The built-in "go to" rows for views the AgentBox product does not mount. A
// navigation row is the main way a user reaches them, so the authority has to
// decide here too — the views behind them read the legacy Hermes REST plane.
describe('CommandPaletteBody — views AgentBox does not mount follow the authority', () => {
  const unmountedViewRows = [
    { label: /^Spawn tree$/, query: 'spawn' },
    { label: /^Cron$/, query: 'cron' },
    { label: /^Memory Graph$/, query: 'memory' }
  ] as const

  it('offers no Agents/Cron/Starmap row under AgentBox authority', async () => {
    renderPalette('agentbox')

    for (const { label, query } of unmountedViewRows) {
      searchFor(query)
      await act(async () => {})

      expect(screen.queryByRole('option', { name: label })).toBeNull()
    }
  })

  it('keeps those rows under Hermes authority', async () => {
    renderPalette('hermes')

    for (const { label, query } of unmountedViewRows) {
      searchFor(query)
      await act(async () => {})

      expect(screen.getByRole('option', { name: label })).toBeTruthy()
    }
  })
})
