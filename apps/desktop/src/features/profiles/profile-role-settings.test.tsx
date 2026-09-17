// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'

import { ProfileRoleSettings } from './profile-role-settings'

afterEach(cleanup)

const copy = en.profiles.roleSettings

const renderSettings = (harness = 'codex', maintenanceAvailable = false) =>
  render(
    <I18nProvider localePreference={null}>
      <ProfileRoleSettings
        copy={copy}
        displayName="P42 role"
        harness={harness}
        maintenanceAvailable={maintenanceAvailable}
        modelEditor={<div data-testid="model-editor">editor content</div>}
      />
    </I18nProvider>
  )

describe('ProfileRoleSettings', () => {
  it('renders the display name in the basics section by default', () => {
    renderSettings('codex')
    expect(screen.getByText('P42 role')).toBeTruthy()
  })

  it('renders for a harness with no declared slots without crashing', () => {
    renderSettings('pi')
    expect(screen.getByText('P42 role')).toBeTruthy()
  })

  it('renders for an unknown harness without crashing', () => {
    renderSettings('unknown-family')
    expect(screen.getByText('P42 role')).toBeTruthy()
  })
})
