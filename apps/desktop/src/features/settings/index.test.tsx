import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubResizeObserver } from '@/dev/test/jsdom'

import { SettingsView } from './index'

vi.mock('./about-settings', () => ({ AboutSettings: () => <div>about-local</div> }))
vi.mock('./appearance-settings', () => ({
  AppearanceSettings: ({ authority }: { authority: string }) => <div>appearance-local:{authority}</div>
}))
vi.mock('./keybind-settings', () => ({ KeybindSettings: () => <div>keybinds-local</div> }))
vi.mock('./notifications-settings', () => ({ NotificationsSettings: () => <div>notifications-local</div> }))

stubResizeObserver()

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>
}

function renderSettings(entry = '/settings') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SettingsView authority="agentbox" onClose={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>
  )
}

afterEach(cleanup)

describe('AgentBox SettingsView', () => {
  it('shows the approved product areas and omits legacy execution/config surfaces', () => {
    renderSettings()

    for (const label of ['Models', 'Skills & MCP', 'Identities', 'Harnesses', 'Data management']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }

    for (const retired of ['Gateways', 'Billing', 'Plugins', 'Archived Chats', 'Tools & Keys']) {
      expect(screen.queryByText(retired)).toBeNull()
    }
  })

  it('moves a legacy MCP deep link to the truthful resources page without mounting its old controls', async () => {
    renderSettings('/settings?tab=mcp&server=legacy')

    expect(screen.getByText(/Manage a shared resource library/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull()
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('tab=product%3Aresources'))
  })

  it('navigates between product areas without presenting save controls before a service contract exists', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Data management' }))

    expect(screen.getByText(/sessions, drafts, Profile memory/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /export|import|backup|restore/i })).toBeNull()
  })

  it('hands the explicit AgentBox authority to the appearance page', () => {
    renderSettings('/settings?tab=appearance')

    // The authority is a caller input, never inferred from gateway state: the
    // page must receive exactly what the product composition root stated.
    expect(screen.getByText('appearance-local:agentbox')).toBeTruthy()
  })

  it('keeps the neutral local tabs reachable under the AgentBox authority', () => {
    renderSettings('/settings?tab=notifications')
    expect(screen.getByText('notifications-local')).toBeTruthy()
  })

  it('keeps the keybind editor reachable under the AgentBox authority', () => {
    renderSettings('/settings?tab=keybinds')
    expect(screen.getByText('keybinds-local')).toBeTruthy()
  })
})
