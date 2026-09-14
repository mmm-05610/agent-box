import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactElement, useState } from 'react'
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
  modelChoices: [],
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

  it('uses opaque provider/model references for model slots and keeps unavailable entries disabled', async () => {
    let activeOverrides: ComposerProfileState['overrides'] = []

    const onOverrideChange = vi.fn((next: ComposerProfileState['overrides']) => {
      activeOverrides = next
    })

    render(
      <ComposerProfileControls
        profile={profileState({
          configDescriptor: {
            controls: [
              { controlId: 'primary', editable: true, kind: 'model_slot', slots: [{ name: 'primary', model: null }] },
              { controlId: 'review', editable: true, kind: 'model_slot', slots: [{ name: 'review', model: null }] }
            ],
            effectTiming: 'next_send',
            profileId: asWireId('profile-reviewer'),
            securityLockedIds: [],
            workspaceId: asWireId('workspace-a')
          },
          modelChoices: [
            {
              availability: 'unknown',
              displayName: 'Slash model',
              modelId: 'family/model-v1',
              providerDisplayName: 'Provider One',
              providerId: 'provider-one',
              unavailableReason: null
            },
            {
              availability: 'unavailable',
              displayName: 'Offline model',
              modelId: 'offline/model-v2',
              providerDisplayName: 'Provider Two',
              providerId: 'provider-two',
              unavailableReason: 'Provider is offline'
            }
          ],
          onOverrideChange,
          overrides: activeOverrides
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Temporary settings' }))
    const controls = screen.getAllByRole('combobox')
    fireEvent.click(controls[0])

    expect(controls[0].textContent).toContain('Use profile default')

    expect(await screen.findByText('Provider One: Slash model')).toBeTruthy()
    const unavailable = await screen.findByText('Provider Two: Offline model')
    expect(unavailable.closest('[role="option"]')?.getAttribute('data-disabled')).not.toBeNull()

    fireEvent.click(screen.getAllByText('Provider One: Slash model').at(-1)!)
    expect(onOverrideChange).toHaveBeenLastCalledWith([
      { controlId: 'primary', value: { modelId: 'family/model-v1', providerId: 'provider-one' } }
    ])

    expect(controls).toHaveLength(2)
  })

  it('preserves a descriptor model reference when it is absent from the catalog', async () => {
    render(
      <ComposerProfileControls
        profile={profileState({
          configDescriptor: {
            controls: [
              {
                controlId: 'primary',
                editable: true,
                kind: 'model_slot',
                slots: [
                  {
                    name: 'primary',
                    model: {
                      availability: 'unavailable',
                      modelId: 'vendor/missing-model',
                      providerId: asWireId('missing-provider'),
                      unavailableReason: 'Not installed'
                    }
                  }
                ]
              }
            ],
            effectTiming: 'next_send',
            profileId: asWireId('profile-reviewer'),
            securityLockedIds: [],
            workspaceId: asWireId('workspace-a')
          }
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Temporary settings' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Primary' }))
    expect((await screen.findAllByText('missing-provider: vendor/missing-model')).length).toBeGreaterThan(0)
  })

  it('keeps the first exact override when a second model slot is changed', async () => {
    const choice = {
      availability: 'unknown' as const,
      displayName: 'Slash model',
      modelId: 'family/model-v1',
      providerDisplayName: 'Provider One',
      providerId: 'provider-one',
      unavailableReason: null
    }

    const onOverrideChange = vi.fn()

    function Controlled(): ReactElement {
      const [overrides, setOverrides] = useState<ComposerProfileState['overrides']>([])

      return (
        <ComposerProfileControls
          profile={profileState({
            configDescriptor: {
              controls: [
                { controlId: 'primary', editable: true, kind: 'model_slot', slots: [{ name: 'primary', model: null }] },
                { controlId: 'review', editable: true, kind: 'model_slot', slots: [{ name: 'review', model: null }] }
              ],
              effectTiming: 'next_send',
              profileId: asWireId('profile-reviewer'),
              securityLockedIds: [],
              workspaceId: asWireId('workspace-a')
            },
            modelChoices: [choice],
            onOverrideChange: next => {
              onOverrideChange(next)
              setOverrides(next)
            },
            overrides
          })}
        />
      )
    }

    render(<Controlled />)
    fireEvent.click(screen.getByRole('button', { name: 'Temporary settings' }))
    fireEvent.click(screen.getAllByRole('combobox')[0])
    fireEvent.click(screen.getByText('Provider One: Slash model'))
    fireEvent.click(screen.getAllByRole('combobox')[1])
    fireEvent.click(screen.getAllByText('Provider One: Slash model').at(-1)!)

    expect(onOverrideChange).toHaveBeenLastCalledWith([
      { controlId: 'primary', value: { modelId: 'family/model-v1', providerId: 'provider-one' } },
      { controlId: 'review', value: { modelId: 'family/model-v1', providerId: 'provider-one' } }
    ])
  })
})

describe('ComposerProfileControls service config preview', () => {
  const withMode = (overrides: Partial<ComposerProfileState> = {}): ComposerProfileState =>
    profileState({
      configDescriptor: {
        controls: [
          { controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast', 'balanced'] }
        ],
        effectTiming: 'next_send',
        profileId: asWireId('profile-reviewer'),
        securityLockedIds: [],
        workspaceId: asWireId('workspace-a')
      },
      ...overrides
    })

  const openPreview = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Temporary settings' }))

    return screen.findByText('Temporary settings')
  }

  it('shows the service effective value instead of the descriptor current value, and never claims it is running yet', async () => {
    render(
      <ComposerProfileControls
        profile={withMode({
          configResolution: { effective: [{ controlId: 'mode', value: 'fast' }], status: 'resolved' },
          overrides: [{ controlId: 'mode', value: 'fast' }]
        })}
      />
    )

    await openPreview()

    expect(screen.getByText('The service confirmed these effective values.')).toBeTruthy()
    expect(screen.getByText('Effective: fast')).toBeTruthy()
    expect(screen.queryByText('Effective: balanced')).toBeNull()
    expect(screen.getByText('The running configuration is fixed only when the service accepts a send.')).toBeTruthy()
  })

  it('renders an opaque model reference exactly and never splits or rewrites its ids', async () => {
    render(
      <ComposerProfileControls
        profile={withMode({
          configDescriptor: {
            controls: [
              {
                controlId: 'primary_model',
                currentValue: 'primary',
                editable: true,
                kind: 'model_slot',
                slots: [{ model: null, name: 'primary' }]
              }
            ],
            effectTiming: 'next_send',
            profileId: asWireId('profile-reviewer'),
            securityLockedIds: [],
            workspaceId: asWireId('workspace-a')
          },
          configResolution: {
            effective: [
              { controlId: 'primary_model', value: { modelId: 'vendor/family/model-v9', providerId: 'provider-a' } }
            ],
            status: 'resolved'
          }
        })}
      />
    )

    await openPreview()

    expect(screen.getByText('Effective: provider-a: vendor/family/model-v9')).toBeTruthy()
  })

  it('surfaces the service reason per control while leaving the rejected override editable', async () => {
    render(
      <ComposerProfileControls
        profile={withMode({
          configResolution: {
            invalidControls: [{ controlId: 'mode', reason: 'UNSUPPORTED_VALUE' }],
            status: 'rejected'
          },
          overrides: [{ controlId: 'mode', value: 'fast' }]
        })}
      />
    )

    await openPreview()

    expect(screen.getByText('The service will not accept this configuration, so it cannot be sent.')).toBeTruthy()
    expect(screen.getByText('UNSUPPORTED_VALUE')).toBeTruthy()
    // The user keeps their value and can clear it back to the profile default.
    expect(screen.getByRole('button', { name: 'Use profile default' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Mode' }).hasAttribute('disabled')).toBe(false)
  })

  it('reports an unavailable service check without pretending the configuration is valid', async () => {
    render(
      <ComposerProfileControls
        profile={withMode({ configResolution: { detail: 'CAPABILITY_NOT_DECLARED', status: 'unavailable' } })}
      />
    )

    await openPreview()

    expect(screen.getByText('The service cannot confirm this configuration. CAPABILITY_NOT_DECLARED')).toBeTruthy()
    expect(screen.queryByText('The service confirmed these effective values.')).toBeNull()
  })

  it('shows the in-flight service check while the answer is pending', async () => {
    render(<ComposerProfileControls profile={withMode({ configResolution: { status: 'resolving' } })} />)

    await openPreview()

    expect(screen.getByText('Checking this configuration with the service…')).toBeTruthy()
  })
})
