// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import http from 'node:http'
import https from 'node:https'

import {
  app,
  BrowserWindow,
  dialog,
  net as electronNet
} from 'electron'

import { downloadAgentFor } from '../legacy-hermes/api-transport'
import {
  cookiesHavePrivyAccessToken,
  cookiesHavePrivySession,
  cookiesHaveSession,
  normalizeRemoteBaseUrl
} from '../legacy-hermes/connection-config'
import {
  filenameFromContentDisposition,
  fsPumpDeps,
  pumpStreamToFile
} from '../legacy-hermes/gateway-file-download'
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  resolveTimeoutMs
} from '../hardening'
import { installWindowRendererLifecycle } from '../window-renderer-lifecycle'

import {
  fetchJsonViaOauthSession,
  getOauthSession,
  getOauthSessionForUrl,
  mainWindow,
  warmOauthCookieStore,
} from './bootstrap-env-composition'
import {
  rememberLog
} from './log-buffer'

export function downloadViaTokenToFile(url, token, ctx, options: any = {}) {
  return new Promise((resolve, reject) => {
    let parsed

    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new Error(`Invalid URL: ${error.message}`))

      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

      return
    }

    const client = parsed.protocol === 'https:' ? https : http
    const agent = downloadAgentFor(parsed.protocol)
    const timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

    const req = client.request(
      parsed,
      {
        agent,
        method: 'GET',
        headers: options.bearer ? { Authorization: `Bearer ${options.bearer}` } : { 'X-Hermes-Session-Token': token }
      },
      res => {
        // Headers arrived — the connection phase is done. Drop the idle timeout
        // so it can't abort mid-stream or while the save dialog is open.
        req.setTimeout(0)
        finalizeGatewayDownload(res, res.statusCode || 500, res.headers || {}, {
          ...ctx,
          abort: () => {
            try {
              req.destroy()
            } catch {
              // already finished
            }
          }
        }).then(resolve, reject)
      }
    )

    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`))
    })
    req.end()
  })
}

export async function hasOauthSessionCookie(baseUrl) {
  const sess = getOauthSessionForUrl(baseUrl)

  if (!sess) {
    return false
  }

  const parsed = new URL(baseUrl)

  try {
    // Query by URL so the cookie jar applies Domain/Path/Secure scoping for us.
    const cookies = await sess.cookies.get({ url: baseUrl })

    return cookiesHaveSession(cookies)
  } catch {
    // Fall back to a host match if the URL query path errors.
    try {
      const cookies = await sess.cookies.get({ domain: parsed.hostname })

      return cookiesHaveSession(cookies)
    } catch {
      return false
    }
  }
}

export function openOauthLoginWindow(baseUrl, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!app.isReady()) {
      reject(new Error('Desktop is not ready to start an OAuth login.'))

      return
    }

    const sess = getOauthSessionForUrl(baseUrl)

    if (!sess) {
      reject(new Error('OAuth session partition is unavailable.'))

      return
    }

    let settled = false
    let win = null
    let pollTimer = null
    let revealTimer = null

    const finish = err => {
      if (settled) {
        return
      }

      settled = true

      if (pollTimer) {
        clearInterval(pollTimer)
      }

      if (revealTimer) {
        clearTimeout(revealTimer)
      }

      try {
        if (win && !win.isDestroyed()) {
          win.destroy()
        }
      } catch {
        // window already torn down
      }

      if (err) {
        reject(err)
      } else {
        resolve({ baseUrl, ok: true })
      }
    }

    const checkCookie = async () => {
      if (settled) {
        return
      }

      if (await hasOauthSessionCookie(baseUrl)) {
        finish(null)
      }
    }

    try {
      win = new BrowserWindow({
        width: 520,
        height: 720,
        title: silent ? 'Connecting to Hermes Cloud agent…' : 'Sign in to Hermes gateway',
        autoHideMenuBar: true,
        // Silent cascade: start HIDDEN. The auto-SSO 302 chain completes in
        // well under a second, so the window normally never needs to show. We
        // only reveal it as a fallback if the cascade DOESN'T complete quickly
        // (e.g. the portal session lapsed and the gate fell through to the
        // interactive chooser) — see the reveal timer below.
        show: !silent,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: sess,
          webSecurity: true
        }
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))

      return
    }

    // Re-check the cookie jar on every successful navigation (the callback
    // redirect is the moment cookies get set) plus a low-frequency poll as a
    // belt-and-braces fallback for IDPs that finish via in-page JS.
    win.webContents.on('did-navigate', () => void checkCookie())
    win.webContents.on('did-redirect-navigation', () => void checkCookie())
    win.webContents.on('did-frame-navigate', () => void checkCookie())
    // Log-only lifecycle diagnostics: a crashed sign-in renderer is invisible
    // to the window's promise path (it never settles), so without this the
    // failure leaves no trace in desktop.log (#81290 follow-up).
    installWindowRendererLifecycle(win, { kind: 'oauth', callbacks: { log: rememberLog } })
    pollTimer = setInterval(() => void checkCookie(), 750)

    // Silent-mode reveal fallback: if the cascade hasn't settled shortly, the
    // auto-SSO didn't go through silently (no portal session, multi-provider,
    // loop-guard tripped, etc.) and the window is now showing an interactive
    // page. Reveal it so the user can complete sign-in manually rather than
    // staring at nothing. Cleared on finish().
    if (silent && win) {
      revealTimer = setTimeout(() => {
        try {
          if (!settled && win && !win.isDestroyed() && !win.isVisible()) {
            win.show()
          }
        } catch {
          // window torn down
        }
      }, 2500)
    }

    win.on('closed', () => {
      if (!settled) {
        finish(new Error('Login window closed before authentication completed.'))
      }
    })

    // ``next`` is intentionally omitted: the gateway lands on ``/`` after
    // login, which is a valid authenticated page that sets the cookies. We
    // only care that the cookie jar is populated.
    //
    // silent=true loads the protected root so the gate auto-SSOs (no chooser);
    // silent=false loads the public ``/login`` chooser for interactive sign-in.
    const normalizedBase = normalizeRemoteBaseUrl(baseUrl)
    const loginUrl = silent ? `${normalizedBase}/` : `${normalizedBase}/login`
    win.loadURL(loginUrl).catch(error => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

export function downloadViaOauthSessionToFile(url, ctx, options: any = {}) {
  return new Promise((resolve, reject) => {
    const sess = getOauthSessionForUrl(url)

    if (!sess) {
      reject(new Error('OAuth session partition is unavailable.'))

      return
    }

    let parsed

    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new Error(`Invalid URL: ${error.message}`))

      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

      return
    }

    const timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

    const request = electronNet.request({
      method: 'GET',
      url,
      session: sess,
      useSessionCookies: true,
      redirect: 'follow'
    } as any)

    let settled = false

    const timer = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true

      try {
        request.abort()
      } catch {
        // already finished
      }

      reject(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`))
    }, timeoutMs)

    request.on('response', res => {
      if (settled) {
        return
      }

      // Response headers arrived — cancel the connect timeout so it can't abort
      // the stream while the save dialog is open or bytes are still flowing.
      settled = true
      clearTimeout(timer)
      finalizeGatewayDownload(res, res.statusCode || 500, res.headers || {}, {
        ...ctx,
        abort: () => {
          try {
            request.abort()
          } catch {
            // already finished
          }
        }
      }).then(resolve, reject)
    })
    request.on('error', error => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      reject(error)
    })
    request.end()
  })
}

export async function finalizeGatewayDownload(res, statusCode, headers, ctx: any = {}) {
  if (statusCode >= 400) {
    const message = await readGatewayErrorText(res)
    const error: any = new Error(`${statusCode}: ${message}`)
    error.statusCode = statusCode
    throw error
  }

  const disposition = headers['content-disposition'] || headers['Content-Disposition']
  const filename = filenameFromContentDisposition(disposition) || ctx.suggested || ctx.fallbackName

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    title: 'Save File'
  })

  if (result.canceled || !result.filePath) {
    ctx.abort?.()

    return { canceled: true, saved: false }
  }

  try {
    // Failure-atomic: exclusive temp create beside the destination, rename into
    // place only once the body is complete (#96597).
    await pumpStreamToFile(res, result.filePath, fsPumpDeps())
  } catch (error) {
    ctx.abort?.()
    throw error
  }

  return { path: result.filePath, saved: true }
}

export function readGatewayErrorText(res): Promise<string> {
  return new Promise(resolve => {
    const chunks = []
    let total = 0

    res.on('data', chunk => {
      if (total >= 500) {
        return
      }

      const buffer = Buffer.from(chunk)

      total += buffer.length
      chunks.push(buffer)
    })
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8').slice(0, 500)))
    res.on('error', () => resolve(Buffer.concat(chunks).toString('utf8').slice(0, 500)))
  })
}

export const DEFAULT_NOUS_PORTAL_URL = 'https://portal.nousresearch.com'

export function resolvePortalBaseUrl() {
  const raw = process.env.HERMES_PORTAL_BASE_URL || process.env.NOUS_PORTAL_BASE_URL || DEFAULT_NOUS_PORTAL_URL

  return String(raw).trim().replace(/\/+$/, '')
}

export async function hasLivePortalSession() {
  const sess = getOauthSession()

  if (!sess) {
    return false
  }

  const portalBaseUrl = resolvePortalBaseUrl()
  const parsed = new URL(portalBaseUrl)

  const readPortal = async () => {
    try {
      const cookies = await sess.cookies.get({ url: portalBaseUrl })

      return cookiesHavePrivySession(cookies)
    } catch {
      try {
        const cookies = await sess.cookies.get({ domain: parsed.hostname })

        return cookiesHavePrivySession(cookies)
      } catch {
        return false
      }
    }
  }

  if (await readPortal()) {
    return true
  }

  await warmOauthCookieStore()

  for (const delayMs of [30, 60, 90]) {
    if (await readPortal()) {
      return true
    }

    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  return readPortal()
}

export async function hasPortalAccessToken() {
  const sess = getOauthSession()

  if (!sess) {
    return false
  }

  const portalBaseUrl = resolvePortalBaseUrl()
  const parsed = new URL(portalBaseUrl)

  try {
    const cookies = await sess.cookies.get({ url: portalBaseUrl })

    return cookiesHavePrivyAccessToken(cookies)
  } catch {
    try {
      const cookies = await sess.cookies.get({ domain: parsed.hostname })

      return cookiesHavePrivyAccessToken(cookies)
    } catch {
      return false
    }
  }
}

export let portalAccessRenewal: Promise<boolean> | null = null

export function renewPortalAccessSilently() {
  if (portalAccessRenewal) {
    return portalAccessRenewal
  }

  portalAccessRenewal = (async () => {
    if (!app.isReady()) {
      return false
    }

    const sess = getOauthSession()

    if (!sess) {
      return false
    }

    // No renewal material at all → nothing to renew; interactive login is
    // genuinely required.
    if (!(await hasLivePortalSession())) {
      return false
    }

    if (await hasPortalAccessToken()) {
      return true
    }

    const portalBaseUrl = resolvePortalBaseUrl()

    return await new Promise<boolean>(resolve => {
      let settled = false
      let win = null
      let pollTimer = null
      let deadlineTimer = null

      const finish = (ok: boolean) => {
        if (settled) {
          return
        }

        settled = true

        if (pollTimer) {
          clearInterval(pollTimer)
        }

        if (deadlineTimer) {
          clearTimeout(deadlineTimer)
        }

        try {
          if (win && !win.isDestroyed()) {
            win.destroy()
          }
        } catch {
          // window already torn down
        }

        rememberLog(`[cloud] silent portal access renewal ${ok ? 'succeeded' : 'did not complete'}`)
        resolve(ok)
      }

      const checkCookie = async () => {
        if (settled) {
          return
        }

        if (await hasPortalAccessToken()) {
          finish(true)
        }
      }

      try {
        win = new BrowserWindow({
          width: 520,
          height: 720,
          show: false,
          title: 'Renewing Hermes Cloud session…',
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            session: sess,
            webSecurity: true
          }
        })
      } catch {
        finish(false)

        return
      }

      win.webContents.on('did-navigate', () => void checkCookie())
      win.webContents.on('did-redirect-navigation', () => void checkCookie())
      win.webContents.on('did-frame-navigate', () => void checkCookie())
      installWindowRendererLifecycle(win, { kind: 'portal-renew', callbacks: { log: rememberLog } })
      pollTimer = setInterval(() => void checkCookie(), 500)
      // Hard deadline: this window is never revealed, so an unrenewable session
      // (revoked refresh token, portal down) must resolve false rather than
      // hang the discovery call behind an invisible window.
      deadlineTimer = setTimeout(() => finish(false), 12_000)

      win.on('closed', () => finish(false))

      win.loadURL(portalBaseUrl).catch(() => finish(false))
    })
  })().finally(() => {
    portalAccessRenewal = null
  }) as Promise<boolean>

  return portalAccessRenewal
}

export function openPortalLoginWindow() {
  const portalBaseUrl = resolvePortalBaseUrl()

  return new Promise((resolve, reject) => {
    if (!app.isReady()) {
      reject(new Error('Desktop is not ready to start a Hermes Cloud sign-in.'))

      return
    }

    const sess = getOauthSession()

    if (!sess) {
      reject(new Error('OAuth session partition is unavailable.'))

      return
    }

    let settled = false
    let win = null
    let pollTimer = null

    const finish = err => {
      if (settled) {
        return
      }

      settled = true

      if (pollTimer) {
        clearInterval(pollTimer)
      }

      try {
        if (win && !win.isDestroyed()) {
          win.destroy()
        }
      } catch {
        // window already torn down
      }

      if (err) {
        reject(err)
      } else {
        resolve({ portalBaseUrl, ok: true })
      }
    }

    const checkCookie = async () => {
      if (settled) {
        return
      }

      // A live portal (Privy) session cookie means sign-in completed.
      if (await hasLivePortalSession()) {
        finish(null)
      }
    }

    try {
      win = new BrowserWindow({
        width: 520,
        height: 720,
        title: 'Sign in to Hermes Cloud',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: sess,
          webSecurity: true
        }
      })
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))

      return
    }

    win.webContents.on('did-navigate', () => void checkCookie())
    win.webContents.on('did-redirect-navigation', () => void checkCookie())
    win.webContents.on('did-frame-navigate', () => void checkCookie())
    // Log-only lifecycle diagnostics, same rationale as the OAuth window:
    // a crashed portal sign-in renderer never settles the promise, so the
    // failure would otherwise leave no trace in desktop.log (#81290
    // follow-up).
    installWindowRendererLifecycle(win, { kind: 'portal', callbacks: { log: rememberLog } })
    pollTimer = setInterval(() => void checkCookie(), 750)

    win.on('closed', () => {
      if (!settled) {
        finish(new Error('Sign-in window closed before authentication completed.'))
      }
    })

    // Land on the portal root; any authenticated portal page sets the session
    // cookie. We only care that the partition cookie jar is populated.
    win.loadURL(portalBaseUrl).catch(error => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })
  })
}

export async function discoverCloudAgents(org?: string) {
  const portalBaseUrl = resolvePortalBaseUrl()

  if (!(await hasLivePortalSession())) {
    const err = new Error(
      'You are not signed in to Hermes Cloud. Open Settings → Gateway, choose Hermes Cloud, and sign in.'
    ) as any

    err.needsCloudLogin = true
    throw err
  }

  // Renewable session present but the short-lived access token `/api/agents`
  // validates is gone (typical after a restart — `privy-token` is ~1h,
  // `privy-session`/`privy-refresh-token` last ~30 days). Renew silently up
  // front instead of letting the request 401 into a re-login demand (#73495).
  if (!(await hasPortalAccessToken())) {
    await renewPortalAccessSilently()
  }

  const orgQuery = org ? `?org=${encodeURIComponent(org)}` : ''
  let body

  const fetchAgents = () =>
    fetchJsonViaOauthSession(`${portalBaseUrl}/api/agents${orgQuery}`, {
      method: 'GET',
      timeoutMs: 15_000
    })

  try {
    body = (await fetchAgents()) as any
  } catch (initialError) {
    let error = initialError as any

    // A 401 with renewal material still in the jar: attempt ONE bounded silent
    // renewal and retry, so a lapsed access token doesn't surface as a full
    // interactive re-login while a 30-day refresh session sits unused. Only a
    // rejected/failed renewal (or a second 401 on genuinely fresh access)
    // falls through to needsCloudLogin.
    if (error && error.statusCode === 401 && (await renewPortalAccessSilently())) {
      try {
        body = (await fetchAgents()) as any
      } catch (retryError) {
        error = retryError
      }
    }

    if (body === undefined) {
      // A 401 means the portal session lapsed (and silent renewal could not
      // recover it) — surface it as a re-login, not a generic failure.
      if (error && error.statusCode === 401) {
        const err = new Error(
          'Your Hermes Cloud session has expired. Open Settings → Gateway and sign in again.'
        ) as any

        err.needsCloudLogin = true
        err.cause = error
        throw err
      }

      // A 409 means we're a multi-org user who hasn't picked an org. The body
      // carries the user's org list; surface it so the renderer shows a picker
      // and re-calls discovery with the chosen org. (fetchJsonViaOauthSession
      // throws on >=400 with err.statusCode + err.message "409: <json body>".)
      if (error && error.statusCode === 409) {
        const orgs = parseOrgSelectionError(error)

        if (orgs) {
          return { needsOrgSelection: true, orgs }
        }
      }

      throw error
    }
  }

  return { agents: trimCloudAgents(body), org: trimCloudOrg(body?.org) }
}

export function trimCloudOrg(org) {
  if (!org || typeof org !== 'object' || typeof org.id !== 'string') {
    return null
  }

  return {
    id: org.id,
    slug: typeof org.slug === 'string' ? org.slug : null,
    name: typeof org.name === 'string' ? org.name : org.id,
    isPersonal: Boolean(org.isPersonal),
    role: typeof org.role === 'string' ? org.role : 'MEMBER'
  }
}

export function parseOrgSelectionError(error) {
  const msg = String(error?.message || '')
  const jsonStart = msg.indexOf('{')

  if (jsonStart < 0) {
    return null
  }

  let parsed

  try {
    parsed = JSON.parse(msg.slice(jsonStart))
  } catch {
    return null
  }

  if (parsed?.error !== 'org_selection_required' || !Array.isArray(parsed.orgs)) {
    return null
  }

  return parsed.orgs
    .filter(o => o && typeof o === 'object' && typeof o.id === 'string')
    .map(o => ({
      id: o.id,
      slug: typeof o.slug === 'string' ? o.slug : null,
      name: typeof o.name === 'string' ? o.name : o.id,
      isPersonal: Boolean(o.isPersonal),
      role: typeof o.role === 'string' ? o.role : 'MEMBER'
    }))
}

export function trimCloudAgents(body) {
  const agents = Array.isArray(body?.agents) ? body.agents : []

  return agents
    .filter(a => a && typeof a === 'object' && typeof a.id === 'string')
    .map(a => ({
      id: a.id,
      name: typeof a.name === 'string' ? a.name : a.id,
      status: typeof a.status === 'string' ? a.status : 'unknown',
      dashboardUrl: typeof a.dashboardUrl === 'string' ? a.dashboardUrl : null,
      dashboardGatewayState: typeof a.dashboardGatewayState === 'string' ? a.dashboardGatewayState : 'unknown'
    }))
}

export function getPortalAccessRenewal() {
  return portalAccessRenewal
}

export function setPortalAccessRenewal(value: any) {
  portalAccessRenewal = value
}
