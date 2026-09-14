/**
 * Appearance under both authorities, exercised through the real component.
 *
 * The page is the product's own settings surface, so it must be fully operable
 * under `agentbox` while issuing zero legacy Hermes REST requests — the two
 * controls that used to be backend-config fields (resume-last-session, terminal
 * font) are Desktop-local preferences there. Under `hermes` the same page keeps
 * the original config-record path for those two rows.
 *
 * The renderer's legacy REST door is deliberately left OPEN in the agentbox
 * tests: the claim is that the Hermes-config components are never mounted, not
 * that their requests happen to be refused.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDesktopLocalePreference,
  LOCALE_PREFERENCE_KEY
} from '@/application/desktop-preferences/locale-preference'
import { type PreferenceStorage } from '@/application/desktop-preferences/preference-storage'
import {
  $resumeLastSession,
  RESUME_LAST_SESSION_DEFAULT,
  RESUME_LAST_SESSION_PREFERENCE_KEY
} from '@/application/desktop-preferences/resume-last-session'
import { TERMINAL_FONT_FAMILY_PREFERENCE_KEY } from '@/application/desktop-preferences/terminal-font-preference'
import { $terminalFontFamily, DEFAULT_TERMINAL_FONT_FAMILY } from '@/application/terminal/terminal-font'
import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import { I18nProvider, type LocalePreferencePort } from '@/i18n'
import { notifyError } from '@/store/notifications'
import type * as NotificationsStore from '@/store/notifications'
import type * as PetGalleryStore from '@/store/pet-gallery'
import { $gatewayState } from '@/store/session'
import { ThemePresenter } from '@/themes/context'

import { AppearanceSettings } from './appearance-settings'
import type { SettingsAuthority } from './types'

// The pet panel polls the gateway gallery once the gateway is "open"; the page's
// zero-legacy-request claim is about Appearance itself, so the poll is stubbed.
vi.mock('@/store/pet-gallery', async importOriginal => ({
  ...(await importOriginal<typeof PetGalleryStore>()),
  loadPetGallery: vi.fn(async () => {})
}))

vi.mock('@/store/notifications', async importOriginal => ({
  ...(await importOriginal<typeof NotificationsStore>()),
  notifyError: vi.fn()
}))

stubResizeObserver()
stubMenuDomApis()

function memoryStorage(options: { failWrite?: boolean } = {}) {
  const entries = new Map<string, string>()

  const storage: PreferenceStorage = {
    read: key => entries.get(key) ?? null,
    write: (key, value) => {
      if (options.failWrite) {
        throw new Error('storage refused the write')
      }

      entries.set(key, value)
    }
  }

  return { entries, storage }
}

interface ApiRequest {
  body?: unknown
  method?: string
  path?: string
}

function stubBridge(handler?: (request: ApiRequest) => Promise<unknown>) {
  const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')
  const api = vi.fn(async (request: ApiRequest) => handler?.(request) ?? ({} as unknown))
  const zoom = { get: vi.fn(async () => ({ percent: 90 })), onChanged: vi.fn(() => () => {}), setPercent: vi.fn() }

  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api, zoom } })

  return {
    api,
    zoom,
    restore: () => {
      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  }
}

function renderPage(
  authority: SettingsAuthority,
  options: { localePreference?: LocalePreferencePort; wrap?: (page: ReactNode) => ReactNode } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const page = <AppearanceSettings authority={authority} />

  return render(
    <QueryClientProvider client={client}>
      <I18nProvider localePreference={options.localePreference ?? null}>
        {options.wrap ? options.wrap(page) : page}
      </I18nProvider>
    </QueryClientProvider>
  )
}

const rowFor = (container: HTMLElement, row: string) => container.querySelector(`[data-setting="${row}"]`)

const toggleInRow = (container: HTMLElement, row: string) => {
  const switchEl = container.querySelector(`[data-setting="${row}"] [role="switch"]`)

  if (!switchEl) {
    throw new Error(`no switch inside [data-setting="${row}"]`)
  }

  return switchEl
}

const terminalFontInput = () => screen.getByRole('combobox', { name: 'Terminal Font' }) as HTMLInputElement

beforeEach(() => {
  window.localStorage.clear()
  $resumeLastSession.set(RESUME_LAST_SESSION_DEFAULT)
  $terminalFontFamily.set('')
  $gatewayState.set('idle')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  $resumeLastSession.set(RESUME_LAST_SESSION_DEFAULT)
  $terminalFontFamily.set('')
  $gatewayState.set('idle')
  vi.restoreAllMocks()
})

describe('Appearance under the agentbox authority', () => {
  it('mounts every row without a single legacy config call, even when the gateway flips open', async () => {
    const bridge = stubBridge()
    const configApi = await import('@/api/config')
    const getRecord = vi.spyOn(configApi, 'getHermesConfigRecord')
    const saveRecord = vi.spyOn(configApi, 'saveHermesConfig')

    try {
      const { container } = renderPage('agentbox')

      // The page really painted its local controls — including the stable hook
      // the independent acceptance driver drives.
      expect(rowFor(container, 'resume-last-session')).toBeTruthy()
      expect(terminalFontInput()).toBeTruthy()
      expect(screen.getByText('Theme')).toBeTruthy()
      expect(screen.getByText('UI Scale')).toBeTruthy()

      act(() => $gatewayState.set('open'))
      await act(async () => {
        await Promise.resolve()
      })

      expect(getRecord).not.toHaveBeenCalled()
      expect(saveRecord).not.toHaveBeenCalled()
      expect(bridge.api).not.toHaveBeenCalled()
    } finally {
      getRecord.mockRestore()
      saveRecord.mockRestore()
      bridge.restore()
    }
  })

  it('toggles resume-last-session as a local preference and keeps it across a remount', () => {
    const bridge = stubBridge()

    try {
      const first = renderPage('agentbox')

      expect(toggleInRow(first.container, 'resume-last-session').getAttribute('aria-checked')).toBe('true')

      fireEvent.click(toggleInRow(first.container, 'resume-last-session'))

      expect($resumeLastSession.get()).toBe(false)
      expect(window.localStorage.getItem(RESUME_LAST_SESSION_PREFERENCE_KEY)).toBe('false')

      first.unmount()
      const second = renderPage('agentbox')

      expect(toggleInRow(second.container, 'resume-last-session').getAttribute('aria-checked')).toBe('false')

      // Flipping back is persisted too — the row is a real switch, not a view.
      fireEvent.click(toggleInRow(second.container, 'resume-last-session'))
      expect(window.localStorage.getItem(RESUME_LAST_SESSION_PREFERENCE_KEY)).toBe('true')
    } finally {
      bridge.restore()
    }
  })

  it('sets the terminal font locally, keeps it across a remount, and treats empty as the default', () => {
    const bridge = stubBridge()

    try {
      const first = renderPage('agentbox')
      const input = terminalFontInput()

      expect(input.getAttribute('data-setting')).toBe('terminal-font')

      fireEvent.change(input, { target: { value: 'MesloLGS NF' } })

      expect($terminalFontFamily.get()).toBe('MesloLGS NF')
      expect(window.localStorage.getItem(TERMINAL_FONT_FAMILY_PREFERENCE_KEY)).toBe('MesloLGS NF')
      expect((screen.getByLabelText('Glyph preview') as HTMLElement).style.fontFamily).toContain('MesloLGS NF')

      first.unmount()
      renderPage('agentbox')

      expect(terminalFontInput().value).toBe('MesloLGS NF')

      fireEvent.click(screen.getByRole('button', { name: 'Use default' }))

      expect($terminalFontFamily.get()).toBe('')
      expect(window.localStorage.getItem(TERMINAL_FONT_FAMILY_PREFERENCE_KEY)).toBe('')
      expect((screen.getByLabelText('Glyph preview') as HTMLElement).style.fontFamily).toContain(
        DEFAULT_TERMINAL_FONT_FAMILY.split(',')[0].replaceAll("'", '')
      )
    } finally {
      bridge.restore()
    }
  })

  it('persists a language switch through the injected Desktop-local port and reports a write that did not land', async () => {
    const bridge = stubBridge()

    try {
      const { entries, storage } = memoryStorage()
      const port = createDesktopLocalePreference(storage)

      renderPage('agentbox', { localePreference: port })

      const trigger = await screen.findByRole('button', { name: 'Switch language' })

      fireEvent.click(trigger)
      fireEvent.click(await screen.findByRole('option', { name: /日本語/i }))

      await waitFor(() => expect(entries.get(LOCALE_PREFERENCE_KEY)).toBe('ja'))
      await expect(port.load()).resolves.toBe('ja')
      // The visible label follows the switch only once the write landed.
      await waitFor(() => expect(trigger.textContent).toContain('日本語'))

      cleanup()

      // A fresh mount (the next launch) reads the same stored choice back.
      renderPage('agentbox', { localePreference: port })

      await waitFor(() => expect(screen.getByText('日本語')).toBeTruthy())

      cleanup()

      // The same picker against a store that refuses the write: the failure is
      // surfaced (rollback + notification), never a silent no-op.
      const failing = createDesktopLocalePreference(memoryStorage({ failWrite: true }).storage)

      renderPage('agentbox', { localePreference: failing })

      const failingTrigger = await screen.findByRole('button', { name: 'Switch language' })

      fireEvent.click(failingTrigger)
      fireEvent.click(await screen.findByRole('option', { name: /日本語/i }))

      await waitFor(() => expect(vi.mocked(notifyError)).toHaveBeenCalled())
      await expect(failing.load()).resolves.toBeUndefined()
      expect(failingTrigger.textContent).not.toContain('日本語')
    } finally {
      bridge.restore()
    }
  })

  it('keeps the theme and UI-scale controls operable', async () => {
    const bridge = stubBridge()
    const onPreferencesChange = vi.fn()

    try {
      renderPage('agentbox', {
        wrap: page => (
          <ThemePresenter
            accentOverride={null}
            activeScope="default"
            appearance={{ paint: () => {} }}
            availableThemes={[]}
            onPendingApplyDrained={() => {}}
            onPreferencesChange={onPreferencesChange}
            pendingApply={null}
            preferences={{ mode: 'light', theme: 'hermes' }}
            systemDark={false}
          >
            {page}
          </ThemePresenter>
        )
      })

      fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
      expect(onPreferencesChange).toHaveBeenCalledWith({ mode: 'dark' })

      fireEvent.click(screen.getByRole('button', { name: '110%' }))
      expect(bridge.zoom.setPercent).toHaveBeenCalledWith(110)
    } finally {
      bridge.restore()
    }
  })
})

describe('Appearance under the hermes authority', () => {
  it('still reads and writes the legacy config record for resume and terminal font', async () => {
    const record = {
      display: { resume_last_session: false, theme: 'hermes' },
      terminal: { backend: 'local', font_family: 'MesloLGS NF' }
    }

    const bridge = stubBridge(async request => (request.method === 'PUT' ? { ok: true } : record))
    const configApi = await import('@/api/config')
    const getRecord = vi.spyOn(configApi, 'getHermesConfigRecord')
    const saveRecord = vi.spyOn(configApi, 'saveHermesConfig')

    try {
      const view = renderPage('hermes')

      await waitFor(() => expect(getRecord).toHaveBeenCalled())
      expect(bridge.api).toHaveBeenCalled()

      // The font row is seeded from the record, not from local storage.
      await waitFor(() => expect(terminalFontInput().value).toBe('MesloLGS NF'))
      expect(window.localStorage.getItem(TERMINAL_FONT_FAMILY_PREFERENCE_KEY)).toBeNull()

      // The resume switch shows the record's value and writes it back through
      // the config store.
      await waitFor(() =>
        expect(toggleInRow(view.container, 'resume-last-session').getAttribute('aria-checked')).toBe('false')
      )

      fireEvent.click(toggleInRow(view.container, 'resume-last-session'))

      await waitFor(() => expect(saveRecord).toHaveBeenCalled())
      const put = bridge.api.mock.calls.map(([request]) => request).find(request => request.method === 'PUT')

      expect(put?.path).toBe('/api/config')
      expect(put?.body).toMatchObject({ config: { display: { resume_last_session: true } } })
      expect(window.localStorage.getItem(RESUME_LAST_SESSION_PREFERENCE_KEY)).toBeNull()
    } finally {
      getRecord.mockRestore()
      saveRecord.mockRestore()
      bridge.restore()
    }
  })

  it('writes the terminal font back to the config record after the autosave delay', async () => {
    const record = { terminal: { backend: 'local', font_family: '' } }
    const bridge = stubBridge(async request => (request.method === 'PUT' ? { ok: true } : record))

    try {
      renderPage('hermes')

      // Seeded from the record (enabled only once the config query answers).
      await waitFor(() => expect(terminalFontInput().disabled).toBe(false))

      fireEvent.change(terminalFontInput(), { target: { value: 'Hack Nerd Font' } })

      await waitFor(
        () => {
          const put = bridge.api.mock.calls.map(([request]) => request).find(request => request.method === 'PUT')

          expect(put?.body).toMatchObject({ config: { terminal: { font_family: 'Hack Nerd Font' } } })
        },
        { timeout: 3_000 }
      )

      expect(window.localStorage.getItem(TERMINAL_FONT_FAMILY_PREFERENCE_KEY)).toBeNull()
    } finally {
      bridge.restore()
    }
  })
})
