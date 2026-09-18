import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import {
  asWireId,
  type ConfigDescriptor,
  type ProviderModelConfigRecord,
  type ProviderModelRef
} from '@/types/wire/wire-v1'

import {
  buildProfileConfigValues,
  emptyProfileConfigDraft,
  isProfileConfigDirty,
  type ProfileConfigDraft,
  ProfileConfigEditor
} from './profile-config-editor'

stubMenuDomApis()
stubResizeObserver()

const HARNESS = 'opaque-alpha'
const OTHER_HARNESS = 'opaque-beta'

type ModelEntry = ProviderModelConfigRecord['models'][number]

const slotRef = (
  modelId: string,
  availability: ProviderModelRef['availability'] = 'available',
  unavailableReason: null | string = null
): ProviderModelRef => ({ availability, modelId, providerId: asWireId('provider-one'), unavailableReason })

const modelEntry = (
  modelId: string,
  availability: ModelEntry['availability'] = 'available',
  unavailableReason: null | string = null
): ModelEntry => ({ availability, displayName: modelId, modelId, unavailableReason })

const providerModel = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  archivedAt: null,
  configuration: [],
  createdAt: '2026-09-14T00:00:00.000Z',
  credentialId: null,
  displayName: 'Provider One',
  harness: HARNESS,
  id: asWireId('provider-one'),
  models: [modelEntry('family/model-v1')],
  provider: 'opaque-provider',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

const primarySlot = (model: null | ProviderModelRef) => ({
  controlId: 'primary_model',
  currentValue: 'primary',
  editable: true,
  kind: 'model_slot' as const,
  slots: [{ model, name: 'primary' }]
})

const descriptor = (overrides: Partial<ConfigDescriptor> = {}): ConfigDescriptor => ({
  controls: [
    { controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast', 'balanced'] },
    { controlId: 'notes', currentValue: 'keep me', editable: true, kind: 'string', multiline: false },
    { controlId: 'journal', editable: true, kind: 'string', multiline: true },
    { controlId: 'verbose', currentValue: true, editable: true, kind: 'boolean' },
    primarySlot(slotRef('family/model-v1'))
  ],
  effectTiming: 'next_send',
  profileId: asWireId('profile-reviewer'),
  securityLockedIds: [],
  workspaceId: null,
  ...overrides
})

/** The editor is controlled: this harness keeps a real draft so multi-step
 *  interactions behave the way they do in the page. */
function EditorHarness({
  descriptor: input,
  disabled,
  harness = HARNESS,
  models,
  onDraft
}: {
  descriptor: ConfigDescriptor
  disabled?: boolean
  harness?: string
  models: ProviderModelConfigRecord[]
  onDraft?: (draft: ProfileConfigDraft) => void
}) {
  const [draft, setDraft] = useState<ProfileConfigDraft>(emptyProfileConfigDraft)

  return (
    <ProfileConfigEditor
      descriptor={input}
      disabled={disabled}
      draft={draft}
      harness={harness}
      models={models}
      onChange={next => {
        setDraft(next)
        onDraft?.(next)
      }}
    />
  )
}

function realClick(element: HTMLElement): void {
  fireEvent.pointerDown(element, { button: 0, pointerType: 'mouse' })
  fireEvent.pointerUp(element, { button: 0, pointerType: 'mouse' })
  fireEvent.click(element)
}

const openSelect = (name: string): void => realClick(screen.getByRole('combobox', { name }))

afterEach(cleanup)

describe('ProfileConfigEditor controls', () => {
  it('renders exactly one limited control per service-described kind', () => {
    render(<EditorHarness descriptor={descriptor()} models={[providerModel()]} />)

    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Notes' }) as HTMLElement).tagName).toBe('INPUT')
    expect((screen.getByRole('textbox', { name: 'Journal' }) as HTMLElement).tagName).toBe('TEXTAREA')
    expect(screen.getByRole('switch', { name: 'Verbose' }).getAttribute('data-state')).toBe('checked')
    expect(screen.getByRole('combobox', { name: 'Primary model' }).textContent).toContain('family/model-v1')
  })

  it('offers only the models whose opaque harness value matches the Profile', async () => {
    const models = [
      providerModel(),
      providerModel({
        displayName: 'Provider Two',
        harness: OTHER_HARNESS,
        id: asWireId('provider-two'),
        models: [modelEntry('other-harness-model')]
      })
    ]

    render(<EditorHarness descriptor={descriptor()} models={models} />)

    openSelect('Primary model')

    expect(await screen.findByRole('option', { name: /family\/model-v1/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /other-harness-model/ })).toBeNull()
  })

  it('keeps an unavailable model unselectable with the service reason and marks unknown ones unverified', async () => {
    const onDraft = vi.fn()

    render(
      <EditorHarness
        descriptor={descriptor()}
        models={[
          providerModel({
            models: [
              modelEntry('family/blocked-model', 'unavailable', 'Quota exhausted'),
              modelEntry('family/unknown-model', 'unknown')
            ]
          })
        ]}
        onDraft={onDraft}
      />
    )

    openSelect('Primary model')

    const blocked = await screen.findByRole('option', { name: /blocked-model/ })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')
    expect(blocked.textContent).toContain('Quota exhausted')

    realClick(blocked)
    expect(onDraft).not.toHaveBeenCalled()

    const unknown = screen.getByRole('option', { name: /unknown-model/ })
    expect(unknown.textContent).toContain('Not verified')

    realClick(unknown)
    expect(onDraft).toHaveBeenCalledWith({
      clearedIds: [],
      edits: [{ controlId: 'primary_model', value: { modelId: 'family/unknown-model', providerId: 'provider-one' } }]
    })
  })

  it('still shows a current reference the directory no longer lists, and can restore the default', async () => {
    const onDraft = vi.fn()

    render(
      <EditorHarness
        descriptor={descriptor({ controls: [primarySlot(slotRef('family/legacy-v1', 'unavailable', 'Retired'))] })}
        models={[providerModel()]}
        onDraft={onDraft}
      />
    )

    expect(screen.getByRole('combobox', { name: 'Primary model' }).textContent).toContain('family/legacy-v1')

    openSelect('Primary model')
    const legacy = await screen.findByRole('option', { name: /family\/legacy-v1/ })
    expect(legacy.textContent).toContain('Retired')

    // An open Radix list hides the rest of the page from the accessibility
    // tree, so it is dismissed before touching the reset control.
    fireEvent.keyDown(legacy, { key: 'Escape' })

    realClick(await screen.findByRole('button', { name: 'Restore default' }))
    expect(onDraft).toHaveBeenCalledWith({ clearedIds: ['primary_model'], edits: [] })
    expect(screen.getByRole('combobox', { name: 'Primary model' }).textContent).toContain('Not set')
  })

  it('leaves security-locked and non-editable controls without any way to change them', () => {
    render(
      <EditorHarness
        descriptor={descriptor({
          controls: [
            { controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast', 'balanced'] },
            { controlId: 'notes', currentValue: 'keep me', editable: false, kind: 'string', multiline: false }
          ],
          securityLockedIds: ['mode']
        })}
        models={[]}
      />
    )

    expect(screen.getByRole('combobox', { name: 'Mode' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('textbox', { name: 'Notes' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Restore default' })).toBeNull()
    expect(screen.getByText('Locked by the service')).toBeTruthy()
  })

  it('edits each service-declared model slot independently', async () => {
    const onDraft = vi.fn()

    render(
      <EditorHarness
        descriptor={descriptor({
          controls: [primarySlot(null), { ...primarySlot(null), controlId: 'fallback_model' }]
        })}
        models={[providerModel({ models: [modelEntry('family/model-v1'), modelEntry('family/model-v2')] })]}
        onDraft={onDraft}
      />
    )

    openSelect('Primary model')
    realClick(await screen.findByRole('option', { name: /family\/model-v2/ }))

    expect(onDraft).toHaveBeenLastCalledWith({
      clearedIds: [],
      edits: [{ controlId: 'primary_model', value: { modelId: 'family/model-v2', providerId: 'provider-one' } }]
    })

    openSelect('Fallback model')
    realClick(await screen.findByRole('option', { name: /family\/model-v1/ }))

    expect(onDraft).toHaveBeenLastCalledWith({
      clearedIds: [],
      edits: [
        { controlId: 'primary_model', value: { modelId: 'family/model-v2', providerId: 'provider-one' } },
        { controlId: 'fallback_model', value: { modelId: 'family/model-v1', providerId: 'provider-one' } }
      ]
    })
  })

  it('never offers a save path to an unavailable model when a value is already set', async () => {
    const onDraft = vi.fn()

    render(
      <EditorHarness
        descriptor={descriptor({ controls: [primarySlot(null)] })}
        models={[providerModel({ models: [modelEntry('family/blocked-model', 'unavailable', 'Quota exhausted')] })]}
        onDraft={onDraft}
      />
    )

    expect(screen.getByRole('combobox', { name: 'Primary model' }).textContent).toContain('Not set')

    openSelect('Primary model')
    realClick(await screen.findByRole('option', { name: /blocked-model/ }))

    expect(onDraft).not.toHaveBeenCalled()
  })
})

describe('buildProfileConfigValues', () => {
  const replacement = descriptor({
    controls: [
      { controlId: 'mode', currentValue: 'balanced', editable: true, kind: 'enum', values: ['fast', 'balanced'] },
      { controlId: 'locked_flag', currentValue: true, editable: true, kind: 'boolean' },
      { controlId: 'unset_notes', editable: true, kind: 'string', multiline: false },
      primarySlot(slotRef('vendor/family/model-v1'))
    ],
    securityLockedIds: ['locked_flag']
  })

  it('carries untouched and security-locked values forward and omits restored or unset ones', () => {
    expect(buildProfileConfigValues(replacement, { clearedIds: ['mode'], edits: [] })).toEqual([
      { controlId: 'locked_flag', value: true },
      { controlId: 'primary_model', value: { modelId: 'vendor/family/model-v1', providerId: 'provider-one' } }
    ])

    expect(buildProfileConfigValues(replacement, emptyProfileConfigDraft())).toEqual([
      { controlId: 'mode', value: 'balanced' },
      { controlId: 'locked_flag', value: true },
      { controlId: 'primary_model', value: { modelId: 'vendor/family/model-v1', providerId: 'provider-one' } }
    ])
  })

  it('sends the model reference exactly as the directory declared it, slash included', () => {
    const draft: ProfileConfigDraft = {
      clearedIds: [],
      edits: [{ controlId: 'primary_model', value: { modelId: 'vendor/family/model-v9', providerId: 'provider-one' } }]
    }

    expect(buildProfileConfigValues(replacement, draft)).toContainEqual({
      controlId: 'primary_model',
      value: { modelId: 'vendor/family/model-v9', providerId: 'provider-one' }
    })
  })

  it('treats an explicit restore as a change and an identical value as none', () => {
    expect(isProfileConfigDirty(replacement, emptyProfileConfigDraft())).toBe(false)
    expect(isProfileConfigDirty(replacement, { clearedIds: ['mode'], edits: [] })).toBe(true)
    expect(
      isProfileConfigDirty(replacement, { clearedIds: [], edits: [{ controlId: 'mode', value: 'balanced' }] })
    ).toBe(false)
  })
})
