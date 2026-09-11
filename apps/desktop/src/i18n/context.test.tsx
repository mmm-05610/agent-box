import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider, useI18n } from './context'
import type { LocalePreferencePort } from './locale-preference'
import type { Locale } from './types'

// The provider's whole contract with persistence is `LocalePreferencePort`:
// "what was stored?" in, "store this locale" out. Every test below injects a
// fake — there is no default backend to fall back on, and mapping a raw stored
// value to `display.language` is the adapter's job
// (`src/hermes-locale-preference.test.ts`), not this component's.
function memoryPort(overrides: Partial<LocalePreferencePort> = {}): LocalePreferencePort {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function LanguageProbe({ target = 'zh' }: { target?: Locale }) {
  const { configLoadError, isLoadingConfig, isSavingLocale, locale, saveError, setLocale, t } = useI18n()

  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <p data-testid="label">{t.language.label}</p>
      <p data-testid="save">{t.common.save}</p>
      <p data-testid="loading">{String(isLoadingConfig)}</p>
      <p data-testid="saving">{String(isSavingLocale)}</p>
      <p data-testid="load-error">{configLoadError?.message ?? ''}</p>
      <p data-testid="save-error">{saveError?.message ?? ''}</p>
      <button onClick={() => void setLocale(target).catch(() => undefined)} type="button">
        switch
      </button>
    </div>
  )
}

describe('I18nProvider', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('defaults to English without a preference port', () => {
    render(
      <I18nProvider localePreference={null}>
        <LanguageProbe />
      </I18nProvider>
    )

    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(screen.getByTestId('label').textContent).toBe('Language')
  })

  it('normalizes an initial locale alias and switches translations', async () => {
    render(
      <I18nProvider initialLocale="zh-CN" localePreference={null}>
        <LanguageProbe target="en" />
      </I18nProvider>
    )

    expect(screen.getByTestId('locale').textContent).toBe('zh')
    expect(screen.getByTestId('label').textContent).toBe('语言')

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en'))
    expect(screen.getByTestId('label').textContent).toBe('Language')
  })

  it('loads the initial locale from the persisted preference', async () => {
    const localePreference = memoryPort({ load: vi.fn().mockResolvedValue('zh-Hans') })

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    expect(screen.getByTestId('locale').textContent).toBe('zh')
    expect(screen.getByTestId('label').textContent).toBe('语言')
    expect(localePreference.save).not.toHaveBeenCalled()
  })

  it('keeps English usable when the preference load fails, and surfaces the error', async () => {
    const localePreference = memoryPort({ load: vi.fn().mockRejectedValue(new Error('config unavailable')) })

    render(
      <I18nProvider initialLocale="zh" localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(screen.getByTestId('label').textContent).toBe('Language')
    expect(screen.getByTestId('load-error').textContent).toBe('config unavailable')
    expect(localePreference.save).not.toHaveBeenCalled()
  })

  it('loads zh-hant from the persisted preference', async () => {
    const localePreference = memoryPort({ load: vi.fn().mockResolvedValue('zh-TW') })

    render(
      <I18nProvider initialLocale="zh" localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    expect(screen.getByTestId('locale').textContent).toBe('zh-hant')
    expect(screen.getByTestId('save').textContent).toBe('儲存')
    expect(localePreference.save).not.toHaveBeenCalled()
  })

  it('loads ja from the persisted preference', async () => {
    const localePreference = memoryPort({ load: vi.fn().mockResolvedValue('ja-JP') })

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    expect(screen.getByTestId('locale').textContent).toBe('ja')
    expect(screen.getByTestId('save').textContent).toBe('保存')
    expect(localePreference.save).not.toHaveBeenCalled()
  })

  it('does not overwrite unsupported configured languages', async () => {
    const localePreference = memoryPort({ load: vi.fn().mockResolvedValue('de') })

    render(
      <I18nProvider initialLocale="zh" localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(screen.getByTestId('label').textContent).toBe('Language')
    expect(localePreference.save).not.toHaveBeenCalled()
  })

  it('hands the chosen locale to the port, in the port vocabulary', async () => {
    const localePreference = memoryPort()

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(localePreference.save).toHaveBeenCalledTimes(1))
    // The locale itself — not a config record, not `display.language`.
    expect(localePreference.save).toHaveBeenCalledWith('zh')
    expect(screen.getByTestId('locale').textContent).toBe('zh')
  })

  it('saves newly supported locales', async () => {
    const localePreference = memoryPort()

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe target="ja" />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(localePreference.save).toHaveBeenCalledTimes(1))
    expect(localePreference.save).toHaveBeenCalledWith('ja')
    expect(screen.getByTestId('locale').textContent).toBe('ja')
  })

  it('applies RTL direction for Arabic and restores LTR on switch back', async () => {
    render(
      <I18nProvider initialLocale="ar" localePreference={null}>
        <LanguageProbe target="en" />
      </I18nProvider>
    )

    expect(screen.getByTestId('locale').textContent).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('en'))
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')
  })

  it('rolls back the visible locale when the save rejects', async () => {
    const localePreference = memoryPort({ save: vi.fn().mockRejectedValue(new Error('save failed')) })

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('save-error').textContent).toBe('save failed'))

    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(screen.getByTestId('label').textContent).toBe('Language')
  })

  it('retries a transient load failure and applies the persisted locale', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('backend not ready yet')).mockResolvedValueOnce('zh-Hans')
    const localePreference = memoryPort({ load })

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    // First attempt fails → settles on English (permanent-failure contract).
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('locale').textContent).toBe('en')

    // The bounded retry succeeds, applies the persisted language, and clears
    // the error it had surfaced.
    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('zh'), { timeout: 5_000 })
    expect(load).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('load-error').textContent).toBe('')
  })

  it('stops retrying after the bounded retry budget is exhausted', async () => {
    vi.useFakeTimers()
    const load = vi.fn().mockRejectedValue(new Error('backend unavailable'))
    const localePreference = memoryPort({ load })

    render(
      <I18nProvider initialLocale="zh" localePreference={localePreference}>
        <LanguageProbe />
      </I18nProvider>
    )

    // Flush the initial attempt: it fails and settles on English.
    await act(async () => {})
    expect(screen.getByTestId('locale').textContent).toBe('en')
    expect(load).toHaveBeenCalledTimes(1)

    // Budget is 10 retries at 3s each; run the whole budget to completion.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        vi.advanceTimersByTime(3_000)
      })
    }

    expect(load).toHaveBeenCalledTimes(11)

    // No timer is left after the budget is spent — nothing fires later.
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(load).toHaveBeenCalledTimes(11)

    vi.useRealTimers()
  })

  it('a late startup read never overrides a language the user picked mid-retry', async () => {
    vi.useFakeTimers()

    const load = vi.fn().mockRejectedValueOnce(new Error('backend not ready yet')).mockResolvedValue('en')
    const localePreference = memoryPort({ load })

    render(
      <I18nProvider localePreference={localePreference}>
        <LanguageProbe target="ja" />
      </I18nProvider>
    )

    await act(async () => {})
    expect(screen.getByTestId('locale').textContent).toBe('en')

    // User picks Japanese while the startup retry is still pending.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'switch' }))
    })
    expect(screen.getByTestId('locale').textContent).toBe('ja')

    // The retry resolves with the stale on-disk value; the explicit pick wins.
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByTestId('locale').textContent).toBe('ja')

    vi.useRealTimers()
  })

  it('switches and stays put when the surface declares no persistence', async () => {
    render(
      <I18nProvider localePreference={null}>
        <LanguageProbe />
      </I18nProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => expect(screen.getByTestId('locale').textContent).toBe('zh'))
    // Nothing to wait on, nothing to fail: a null port is not a pending save.
    expect(screen.getByTestId('saving').textContent).toBe('false')
    expect(screen.getByTestId('save-error').textContent).toBe('')
    expect(screen.getByTestId('load-error').textContent).toBe('')
  })
})
