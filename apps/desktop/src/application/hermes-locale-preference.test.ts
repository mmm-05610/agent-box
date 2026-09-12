import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesConfigRecord } from '@/types/hermes'

import { getConfigDisplayLanguage, hermesLocalePreference, withConfigDisplayLanguage } from './hermes-locale-preference'

// This adapter is the whole of language persistence as far as i18n can see, so
// the Hermes facts it owns are tested here: the preference IS
// `display.language`, the write is a read-modify-write that must not drop the
// user's other config, and a backend that answers `{ ok: false }` is a failure
// rather than a silent success.
interface ConfigCall {
  body?: { config: HermesConfigRecord }
  method?: string
  path: string
}

describe('hermesLocalePreference', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn(async (request: ConfigCall) => {
      void request

      return {} as never
    })

    ;(window as { hermesDesktop?: unknown }).hermesDesktop = { api }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as { hermesDesktop?: unknown }).hermesDesktop
  })

  it('reads display.language out of the backend config', async () => {
    api.mockResolvedValueOnce({ display: { language: 'zh-Hans', skin: 'slate' } })

    await expect(hermesLocalePreference.load()).resolves.toBe('zh-Hans')
    // A read, not a write: no method, and the record is not touched.
    expect(api.mock.calls[0]?.[0]).toMatchObject({ path: '/api/config' })
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('reads nothing when the config has no display section', async () => {
    api.mockResolvedValueOnce({ terminal: { cwd: '/tmp' } })

    await expect(hermesLocalePreference.load()).resolves.toBeUndefined()
  })

  it('re-reads the latest config and preserves unrelated values when saving', async () => {
    api.mockResolvedValueOnce({ display: { language: 'en', skin: 'mono' }, terminal: { cwd: '/old' } })
    api.mockResolvedValueOnce({ ok: true })

    await hermesLocalePreference.save('zh')

    // Two calls: read the config as it is NOW, write it back with the one key
    // changed. A record assembled at mount would clobber the newer values.
    expect(api.mock.calls[0]?.[0]).toMatchObject({ path: '/api/config' })
    expect(api.mock.calls[1]?.[0]).toMatchObject({
      body: { config: { display: { language: 'zh', skin: 'mono' }, terminal: { cwd: '/old' } } },
      method: 'PUT',
      path: '/api/config'
    })
  })

  it('writes the canonical config value for a locale, not the locale id', async () => {
    api.mockResolvedValueOnce({ display: {} })
    api.mockResolvedValueOnce({ ok: true })

    await hermesLocalePreference.save('ja')
    expect((api.mock.calls[1]?.[0] as ConfigCall).body?.config.display).toEqual({ language: 'ja' })

    api.mockResolvedValueOnce({ display: {} })
    api.mockResolvedValueOnce({ ok: true })

    await hermesLocalePreference.save('zh-hant')
    expect((api.mock.calls[3]?.[0] as ConfigCall).body?.config.display).toEqual({ language: 'zh-hant' })
  })

  it('rejects when the backend refuses the write', async () => {
    api.mockResolvedValueOnce({ display: { language: 'en' } })
    api.mockResolvedValueOnce({ ok: false })

    await expect(hermesLocalePreference.save('zh')).rejects.toThrow('Failed to save language')
  })

  it('does nothing when there is no Electron config bridge', async () => {
    delete (window as { hermesDesktop?: unknown }).hermesDesktop

    await expect(hermesLocalePreference.load()).resolves.toBeUndefined()
    await expect(hermesLocalePreference.save('zh')).resolves.toBeUndefined()
    expect(api).not.toHaveBeenCalled()
  })

  it('merges display.language without disturbing the rest of display', () => {
    expect(withConfigDisplayLanguage({ display: { language: 'en', skin: 'mono' } }, 'zh')).toEqual({
      display: { language: 'zh', skin: 'mono' }
    })
    // A config that never had a display section gains exactly one.
    expect(withConfigDisplayLanguage({ terminal: { cwd: '/x' } }, 'ja')).toEqual({
      display: { language: 'ja' },
      terminal: { cwd: '/x' }
    })
  })

  it('treats a non-record display section as absent rather than throwing', () => {
    expect(getConfigDisplayLanguage({ display: 'mono' })).toBeUndefined()
    expect(getConfigDisplayLanguage({})).toBeUndefined()
  })
})
