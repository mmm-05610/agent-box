// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { ConfigDescriptor } from '@/types/wire/wire-v1'
import { asWireId } from '@/types/wire/wire-v1'

import { ComposerAccessChip } from './access-chip'

afterEach(cleanup)

// Radix Select needs these in jsdom: pointer capture and scroll do not exist
// on the test element prototypes.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => undefined

const enumControl = (overrides: Partial<{ controlId: string; editable: boolean; values: string[] }> = {}) => ({
  kind: 'enum' as const,
  controlId: 'permission',
  values: ['default', 'full'],
  editable: true,
  ...overrides
})

const descriptor = (controls: ConfigDescriptor['controls'], securityLockedIds: string[] = []): ConfigDescriptor => ({
  controls,
  effectTiming: 'next_send',
  profileId: asWireId('profile-1'),
  securityLockedIds,
  workspaceId: asWireId('workspace-1')
})

const mount = (configDescriptor: ConfigDescriptor | null, overrides: { controlId: string; value: unknown }[] = []) => {
  const onOverrideChange = vi.fn()

  render(
    <I18nProvider localePreference={null}>
      <ComposerAccessChip
        profile={{
          configDescriptor,
          onOverrideChange,
          onSelect: () => true,
          options: [],
          overrides,
          selectedId: 'p1'
        }}
      />
    </I18nProvider>
  )

  return onOverrideChange
}

/** Radix Select opens its content on a pointerdown on the trigger and commits
 *  an option on the same gesture — one helper owns that pair. */
async function openChipAndPick(optionName?: string) {
  const trigger = screen.getByRole('combobox', { name: 'Access mode' })

  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(trigger)

  if (optionName === undefined) {
    return
  }

  const option = await screen.findByRole('option', { name: optionName })

  fireEvent.pointerDown(option, { button: 0, ctrlKey: false })
  fireEvent.click(option)
}

describe('ComposerAccessChip', () => {
  it('renders when the service declares an editable enum permission control', () => {
    mount(descriptor([enumControl()]))
    expect(screen.getByRole('combobox', { name: 'Access mode' })).toBeTruthy()
  })

  it('renders nothing when no permission control is declared', () => {
    mount(descriptor([]))
    expect(screen.queryByRole('combobox', { name: 'Access mode' })).toBeNull()
  })

  it('renders nothing when the permission control is not editable', () => {
    mount(descriptor([enumControl({ editable: false })]))
    expect(screen.queryByRole('combobox', { name: 'Access mode' })).toBeNull()
  })

  it('renders nothing when the permission control is security-locked', () => {
    mount(descriptor([enumControl()], ['permission']))
    expect(screen.queryByRole('combobox', { name: 'Access mode' })).toBeNull()
  })

  it('renders nothing when the declared permission control is not an enum', () => {
    mount(
      descriptor([
        { kind: 'boolean', controlId: 'permission', editable: true }
      ])
    )
    expect(screen.queryByRole('combobox', { name: 'Access mode' })).toBeNull()
  })

  it('offers exactly the declared values, not invented ones', async () => {
    mount(descriptor([enumControl({ values: ['ask', 'allowed'] })]))
    await openChipAndPick()
    const options = screen.getAllByRole('option').map(option => option.textContent)
    expect(options).toEqual(['ask', 'allowed'])
  })

  it('writes the chosen value as an override for the declared control', async () => {
    const onOverrideChange = mount(descriptor([enumControl({ values: ['default', 'full'] })]))
    await openChipAndPick('full')

    expect(onOverrideChange).toHaveBeenCalledWith([{ controlId: 'permission', value: 'full' }])
  })

  it('replaces an existing override for the same control and preserves others', async () => {
    const onOverrideChange = mount(descriptor([enumControl({ controlId: 'permission_mode' })]), [
      { controlId: 'model', value: 'fixture-model' },
      { controlId: 'permission_mode', value: 'default' }
    ])
    await openChipAndPick('full')

    expect(onOverrideChange).toHaveBeenCalledWith([
      { controlId: 'model', value: 'fixture-model' },
      { controlId: 'permission_mode', value: 'full' }
    ])
  })

  it('shows the placeholder, not an invented value, while no override is set', () => {
    mount(descriptor([enumControl()]))
    expect(screen.getByText('Access mode')).toBeTruthy()
  })
})
