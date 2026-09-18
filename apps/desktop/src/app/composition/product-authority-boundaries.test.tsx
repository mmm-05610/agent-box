/**
 * The product authority boundaries, exercised through the real seams.
 *
 * Three legacy Hermes control flows were reachable from the AgentBox product
 * composition: the config-record read behind the cold-start gate, the MCP
 * background health checker, and two REST reads that live below the composition
 * root (the plugin host's `profileRoutes` and the i18n locale port). This file
 * renders the REAL composition root with the preload bridge stubbed and proves
 * the product issues no legacy REST request on the cold-start path, then pins
 * the two lower seam gates.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isLegacyRestAllowed, setLegacyRestAllowed } from '@/api/legacy-rest'
// Imported at module scope on purpose: this is the product composition root,
// and loading it is itself the behavior under test (it applies the product
// runtime policy at import time, before any surface can mount). Keeping the
// heavy graph load out of the test body also keeps the test itself fast.
import { ContribWiring } from '@/app/composition/wiring/features'
import { hermesLocalePreference } from '@/application/hermes-locale-preference'
import { hostProfileRouting } from '@/extension/sdk/host-routing'
import { $profiles } from '@/store/profile'
import type { HermesConfigRecord, ProfileInfo } from '@/types/hermes'

// ── The composition root's heavy children, replaced by inert stubs ──────────
vi.mock('@/app/composition/registrations/surfaces', () => ({
  ChatRoutesSurface: () => null,
  SidebarSurface: () => null,
  StatusbarSurface: () => null,
  TerminalSurface: () => null
}))
vi.mock('@/components/boot-failure-overlay', () => ({ BootFailureOverlay: () => null }))
vi.mock('@/components/confirm-host', () => ({ ConfirmHost: () => null }))
vi.mock('@/components/desktop-install-overlay', () => ({ DesktopInstallOverlay: () => null }))
vi.mock('@/components/find-bar', () => ({ FindBar: () => null }))
vi.mock('@/components/notifications', () => ({ NotificationStack: () => null }))
vi.mock('@/components/onboarding', () => ({ DesktopOnboardingOverlay: () => null }))
vi.mock('@/components/pet/floating-pet', () => ({ FloatingPet: () => null }))
vi.mock('@/components/remote-display-banner', () => ({ RemoteDisplayBanner: () => null }))
vi.mock('@/components/send-diagnostics-dialog', () => ({ SendDiagnosticsHost: () => null }))
vi.mock('@/components/tips', () => ({ TipHost: () => null }))
vi.mock('@/features/pet-generate/pet-generate-overlay', () => ({ PetGenerateOverlay: () => null }))
vi.mock('@/features/profiles/model-picker-overlay', () => ({ ModelPickerOverlay: () => null }))
vi.mock('@/features/profiles/model-visibility-overlay', () => ({ ModelVisibilityOverlay: () => null }))
vi.mock('@/features/right-sidebar/file-actions', () => ({ FileActionDialogs: () => null }))
vi.mock('@/features/right-sidebar/files/remote-picker', () => ({ RemoteFolderPicker: () => null }))
vi.mock('@/features/right-sidebar/terminal/persistent', () => ({ PersistentTerminal: () => null }))
vi.mock('@/features/session/session-picker-overlay', () => ({ SessionPickerOverlay: () => null }))
vi.mock('@/features/session/session-switcher', () => ({ SessionSwitcher: () => null }))
vi.mock('@/features/settings/plugin-install-modal', () => ({ PluginInstallModal: () => null }))
vi.mock('@/features/updates/updates-overlay', () => ({ UpdatesOverlay: () => null }))
vi.mock('@/app/composition/registrations/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/gateway-connecting-overlay', () => ({ GatewayConnectingOverlay: () => null }))
vi.mock('@/app/shell/chrome/titlebar/controls', () => ({ TitlebarControls: () => null }))
vi.mock('@/features/session-import', () => ({ SessionImportView: () => null }))

// The config-record seam: the exact call the composition root used to make for
// `resume_last_session`. The composition must never trigger it. The spy wraps
// the REAL function (installed inside the test), so every other caller in this
// file keeps the production implementation.

function stubBridge(handler?: (request: { body?: unknown; method?: string; path?: string }) => unknown) {
  const api = vi.fn(async (request: { body?: unknown; method?: string; path?: string }) => handler?.(request) ?? {})
  const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')

  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api } })

  return {
    api,
    restore: () => {
      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  }
}

const profile = (name: string): ProfileInfo => ({ name }) as ProfileInfo

afterEach(() => {
  setLegacyRestAllowed(true)
  vi.clearAllMocks()
})

describe('the AgentBox product composition root', () => {
  it('mounts the cold-start shell without a single config-record fetch', async () => {
    const bridge = stubBridge()
    const config = await import('@/api/config')
    const getHermesConfigRecord = vi.spyOn(config, 'getHermesConfigRecord')
    const mcpHealth = await import('@/store/mcp-health')
    const startMcpHealthChecker = vi.spyOn(mcpHealth, 'startMcpHealthChecker')

    try {
      expect(getHermesConfigRecord).not.toHaveBeenCalled()
      // Loading the composition root closed the renderer's one legacy REST
      // door, before any surface below it mounted.
      expect(isLegacyRestAllowed()).toBe(false)

      render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/']}>
            <ContribWiring>{null}</ContribWiring>
          </MemoryRouter>
        </QueryClientProvider>
      )

      // … the composition's own cold-start gate never reads the record …
      expect(getHermesConfigRecord).not.toHaveBeenCalled()
      // … the legacy MCP health checker is never installed …
      expect(startMcpHealthChecker).not.toHaveBeenCalled()
      // … and nothing was issued over the preload bridge.
      expect(bridge.api).not.toHaveBeenCalled()
    } finally {
      getHermesConfigRecord.mockRestore()
      startMcpHealthChecker.mockRestore()
      bridge.restore()
    }
  })
})

describe('host.profileRoutes under the renderer legacy REST door', () => {
  it('reads the cached inventory without issuing GET /api/profiles when the door is closed', async () => {
    setLegacyRestAllowed(false)
    $profiles.set([profile('cached-worker')])

    const getProfileRoutes = vi.fn(async (names: string[]) =>
      names.map(name => ({
        connectionId: `connection-${name}`,
        mode: 'local' as const,
        profile: name,
        targetProfile: name
      }))
    )

    const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')

    Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { getProfileRoutes } })

    try {
      const routes = await hostProfileRouting.profileRoutes()

      expect(routes).toEqual([
        { connectionId: 'connection-cached-worker', mode: 'local', profile: 'cached-worker', targetProfile: 'cached-worker' }
      ])
      expect(getProfileRoutes).toHaveBeenCalledWith(['cached-worker'])
    } finally {
      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  })

  it('still refreshes the inventory before asking Electron for routes when the door is open', async () => {
    setLegacyRestAllowed(true)
    $profiles.set([profile('cached-worker')])

    const refreshed = [profile('fresh-worker')]
    const catalog = await import('@/application/profile/catalog')
    const refresh = vi.spyOn(catalog, 'refreshProfiles').mockResolvedValueOnce(refreshed)

    const getProfileRoutes = vi.fn(async (names: string[]) => names.map(name => ({ connectionId: name, profile: name, targetProfile: name })))
    const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')

    Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { getProfileRoutes } })

    try {
      await hostProfileRouting.profileRoutes()

      expect(refresh).toHaveBeenCalledOnce()
      expect(getProfileRoutes).toHaveBeenCalledWith(['fresh-worker'])
    } finally {
      refresh.mockRestore()

      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  })

  it('falls back to the cached inventory when the open-door refresh fails', async () => {
    setLegacyRestAllowed(true)
    $profiles.set([profile('cached-worker')])

    const catalog = await import('@/application/profile/catalog')
    const refresh = vi.spyOn(catalog, 'refreshProfiles').mockRejectedValueOnce(new Error('backend unavailable'))

    const getProfileRoutes = vi.fn(async (names: string[]) => names.map(name => ({ connectionId: name, profile: name, targetProfile: name })))
    const original = Object.getOwnPropertyDescriptor(window, 'hermesDesktop')

    Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { getProfileRoutes } })

    try {
      await hostProfileRouting.profileRoutes()

      expect(refresh).toHaveBeenCalledOnce()
      expect(getProfileRoutes).toHaveBeenCalledWith(['cached-worker'])
    } finally {
      refresh.mockRestore()

      if (original) {
        Object.defineProperty(window, 'hermesDesktop', original)
      } else {
        Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'hermesDesktop')
      }
    }
  })
})

describe('the locale preference port under the renderer legacy REST door', () => {
  it('resolves "nothing stored" and writes nothing when the door is closed', async () => {
    const bridge = stubBridge()

    try {
      setLegacyRestAllowed(false)

      await expect(hermesLocalePreference.load()).resolves.toBeUndefined()
      await expect(hermesLocalePreference.save('ja')).resolves.toBeUndefined()
      expect(bridge.api).not.toHaveBeenCalled()
    } finally {
      bridge.restore()
    }
  })

  it('reads display.language and read-modify-writes it when the door is open', async () => {
    setLegacyRestAllowed(true)

    const bridge = stubBridge(request =>
      request.method === 'PUT'
        ? { ok: true }
        : ({ agent: { keep: true }, display: { language: 'zh-Hans', theme: 'dark' } } as HermesConfigRecord)
    )

    try {
      const { localeConfigValue } = await import('@/i18n')

      await expect(hermesLocalePreference.load()).resolves.toBe('zh-Hans')

      await hermesLocalePreference.save('ja')

      const put = bridge.api.mock.calls.find(([request]) => request.method === 'PUT')?.[0]

      expect(put?.path).toBe('/api/config')
      expect((put?.body as { config: HermesConfigRecord }).config.display).toEqual({
        language: localeConfigValue('ja'),
        theme: 'dark'
      })
      expect((put?.body as { config: HermesConfigRecord }).config.agent).toEqual({ keep: true })
    } finally {
      bridge.restore()
    }
  })

  it('rejects the save when the config store answers ok:false (door open)', async () => {
    setLegacyRestAllowed(true)

    const bridge = stubBridge(() => ({ ok: false }))

    try {
      await expect(hermesLocalePreference.save('ja')).rejects.toThrow('Failed to save language')
    } finally {
      bridge.restore()
    }
  })
})
