// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  app,
  BrowserWindow,
  dialog,
  session
} from 'electron'

import {
  rememberLog
} from '../app/log-buffer'
import {
  downloadViaOauthSessionToFile,
  downloadViaTokenToFile,
} from '../host-capabilities/credentials/cloud-oauth'
import {
  resolveGatedDownloadAuth,
  resolveOauthRestAuth
} from '../host-capabilities/credentials/native-auth-decisions'
import {
  clampDataUrlReadMaxMb,
  DATA_URL_READ_DEFAULT_MAX_MB,
  DEFAULT_FETCH_TIMEOUT_MS,
  resolveReadableFileForIpc,
  resolveRequestedPathForIpc,
  resolveTimeoutMs
} from '../host-capabilities/filesystem/hardening'
import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'
import {
  LOCAL_PREVIEW_HOSTS,
  PREVIEW_HTML_EXTENSIONS,
  PREVIEW_LANGUAGE_BY_EXT,
  PREVIEW_PDF_EXTENSIONS,
  PREVIEW_WATCH_DEBOUNCE_MS,
  previewFileMetadata
} from '../host-capabilities/preview/media-bridge'
import {
  apiRequestRegistryConnectionId,
  pathForRegistryBackendRequest,
  pathWithGlobalRemoteProfile,
  profileHasRemoteConnection,
  type RegistryBackendRequestScope,
  resolveProfileApiRequest
} from '../legacy-hermes/connection-config'
import {
  backendScopeKey,
  backendScopePrefix
} from '../legacy-hermes/connection-registry'
import {
  fsPumpDeps,
  gatewayFilePath,
  gatewayFileRequestPaths,
  isNotFoundError,
  parseDataUrlToBuffer,
  resolveGatewayFileBackend,
  writeBufferToFile
} from '../legacy-hermes/gateway-file-download'
import {
  decideProfileDeleteAction,
  localProfilePoolKeys,
  profileNameFromDeleteRequest,
  resolveRouteProfile
} from '../legacy-hermes/profile-delete-routing'
import { prepareProfileRenameLifecycle } from '../legacy-hermes/profile-rename-routing'
import {
  buildSidebarSessionSliceParams,
  fetchPrimaryProfileSessions,
  fetchRegistrySessionRows,
  fetchRemoteProfileSessions,
  findRemoteOwnerProfileForSession,
  mergeProfileSessionWindow,
  type RegistrySessionSource,
  spliceRegistrySessionRows,
  tagRegistrySessionResponse
} from '../legacy-hermes/profile-session-routing'
import {
  resetHermesConnection,
} from '../legacy-hermes/runtime-composition'
import { createLinkTitleWindow, guardLinkTitleSession, readLinkTitleWindowTitle } from '../windows/link-title-window'

import {
  backendConnectionState,
  backendDialClaims,
  backendPool,
  directoryExists,
  ensureBackend,
  ensureNativeAccessToken,
  ensureRegistryBackend,
  fetchJson,
  fetchJsonForBackend,
  fetchJsonViaOauthSession,
  fileExists,
  globalRemoteActive,
  mainWindow,
  MEDIA_MIME_TYPES,
  poolStopper,
  primaryProfileKey,
  PROFILE_NAME_RE,
  profileHasRemoteOverride,
  profileRouteOptions,
  readDesktopConnectionConfig,
  readDesktopConnectionsRegistry,
  resolveHermesCwd,
  setSoftRehomeInProgress,
  sshBootstrapCoordinator,
  startHermes,
  stopPoolBackend,
  teardownSshConnection,
  waitForBackendExit,
  writeActiveDesktopProfile,
} from './bootstrap-env-composition'

export const previewWatchers = new Map()

export function mimeTypeForPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()

  return MEDIA_MIME_TYPES[ext] || 'application/octet-stream'
}

export function extensionForMimeType(mimeType) {
  const type = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase()

  if (type === 'image/png') {
    return '.png'
  }

  if (type === 'image/jpeg') {
    return '.jpg'
  }

  if (type === 'image/gif') {
    return '.gif'
  }

  if (type === 'image/webp') {
    return '.webp'
  }

  if (type === 'image/bmp') {
    return '.bmp'
  }

  if (type === 'image/svg+xml') {
    return '.svg'
  }

  return ''
}

export function filenameFromUrl(rawUrl, fallback = 'image') {
  try {
    const parsed = new URL(rawUrl)
    const base = path.basename(decodeURIComponent(parsed.pathname || ''))

    return base && base.includes('.') ? base : fallback
  } catch {
    return fallback
  }
}

export const titleCache = new Map()

export const titleInflight = new Map()

export const TITLE_CACHE_LIMIT = 500

export const TITLE_BYTE_BUDGET = 96 * 1024

export const TITLE_TIMEOUT_MS = 5000

export const TITLE_MAX_REDIRECTS = 3

export const TITLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export const TITLE_ERROR_RE =
  /\b(access denied|attention required|captcha|error|forbidden|just a moment|request blocked|too many requests)\b/i

export const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

export const RENDER_TITLE_MAX_CONCURRENT = 2

export const RENDER_TITLE_TIMEOUT_MS = 8000

export const RENDER_TITLE_GRACE_MS = 700

export const RENDER_TITLE_BLOCKED_RESOURCES = new Set([
  'cspReport',
  'font',
  'imageset',
  'media',
  'object',
  'ping',
  'stylesheet'
])

export let linkTitleSession = null

export let renderTitleInFlight = 0

export const renderTitleQueue = []

export function canonicalTitleCacheKey(rawUrl) {
  const value = String(rawUrl || '').trim()

  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./i, '').toLowerCase()
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') || '/'

    return `${host}${pathname}${url.search || ''}`
  } catch {
    return value
  }
}

export function cacheTitle(key, title) {
  if (titleCache.size >= TITLE_CACHE_LIMIT) {
    titleCache.delete(titleCache.keys().next().value)
  }

  titleCache.set(key, title)
}

export function decodeHtmlEntities(value) {
  return value
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, k) => HTML_ENTITIES[k.toLowerCase()] ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10) || 32))
}

export function parseHtmlTitle(html) {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]

  return raw ? decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim() : ''
}

export function fetchHtmlTitleWithCurl(rawUrl: string): Promise<string> {
  return new Promise(resolve => {
    const url = String(rawUrl || '').trim()

    if (!url) {
      return resolve('')
    }

    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--max-redirs',
      String(TITLE_MAX_REDIRECTS),
      '--max-time',
      String(Math.max(2, Math.ceil(TITLE_TIMEOUT_MS / 1000))),
      '--connect-timeout',
      '4',
      '--user-agent',
      TITLE_USER_AGENT,
      '--header',
      'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      '--header',
      'Accept-Language: en-US,en;q=0.7',
      '--header',
      'Accept-Encoding: identity',
      '--raw',
      url
    ]

    const child = spawn('curl', args, hiddenWindowsChildOptions({ stdio: ['ignore', 'pipe', 'ignore'] }))
    const chunks = []
    let bytes = 0

    child.stdout.on('data', chunk => {
      if (bytes >= TITLE_BYTE_BUDGET) {
        return
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = TITLE_BYTE_BUDGET - bytes
      const next = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer
      chunks.push(next)
      bytes += next.length
    })

    child.on('error', () => resolve(''))
    child.on('close', () => {
      if (!chunks.length) {
        return resolve('')
      }

      resolve(parseHtmlTitle(Buffer.concat(chunks).toString('utf8')))
    })
  })
}

export function getLinkTitleSession() {
  if (linkTitleSession || !app.isReady()) {
    return linkTitleSession
  }

  linkTitleSession = session.fromPartition('hermes:link-titles', { cache: false })
  linkTitleSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: RENDER_TITLE_BLOCKED_RESOURCES.has(details.resourceType) })
  })
  guardLinkTitleSession(linkTitleSession)

  return linkTitleSession
}

export function dequeueRenderTitle() {
  while (renderTitleInFlight < RENDER_TITLE_MAX_CONCURRENT && renderTitleQueue.length) {
    const item = renderTitleQueue.shift()
    renderTitleInFlight += 1
    runRenderTitleJob(item.url).then(title => {
      renderTitleInFlight -= 1
      item.resolve(title)
      dequeueRenderTitle()
    })
  }
}

export function runRenderTitleJob(rawUrl) {
  return new Promise(resolve => {
    if (!app.isReady()) {
      return resolve('')
    }

    const partitionSession = getLinkTitleSession()

    if (!partitionSession) {
      return resolve('')
    }

    let settled = false
    let window = null
    let hardTimer = null
    let graceTimer = null

    const finish = title => {
      if (settled) {
        return
      }

      settled = true

      if (hardTimer) {
        clearTimeout(hardTimer)
      }

      if (graceTimer) {
        clearTimeout(graceTimer)
      }

      const value = (title || '').replace(/\s+/g, ' ').trim()

      try {
        if (window && !window.isDestroyed()) {
          window.destroy()
        }
      } catch {
        // BrowserWindow may already be torn down; ignore.
      }

      resolve(value)
    }

    try {
      window = createLinkTitleWindow(BrowserWindow, partitionSession)
    } catch {
      return finish('')
    }

    const finishWithTitle = () => finish(readLinkTitleWindowTitle(window))

    const scheduleGrace = () => {
      if (graceTimer) {
        clearTimeout(graceTimer)
      }

      graceTimer = setTimeout(finishWithTitle, RENDER_TITLE_GRACE_MS)
    }

    hardTimer = setTimeout(finishWithTitle, RENDER_TITLE_TIMEOUT_MS)

    window.webContents.setUserAgent(TITLE_USER_AGENT)
    window.webContents.on('page-title-updated', scheduleGrace)
    window.webContents.on('did-finish-load', scheduleGrace)
    window.webContents.on('did-fail-load', (_event, _code, _desc, _validatedURL, isMainFrame) => {
      if (isMainFrame) {
        finish('')
      }
    })

    window
      .loadURL(rawUrl, {
        httpReferrer: 'https://www.google.com/',
        userAgent: TITLE_USER_AGENT
      })
      .catch(() => finish(''))
  })
}

export function fetchHtmlTitleWithRenderer(rawUrl: string): Promise<string> {
  return new Promise(resolve => {
    renderTitleQueue.push({ resolve, url: rawUrl })
    dequeueRenderTitle()
  })
}

export function usableTitle(value: string): string {
  return value && !TITLE_ERROR_RE.test(value) ? value : ''
}

export function fetchLinkTitle(rawUrl) {
  const url = String(rawUrl || '').trim()
  const key = canonicalTitleCacheKey(url)

  if (!key) {
    return Promise.resolve('')
  }

  if (titleCache.has(key)) {
    return Promise.resolve(titleCache.get(key))
  }

  if (titleInflight.has(key)) {
    return titleInflight.get(key)
  }

  const pending = fetchHtmlTitleWithCurl(url)
    .catch(() => '')
    .then(value => usableTitle((value || '').slice(0, 240)))
    .then(
      async value => value || usableTitle(((await fetchHtmlTitleWithRenderer(url).catch(() => '')) || '').slice(0, 240))
    )
    .then(clean => {
      cacheTitle(key, clean)
      titleInflight.delete(key)

      return clean
    })

  titleInflight.set(key, pending)

  return pending
}

export async function resourceBufferFromUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error('Missing URL')
  }

  if (rawUrl.startsWith('data:')) {
    const match = rawUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)

    if (!match) {
      throw new Error('Invalid data URL')
    }

    const mimeType = match[1] || 'application/octet-stream'
    const encoded = match[3] || ''
    const buffer = match[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded), 'utf8')

    return { buffer, mimeType }
  }

  if (/^file:/i.test(rawUrl)) {
    const { resolvedPath } = await resolveReadableFileForIpc(rawUrl, { purpose: 'Image file' })
    const buffer = await fs.promises.readFile(resolvedPath)

    return { buffer, mimeType: mimeTypeForPath(resolvedPath) }
  }

  const parsed = new URL(rawUrl)
  const client = parsed.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = client.get(parsed, res => {
      if ((res.statusCode || 500) >= 400) {
        reject(new Error(`Failed to fetch ${rawUrl}: ${res.statusCode}`))
        res.resume()

        return
      }

      const chunks = []
      res.on('error', reject)
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          mimeType: res.headers['content-type'] || 'application/octet-stream'
        })
      })
    })

    req.on('error', reject)
  })
}

export async function saveImageFromUrl(rawUrl) {
  const { buffer, mimeType } = (await resourceBufferFromUrl(rawUrl)) as any
  const extension = extensionForMimeType(mimeType) || '.png'
  // Generated-image URLs (fal.media etc.) usually end in an extensionless
  // content hash. Keep the name but always guarantee an extension — without
  // one Windows saves an unopenable "All Files" blob (#image18 report).
  const baseName = filenameFromUrl(rawUrl, `image${extension}`)
  const fallbackName = path.extname(baseName) ? baseName : `${baseName}${extension}`

  let downloadsDir = ''

  try {
    downloadsDir = app.getPath('downloads')
  } catch {
    // Leave the dialog at its last-used location when the OS has no
    // Downloads directory to offer.
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Image',
    defaultPath: downloadsDir ? path.join(downloadsDir, fallbackName) : fallbackName,
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  await fs.promises.writeFile(result.filePath, buffer)

  return true
}

export function previewLabelForUrl(url) {
  return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
}

export function expandUserPath(filePath) {
  const value = String(filePath || '').trim()

  if (value === '~') {
    return app.getPath('home')
  }

  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(app.getPath('home'), value.slice(2))
  }

  return value
}

export async function previewFileTarget(rawTarget, baseDir) {
  const raw = String(rawTarget || '').trim()
  const base = baseDir ? path.resolve(expandUserPath(baseDir)) : resolveHermesCwd()

  let resolved = resolveRequestedPathForIpc(/^file:/i.test(raw) ? raw : expandUserPath(raw), {
    baseDir: base,
    purpose: 'Preview target'
  })

  if (directoryExists(resolved)) {
    resolved = path.join(resolved, 'index.html')
  }

  const ext = path.extname(resolved).toLowerCase()

  if (!fileExists(resolved)) {
    return null
  }

  ;({ resolvedPath: resolved } = await resolveReadableFileForIpc(resolved, { purpose: 'Preview target' }))

  const mimeType = mimeTypeForPath(resolved)
  const metadata = previewFileMetadata(resolved, mimeType)
  const isHtml = PREVIEW_HTML_EXTENSIONS.has(ext)
  const isImage = mimeType.startsWith('image/')
  const isPdf = PREVIEW_PDF_EXTENSIONS.has(ext) || mimeType === 'application/pdf'
  const previewKind = isHtml ? 'html' : isImage ? 'image' : isPdf ? 'pdf' : metadata.binary ? 'binary' : 'text'

  return {
    binary: metadata.binary,
    byteSize: metadata.byteSize,
    kind: 'file',
    large: metadata.large,
    label: path.basename(resolved),
    language: PREVIEW_LANGUAGE_BY_EXT[ext] || 'text',
    mimeType,
    path: resolved,
    previewKind,
    source: raw,
    url: pathToFileURL(resolved).toString()
  }
}

export function previewUrlTarget(rawTarget) {
  const raw = String(rawTarget || '').trim()
  const url = new URL(raw)

  if (!['http:', 'https:'].includes(url.protocol)) {
    return null
  }

  if (!LOCAL_PREVIEW_HOSTS.has(url.hostname.toLowerCase())) {
    return null
  }

  if (url.hostname === '0.0.0.0') {
    url.hostname = '127.0.0.1'
  }

  return {
    kind: 'url',
    label: previewLabelForUrl(url),
    source: raw,
    url: url.toString()
  }
}

export async function normalizePreviewTarget(rawTarget, baseDir) {
  const raw = String(rawTarget || '').trim()

  if (!raw) {
    return null
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      return previewUrlTarget(raw)
    }

    return await previewFileTarget(raw, baseDir)
  } catch {
    return null
  }
}

export async function filePathFromPreviewUrl(rawUrl) {
  const { resolvedPath } = await resolveReadableFileForIpc(String(rawUrl || ''), { purpose: 'Preview file' })

  return resolvedPath
}

export function sendPreviewFileChanged(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:preview-file-changed', payload)
}

export async function watchPreviewFile(rawUrl) {
  const filePath = await filePathFromPreviewUrl(rawUrl)
  const watchDir = path.dirname(filePath)
  const targetName = path.basename(filePath)
  const id = crypto.randomBytes(12).toString('base64url')
  let timer = null

  const watcher = fs.watch(watchDir, (_eventType, filename) => {
    const changedName = filename ? path.basename(String(filename)) : ''

    if (changedName && changedName !== targetName) {
      return
    }

    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null

      if (!fileExists(filePath)) {
        return
      }

      sendPreviewFileChanged({ id, path: filePath, url: pathToFileURL(filePath).toString() })
    }, PREVIEW_WATCH_DEBOUNCE_MS)
  })

  previewWatchers.set(id, {
    close: () => {
      if (timer) {
        clearTimeout(timer)
      }

      watcher.close()
    }
  })

  return { id, path: filePath }
}

export function stopPreviewFileWatch(id) {
  const watcher = previewWatchers.get(id)

  if (!watcher) {
    return false
  }

  watcher.close()
  previewWatchers.delete(id)

  return true
}

export function closePreviewWatchers() {
  for (const id of previewWatchers.keys()) {
    stopPreviewFileWatch(id)
  }
}

export function watchDirectory(rawDir) {
  const watchDir = path.resolve(String(rawDir || ''))

  if (!fs.existsSync(watchDir) || !fs.statSync(watchDir).isDirectory()) {
    throw new Error(`Not a directory: ${watchDir}`)
  }

  const id = crypto.randomBytes(12).toString('base64url')
  let timer = null

  const watcher = fs.watch(watchDir, () => {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null
      sendPreviewFileChanged({ id, path: watchDir, url: pathToFileURL(watchDir).toString() })
    }, PREVIEW_WATCH_DEBOUNCE_MS)
  })

  previewWatchers.set(id, {
    close: () => {
      if (timer) {
        clearTimeout(timer)
      }

      watcher.close()
    }
  })

  return { id, path: watchDir }
}

interface GatewayFileConnection extends RegistryBackendRequestScope {
  authMode?: 'oauth' | 'token'
  baseUrl: string
  token?: null | string
}

interface GatewayFileSaveContext {
  fallbackName: string
  suggested: string
}

interface GatewayFileSavePayload {
  sessionId?: string
  connectionId?: unknown
  path?: unknown
  profile?: unknown
  suggestedName?: unknown
}

export async function gatedFileAuth(connection: GatewayFileConnection) {
  const nativeAt =
    connection.authMode === 'oauth' ? await ensureNativeAccessToken(connection.baseUrl).catch(() => null) : null

  return resolveGatedDownloadAuth(connection.authMode, nativeAt, connection.token)
}

export function gatewayFileRequestPath(
  connection: GatewayFileConnection,
  connectionId: null | string,
  profile: null | string,
  requestPath: string
) {
  return connectionId
    ? pathForRegistryBackendRequest(requestPath, profile, connection)
    : pathWithGlobalRemoteProfile(requestPath, profile, profileRouteOptions(profile))
}

export async function saveGatewayFile(payload: GatewayFileSavePayload = {}) {
  const filePath = gatewayFilePath(payload.path)

  if (!filePath) {
    throw new Error('Missing gateway file path')
  }

  const { connection, connectionId, profile } = await resolveGatewayFileBackend<GatewayFileConnection>(payload, {
    ensureLegacy: ensureBackend,
    ensureRegistry: ensureRegistryBackend
  })

  const suggested = String(payload.suggestedName || '').trim()
  const fallbackName = path.basename(filePath) || suggested || 'download'
  const ctx = { suggested, fallbackName }

  const requestPaths = gatewayFileRequestPaths(
    filePath,
    requestPath => gatewayFileRequestPath(connection, connectionId, profile, requestPath),
    payload.sessionId
  )

  const url = `${connection.baseUrl}${requestPaths.download}`

  try {
    const auth = await gatedFileAuth(connection)

    if (auth.kind === 'bearer') {
      return await downloadViaTokenToFile(url, auth.token, ctx, { bearer: auth.token })
    }

    if (auth.kind === 'cookie') {
      return await downloadViaOauthSessionToFile(url, ctx)
    }

    return await downloadViaTokenToFile(url, auth.token, ctx)
  } catch (error) {
    // Desktop and the remote gateway update independently. A gateway predating
    // /api/fs/download 404s here; fall back (ONLY on 404) to the older capped
    // data-URL route so downloads keep working against older backends.
    if (isNotFoundError(error)) {
      return await saveGatewayFileViaDataUrl(connection, requestPaths.dataUrl, ctx)
    }

    throw error
  }
}

export async function saveGatewayFileViaDataUrl(
  connection: GatewayFileConnection,
  requestPath: string,
  ctx: GatewayFileSaveContext
) {
  const url = `${connection.baseUrl}${requestPath}`
  const auth = await gatedFileAuth(connection)
  let json: unknown

  if (auth.kind === 'bearer') {
    json = await fetchJson(url, null, { bearer: auth.token })
  } else if (auth.kind === 'cookie') {
    json = await fetchJsonViaOauthSession(url)
  } else {
    json = await fetchJson(url, auth.token)
  }

  const dataUrl =
    json && typeof json === 'object' && 'dataUrl' in json && typeof json.dataUrl === 'string' ? json.dataUrl : ''

  if (!dataUrl) {
    throw new Error('Gateway returned no file data')
  }

  const buffer = parseDataUrlToBuffer(dataUrl)
  const filename = ctx.suggested || ctx.fallbackName

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    title: 'Save File'
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true, saved: false }
  }

  // Same failure-atomic contract as the streaming path: a direct writeFile
  // truncates an existing destination before the write completes (#96597).
  await writeBufferToFile(buffer, result.filePath, fsPumpDeps())

  return { path: result.filePath, saved: true }
}

export function configuredRemoteProfileNames() {
  const config = readDesktopConnectionConfig()

  return Object.keys(config.profiles || {}).filter(name => profileHasRemoteConnection(config, name))
}

export async function fetchJsonForProfile(profile, path) {
  return requestJsonForProfile(profile, path, 'GET')
}

export async function requestJsonForProfile(profile: string, path: string, method: string, body?: string) {
  const conn = await ensureBackend(profile)
  const url = `${conn.baseUrl}${path}`
  const opts = { method, body, timeoutMs: DEFAULT_FETCH_TIMEOUT_MS }

  if (conn.authMode === 'oauth') {
    // Native RFC 8252 flow: authenticate with the bearer token (cookieless)
    // when we hold one for this gateway; otherwise use the cookie partition.
    const nativeAt = await ensureNativeAccessToken(conn.baseUrl).catch(() => null)

    if (nativeAt) {
      return fetchJson(url, null, { ...opts, bearer: nativeAt, headers: conn.headers })
    }

    return fetchJsonViaOauthSession(url, { ...opts, headers: conn.headers })
  }

  return fetchJson(url, conn.token, { ...opts, headers: conn.headers })
}

export async function teardownPrimaryBackendAndWait({ soft = false } = {}) {
  // Capture the reference before resetHermesConnection() invalidates it.
  const hermesProcess = backendConnectionState.getProcess()
  const dying = hermesProcess && !hermesProcess.killed ? hermesProcess : null

  if (soft) {
    setSoftRehomeInProgress(true)
  }

  try {
    resetHermesConnection({ soft })
    await waitForBackendExit(dying)
  } finally {
    if (soft) {
      setSoftRehomeInProgress(false)
    }
  }
}

export async function teardownPoolBackendAndWait(profile) {
  await Promise.all(localProfilePoolKeys(profile).map(key => stopPoolBackend(key)))
}

export async function prepareProfileDeleteRequest(request) {
  const profile = profileNameFromDeleteRequest(request)

  const decision = decideProfileDeleteAction(profile, {
    isDefaultProfile: p => p === 'default',
    isValidProfileName: p => PROFILE_NAME_RE.test(p),
    primaryProfileKey
  })

  if (decision.action === 'noop') {
    return null
  }

  if (decision.action === 'teardown-primary') {
    writeActiveDesktopProfile('default')
    await Promise.all([teardownPrimaryBackendAndWait(), teardownPoolBackendAndWait(decision.profile)])

    return decision.profile
  }

  await teardownPoolBackendAndWait(decision.profile)

  return decision.profile
}

export async function prepareProfileRenameRequest(request) {
  return prepareProfileRenameLifecycle(request, {
    isValidProfileName: profile => PROFILE_NAME_RE.test(profile),
    primaryProfileKey,
    reloadPrimaryWindow: () => {
      mainWindow?.reload()
    },
    restartPrimaryBackend: async () => {
      await startHermes()
    },
    teardownPoolBackendAndWait,
    teardownPrimaryBackendAndWait,
    writeActiveDesktopProfile: profile => {
      writeActiveDesktopProfile(profile)
    }
  })
}

export async function getJsonForBackend(descriptor, path, opts: any = {}) {
  return fetchJsonForBackend(descriptor, path, opts)
}

export async function interceptSessionRequestForRemote(request) {
  if (typeof request?.path !== 'string') {
    return undefined
  }

  const method = (request.method || 'GET').toUpperCase()

  let parsed

  try {
    parsed = new URL(request.path, 'http://x')
  } catch {
    return undefined
  }

  const { pathname, searchParams } = parsed

  if (method === 'GET' && pathname === '/api/profiles/sessions') {
    const remoteProfiles = configuredRemoteProfileNames()
    const registrySources = await pooledRegistrySessionSources()

    if (remoteProfiles.length === 0 && registrySources.length === 0) {
      return undefined // no remote profiles and no connected registry gateways → local fast path
    }

    const requested = (searchParams.get('profile') || 'all').trim() || 'all'

    if (requested !== 'all') {
      return profileHasRemoteOverride(requested) ? remoteSessionList(requested, searchParams) : undefined
    }

    return mergeRemoteProfileSessions(searchParams, remoteProfiles)
  }

  // Batched sidebar slices. With no remote profiles the local batched endpoint
  // (one DB open per profile) serves it directly — take the fast path. When
  // remotes exist, fan the three slices back out to the per-slice
  // /api/profiles/sessions path (which already merges remote rows correctly) and
  // reassemble; local profiles fall back to three primary reads there, but
  // remote correctness is preserved.
  if (method === 'GET' && pathname === '/api/profiles/sessions/sidebar') {
    const remoteProfiles = configuredRemoteProfileNames()
    const registrySources = await pooledRegistrySessionSources()

    if (remoteProfiles.length === 0 && registrySources.length === 0) {
      return undefined // local fast path → batched endpoint's single DB open
    }

    const { recents: recentsSp, cron: cronSp, messaging: messagingSp } = buildSidebarSessionSliceParams(searchParams)

    const [recents, cron, messaging] = await Promise.all([
      fetchProfilesSessionSlice(recentsSp, remoteProfiles),
      fetchProfilesSessionSlice(cronSp, remoteProfiles),
      fetchProfilesSessionSlice(messagingSp, remoteProfiles)
    ])

    return {
      recents: {
        sessions: rowsOf(recents),
        total: Number(recents?.total) || 0,
        profile_totals: recents?.profile_totals || {}
      },
      cron: { sessions: rowsOf(cron) },
      messaging: {
        sessions: rowsOf(messaging),
        total: Number(messaging?.total) || rowsOf(messaging).length
      },
      errors: []
    }
  }

  // Per-session read/mutation. Owner is in ?profile= (reads) or request.profile
  // (mutations). Two remote shapes:
  //  - per-profile override: route to that profile's own remote, sans profile
  //    param (it serves its own state.db natively).
  //  - global remote mode: ONE backend serves every profile via ?profile=, so
  //    route there and KEEP the profile param so it opens the right state.db.
  if (/^\/api\/sessions\/[^/]+(\/messages)?$/.test(pathname)) {
    let profile = (searchParams.get('profile') || request.profile || '').trim()

    if (!profile) {
      // No explicit owner hint (#85834). The list endpoints above already know
      // which remote profile owns each row (remoteSessionList tags s.profile),
      // but a caller without a hint used to fall straight through to the LOCAL
      // backend and 404 on its state.db even though the session lives on a
      // remote. Consult the same remote lists to find the owner; only fall
      // through when the id is genuinely unknown remotely.
      const sessionId = decodeURIComponent(pathname.split('/')[3] || '')
      profile = (await remoteOwnerProfileForSession(sessionId)) || ''

      if (!profile) {
        return undefined
      }
    }

    // Preserve every non-profile query param (limit/offset/order pagination —
    // stripping them made getAllSessionMessages loop the same default page
    // against paginating remote backends).
    const passthroughParams = new URLSearchParams(searchParams)
    passthroughParams.delete('profile')
    const passthroughQuery = passthroughParams.toString()

    if (profileHasRemoteOverride(profile)) {
      if (method === 'GET') {
        return fetchJsonForProfile(profile, passthroughQuery ? `${pathname}?${passthroughQuery}` : pathname)
      }

      const body = request.body && typeof request.body === 'object' ? { ...request.body } : request.body

      if (body) {
        delete body.profile
      }

      return requestJsonForProfile(profile, pathname, method, body)
    }

    if (globalRemoteActive()) {
      // Single global backend: keep ?profile= so it opens the right state.db.
      passthroughParams.set('profile', profile)
      const path = `${pathname}?${passthroughParams.toString()}`

      if (method === 'GET') {
        return fetchJsonForProfile(null, path)
      }

      const body = request.body && typeof request.body === 'object' ? { ...request.body, profile } : { profile }

      return requestJsonForProfile(null, path, method, body)
    }

    return undefined
  }

  return undefined
}

export const rowsOf = data => (Array.isArray(data?.sessions) ? data.sessions : [])

export async function remoteSessionList(profile, searchParams) {
  const data = await fetchRemoteProfileSessions(profile, searchParams, fetchJsonForProfile)

  for (const s of rowsOf(data)) {
    s.profile = profile
    s.is_default_profile = false
  }

  return { ...(data as any), sessions: rowsOf(data) }
}

export const remoteOwnerBySessionId = new Map<string, { at: number; profile: null | string }>()

export const REMOTE_OWNER_CACHE_TTL_MS = 30_000

export async function remoteOwnerProfileForSession(sessionId: string) {
  if (!sessionId) {
    return null
  }

  const remoteProfiles = configuredRemoteProfileNames()

  if (remoteProfiles.length === 0) {
    return null
  }

  const cached = remoteOwnerBySessionId.get(sessionId)

  if (cached && Date.now() - cached.at < REMOTE_OWNER_CACHE_TTL_MS) {
    return cached.profile
  }

  const owner = await findRemoteOwnerProfileForSession(sessionId, remoteProfiles, (profile, params) =>
    remoteSessionList(profile, params)
  ).catch(() => null)

  remoteOwnerBySessionId.set(sessionId, { at: Date.now(), profile: owner })

  return owner
}

export async function fetchProfilesSessionSlice(searchParams, remoteProfiles) {
  const requested = (searchParams.get('profile') || 'all').trim() || 'all'

  if (requested !== 'all') {
    if (profileHasRemoteOverride(requested)) {
      return remoteSessionList(requested, searchParams)
    }

    return fetchPrimaryProfileSessions(searchParams, fetchJsonForProfile)
  }

  return mergeRemoteProfileSessions(searchParams, remoteProfiles)
}

export async function mergeRemoteProfileSessions(searchParams, remoteProfiles) {
  const limit = Math.max(1, Number(searchParams.get('limit')) || 20)
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0)
  const order = searchParams.get('order') === 'created' ? 'started_at' : 'last_active'

  const base = (await fetchPrimaryProfileSessions(searchParams, fetchJsonForProfile)) as any

  // Over-fetch each remote from offset 0 (limit+offset rows) so the merged window
  // is correct for this page — mirrors the primary's per-profile over-fetch.
  const remoteParams = new URLSearchParams(searchParams)
  remoteParams.set('limit', String(limit + offset))
  remoteParams.set('offset', '0')

  const remoteSet = new Set(remoteProfiles)
  const merged = rowsOf(base).filter(s => !remoteSet.has(s?.profile))
  const profileTotals = { ...(base.profile_totals || {}) }
  let total = (Number(base.total) || 0) - remoteProfiles.reduce((n, p) => n + (profileTotals[p] || 0), 0)

  // Swap each remote profile's stale local rows/total for the remote's real ones.
  await Promise.all(
    remoteProfiles.map(async name => {
      const list = await remoteSessionList(name, remoteParams).catch(() => null)

      if (!list) {
        delete profileTotals[name] // dead remote → drop its stale local total too

        return
      }

      const rows = rowsOf(list)
      merged.push(...rows)
      profileTotals[name] = Number(list.total) || rows.length
      total += profileTotals[name]
    })
  )

  // Registry gateways (v2 connections): splice every CONNECTED gateway's rows
  // into the unified list. Only already-pooled backends are read — a sidebar
  // refresh must never dial or spawn a backend (the Bot Mode roster-respawn
  // trap). Reads omit include_hidden, so Bot Mode's hidden canonical chats
  // stay out of the global list, same as local sessions.
  const registrySources = await pooledRegistrySessionSources()

  if (registrySources.length) {
    const registryRows = await fetchRegistrySessionRows(registrySources, remoteParams, (descriptor, path) =>
      getJsonForBackend(descriptor, path, { timeoutMs: 10_000 })
    )

    const { added } = spliceRegistrySessionRows(merged, registryRows, profileTotals)
    total += added
  }

  const recency = s => s?.[order] ?? s?.started_at ?? 0
  merged.sort((a, b) => recency(b) - recency(a))

  return {
    ...(base as any),
    sessions: mergeProfileSessionWindow(merged, offset, limit),
    total,
    profile_totals: profileTotals
  }
}

export async function pooledRegistrySessionSources(): Promise<RegistrySessionSource[]> {
  const registry = readDesktopConnectionsRegistry()
  const sources: RegistrySessionSource[] = []

  for (const connection of registry.connections) {
    if (connection.kind === 'local') {
      continue
    }

    const prefix = backendScopePrefix(connection.id)

    const pooled = [...backendPool.entries()].filter(
      ([key, entry]) => key.startsWith(prefix) && entry.connectionPromise
    )

    if (pooled.length === 0) {
      continue
    }

    const backends: Array<{ descriptor: unknown; profileLabel: null | string }> = []

    for (const [key, entry] of connection.kind === 'ssh' ? pooled : pooled.slice(0, 1)) {
      try {
        // Already-resolved for a connected backend; a still-dialing entry is
        // skipped via the timeout guard rather than blocking the sidebar.
        const descriptor = await Promise.race([
          entry.connectionPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('pending')), 2_000))
        ])

        backends.push({
          descriptor,
          profileLabel: connection.kind === 'ssh' ? key.slice(prefix.length) || 'default' : null
        })
      } catch {
        // Dead or still-connecting backend — contributes nothing this refresh.
      }
    }

    if (backends.length) {
      sources.push({ backends, connectionId: connection.id, kind: connection.kind })
    }
  }

  return sources
}

export async function dispatchRegistryApiRequest(
  request,
  registryConnectionId,
  routeProfile = request?.profile,
  requestProfile = request?.profile
) {
  // Claim-guarded (#90812): every registry-scoped REST call funnels through
  // here, so it can race a renderer's own WS reconnect dial for the same
  // (connectionId, profile) scope; coalescing avoids bootstrapping a second
  // SSH tunnel / remote dashboard.
  const connection: any = await backendDialClaims.run(backendScopeKey(registryConnectionId, routeProfile), () =>
    ensureRegistryBackend(registryConnectionId, routeProfile)
  )

  const requestPath = pathForRegistryBackendRequest(request.path, requestProfile, connection)

  const response = await fetchJsonForBackend(connection, requestPath, {
    method: request?.method,
    body: request?.body,
    upload: request?.upload,
    timeoutMs: resolveTimeoutMs(request?.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)
  })

  return (request?.method || 'GET').toUpperCase() === 'GET'
    ? tagRegistrySessionResponse(requestPath, response, registryConnectionId)
    : response
}

export function registryConnectionKind(connectionId) {
  const registry = readDesktopConnectionsRegistry()
  const source = registry.connections.find(connection => connection.id === connectionId)

  if (!source) {
    throw new Error(`No connection with id "${connectionId}".`)
  }

  return source.kind
}

export async function teardownConnectionScopedProfileBackend(connectionId, profile) {
  const key = backendScopeKey(connectionId, profile)
  await Promise.all([
    poolStopper.stop(key),
    sshBootstrapCoordinator.cancelAndWait(key).then(() => teardownSshConnection(key))
  ])
}

export async function handleHermesApiRequest(request) {
  // Registry-pinned request (request.connectionId): the renderer is working
  // against a REGISTERED gateway connection, so the data — cron jobs and their
  // run sessions included — lives in THAT host's state.db, not any local
  // profile's. Resolve the backend through the registry (same pool the job
  // list and WS traffic use) instead of the legacy profile route; a shared
  // remote/cloud host serves every profile via ?profile=, so scope the path.
  // An absent/empty id falls through to the byte-identical v1 route below.
  // Explicit `local` stays registry-pinned so it cannot inherit a v1 remote.
  const registryConnectionId = apiRequestRegistryConnectionId(request)

  if (registryConnectionId) {
    return dispatchRegistryApiRequest(request, registryConnectionId)
  }

  // Remote-profile session requests would otherwise hit the local primary off
  // each profile's on-disk state.db — fine for local profiles, but a remote
  // profile's sessions live on its remote host, so the UI's IDs 404 (or mutations
  // no-op) the moment they run there. Route reads + mutations to the remote.
  const rerouted = await interceptSessionRequestForRemote(request)

  if (rerouted !== undefined) {
    return rerouted
  }

  const profileRename = await prepareProfileRenameRequest(request)
  const tornDownProfile = await prepareProfileDeleteRequest(request)

  const profile = request?.profile
  // After tearing down a backend for profile deletion, route to the primary
  // backend instead of spawning a fresh pool backend.  A freshly spawned
  // backend calls ensure_hermes_home() which recreates the profile directory,
  // defeating the deletion and leaving a zombie process.
  //
  // Safe local-profile REST calls also stay on the primary dashboard and carry
  // ?profile=. Endpoints that cannot honor that scope retain their pooled
  // backend so a destructive call can never fall through to the primary home.
  //
  // A profile rename tears down the old-name backend the same way; for a
  // primary rename the lifecycle has already made `default` the temporary
  // primary until the PATCH settles, so the request routes there.
  const apiRoute = resolveProfileApiRequest(profile, request.path, profileRouteOptions(profile, request))

  const routeProfile = profileRename
    ? profileRename.routeProfile
    : resolveRouteProfile(tornDownProfile, apiRoute.backendProfile)

  let response

  try {
    const connection = await ensureBackend(routeProfile)
    const timeoutMs = resolveTimeoutMs(request?.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

    const url = `${connection.baseUrl}${apiRoute.requestPath}`

    // OAuth gateways authenticate REST via EITHER a native bearer token
    // (cookieless RFC 8252 flow) OR the HttpOnly session cookie held in the OAuth
    // partition. Prefer the native bearer when present (mirroring
    // mintGatewayWsTicket): the native flow never sets a cookie, so routing an
    // oauth-mode REST call through the cookie-only path returns 401 no_cookie even
    // though a valid bearer is held. Cookie mode rides Electron's net stack bound
    // to the OAuth partition so the cookie attaches automatically. Token/local
    // modes keep using the static session-token header.
    if (connection.authMode === 'oauth') {
      // The OAuth path rides electron.net with JSON headers; multipart isn't
      // wired there. Fail loudly rather than corrupting the upload.
      if (request?.upload) {
        throw new Error('File uploads are not supported against OAuth-gated remote backends yet.')
      }

      // Native bearer first (cookieless). ensureNativeAccessToken transparently
      // refreshes a near-expiry AT via /auth/native/refresh; a null return means
      // no native session (resolveOauthRestAuth then selects the cookie path).
      const nativeAt = await ensureNativeAccessToken(connection.baseUrl).catch(() => null)
      const restAuth = resolveOauthRestAuth(nativeAt)

      if (restAuth.kind === 'bearer') {
        response = await fetchJson(url, null, {
          method: request?.method,
          body: request?.body,
          timeoutMs,
          bearer: restAuth.token
        })
      } else {
        response = await fetchJsonViaOauthSession(url, {
          method: request?.method,
          body: request?.body,
          timeoutMs
        })
      }
    } else {
      response = await fetchJson(url, connection.token, {
        method: request?.method,
        body: request?.body,
        upload: request?.upload,
        timeoutMs
      })
    }
  } catch (error) {
    // A failed rename PATCH must not strand the app on the temporary primary:
    // restore the original active profile and restart its backend.
    if (profileRename) {
      try {
        await profileRename.rollback()
      } catch (rollbackError) {
        rememberLog(`Failed to restore primary profile after rename error: ${String(rollbackError)}`)
      }
    }

    throw error
  }

  await profileRename?.complete()

  return response
}

export const DATA_URL_READ_MAX_CONFIG_PATH = path.join(app.getPath('userData'), 'data-url-read-max.json')

export function readPersistedDataUrlReadMaxMb() {
  try {
    return clampDataUrlReadMaxMb(JSON.parse(fs.readFileSync(DATA_URL_READ_MAX_CONFIG_PATH, 'utf8')).maxMb)
  } catch {
    return DATA_URL_READ_DEFAULT_MAX_MB
  }
}

export let dataUrlReadMaxMb = readPersistedDataUrlReadMaxMb()

export function persistDataUrlReadMaxMb(maxMb) {
  const next = clampDataUrlReadMaxMb(maxMb)
  dataUrlReadMaxMb = next

  try {
    fs.mkdirSync(path.dirname(DATA_URL_READ_MAX_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(DATA_URL_READ_MAX_CONFIG_PATH, JSON.stringify({ maxMb: next }, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[data-url-read-max] write failed: ${error.message}`)
  }

  return next
}

export function getRenderTitleInFlight() {
  return renderTitleInFlight
}

export function setRenderTitleInFlight(value: any) {
  renderTitleInFlight = value
}

export function getDataUrlReadMaxMb() {
  return dataUrlReadMaxMb
}

export function setDataUrlReadMaxMb(value: any) {
  dataUrlReadMaxMb = value
}
