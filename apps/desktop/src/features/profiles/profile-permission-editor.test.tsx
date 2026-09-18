// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'
import { asWireId, type ProfileRecord } from '@/types/wire/wire-v1'

import { ProfilePermissionEditor } from './profile-permission-editor'

afterEach(cleanup)

const copy = en.profiles.roleSettings

const profile = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-18T00:00:00.000Z',
  displayName: 'Planner',
  harness: 'opaque-alpha',
  id: asWireId('profile_1'),
  permissionPreset: 'plan',
  permissionRules: [
    { action: 'allow', key: 'read', pattern: null },
    { action: 'deny', key: 'bash', pattern: null }
  ],
  updatedAt: '2026-09-18T00:00:00.000Z',
  version: 4,
  ...overrides
})

const mount = (onSave: (intent: { preset: string; rules: unknown[] }) => Promise<void>, disabled = false) =>
  render(
    <I18nProvider localePreference={null}>
      <ProfilePermissionEditor copy={copy} disabled={disabled} onSave={onSave as never} profile={profile()} />
    </I18nProvider>
  )

describe('ProfilePermissionEditor (order 60 write path)', () => {
  it('submits the stored order unchanged — the last match is what decides', async () => {
    const onSave = vi.fn(async () => undefined)

    mount(onSave)

    expect(document.querySelectorAll('[data-permission-rules] li')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: copy.permissionsSave }))

    await screen.findByText(copy.permissionsSaved)
    expect(onSave).toHaveBeenCalledWith({
      preset: 'plan',
      rules: [
        { action: 'allow', key: 'read', pattern: null },
        { action: 'deny', key: 'bash', pattern: null }
      ]
    })
  })

  it('adds and removes rows without reordering the rest', async () => {
    const onSave = vi.fn(async () => undefined)

    mount(onSave)
    fireEvent.click(screen.getByRole('button', { name: copy.permissionsAdd }))
    expect(document.querySelectorAll('[data-permission-rules] li')).toHaveLength(3)

    fireEvent.click(screen.getAllByRole('button', { name: copy.permissionsRemove })[0]!)
    expect(document.querySelectorAll('[data-permission-rules] li')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: copy.permissionsSave }))

    await screen.findByText(copy.permissionsSaved)
    const [intent] = onSave.mock.calls[0] as unknown as [{ rules: Array<{ key: string }> }]

    // The first row was removed, so what remains starts at the old second row.
    expect(intent.rules[0]?.key).toBe('bash')
  })

  it('G2: a disabled surface cannot submit — no call, no silent failure', () => {
    const onSave = vi.fn(async () => undefined)

    mount(onSave, true)
    fireEvent.click(screen.getByRole('button', { name: copy.permissionsSave }))

    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows the service refusal by its typed code and keeps the edited rules', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('INVALID_REQUEST: PERMISSION_PRESET_UNSUPPORTED')
    })

    mount(onSave)
    fireEvent.click(screen.getByRole('button', { name: copy.permissionsSave }))

    const error = await screen.findByText(/PERMISSION_PRESET_UNSUPPORTED/)

    expect(error.getAttribute('data-permission-error')).toBe('')
    expect(document.querySelectorAll('[data-permission-rules] li')).toHaveLength(2)
    expect(screen.queryByText(copy.permissionsSaved)).toBeNull()
  })
})
