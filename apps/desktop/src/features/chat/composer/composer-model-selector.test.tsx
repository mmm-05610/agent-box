// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ReactElement, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import type { ComposerProfileState, ComposerProviderModelChoice } from '@/lib/composer/types'
import { asWireId, type ProviderModelRef } from '@/types/wire/wire-v1'

import { ComposerModelSelector } from './composer-model-selector'

stubMenuDomApis()
stubResizeObserver()

const choice = (
  providerId: string,
  modelId: string,
  overrides: Partial<Pick<ComposerProviderModelChoice, 'availability' | 'unavailableReason'>> = {}
) => ({
  availability: 'available' as const,
  displayName: `Display ${modelId}`,
  modelId,
  providerDisplayName: `Display ${providerId}`,
  providerId,
  unavailableReason: null,
  ...overrides
})

const slotDescriptor = (model: ProviderModelRef | null) => ({
  controls: [{ controlId: 'model', editable: true, kind: 'model_slot' as const, slots: [{ model, name: 'primary' }] }],
  effectTiming: 'next_send' as const,
  profileId: asWireId('profile-reviewer'),
  securityLockedIds: [],
  workspaceId: asWireId('workspace-a')
})

const profileState = (overrides: Partial<ComposerProfileState> = {}): ComposerProfileState => ({
  configDescriptor: slotDescriptor(null),
  modelChoices: [choice('provider-one', 'model-v1'), choice('provider-two', 'model-v2')],
  onOverrideChange: vi.fn(),
  onSelect: vi.fn(() => true),
  options: [],
  overrides: [],
  selectedId: 'profile-reviewer',
  ...overrides
})

/** A controlled parent, so an override written by the selector actually
 *  repaints the row — the same round-trip the composition gives it. */
function Controlled({ initial }: { initial: ComposerProfileState }): ReactElement {
  const [overrides, setOverrides] = useState(initial.overrides)

  return <ComposerModelSelector profile={{ ...initial, onOverrideChange: setOverrides, overrides }} />
}

const realClick = (element: Element): void => {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' })
  fireEvent.click(element)
}

const openMenu = async (): Promise<void> => {
  realClick(screen.getByRole('button', { name: /^Model:/ }))
}

afterEach(cleanup)

describe('ComposerModelSelector', () => {
  it('renders nothing while the descriptor has not arrived', () => {
    const { container } = render(<ComposerModelSelector profile={profileState({ configDescriptor: undefined })} />)

    expect(container.querySelector('[data-slot="composer-model-selector-trigger"]')).toBeNull()
  })

  it('renders nothing when the harness declares no model slot control', () => {
    const { container } = render(
      <ComposerModelSelector
        profile={profileState({
          configDescriptor: {
            controls: [{ controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast'] }],
            effectTiming: 'next_send',
            profileId: asWireId('profile-reviewer'),
            securityLockedIds: [],
            workspaceId: asWireId('workspace-a')
          }
        })}
      />
    )

    expect(container.querySelector('[data-slot="composer-model-selector-trigger"]')).toBeNull()
  })

  it('shows the service effective value once resolution has answered', () => {
    render(
      <ComposerModelSelector
        profile={profileState({
          configDescriptor: slotDescriptor({
            availability: 'available',
            modelId: 'model-v1',
            providerId: asWireId('provider-one'),
            unavailableReason: null
          }),
          configResolution: {
            effective: [{ controlId: 'model', value: { modelId: 'model-v1', providerId: 'provider-one' } }],
            status: 'resolved'
          }
        })}
      />
    )

    expect(screen.getByRole('button', { name: 'Model: provider-one: model-v1' })).toBeTruthy()
  })

  it('groups the declared directory by provider and writes the model slot override on pick', async () => {
    const onOverrideChange = vi.fn()
    render(<ComposerModelSelector profile={profileState({ onOverrideChange })} />)

    await openMenu()

    expect(screen.getByText('Display provider-one')).toBeTruthy()
    expect(screen.getByText('Display provider-two')).toBeTruthy()

    realClick(screen.getByText('Display model-v2'))

    expect(onOverrideChange).toHaveBeenCalledWith([
      { controlId: 'model', value: { modelId: 'model-v2', providerId: 'provider-two' } }
    ])
  })

  it('keeps an unavailable entry unselectable with its service reason', async () => {
    const onOverrideChange = vi.fn()
    render(
      <ComposerModelSelector
        profile={profileState({
          modelChoices: [
            choice('provider-one', 'model-v1'),
            choice('provider-two', 'model-v2', { availability: 'unavailable', unavailableReason: 'Provider is offline' })
          ],
          onOverrideChange
        })}
      />
    )

    await openMenu()

    const offline = screen.getByText('Display model-v2 — Provider is offline')
    const item = offline.closest('[role="option"]') ?? offline.closest('[data-disabled]')

    expect(item?.getAttribute('aria-disabled') ?? item?.getAttribute('data-disabled')).not.toBeNull()

    realClick(offline)
    expect(onOverrideChange).not.toHaveBeenCalled()
  })

  it('keeps a controlled round-trip: the picked value becomes the shown value', async () => {
    render(<Controlled initial={profileState()} />)

    await openMenu()
    realClick(screen.getByText('Display model-v1'))

    expect(screen.getByRole('button', { name: 'Model: Display provider-one: Display model-v1' })).toBeTruthy()
  })

  it('offers the way back to the profile default once a temporary override exists', async () => {
    const onOverrideChange = vi.fn()
    render(
      <ComposerModelSelector
        profile={profileState({
          onOverrideChange,
          overrides: [{ controlId: 'model', value: { modelId: 'model-v1', providerId: 'provider-one' } }]
        })}
      />
    )

    await openMenu()

    realClick(screen.getByText('Use profile default'))

    expect(onOverrideChange).toHaveBeenCalledWith([])
  })

  it('still offers a service-declared reference the directory no longer lists', async () => {
    render(
      <ComposerModelSelector
        profile={profileState({
          configDescriptor: slotDescriptor({
            availability: 'unavailable',
            modelId: 'vendor/missing-model',
            providerId: asWireId('missing-provider'),
            unavailableReason: 'Not installed'
          }),
          modelChoices: []
        })}
      />
    )

    await openMenu()

    expect(screen.getByText('vendor/missing-model — Not installed')).toBeTruthy()
  })
})
