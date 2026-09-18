// @vitest-environment jsdom
//
// The sidebar filter menu's Profile submenu carries the legacy profile-share
// flow and the legacy per-profile filter boxes. Under `'agentbox'` neither may
// appear: wire-v1 has no Profile bundle method, so there is nothing to stand
// behind an import row (and the product deliberately shows no fake "not
// supported" row instead), and the profile manager page — not `$profiles` — is
// the product's profile authority.
//
// The legacy flow is mocked with its REAL implementation, so a click still
// runs the whole helper (and would open the native picker); the assertions are
// therefore call counts and rendered rows, not a stubbed success.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import type { SessionAuthority } from '@/features/chat/sidebar/sidebar-constants'
import { $sidebarProfileFilter } from '@/store/layout'
import { $profiles, $showAllProfiles } from '@/store/profile'
import * as profileShareModule from '@/store/profile-share'
import type { ProfileInfo } from '@/types/hermes'

import { SidebarFilterMenu } from './filter-menu'

vi.mock('@/store/profile-share', async importOriginal => {
  const actual = await importOriginal<typeof profileShareModule>()

  return { ...actual, runImportProfileFlow: vi.fn(actual.runImportProfileFlow) }
})

const profile = (name: string): ProfileInfo =>
  ({
    has_env: false,
    is_default: false,
    model: null,
    name,
    path: `/home/tester/.hermes/profiles/${name}`,
    provider: null,
    skill_count: 0
  }) satisfies ProfileInfo

const selectPaths = vi.fn()

beforeEach(() => {
  stubResizeObserver()
  stubMenuDomApis()
  vi.mocked(profileShareModule.runImportProfileFlow).mockClear()
  selectPaths.mockClear()
  // The native picker the import flow would open. Installing it means a row
  // that reached the flow is observable here even though the flow is wrapped.
  Object.assign(window, { hermesDesktop: { selectPaths } })
  $profiles.set([profile('alpha'), profile('beta')])
  $showAllProfiles.set(true)
  $sidebarProfileFilter.set([])
})

afterEach(() => {
  cleanup()
  $profiles.set([])
  $showAllProfiles.set(false)
  $sidebarProfileFilter.set([])
})

/** Open the root menu, then the Profile submenu. Radix opens its trigger on the
 *  pointer sequence and its submenu immediately on click (the pointer path runs
 *  on a grace timer). */
function openProfileSubmenu() {
  const trigger = screen.getByRole('button', { name: 'Filters' })

  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByText('Profile'))
}

/** Proof that the Profile submenu really opened. Every authority assertion runs
 *  after this, so "the row is absent" can never pass because the menu never
 *  mounted — which is how a negative assertion usually lies. */
function expectProfileSubmenuOpen() {
  expect(screen.getByText('New profile')).toBeTruthy()
}

function renderMenu(sessionAuthority: SessionAuthority) {
  return render(<SidebarFilterMenu sessionAuthority={sessionAuthority} />)
}

describe('SidebarFilterMenu — AgentBox authority offers no legacy profile surface', () => {
  it('shows no Import profile row and never reaches the flow or the native picker', () => {
    renderMenu('agentbox')
    openProfileSubmenu()
    expectProfileSubmenuOpen()

    expect(screen.queryByText('Import profile…')).toBeNull()
    expect(vi.mocked(profileShareModule.runImportProfileFlow)).not.toHaveBeenCalled()
    expect(selectPaths).not.toHaveBeenCalled()
  })

  it('keeps New profile, which navigates to the AgentBox profile manager', () => {
    renderMenu('agentbox')
    openProfileSubmenu()
    expectProfileSubmenuOpen()
  })

  it('does not present the legacy per-profile list as the profile authority', () => {
    // The legacy store is populated on purpose: the boxes must be absent
    // because of the authority, not because a legacy cache happens to be empty.
    renderMenu('agentbox')
    openProfileSubmenu()
    expectProfileSubmenuOpen()

    expect(screen.queryByText('alpha')).toBeNull()
    expect(screen.queryByText('beta')).toBeNull()
  })
})

describe('SidebarFilterMenu — Hermes authority keeps the legacy profile surface', () => {
  it('shows Import profile and runs the existing flow, native picker included', () => {
    renderMenu('hermes')
    openProfileSubmenu()
    expectProfileSubmenuOpen()

    fireEvent.click(screen.getByText('Import profile…'))

    expect(vi.mocked(profileShareModule.runImportProfileFlow)).toHaveBeenCalledTimes(1)
    expect(selectPaths).toHaveBeenCalledTimes(1)
  })

  it('keeps New profile and the per-profile filter boxes', () => {
    renderMenu('hermes')
    openProfileSubmenu()
    expectProfileSubmenuOpen()

    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('beta')).toBeTruthy()
  })
})
