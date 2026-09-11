/**
 * legacy-hermes/gateway-connection.ts
 *
 * Talking to a Hermes gateway: mint the WebSocket URL for a profile, clear an
 * OAuth session, and test what a candidate remote connection actually is.
 *
 * Moved verbatim out of `main.ts` (E5c). Two behaviours here exist because a
 * half-connected app is worse than an honest failure:
 *
 *  - `freshGatewayWsUrl` mints for the REQUESTED profile's backend, not always the
 *    primary — swapping to a pooled profile must not silently land the renderer
 *    back on the default backend and write sessions to the wrong database.
 *  - `testDesktopConnectionConfig` exercises the leg the app will actually use.
 *    An HTTP probe passing while the WebSocket leg fails is the "it said connected
 *    but nothing works" false positive, so the WS probe is part of the test.
 */

import {
  decryptDesktopSecret,
  decryptRemoteHeaders,
  ensureBackend,
  ensureNativeAccessToken,
  fetchJson,
  fetchJsonForBackend,
  fetchJsonViaOauthSession,
  fetchPublicJson,
  getMainWindow,
  getOauthSessionForUrl,
  mintGatewayWsTicket,
  readDesktopConnectionConfig,
  rememberRemoteWsHeaders,
  resolveRemoteBackend,
  sshRememberLog,
  startHermes
} from '../composition/bootstrap-env-composition'
import { createSshProbeConnection } from '../host-capabilities/platform/ssh-connection'

import {
  authModeFromStatus,
  buildGatewayWsUrlWithTicket,
  connectionScopeKey,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeSshConfig,
  normAuthMode,
  resolveTestWsUrl
} from './connection-config'
import { coerceDesktopConnectionConfig } from './connections-composition'
import { probeGatewayWebSocket } from './gateway-ws-probe'
import * as remoteLifecycle from './remote-lifecycle'
import { detectRemotePlatform, helper } from './windows-remote-lifecycle'

export async function freshGatewayWsUrl(profile) {
  // Mint for the requested profile's backend, NOT always the primary. The
  // renderer re-mints right before every gateway.connect(); when swapping to a
  // pooled profile we must return THAT backend's ws URL, otherwise the connect
  // silently lands back on the primary (default) backend and writes sessions to
  // the wrong profile's DB. A null/empty profile resolves to the primary, so
  // legacy callers and single-profile users are unchanged.
  const connection = await ensureBackend(profile)

  if (connection.authMode === 'oauth') {
    const ticket = await mintGatewayWsTicket(connection.baseUrl, connection.headers)
    const wsUrl = buildGatewayWsUrlWithTicket(connection.baseUrl, ticket)

    rememberRemoteWsHeaders(wsUrl, connection.headers)

    return wsUrl
  }

  // Local/token: the cached wsUrl already carries the (long-lived) token.
  rememberRemoteWsHeaders(connection.wsUrl, connection.headers)

  return connection.wsUrl
}

export async function clearOauthSession(baseUrl) {
  const sess = getOauthSessionForUrl(baseUrl)

  if (!sess) {
    return
  }

  try {
    const cookies = await sess.cookies.get(baseUrl ? { url: baseUrl } : {})
    await Promise.all(
      cookies.map(c => {
        const scheme = c.secure ? 'https' : 'http'
        const cookieUrl = `${scheme}://${c.domain.replace(/^\./, '')}${c.path || '/'}`

        return sess.cookies.remove(cookieUrl, c.name).catch(() => undefined)
      })
    )
  } catch {
    // Best effort — a stale cookie self-expires anyway.
  }
}

export function sendConnectionApplied() {
  if (!getMainWindow() || getMainWindow().isDestroyed()) {
    return
  }

  const { webContents } = getMainWindow()

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:connection:applied')
}

export async function fetchConnectionStatus(baseUrl, authMode, token, headers = {}) {
  const url = `${baseUrl}/api/status`

  if (authMode === 'oauth') {
    // Native PKCE bearer first, OAuth session cookies second — the same two
    // credentials real traffic uses, in the same order. A refresh failure is
    // NOT a silent downgrade to an anonymous probe: the cookie path is still
    // an authenticated request, and if neither credential works the probe
    // fails, which is the correct answer for a gateway we cannot reach with
    // the credentials we hold.
    const nativeAt = await ensureNativeAccessToken(baseUrl).catch(() => null)

    if (nativeAt) {
      return fetchJson(url, null, { timeoutMs: 8_000, bearer: nativeAt, headers })
    }

    return fetchJsonViaOauthSession(url, { timeoutMs: 8_000, headers })
  }

  return fetchJson(url, token, { timeoutMs: 8_000, headers })
}

export async function probeRemoteAuthMode(rawUrl) {
  // Determine how a remote gateway expects callers to authenticate, WITHOUT
  // sending any credentials. ``/api/status`` is public on every Hermes
  // gateway (it backs the portal liveness probe) and reports:
  //   auth_required: true  → OAuth gate is engaged (cookie + ws-ticket auth)
  //   auth_required: false → loopback/--insecure: legacy session-token auth
  // ``/api/auth/providers`` (also public, only meaningful when gated) gives
  // the human-facing provider name(s) for the login button label.
  //
  // The settings UI calls this as the user types a URL so it can render an
  // OAuth login button vs a session-token entry box. Network/parse failures
  // surface as ``reachable: false`` rather than throwing, so a half-typed or
  // unreachable URL degrades to "can't tell yet" instead of a hard error.
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)

  let status

  try {
    status = await fetchPublicJson(`${baseUrl}/api/status`, { timeoutMs: 8_000 })
  } catch (error: any) {
    return {
      baseUrl,
      reachable: false,
      authMode: 'unknown',
      providers: [],
      version: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  const authRequired = authModeFromStatus(status) === 'oauth'
  let providers = []

  if (authRequired) {
    // Best-effort: a gated gateway exposes the registered providers so the
    // button can read "Sign in with Nous Research" instead of a generic
    // label, and so a username/password provider can be distinguished from
    // an OAuth-redirect one (``supports_password``). A failure here doesn't
    // change the auth mode, so swallow it.
    try {
      const body = (await fetchPublicJson(`${baseUrl}/api/auth/providers`, { timeoutMs: 8_000 })) as any

      if (Array.isArray(body?.providers)) {
        providers = body.providers
          .filter(p => p && typeof p === 'object')
          .map(p => ({
            name: String(p.name || ''),
            displayName: String(p.display_name || p.name || ''),
            supportsPassword: Boolean(p.supports_password)
          }))
          .filter(p => p.name)
      }
    } catch {
      // Provider listing is optional metadata; the auth mode is already known.
    }
  }

  return {
    baseUrl,
    reachable: true,
    authMode: authRequired ? 'oauth' : 'token',
    providers,
    version: status?.version || null,
    error: null
  }
}

export async function testDesktopConnectionConfig(input: any = {}) {
  if (input.mode === 'ssh') {
    const sshConfig = normalizeSshConfig({
      mode: 'ssh',
      host: input.sshHost,
      user: input.sshUser,
      port: input.sshPort,
      keyPath: input.sshKeyPath,
      remoteHermesPath: input.sshRemoteHermesPath
    })

    if (!sshConfig) {
      return { reachable: false, sshError: 'unreachable', error: 'SSH host is required.' }
    }

    const ssh = createSshProbeConnection(
      { host: sshConfig.host, user: sshConfig.user, port: sshConfig.port, keyPath: sshConfig.keyPath },
      { rememberLog: sshRememberLog }
    )

    try {
      // One bounded retry on TIMEOUT only: a cold Windows backend's first
      // PowerShell exec can exceed the budget (observed live), and a timeout is
      // indeterminate — unlike auth/host-key/unreachable, which are verdicts.
      let attempt = 0

      for (;;) {
        try {
          await ssh.open()
          const platform: any = await detectRemotePlatform(ssh, sshConfig.remoteHermesPath || '')
          let hermesPath
          let hermesVersion
          let supported

          if (platform.os === 'Windows') {
            const runtime = platform
            hermesPath = runtime.hermesPath
            const inspection = await helper(ssh, runtime, 'inspect', [runtime.hermesPath])
            hermesVersion = inspection.version
            supported = inspection.supported
          } else {
            hermesPath = await remoteLifecycle.locateHermes(ssh, sshConfig.remoteHermesPath || '')
            hermesVersion = await remoteLifecycle.probeHermesVersion(ssh, hermesPath)
            supported = await remoteLifecycle.remoteSupportsSshOwnership(ssh, hermesPath)
          }

          if (!supported) {
            return {
              reachable: false,
              sshError: 'update-required',
              error: 'Update Hermes on the remote host before connecting with Desktop SSH.'
            }
          }

          return {
            reachable: true,
            sshError: null,
            error: null,
            remotePlatform: `${platform.os}/${platform.arch}`,
            remoteHermesPath: hermesPath,
            remoteHermesVersion: hermesVersion,
            host: sshConfig.user ? `${sshConfig.user}@${sshConfig.host}` : sshConfig.host
          }
        } catch (error: any) {
          if (error?.kind === 'timeout' && attempt === 0) {
            attempt += 1
            sshRememberLog('[ssh] test probe timed out once; retrying')

            continue
          }

          throw error
        }
      }
    } catch (error: any) {
      return { reachable: false, sshError: error.kind || 'unknown', error: error.message }
    } finally {
      try {
        await ssh.close()
      } catch {
        void 0
      }
    }
  }

  const config = coerceDesktopConnectionConfig(input, readDesktopConnectionConfig(), { persistToken: false })
  const key = connectionScopeKey(input.profile)
  // The block under test: a per-profile entry or the global remote. Coerce has
  // already normalized the URL and resolved token inheritance for the scope.
  const block = key ? config.profiles?.[key] || null : config.remote

  const wantRemote =
    modeIsRemoteLike(block?.mode) || (!key && modeIsRemoteLike(config.mode)) || (modeIsRemoteLike(input.mode) && block)

  // Test ``/api/status`` through the connection's real auth path. Self-hosted
  // gateways may protect it, and an anonymous success/failure would not prove
  // that the OAuth cookie/native bearer or configured token is reusable. For
  // a remote config we normalize the URL from the input; for local we fall
  // back to the resolved/started backend.
  let baseUrl
  let token = null
  let authMode = 'token'
  let testHeaders = {}

  if (wantRemote && block?.url) {
    baseUrl = normalizeRemoteBaseUrl(block.url)
    authMode = normAuthMode(block.authMode)
    testHeaders = decryptRemoteHeaders(block.headers)

    if (authMode !== 'oauth') {
      token = decryptDesktopSecret(block.token)
    }
  } else {
    const remote = (await resolveRemoteBackend(key)) || (await startHermes())
    baseUrl = remote.baseUrl
    token = remote.token
    authMode = normAuthMode(remote.authMode)
    testHeaders = remote.headers || {}
  }

  const status = (await fetchConnectionStatus(baseUrl, authMode, token, testHeaders)) as any

  // The HTTP status check above proves the backend is reachable, but the chat
  // surface only works once the renderer's live WebSocket to ``/api/ws``
  // connects — a separate transport with separate server-side guards (Host/
  // Origin, ws-ticket/token auth). Validating only the HTTP side produced a
  // false-positive "reachable" while the real boot still failed with "Could not
  // connect to Hermes gateway". Mirror the renderer's connect here so the test
  // reflects the full path the app actually uses.
  const wsUrl = await resolveTestWsUrl(baseUrl, authMode, token, {
    mintTicket: url => mintGatewayWsTicket(url, testHeaders)
  })

  // Skip the WS leg only when the runtime genuinely lacks a WebSocket (so an
  // older Electron/Node never fails the test spuriously); Electron's main
  // process ships a global WebSocket on every supported version.
  if (wsUrl && typeof globalThis.WebSocket === 'function') {
    const probe = await probeGatewayWebSocket(wsUrl, { WebSocketImpl: globalThis.WebSocket, headers: testHeaders })

    if (!probe.ok) {
      throw new Error(
        `Reached the gateway over HTTP, but the live WebSocket (/api/ws) connection failed: ${probe.reason} ` +
          'The HTTP check can pass while the WebSocket is blocked by a proxy, firewall, or gateway auth/origin guard.'
      )
    }
  }

  return {
    ok: true,
    baseUrl,
    version: status?.version || null
  }
}

export async function postJsonForBackend(descriptor, path, body, opts: any = {}) {
  return fetchJsonForBackend(descriptor, path, { ...opts, body: body ?? {}, method: 'POST' })
}
