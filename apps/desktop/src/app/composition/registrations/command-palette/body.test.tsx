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

import * as sessionListsModule from '@/application/session-lists'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { $commandPaletteOpen, $commandPalettePage, $commandPaletteSeed } from '@/store/command-palette'
import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { CommandPaletteBody } from './body'

vi.mock('@/application/session-lists', async importOriginal => ({
  ...(await importOriginal<typeof sessionListsModule>()),
  listAllProfileSessions: vi.fn(async () => ({
    sessions: [{ git_branch: 'legacy-branch', id: 'legacy-1', preview: 'legacy preview', title: 'Legacy Session' }]
  }))
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

function renderPalette() {
  const paths: string[] = []

  render(
    <MemoryRouter initialEntries={['/']}>
      <DialogPrimitive.Root open>
        <CommandPaletteBody onExited={() => {}} />
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
