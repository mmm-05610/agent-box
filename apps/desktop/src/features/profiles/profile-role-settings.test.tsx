// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'
import type { AssetBinding } from '@/types/wire/wire-v1'

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

describe('ProfileRoleSettings P21 read-only facts (orders 58/60/63)', () => {
  const binding: AssetBinding = {
    assetId: 'fixture-skill',
    digest: 'sha256:1111',
    enabled: false,
    kind: 'skill',
    name: 'Fixture skill',
    revision: 3
  }

  const open = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))

  it('keeps the memory section out of the nav when the service declares no paths', () => {
    renderSettings('codex')

    expect(screen.queryByRole('button', { name: copy.roleNav.memory })).toBeNull()
    expect(document.querySelector('[data-role-section="memory"]')).toBeNull()
  })

  it('renders the memory files, and a refusal without its content', () => {
    render(
      <I18nProvider localePreference={null}>
        <ProfileRoleSettings
          copy={copy}
          displayName="P42 role"
          harness="codex"
          maintenanceAvailable={false}
          memory={{
            files: [
              { content: null, path: 'MEMORY.md', refusal: 'MEMORY_CONTAINS_SECRET', size: 12 },
              { content: 'remembered', path: 'notes.md', refusal: null, size: 4 }
            ],
            note: null
          }}
          modelEditor={null}
        />
      </I18nProvider>
    )

    open(copy.roleNav.memory)

    const section = document.querySelector('[data-role-section="memory"]')!

    expect(section.textContent).toContain('notes.md')
    expect(section.textContent).toContain('remembered')
    expect(section.textContent).toContain('MEMORY_CONTAINS_SECRET — content withheld')
    expect(document.querySelector('[data-role-memory-refused]')?.textContent).toContain('MEMORY_CONTAINS_SECRET')
  })

  it('lists bound assets with their revision and disabled state', () => {
    render(
      <I18nProvider localePreference={null}>
        <ProfileRoleSettings
          bindings={[binding]}
          copy={copy}
          displayName="P42 role"
          harness="codex"
          maintenanceAvailable={false}
          modelEditor={null}
        />
      </I18nProvider>
    )

    open(copy.roleNav.skill)

    const row = document.querySelector('[data-role-binding="fixture-skill"]')

    expect(row?.textContent).toContain('Fixture skill')
    expect(row?.textContent).toContain('r3')
    expect(row?.textContent).toContain(copy.bindingsDisabled)
    // A role with no MCP assets says so rather than rendering an empty list.
    open(copy.roleNav.mcp)
    expect(document.querySelector('[data-role-bindings="empty"]')?.textContent).toBe(copy.bindingsEmpty)
  })

  it('shows the permission posture the service reported, marking overridden rows', () => {
    render(
      <I18nProvider localePreference={null}>
        <ProfileRoleSettings
          copy={copy}
          displayName="P42 role"
          harness="codex"
          maintenanceAvailable={false}
          modelEditor={null}
          permissions={{
            preset: 'plan',
            rows: [
              { action: 'allow', key: 'read', pattern: null, shadowed: true },
              { action: 'deny', key: 'bash', pattern: null, shadowed: false }
            ]
          }}
        />
      </I18nProvider>
    )

    open(copy.roleNav.permission)

    expect(document.querySelector('[data-role-permission-preset="plan"]')).not.toBeNull()
    expect(screen.getByText(copy.permissionsPreset('plan'))).toBeTruthy()
    expect(document.querySelectorAll('[data-role-permission-shadowed]')).toHaveLength(1)
  })
})
