// @vitest-environment jsdom
//
// The AgentBox session list owns the unified sidebar's service-side session
// behavior: open (select shell row → session route, nothing else), rename and
// pin over `sessions.update` version CAS, archive over `sessions.archive`
// version CAS, and the honest loading/empty states. The real
// `updateOrdessaSession`/`archiveOrdessaSession` seams run — only the wire
// client is fake — so every assertion below is the exact payload that would
// cross the wire.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $agentBoxCatalogReadiness,
  $agentBoxHello,
  $agentBoxService,
  $agentBoxSessions,
  agentBoxCapabilitySupported
} from '@/store/agentbox-service'
import { $notifications } from '@/store/notifications'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { asWireId, type ServerHelloResult, type SessionRecord, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import { AgentBoxSessionList } from './agentbox-session-list'

vi.mock('@/api/agentbox-runtime-client', () => ({
  agentBoxRuntimeClient: () => wireClient
}))

const wireClient = { call: vi.fn() }

const session = (overrides: { id?: string } & Omit<Partial<SessionRecord>, 'id'> = {}): SessionRecord => {
  const { id = 'session-1', ...rest } = overrides

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

const hello = (ids: string[] = ['sessions.update']): ServerHelloResult => ({
  auth: { required: false },
  capabilities: ids.map(id => ({ id, supported: true })),
  protocolVersion: WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-1')
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void

  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })

  return { promise, reject, resolve }
}

// A route probe that records navigations AFTER mount (the selection listener
// fires synchronously inside the click, so event order proves the contract:
// selectWorkspaceView FIRST, navigate SECOND).
function RouteProbe({ events }: { events: string[] }) {
  const location = useLocation()
  const mounted = events.length === 0

  useEffect(() => {
    if (!mounted) {
      events.push(location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe only
  }, [location.pathname])

  return null
}

function renderList(events: string[]) {
  return render(
    <MemoryRouter>
      <AgentBoxSessionList shellId="proj-1" workspace={{
        accessibility: { executableForRole: null, readable: true, reasons: [], writable: true },
        archivedAt: null,
        connection: { state: 'connected' },
        createdAt: '2026-09-14T00:00:00.000Z',
        displayName: 'App',
        environment: { host: null, kind: 'local', user: null },
        id: asWireId('workspace-1'),
        normalizedPath: 'C:/work/app',
        updatedAt: '2026-09-14T00:00:00.000Z',
        version: 1
      }} />
      <RouteProbe events={events} />
    </MemoryRouter>
  )
}

const openRowMenu = (index = 0) => {
  const trigger = screen.getAllByRole('button', { name: 'Session actions' })[index]!

  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.click(trigger)
}

const renameVia = async (dialog: HTMLElement, value: string) => {
  const input = within(dialog).getByRole('textbox')

  await act(async () => {
    fireEvent.change(input, { target: { value } })
  })

  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  })
}

beforeEach(() => {
  wireClient.call.mockReset()
  localStorage.clear()
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxHello.set(hello())
  $agentBoxCatalogReadiness.set({ sessions: true, workspaces: true })
  $agentBoxSessions.set({})
  $workspaceViewSelectedId.set(null)
  $notifications.set([])
})

afterEach(() => {
  cleanup()
  $agentBoxSessions.set({})
  $agentBoxHello.set(null)
  $agentBoxService.set({ detail: null, phase: 'idle' })
  $agentBoxCatalogReadiness.set({ sessions: false, workspaces: false })
  $workspaceViewSelectedId.set(null)
  $notifications.set([])
})

describe('Ordessa session list — honest states', () => {
  it('shows an honest loading state before the session catalog is ready', () => {
    $agentBoxService.set({ detail: null, phase: 'loading' })
    const first = renderList([])

    expect(first.container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')?.textContent).toContain(
      'Loading sessions'
    )

    cleanup()

    // Ready service but a not-yet-arrived catalog is the same honest state.
    $agentBoxService.set({ detail: null, phase: 'ready' })
    $agentBoxCatalogReadiness.set({ sessions: false, workspaces: true })
    const second = renderList([])

    expect(second.container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')).toBeTruthy()
  })

  it('shows the neutral empty state for a workspace without sessions', () => {
    const { container } = renderList([])

    expect(container.querySelector('[data-agentbox-sessions-empty="workspace-1"]')?.textContent).toContain(
      'No Ordessa sessions'
    )
  })
})

describe('Ordessa session list — open an existing session', () => {
  it('selects the shell row first, then navigates the session route — and nothing else', async () => {
    $agentBoxSessions.set({
      'session-live': session({ id: 'session-live', updatedAt: '2026-09-14T09:00:00.000Z' })
    })

    const events: string[] = []
    const stopSelection = $workspaceViewSelectedId.listen(() => events.push('select'))
    const callCountBefore = wireClient.call.mock.calls.length

    renderList(events)

    fireEvent.click(screen.getByRole('button', { name: /Session session-live/ }))
    await act(async () => {})

    stopSelection()

    // Order: the selection fired synchronously during the click; the route
    // change landed after it. The session route is `/{id}` (lib/routes).
    expect(events).toEqual(['select', '/session-live'])
    // Opening is ONLY select + navigate: no workspaces.open, no sends, no
    // harness, no legacy Hermes calls.
    expect(wireClient.call.mock.calls.length).toBe(callCountBefore)
  })

  it('renders the workspace projection only: pinned first, newest first, foreign sessions out', () => {
    $agentBoxSessions.set({
      'session-pinned': session({ id: 'session-pinned', pinned: true, updatedAt: '2026-09-13T00:00:00.000Z' }),
      'session-new': session({ id: 'session-new', updatedAt: '2026-09-14T09:00:00.000Z' }),
      'session-foreign': session({ id: 'session-foreign', workspaceId: asWireId('workspace-2') }),
      'session-archived': session({ archivedAt: '2026-09-14T01:00:00.000Z', id: 'session-archived' })
    })

    const { container } = renderList([])

    const rows = [...container.querySelectorAll('[data-agentbox-session-row]')]

    expect(rows.map(row => row.getAttribute('data-agentbox-session-row'))).toEqual([
      'session-pinned',
      'session-new'
    ])
  })
})

describe('Ordessa session list — rename via sessions.update', () => {
  it('sends the exact CAS of the record the row showed, then adopts the returned record', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old name', version: 3 }) })
    wireClient.call.mockResolvedValue({
      session: session({ displayName: 'Normalized', version: 4 })
    })

    renderList([])

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))

    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole<HTMLInputElement>('textbox').value).toBe('Old name')

    await act(async () => {
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' New name ' } })
    })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })

    expect(wireClient.call).toHaveBeenCalledTimes(1)
    expect(wireClient.call).toHaveBeenCalledWith('sessions.update', {
      displayName: 'New name',
      expectedVersion: 3,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-1'
    })

    // The service normalization shows immediately; the dialog is gone (no
    // dirty remnant) because the returned record is the projection.
    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Normalized')
    expect($agentBoxSessions.get()['session-1']?.version).toBe(4)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mints a new requestId for every intent', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old', version: 1 }) })
    wireClient.call.mockResolvedValue({ session: session({ displayName: 'Renamed', version: 2 }) })

    renderList([])

    const requestIds: string[] = []

    for (let intent = 0; intent < 2; intent += 1) {
      openRowMenu()
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))

      const dialog = await screen.findByRole('dialog')
      const input = within(dialog).getByRole('textbox')

      await act(async () => {
        fireEvent.change(input, { target: { value: `Draft ${intent}` } })
      })
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      })
    }

    for (const call of wireClient.call.mock.calls) {
      requestIds.push((call[1] as { requestId: string }).requestId)
    }

    expect(requestIds).toHaveLength(2)
    expect(new Set(requestIds).size).toBe(2)
  })

  it('keeps the dialog, the draft and the projection on CONFLICT_VERSION', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old', version: 3 }) })
    wireClient.call.mockRejectedValue(new Error('CONFLICT_VERSION'))

    renderList([])

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))

    const dialog = await screen.findByRole('dialog')

    await act(async () => {
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Kept draft' } })
    })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })

    // Dialog stays open, draft stays, the service reason is visible, the
    // projection is untouched, and nothing retried silently.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole<HTMLInputElement>('textbox').value).toBe('Kept draft')
    expect(within(screen.getByRole('dialog')).getByText('CONFLICT_VERSION')).toBeTruthy()
    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Old')
    expect(wireClient.call).toHaveBeenCalledTimes(1)
  })

  it('sends exactly one request when save is pressed twice while pending', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old', version: 1 }) })

    const pending = deferred<{ session: SessionRecord }>()

    wireClient.call.mockReturnValue(pending.promise)

    renderList([])

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))

    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByRole('textbox')
    const save = within(dialog).getByRole('button', { name: 'Save' })

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Draft' } })
      fireEvent.click(save)
    })

    await act(async () => {
      fireEvent.click(save)
    })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    })

    expect(wireClient.call).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve({ session: session({ displayName: 'Draft', version: 2 }) })
    })
  })
})

describe('Ordessa session list — pin via sessions.update', () => {
  const pinItem = async () => {
    openRowMenu()

    return screen.findByRole('menuitem', { name: 'Pin' })
  }

  it('sends the exact CAS flip, adopts nothing until the service answers', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', pinned: false, version: 3 }) })

    const pending = deferred<{ session: SessionRecord }>()

    wireClient.call.mockReturnValue(pending.promise)

    const { container } = renderList([])

    fireEvent.click(await pinItem())

    expect(wireClient.call).toHaveBeenCalledWith('sessions.update', {
      expectedVersion: 3,
      pinned: true,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-1'
    })

    // Not optimistic: the record and the row keep the service's current state
    // while the request is in flight, and no legacy pin store was touched.
    expect($agentBoxSessions.get()['session-1']?.pinned).toBe(false)
    expect(container.querySelector('.codicon-pinned')).toBeNull()

    await act(async () => {
      pending.resolve({ session: session({ pinned: true, version: 4 }) })
    })

    expect($agentBoxSessions.get()['session-1']?.pinned).toBe(true)
    expect(container.querySelector('.codicon-pinned')).toBeTruthy()
  })

  it('pinned records sort ahead of unpinned ones after the flip', async () => {
    $agentBoxSessions.set({
      'session-1': session({ id: 'session-1', pinned: false, updatedAt: '2026-09-14T09:00:00.000Z' }),
      'session-2': session({ id: 'session-2', pinned: false, updatedAt: '2026-09-14T08:00:00.000Z' })
    })

    wireClient.call.mockResolvedValue({
      session: session({ id: 'session-2', pinned: true, updatedAt: '2026-09-14T08:00:00.000Z', version: 4 })
    })

    const { container } = renderList([])

    const orderBefore = () =>
      [...container.querySelectorAll('[data-agentbox-session-row]')].map(row =>
        row.getAttribute('data-agentbox-session-row')
      )

    expect(orderBefore()).toEqual(['session-1', 'session-2'])

    // Capture the trigger BEFORE the pointer sequence opens the menu — once
    // open, radix hides the outside content from role queries.
    const trigger = screen.getAllByRole('button', { name: 'Session actions' })[1]!

    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }))

    await act(async () => {})

    expect(orderBefore()).toEqual(['session-2', 'session-1'])
  })

  it('keeps the old pinned state and shows the service reason on failure', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', pinned: true, version: 3 }) })
    wireClient.call.mockRejectedValue(new Error('CONFLICT_VERSION'))

    renderList([])

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpin' }))

    await act(async () => {})

    expect(wireClient.call).toHaveBeenCalledWith('sessions.update', {
      expectedVersion: 3,
      pinned: false,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-1'
    })

    expect($agentBoxSessions.get()['session-1']?.pinned).toBe(true)
    expect($notifications.get().some(item => item.kind === 'error' && item.message === 'CONFLICT_VERSION')).toBe(true)
  })

  it('keeps the row openable but affordance-free when the capability is undeclared', async () => {
    $agentBoxHello.set(hello(['workspaces.archive']))
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 1 }) })

    renderList([])

    // The row renders (openable) — but no menu exists, so no maintenance
    // affordance and no wire call can happen.
    expect(screen.getByRole('button', { name: /Live/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()

    expect(agentBoxCapabilitySupported($agentBoxHello.get(), 'sessions.update')).toBe(false)
    expect(wireClient.call).not.toHaveBeenCalled()
  })
})

describe('Ordessa session list — archive via sessions.archive', () => {
  // Archive needs its OWN declared capability; update is irrelevant to it.
  const archiveHello = () => hello(['sessions.archive', 'sessions.update'])

  const openArchiveDialog = async () => {
    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in Ordessa' }))

    return screen.findByRole('dialog')
  }

  const clickConfirm = async (dialog: HTMLElement) => {
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive in Ordessa' }))
    })
  }

  it('sends the exact CAS of the displayed record once — no optimistic hide, no other call', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })

    const pending = deferred<{ session: SessionRecord }>()
    wireClient.call.mockReturnValue(pending.promise)

    const events: string[] = []
    const { container } = renderList(events)

    const dialog = await openArchiveDialog()

    // The menu click captures the target but hides nothing and sends nothing:
    // the row stays the service's current truth until the service answers.
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')).toBeTruthy()
    expect(wireClient.call).not.toHaveBeenCalled()

    await clickConfirm(dialog)

    // The ONLY wire call is the archive CAS — no runs.stop, no
    // sessions.createAndSend/send, no sessions.update, no workspaces.archive.
    expect(wireClient.call.mock.calls).toEqual([
      [
        'sessions.archive',
        {
          expectedVersion: 3,
          requestId: expect.stringMatching(/^desktop-/),
          sessionId: 'session-1'
        }
      ]
    ])

    // In flight is not hidden either, and the dialog is still open mid-CAS.
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => {
      pending.resolve({ session: session({ archivedAt: '2026-09-14T06:00:00.000Z', version: 4 }) })
    })

    // The projection's own `archivedAt !== null` filter drops the row; the
    // cache keeps the record the service returned.
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')).toBeNull()
    expect($agentBoxSessions.get()['session-1']?.archivedAt).toBe('2026-09-14T06:00:00.000Z')
    expect($agentBoxSessions.get()['session-1']?.version).toBe(4)
    // Archive does not open, select, navigate, send or stop anything.
    expect(events).toEqual([])
    expect($workspaceViewSelectedId.get()).toBeNull()
  })

  it('keeps the dialog open and sends exactly one request when confirm is pressed twice', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })

    const pending = deferred<{ session: SessionRecord }>()
    wireClient.call.mockReturnValue(pending.promise)

    renderList([])

    const dialog = await openArchiveDialog()
    // The label swaps to the busy copy while saving, so hold the node itself.
    const confirmButton = within(dialog).getByRole('button', { name: 'Archive in Ordessa' })

    await act(async () => {
      fireEvent.click(confirmButton)
    })
    await act(async () => {
      fireEvent.click(confirmButton)
    })

    expect(wireClient.call).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => {
      pending.resolve({ session: session({ archivedAt: '2026-09-14T06:00:00.000Z', version: 4 }) })
    })
  })

  it('keeps the dialog, the record and the row on CONFLICT_VERSION — no retry, no version bump', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })
    wireClient.call.mockRejectedValue(new Error('CONFLICT_VERSION'))

    const { container } = renderList([])

    const dialog = await openArchiveDialog()

    await clickConfirm(dialog)

    // The readable service reason is visible, the dialog stays open, the
    // projection is untouched (version AND archivedAt) and nothing retried.
    expect(within(screen.getByRole('dialog')).getByText('CONFLICT_VERSION')).toBeTruthy()
    expect($agentBoxSessions.get()['session-1']?.version).toBe(3)
    expect($agentBoxSessions.get()['session-1']?.archivedAt).toBeNull()
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')).toBeTruthy()
    expect(wireClient.call).toHaveBeenCalledTimes(1)
  })

  it('keeps the row with the service version and name when the service answers unarchived', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })
    wireClient.call.mockResolvedValue({ session: session({ displayName: 'Service name', version: 4 }) })

    const { container } = renderList([])

    const dialog = await openArchiveDialog()

    await clickConfirm(dialog)

    // The service's answer is authoritative: an unarchived record stays, with
    // the version and name the service returned.
    expect($agentBoxSessions.get()['session-1']?.version).toBe(4)
    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Service name')
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')?.textContent).toContain('Service name')
  })

  it('makes zero wire calls and shows the failure when the service went away while the dialog was open', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })

    renderList([])

    const dialog = await openArchiveDialog()

    await act(async () => {
      $agentBoxService.set({ detail: 'service went away', phase: 'unavailable' })
    })
    await clickConfirm(dialog)

    // Fail closed: the intent is not sent on faith, and the dialog names the
    // failure instead of pretending success.
    expect(wireClient.call).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByText('Session could not be archived')).toBeTruthy()
    expect($agentBoxSessions.get()['session-1']?.archivedAt).toBeNull()
  })

  it('makes zero wire calls when hello stopped declaring sessions.archive while the dialog was open', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })

    renderList([])

    const dialog = await openArchiveDialog()

    await act(async () => {
      $agentBoxHello.set(hello(['sessions.update']))
    })
    await clickConfirm(dialog)

    expect(wireClient.call).not.toHaveBeenCalled()
    expect(within(screen.getByRole('dialog')).getByText('Session could not be archived')).toBeTruthy()
  })

  it('gates rename/pin and archive on their own capabilities independently', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })

    // update only → rename + pin, no archive entry.
    $agentBoxHello.set(hello(['sessions.update']))
    renderList([])
    openRowMenu()
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in Ordessa' })).toBeNull()

    cleanup()

    // archive only → archive alone.
    $agentBoxHello.set(hello(['sessions.archive']))
    renderList([])
    openRowMenu()
    expect(await screen.findByRole('menuitem', { name: 'Archive in Ordessa' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).toBeNull()

    cleanup()

    // both → all three.
    $agentBoxHello.set(hello(['sessions.update', 'sessions.archive']))
    renderList([])
    openRowMenu()
    expect(await screen.findByRole('menuitem', { name: 'Rename…' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Pin' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Archive in Ordessa' })).toBeTruthy()

    // neither is the existing "affordance-free" case: no menu exists at all,
    // so no entry and no wire call can happen.
    expect(wireClient.call).not.toHaveBeenCalled()
  })

  it('keeps the cached rows and their honest status but offers no archive entry while unavailable', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 3 }) })
    $agentBoxService.set({ detail: 'connect ECONNREFUSED 127.0.0.1:8732', phase: 'unavailable' })

    const { container } = renderList([])

    // The declared capability is not a promise the service can answer: the
    // row and the reason stay, the archive entry is withdrawn.
    expect(container.querySelector('[data-agentbox-session-row="session-1"]')?.textContent).toContain('Live')
    expect(container.querySelector('[data-agentbox-sessions-unavailable="workspace-1"]')?.textContent).toContain(
      'connect ECONNREFUSED 127.0.0.1:8732'
    )
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()
    expect(wireClient.call).not.toHaveBeenCalled()
  })

  it('captures the version of the session whose menu was used, not another row', async () => {
    $agentBoxHello.set(archiveHello())
    $agentBoxSessions.set({
      'session-1': session({ displayName: 'First', id: 'session-1', updatedAt: '2026-09-14T09:00:00.000Z', version: 3 }),
      'session-2': session({ displayName: 'Second', id: 'session-2', updatedAt: '2026-09-14T08:00:00.000Z', version: 7 })
    })
    wireClient.call.mockResolvedValue({
      session: session({ archivedAt: '2026-09-14T06:00:00.000Z', id: 'session-2', version: 8 })
    })

    renderList([])

    // Projection order is newest first: [session-1, session-2] — aim at the
    // second row's own menu.
    openRowMenu(1)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in Ordessa' }))

    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/Second/)).toBeTruthy()

    await clickConfirm(dialog)

    expect(wireClient.call.mock.calls).toEqual([
      [
        'sessions.archive',
        {
          expectedVersion: 7,
          requestId: expect.stringMatching(/^desktop-/),
          sessionId: 'session-2'
        }
      ]
    ])
    expect($agentBoxSessions.get()['session-1']?.archivedAt).toBeNull()
    expect($agentBoxSessions.get()['session-2']?.archivedAt).toBe('2026-09-14T06:00:00.000Z')
  })
})

// The service boundary: what the list shows is the CACHE it already holds, and
// what the service phase changes is only what the rows can do next. A service
// that goes away must never erase its own sessions, hand the row back to the
// legacy Hermes list, or accept maintenance intents it cannot honor.
describe('Ordessa session list — service state boundary', () => {
  const unavailableDetail = 'connect ECONNREFUSED 127.0.0.1:8732'

  const rows = (container: HTMLElement) => container.querySelectorAll('[data-agentbox-session-row]')

  it('keeps the cached rows when the service goes unavailable: reason shown, maintenance fail-closed, row still opens', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 2 }) })

    const events: string[] = []
    const { container } = renderList(events)

    expect(rows(container)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Session actions' })).toBeTruthy()

    await act(async () => {
      $agentBoxService.set({ detail: unavailableDetail, phase: 'unavailable' })
    })

    // The record we already hold is still the row — the service phase does not
    // erase it and the list does not go back to legacy Hermes.
    expect(rows(container)).toHaveLength(1)
    expect(rows(container)[0]?.textContent).toContain('Live')
    // The service's own reason, verbatim.
    expect(container.querySelector('[data-agentbox-sessions-unavailable="workspace-1"]')?.textContent).toContain(
      unavailableDetail
    )
    // Unavailable is not a spinner.
    expect(container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')).toBeNull()
    // No maintenance entry can exist, so no `sessions.update` can be sent.
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()
    expect(wireClient.call).not.toHaveBeenCalled()

    // The cached row is still openable: select the shell row, then navigate.
    const stopSelection = $workspaceViewSelectedId.listen(() => events.push('select'))
    const callCountBefore = wireClient.call.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /Live/ }))
    await act(async () => {})

    stopSelection()

    expect(events).toEqual(['select', '/session-1'])
    expect($workspaceViewSelectedId.get()).toBe('proj-1')
    expect(wireClient.call.mock.calls.length).toBe(callCountBefore)
  })

  it('renders the service reason as plain text, with the localized fallback when it is empty', async () => {
    $agentBoxSessions.set({ 'session-1': session() })
    $agentBoxService.set({ detail: '<b>not markup</b>', phase: 'unavailable' })

    const { container } = renderList([])
    const detail = container.querySelector('[data-agentbox-service-detail]')

    expect(detail?.textContent).toBe('<b>not markup</b>')
    expect(detail?.querySelector('b')).toBeNull()

    await act(async () => {
      $agentBoxService.set({ detail: '   ', phase: 'unavailable' })
    })

    expect(container.querySelector('[data-agentbox-service-detail]')?.textContent).toBe(
      'The service reported no reason.'
    )
  })

  it('keeps the cached rows and adds the compact loading marker while the catalog is not ready', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live' }) })
    $agentBoxService.set({ detail: null, phase: 'loading' })

    const { container } = renderList([])

    expect(rows(container)).toHaveLength(1)
    expect(container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')?.textContent).toContain(
      'Loading sessions'
    )
    // Loading is an addition beside the records, never a replacement for them
    // and never the empty state.
    expect(container.querySelector('[data-agentbox-sessions-empty="workspace-1"]')).toBeNull()

    // A ready service whose catalog has not arrived is the same picture.
    await act(async () => {
      $agentBoxService.set({ detail: null, phase: 'ready' })
      $agentBoxCatalogReadiness.set({ sessions: false, workspaces: true })
    })

    expect(rows(container)).toHaveLength(1)
    expect(container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')).toBeTruthy()
  })

  it('shows unavailable — never a spinner — for a workspace with nothing cached', () => {
    $agentBoxService.set({ detail: unavailableDetail, phase: 'unavailable' })

    const { container } = renderList([])

    expect(container.querySelector('[data-agentbox-sessions-unavailable="workspace-1"]')?.textContent).toContain(
      unavailableDetail
    )
    expect(container.querySelector('[data-agentbox-sessions-loading="workspace-1"]')).toBeNull()
    expect(container.querySelector('[data-agentbox-sessions-empty="workspace-1"]')).toBeNull()
    expect(rows(container)).toHaveLength(0)
    expect(wireClient.call).not.toHaveBeenCalled()
  })

  it('sends nothing when a rename dialog outlives the service it was opened on', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old', version: 3 }) })

    renderList([])

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))

    const dialog = await screen.findByRole('dialog')

    await act(async () => {
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'New name' } })
    })
    await act(async () => {
      $agentBoxService.set({ detail: 'service went away', phase: 'unavailable' })
    })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })

    // Fail closed: the intent is not sent on faith, the draft is not thrown
    // away with it, and nothing is written.
    expect(wireClient.call).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByRole<HTMLInputElement>('textbox').value).toBe('New name')
    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Old')
  })

  it('restores maintenance when the service comes back, without duplicating the rows', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Live', version: 4 }) })
    $agentBoxService.set({ detail: unavailableDetail, phase: 'unavailable' })
    wireClient.call.mockResolvedValue({ session: session({ pinned: true, version: 5 }) })

    const { container } = renderList([])

    expect(rows(container)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()

    await act(async () => {
      $agentBoxService.set({ detail: null, phase: 'ready' })
    })

    // One record, one row — the recovery re-renders, it does not re-project.
    expect(rows(container)).toHaveLength(1)
    expect(container.querySelector('[data-agentbox-sessions-unavailable="workspace-1"]')).toBeNull()

    openRowMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }))

    expect(wireClient.call).toHaveBeenCalledWith('sessions.update', {
      expectedVersion: 4,
      pinned: true,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-1'
    })

    await act(async () => {})

    expect($agentBoxSessions.get()['session-1']?.pinned).toBe(true)
    expect(rows(container)).toHaveLength(1)
  })
})
