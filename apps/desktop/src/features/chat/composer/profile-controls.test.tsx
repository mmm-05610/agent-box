import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import type { ComposerProfileState } from '@/lib/composer/types'
import { asWireId } from '@/types/wire/wire-v1'

import { ComposerProfileControls } from './profile-controls'

stubMenuDomApis()
stubResizeObserver()

const profiles: ComposerProfileState['options'] = [
  { displayName: 'Reviewer', harness: 'opaque-alpha', id: 'profile-reviewer', selectable: true },
  {
    displayName: 'Builder',
    harness: 'opaque-beta',
    id: 'profile-builder',
    selectable: false,
    unavailableReason: 'Different harness'
  }
]

const profileState = (overrides: Partial<ComposerProfileState> = {}): ComposerProfileState => ({
  configDescriptor: {
    controls: [],
    effectTiming: 'next_send',
    profileId: asWireId('profile-reviewer'),
    securityLockedIds: [],
    workspaceId: asWireId('workspace-a')
  },
  onOverrideChange: vi.fn(),
  onSelect: vi.fn(() => true),
  options: profiles,
  overrides: [],
  selectedId: 'profile-reviewer',
  ...overrides
})

afterEach(cleanup)

describe('ComposerProfileControls', () => {
  it('shows the harness as opaque display data and does not expose a harness selector', async () => {
    render(<ComposerProfileControls profile={profileState()} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Profile: Reviewer' }))

    expect(await screen.findByText('Harness: opaque-alpha')).toBeTruthy()
    expect(screen.getByText('Harness: opaque-beta')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /harness/i })).toBeNull()
  })

  it('keeps the confirmed profile painted until the service-confirmed callback updates props', async () => {
    let resolveSwitch: ((value: boolean) => void) | undefined

    const onSelect = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          resolveSwitch = resolve
        })
    )

    render(
      <ComposerProfileControls
        profile={profileState({
          onSelect,
          options: profiles.map(profile => ({ ...profile, selectable: true }))
        })}
      />
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Profile: Reviewer' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Builder/ }))

    expect(onSelect).toHaveBeenCalledWith('profile-builder')
    expect(screen.getByRole('button', { name: 'Profile: Reviewer' })).toBeTruthy()

    resolveSwitch?.(false)
    await waitFor(() => expect(onSelect).toHaveReturned())
    expect(screen.getByRole('button', { name: 'Profile: Reviewer' })).toBeTruthy()
  })

  it('disables a service-declared incompatible profile without branching on its harness name', async () => {
    const onSelect = vi.fn()
    render(<ComposerProfileControls profile={profileState({ onSelect })} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Profile: Reviewer' }))
    const builder = await screen.findByRole('menuitemradio', { name: /Builder/ })

    expect(builder.getAttribute('data-disabled')).not.toBeNull()
    fireEvent.click(builder)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders finite config controls from the descriptor and never edits security-locked fields', async () => {
    const onOverrideChange = vi.fn()
    render(
      <ComposerProfileControls
        profile={profileState({
          configDescriptor: {
            controls: [
              {
                controlId: 'reasoning_effort',
                currentValue: 'medium',
                editable: true,
                kind: 'enum',
                values: ['low', 'medium', 'high']
              },
              { controlId: 'allow_network', currentValue: false, editable: true, kind: 'boolean' }
            ],
            effectTiming: 'next_send',
            profileId: asWireId('profile-reviewer'),
            securityLockedIds: ['allow_network'],
            workspaceId: asWireId('workspace-a')
          },
          onOverrideChange
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Temporary settings' }))

    expect(await screen.findByText('Changes apply to the next send.')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toBeTruthy()
    expect((screen.getByRole('switch', { name: 'Allow network' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('switch', { name: 'Allow network' }).closest('[title]')?.getAttribute('title')).toBe(
      'Locked by the service security policy'
    )
    expect(onOverrideChange).not.toHaveBeenCalled()
  })
})
