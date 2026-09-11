import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider, type LocalePreferencePort } from '@/i18n'
import { stubMenuDomApis, stubResizeObserver } from '@/test/jsdom'

import { LanguageSwitcher } from './language-switcher'

stubResizeObserver()
stubMenuDomApis()
describe('LanguageSwitcher', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('persists the picked language through the injected preference port', async () => {
    const save = vi.fn().mockResolvedValue(undefined)

    const localePreference: LocalePreferencePort = {
      load: vi.fn().mockResolvedValue('en'),
      save
    }

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageSwitcher />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch language' }).hasAttribute('disabled')).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Switch language' }))
    fireEvent.click(screen.getByRole('option', { name: /日本語/i }))

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    // Where it lands (display.language in the Hermes config) is the adapter's
    // business; the switcher only reports WHICH locale the user picked.
    expect(save).toHaveBeenCalledWith('ja')
  })
})
