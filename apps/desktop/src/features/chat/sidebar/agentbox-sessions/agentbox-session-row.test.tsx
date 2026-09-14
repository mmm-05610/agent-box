import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { AgentBoxSessionRow } from './agentbox-session-row'

const labels = {
  menuActions: 'Session actions',
  menuPin: 'Pin',
  menuRename: 'Rename…',
  menuUnpin: 'Unpin',
  pinned: 'Pinned'
}

const session = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Fix the login flow',
  id: asWireId('session-1'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T05:00:00.000Z',
  version: 3,
  workspaceId: asWireId('workspace-1'),
  ...overrides
})

afterEach(cleanup)

// Radix menus open on the pointer sequence, not on a bare click — the same
// three-event gesture the sidebar's other menus need in jsdom.
const openMenu = (trigger: HTMLElement) => {
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.click(trigger)
}

const renderRow = (overrides: Partial<Parameters<typeof AgentBoxSessionRow>[0]> = {}) =>
  render(
    <AgentBoxSessionRow
      labels={overrides.labels ?? labels}
      meta={overrides.meta ?? '2h ago'}
      onOpen={overrides.onOpen ?? vi.fn()}
      onPin={overrides.onPin}
      onRename={overrides.onRename}
      pending={overrides.pending}
      session={overrides.session ?? session()}
    />
  )

describe('AgentBoxSessionRow', () => {
  it('presents only what the service record proves: name, pin and updatedAt', () => {
    const first = renderRow()

    const row = first.container.querySelector('[data-agentbox-session-row="session-1"]')

    expect(row?.textContent).toContain('Fix the login flow')
    expect(row?.textContent).toContain('2h ago')
    // No pinned indicator for an unpinned record…
    expect(first.container.querySelector('.codicon-pinned')).toBeNull()

    cleanup()

    const pinned = renderRow({ session: session({ pinned: true }) })

    // …and the pinned glyph appears when the record says so.
    expect(pinned.container.querySelector('.codicon-pinned')).toBeTruthy()
  })

  it('opens on click — the row never wires anything itself', () => {
    const onOpen = vi.fn()

    renderRow({ onOpen })

    fireEvent.click(screen.getByRole('button', { name: /Fix the login flow/ }))

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('offers no maintenance affordance when the handlers are absent', () => {
    renderRow()

    // No menu trigger at all — capability absent means nothing to click.
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()
  })

  it('shows the rename and pin entries with the current pin state', async () => {
    const onRename = vi.fn()
    const onPin = vi.fn()

    renderRow({ onPin, onRename, session: session({ pinned: true }) })

    openMenu(screen.getByRole('button', { name: 'Session actions' }))

    const rename = await screen.findByRole('menuitem', { name: 'Rename…' })

    expect(screen.getByRole('menuitem', { name: 'Unpin' })).toBeTruthy()

    fireEvent.click(rename)

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onPin).not.toHaveBeenCalled()
  })

  it('locks the menu while this row has maintenance pending', async () => {
    const onRename = vi.fn()
    const onPin = vi.fn()

    renderRow({ onPin, onRename, pending: true })

    openMenu(screen.getByRole('button', { name: 'Session actions' }))

    const rename = await screen.findByRole('menuitem', { name: 'Rename…' })

    expect(rename.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Pin' }).getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(rename)

    expect(onRename).not.toHaveBeenCalled()
    expect(onPin).not.toHaveBeenCalled()
  })
})
