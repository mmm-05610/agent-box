// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WireRemoteError } from '@/api/wire-v1-client'
import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'
import { asWireId, type ProfileRecord, type ProfilesCloneResult } from '@/types/wire/wire-v1'

import { CloneProfileDialog } from './clone-profile-dialog'

afterEach(cleanup)

const copy = en.profiles.clone

const profile: ProfileRecord = {
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-18T00:00:00.000Z',
  displayName: 'Builder',
  harness: 'opaque-alpha',
  id: asWireId('profile_1'),
  updatedAt: '2026-09-18T00:00:00.000Z',
  version: 3
}

const cloneResult = (): ProfilesCloneResult => ({
  migration: {
    items: [
      { item: 'configuration', migrated: true, reason: 'same family: the configuration object is reused' },
      { item: 'native-sessions', migrated: false, reason: 'native sessions belong to the source' }
    ],
    migratedCount: 1,
    permissions: { preset: 'plan', rules: [] },
    reboundAssets: ['skill:fixture'],
    refusedCount: 1,
    sameFamily: true,
    sourceFamily: 'opaque-alpha',
    targetFamily: 'opaque-alpha'
  },
  profile: { ...profile, displayName: 'Builder copy', id: asWireId('profile_2'), version: 1 }
})

const mount = (onClone: (intent: { displayName: string; harness?: string }) => Promise<ProfilesCloneResult>) =>
  render(
    <I18nProvider localePreference={null}>
      <CloneProfileDialog
        copy={copy}
        harnessChoices={[
          { id: 'opaque-alpha', label: 'Alpha' },
          { id: 'opaque-beta', label: 'Beta' }
        ]}
        onClone={onClone}
        onClose={() => undefined}
        open
        profile={profile}
      />
    </I18nProvider>
  )

describe('CloneProfileDialog', () => {
  it('shows the migration report the service computed, including what stayed behind', async () => {
    mount(async () => cloneResult())

    fireEvent.click(screen.getByRole('button', { name: copy.submit }))

    const report = await screen.findByText(copy.reportTitle)
    const body = report.closest('[data-clone-report]')

    expect(body?.textContent).toContain(copy.reportCounts(1, 1))
    expect(body?.textContent).toContain('native-sessions')
    expect(body?.textContent).toContain('native sessions belong to the source')
    expect(body?.textContent).toContain(copy.rebound(1))
  })

  it('sends the chosen family only when it changes', async () => {
    const onClone = vi.fn(async () => cloneResult())

    mount(onClone)
    fireEvent.change(screen.getByLabelText(copy.harnessLabel), { target: { value: 'opaque-beta' } })
    fireEvent.click(screen.getByRole('button', { name: copy.submit }))

    await screen.findByText(copy.reportTitle)
    expect(onClone).toHaveBeenCalledWith({ displayName: 'Builder copy', harness: 'opaque-beta' })
  })

  it('shows a typed refusal and writes nothing local', async () => {
    const onCloned = vi.fn()

    mount(async () => {
      throw new WireRemoteError({
        code: 'INVALID_REQUEST',
        message: "the 'opaque-unknown' family is not registered"
      })
    })

    fireEvent.click(screen.getByRole('button', { name: copy.submit }))

    const error = await screen.findByText(/family is not registered/)

    expect(error.getAttribute('data-clone-error')).toBe('')
    expect(error.textContent).toContain('INVALID_REQUEST')
    expect(onCloned).not.toHaveBeenCalled()
    expect(document.querySelector('[data-clone-report]')).toBeNull()
  })
})
