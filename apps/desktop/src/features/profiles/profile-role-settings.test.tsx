// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

import { ProfileRoleSettings } from './profile-role-settings'

afterEach(cleanup)

const copy = en.profiles.roleSettings

const renderSettings = (harness = 'codex', maintenanceAvailable = false) =>
  render(
    <ProfileRoleSettings
      copy={copy}
      displayName="P42 role"
      harness={harness}
      maintenanceAvailable={maintenanceAvailable}
      modelEditor={<div data-testid="model-editor" />}
    />
  )

describe('ProfileRoleSettings', () => {
  it('renders without crashing for a declared and an undeclared harness', () => {
    renderSettings('codex')
    expect(screen.getByText('P42 role')).toBeTruthy()

    cleanup()
    renderSettings('unknown-family')
    expect(screen.getByText('P42 role')).toBeTruthy()
  })

  it('renders the model editor when maintenance is available and the Model nav is selected', () => {
    renderSettings('codex', true)
    fireEvent.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByTestId('model-editor')).toBeTruthy()
  })

  it('hides the model editor when maintenance is unavailable', () => {
    renderSettings('codex', false)
    expect(screen.queryByTestId('model-editor')).toBeNull()
  })
})
