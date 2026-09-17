import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'

import { ProfileRoleSettings, profileRoleSettingsCopy } from './profile-role-settings'

afterEach(cleanup)

const copy = en.profiles.roleSettings

const renderSettings = () => render(
  <I18nProvider localePreference={null}>
    <ProfileRoleSettings copy={copy} />
  </I18nProvider>
)

describe('ProfileRoleSettings', () => {
  it('states that sessions belong to a workspace, not to the role', () => {
    const { container } = renderSettings()

    const ownership = container.querySelector('[data-session-ownership]')?.textContent ?? ''

    expect(ownership).toContain('Sessions belong to a workspace')
    expect(ownership).toContain('it does not own it')
    expect(ownership).toContain('an action on the session')
  })

  it('names the six zones a role will carry and says editing waits for the service', () => {
    const { container } = renderSettings()

    const zones = container.querySelector('[data-role-zones]')?.textContent ?? ''

    for (const zone of ['Instructions', 'Model slot', 'Credential or account reference', 'Skills, MCP and hooks', 'Permission rules', 'Advanced runtime limits']) {
      expect(zones).toContain(zone)
    }
    expect(container.querySelector('[data-role-zones-pending]')?.textContent).toContain('could not save')
  })

  it('writes down the permission model: last match wins, presets stay overridable, ask is the approval round trip', () => {
    const text = profileRoleSettingsCopy(copy).join('\n')

    expect(text).toContain('LAST matching rule wins')
    expect(text).toContain('stay overridable')
    expect(text).toContain('ask means our approval round trip')
  })

  it('states both rebind consequences before the action, and that a clone inherits no native session', () => {
    const text = profileRoleSettingsCopy(copy).join('\n')

    expect(text).toContain('carries its native sessions along')
    expect(text).toContain('restarts native continuity')
    expect(text).toContain('BEFORE the change')
    expect(text).toContain('Session-class assets do not migrate')
    expect(text).toContain('never inherits an old native session')
  })

  it('renders no control: the records behind these zones are the service\u2019s', () => {
    const { container } = renderSettings()

    expect(container.querySelector('[data-role-settings]')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
