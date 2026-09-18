import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $bootFailureDismissed, $desktopBoot, applyDesktopBootProgress, dismissBootFailure } from '@/store/boot'
import { $desktopOnboarding } from '@/store/onboarding'

import { BootFailureOverlay } from './boot-failure-overlay'

// Remote-backend users hit a hard boot failure that isn't OAuth reauth (token
// auth, wrong URL, unreachable host). The recovery screen must let them fix the
// remote connection in place — the "Connection settings" action swaps the card
// to an in-line connect form — instead of stranding them (the old bug forced a
// hand-edit of connection.json).

function failBoot() {
  $desktopBoot.set({
    error: 'Could not connect to Hermes gateway',
    fakeMode: false,
    message: 'boot failed',
    phase: 'renderer.error',
    progress: 40,
    running: false,
    timestamp: Date.now(),
    visible: true
  })
}

// The host (app/composition/wiring/features) injects the Gateway settings view; a directly
// constructed overlay takes a stub and renders it in the connect slot.
const StubGatewaySettingsView = ({ embedded }: { embedded?: boolean }) => (
  <div data-embedded={String(Boolean(embedded))} data-testid="stub-gateway-settings" />
)

function stubDesktop(config: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const original = window.hermesDesktop
  Object.defineProperty(window, 'hermesDesktop', {
    configurable: true,
    value: { getRecentLogs: async () => ({ lines: [] }), getConnectionConfig: async () => config, ...overrides }
  })

  return () => Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: original })
}

const remoteToken = {
  envOverride: false,
  mode: 'remote',
  profile: null,
  remoteAuthMode: 'token',
  remoteOauthConnected: false,
  remoteTokenPreview: null,
  remoteTokenSet: true,
  remoteUrl: 'http://100.116.104.53:9191',
  cloudOrg: ''
}

beforeEach(() => {
  $desktopOnboarding.set({
    configured: true,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false
  })
  failBoot()
})

afterEach(cleanup)

describe('BootFailureOverlay', () => {
  it('swaps to the in-place gateway settings view (no route nav) and back', async () => {
    render(<BootFailureOverlay GatewaySettingsView={StubGatewaySettingsView} />)

    fireEvent.click(screen.getByRole('button', { name: /gateway settings/i }))
    // Recovery actions give way to the injected panel (behind a Back control).
    expect(await screen.findByRole('button', { name: /back/i })).toBeTruthy()
    expect(screen.getByTestId('stub-gateway-settings').getAttribute('data-embedded')).toBe('true')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    expect(screen.queryByTestId('stub-gateway-settings')).toBeNull()
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
  })

  it('drops local-only Repair and Use-local-gateway on a local failure', () => {
    render(<BootFailureOverlay />)
    // No connection config stub → treated as a local failure.
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /repair/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /use local gateway/i })).toBeNull()
  })

  it('leads with Gateway settings and drops Repair for a remote (token) failure', async () => {
    const restore = stubDesktop(remoteToken)

    try {
      render(<BootFailureOverlay GatewaySettingsView={StubGatewaySettingsView} />)
      await waitFor(() => expect(screen.queryByRole('button', { name: /repair/i })).toBeNull())
      expect(screen.getByRole('button', { name: /gateway settings/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /use local gateway/i })).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('offers no Gateway settings action when the host hands in no legacy panel', async () => {
    // The AgentBox product passes no panel: the legacy gateway/connection
    // surface — whose "Test connection" action dials hermes:connections:test and
    // can start the runtime — must have no way in, on any failure kind.
    const restore = stubDesktop(remoteToken)

    try {
      render(<BootFailureOverlay />)
      await waitFor(() => expect(screen.queryByRole('button', { name: /repair/i })).toBeNull())
      expect(screen.getByRole('button', { name: /use local gateway/i })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /gateway settings/i })).toBeNull()
    } finally {
      restore()
    }
  })

  it('opens gateway settings with a partial persisted remote config', async () => {
    const restore = stubDesktop({ mode: 'remote', remoteAuthMode: undefined, remoteUrl: undefined })

    try {
      render(<BootFailureOverlay GatewaySettingsView={StubGatewaySettingsView} />)
      fireEvent.click(screen.getByRole('button', { name: /gateway settings/i }))

      expect(await screen.findByRole('button', { name: /back/i })).toBeTruthy()
      expect(screen.getByTestId('stub-gateway-settings')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    } finally {
      restore()
    }
  })

  it('clears and signs in only the failed gateway once', async () => {
    const gatewayUrl = 'http://100.116.104.53:9191'
    const logout = vi.fn().mockResolvedValue({ ok: true, connected: false })
    const login = vi.fn().mockResolvedValue({ ok: true, connected: false })

    const restore = stubDesktop(
      {
        ...remoteToken,
        remoteAuthMode: 'oauth',
        remoteOauthConnected: false,
        remoteTokenSet: false,
        remoteUrl: gatewayUrl
      },
      {
        oauthLoginConnectionConfig: login,
        oauthLogoutConnectionConfig: logout,
        probeConnectionConfig: vi.fn().mockResolvedValue({ providers: [{ id: 'basic', type: 'password' }] })
      }
    )

    try {
      render(<BootFailureOverlay />)
      fireEvent.click(await screen.findByRole('button', { name: /sign out & sign in/i }))

      await waitFor(() => expect(login).toHaveBeenCalledWith(gatewayUrl))
      expect(logout).toHaveBeenCalledTimes(1)
      expect(logout).toHaveBeenCalledWith(gatewayUrl)
      expect(login).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  it('recovers a cloud connection through the portal cascade instead of native OAuth', async () => {
    const gatewayUrl = 'https://agent-1.agents.nousresearch.com'
    const logout = vi.fn().mockResolvedValue({ ok: true, connected: false })
    const nativeLogin = vi.fn().mockResolvedValue({ ok: true, connected: false })
    const cloudStatus = vi.fn().mockResolvedValue({ portalBaseUrl: 'https://portal.nousresearch.com', signedIn: false })

    const cloudLogin = vi.fn().mockResolvedValue({
      ok: true,
      portalBaseUrl: 'https://portal.nousresearch.com',
      signedIn: true
    })

    const cloudAgentSignIn = vi.fn().mockResolvedValue({ baseUrl: gatewayUrl, connected: false })

    const restore = stubDesktop(
      {
        ...remoteToken,
        mode: 'cloud',
        remoteAuthMode: 'oauth',
        remoteOauthConnected: false,
        remoteTokenSet: false,
        remoteUrl: gatewayUrl
      },
      {
        cloud: { status: cloudStatus, login: cloudLogin, agentSignIn: cloudAgentSignIn },
        oauthLoginConnectionConfig: nativeLogin,
        oauthLogoutConnectionConfig: logout,
        probeConnectionConfig: vi.fn().mockResolvedValue({ providers: [{ id: 'nous', type: 'oauth' }] })
      }
    )

    try {
      render(<BootFailureOverlay />)
      fireEvent.click(await screen.findByRole('button', { name: /sign in/i }))

      await waitFor(() => expect(cloudAgentSignIn).toHaveBeenCalledWith(gatewayUrl))
      expect(logout).toHaveBeenCalledWith(gatewayUrl)
      expect(cloudStatus).toHaveBeenCalledTimes(1)
      expect(cloudLogin).toHaveBeenCalledTimes(1)
      expect(nativeLogin).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('shows the Nous Cloud down recovery when the backend flags isCloudBackendDown', async () => {
    const restore = stubDesktop(remoteToken)
    $desktopBoot.set({
      error: 'Nous Cloud agent ares-3009.agents.nousresearch.com is down (HTTP 503: server-side fault).',
      fakeMode: false,
      isCloudBackendDown: true,
      message: 'boot failed',
      phase: 'renderer.error',
      progress: 40,
      running: false,
      statusCode: 503,
      timestamp: Date.now(),
      visible: true
    })

    try {
      render(<BootFailureOverlay GatewaySettingsView={StubGatewaySettingsView} />)
      // Cloud-specific title + actionable recovery instead of the generic
      // remote-failure copy.
      expect(await screen.findByText(/Nous Cloud agent is down/i)).toBeTruthy()
      // Portal and Discord are dedicated action buttons (localized labels
      // can't drift the URLs, which live in code).
      expect(screen.getByRole('button', { name: /check portal status/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /get help on discord/i })).toBeTruthy()
      // Cloud-down is a remote failure: local-only Repair is dropped; the
      // actionable paths are Gateway settings + Use local gateway.
      expect(screen.queryByRole('button', { name: /repair/i })).toBeNull()
      expect(screen.getByRole('button', { name: /gateway settings/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /use local gateway/i })).toBeTruthy()
      // The electron-built error message (portal / local mode / Discord) is
      // still surfaced in the error box.
      expect(screen.getByText(/ares-3009\.agents\.nousresearch\.com/i)).toBeTruthy()
    } finally {
      restore()
    }
  })

  // P02A — the recovery surface is non-blocking: the product stays usable
  // with the backend down, the panel can be dismissed, and a DIFFERENT
  // failure re-arms it. The old full-screen mask (data-glass-opaque over
  // fixed inset-0) must be gone.
  // P02A — a dead backend with a FRESH profile must still report the failure:
  // the setup surface yields an unresolved readiness check, so it must not
  // suppress the only honest state on screen.
  it('shows the failure panel while the setup readiness check is unresolved', () => {
    failBoot()
    $desktopOnboarding.set({
      configured: null,
      firstRunSkipped: false,
      flow: { currentModel: 'mock-model', label: 'Mock', providerSlug: 'mock', saving: false, status: 'confirming_model' },
      manual: false,
      mode: 'oauth',
      providers: null,
      reason: null,
      requested: false,
      localEndpoint: false
    })

    render(<BootFailureOverlay />)

    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('keeps the failure terminal when an older running progress event arrives late', () => {
    failBoot()
    applyDesktopBootProgress({
      error: null,
      fakeMode: false,
      message: 'Resolving Hermes backend',
      phase: 'backend.resolve',
      progress: 8,
      running: true,
      timestamp: Date.now() + 1
    })

    render(<BootFailureOverlay />)

    expect($desktopBoot.get().running).toBe(false)
    expect($desktopBoot.get().error).toBe('Could not connect to Hermes gateway')
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('shows the failure panel when onboarding cannot own the screen without an open gateway', () => {
    failBoot()
    $desktopOnboarding.set({
      configured: false,
      firstRunSkipped: false,
      flow: { currentModel: 'mock-model', label: 'Mock', providerSlug: 'mock', saving: false, status: 'confirming_model' },
      manual: false,
      mode: 'oauth',
      providers: null,
      reason: null,
      requested: false,
      localEndpoint: false
    })

    render(<BootFailureOverlay onboardingEnabled={false} />)

    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
  })

  it('yields to an active onboarding flow only when onboarding really owns the screen', () => {
    failBoot()
    $desktopOnboarding.set({
      configured: false,
      firstRunSkipped: false,
      flow: { currentModel: 'mock-model', label: 'Mock', providerSlug: 'mock', saving: false, status: 'confirming_model' },
      manual: false,
      mode: 'oauth',
      providers: null,
      reason: null,
      requested: false,
      localEndpoint: false
    })

    render(<BootFailureOverlay onboardingEnabled />)

    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  describe('non-blocking failure surface (P02A)', () => {
    it('renders as a floating panel without the full-screen glass mask', () => {
      failBoot()

      const { container } = render(<BootFailureOverlay />)

      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
      // The glass contract marks full-screen masks; a floating panel must
      // not carry it anywhere in the failure UI.
      expect(container.querySelector('[data-glass-opaque]')).toBeNull()
    })

    it('dismisses the failed boot and stays hidden for that error', () => {
      failBoot()

      const { container } = render(<BootFailureOverlay />)

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

      // The panel is gone for THIS error…
      expect(container.querySelector('[aria-label="Dismiss"]')).toBeNull()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
      // …and the dismissal atom is latched to the failed boot's message.
      expect($bootFailureDismissed.get()).toBe('Could not connect to Hermes gateway')
    })

    it('re-arms the surface when a different error arrives after dismissal', () => {
      failBoot()
      dismissBootFailure('Could not connect to Hermes gateway')

      const { container } = render(<BootFailureOverlay />)

      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()

      // A new, different failure must be visible — dismissal never hides a
      // failure the user has not seen.
      act(() => {
        failBoot()
        $desktopBoot.set({ ...$desktopBoot.get(), error: 'backend exited during startup' })
      })

      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
      expect(container).toBeTruthy()
    })
  })
})
