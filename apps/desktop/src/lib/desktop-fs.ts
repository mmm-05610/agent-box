import { hermesApi } from '@/api/client'
import type {
  HermesConnection,
  HermesReadDirResult,
  HermesReadFileTextResult,
  HermesSelectPathsOptions
} from '@/global'
import {
  filePathFromMediaPath,
  isFileMediaPath,
  isInlineMediaSrc,
  mediaKind,
  mediaName,
  mediaStreamUrl
} from '@/lib/media'

// The host-capability adapter: one operation, two backends. Local goes through
// the Electron IPC bridge (`window.hermesDesktop`); a remote gateway has the
// filesystem, so the same operation mirrors onto its REST surface (/api/fs/*,
// /api/git/*, /api/files/*). The renderer's file and git surfaces never learn
// which side answered.
//
// It is a LEAF, and it stays one. It used to read `$connection` out of the
// session store, which is what made a filesystem primitive depend on app state;
// the active connection now arrives through `setDesktopFsConnectionSource`,
// the same shape this file already used for the remote picker below.

export interface DesktopFsRemotePicker {
  selectPaths: (options?: HermesSelectPathsOptions) => Promise<string[]>
}

let remotePicker: DesktopFsRemotePicker | null = null

export function setDesktopFsRemotePicker(next: DesktopFsRemotePicker | null) {
  remotePicker = next
}

/** The active connection, published by the composition root (see
 *  `app/composition/bridges/desktop-filesystem.ts`).
 *
 *  Reading it lazily — a getter rather than a value — is what keeps the
 *  behaviour identical to reading the atom directly: a connection that changes
 *  mid-session is picked up by the next call, and no re-registration is needed.
 *
 *  The `() => null` default is the not-yet-connected state, which is exactly
 *  what `$connection.get()` returns before a backend is chosen: local mode, no
 *  profile. So an unwired source degrades to the same answer the store gave,
 *  and never to a wrong remote one. */
let readConnection: () => HermesConnection | null = () => null

export function setDesktopFsConnectionSource(source: () => HermesConnection | null): void {
  readConnection = source
}

function connectionCacheKey(connection: HermesConnection | null) {
  if (!connection) {
    return 'local:'
  }

  // A profile belongs to a registry connection, not the whole Desktop. The
  // registry id is the isolation boundary, including for SSH connections; the
  // stable host identity below is only the fallback for legacy connections.
  if (connection.connectionId) {
    return `connection:${connection.connectionId}:${connection.profile || ''}`
  }

  const target =
    connection.remoteKind === 'ssh'
      ? connection.remoteIdentity || connection.remoteHost || ''
      : connection.baseUrl || ''

  return `${connection.mode || 'local'}:${connection.remoteKind || ''}:${connection.profile || ''}:${target}`
}

export function desktopFsCacheKey(connection: HermesConnection | null = readConnection()) {
  return connectionCacheKey(connection)
}

export function isDesktopFsRemoteMode() {
  return readConnection()?.mode === 'remote'
}

// Active profile for FS/git REST calls. Without it the Electron api bridge
// hits the primary (local) backend even when the user switched to a remote profile.
export function desktopFsProfile(): string | undefined {
  return readConnection()?.profile || undefined
}

function fsPath(endpoint: string, filePath: string) {
  return `/api/fs/${endpoint}?path=${encodeURIComponent(filePath)}`
}

function bridge() {
  const desktop = window.hermesDesktop

  if (!desktop) {
    throw new Error('Hermes Desktop bridge is unavailable')
  }

  return desktop
}

function remoteFsApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  return hermesApi<T>(
    body ? { body, method: 'POST', path, profile: desktopFsProfile() } : { path, profile: desktopFsProfile() }
  )
}

export async function readDesktopDir(path: string): Promise<HermesReadDirResult> {
  if (!isDesktopFsRemoteMode()) {
    return bridge().readDir(path)
  }

  return remoteFsApi<HermesReadDirResult>(fsPath('list', path))
}

export async function readDesktopFileText(path: string): Promise<HermesReadFileTextResult> {
  if (!isDesktopFsRemoteMode()) {
    return bridge().readFileText(path)
  }

  return remoteFsApi<HermesReadFileTextResult>(fsPath('read-text', path))
}

// Save UTF-8 text back to a file. Local writes go through the hardened Electron
// IPC; remote writes hit the dashboard's POST /api/fs/write-text (same path
// hardening, parent-must-exist, size cap) so the editor behaves identically in
// both modes. Stale-on-disk detection is the caller's job (re-read before save).
export async function writeDesktopFileText(path: string, content: string): Promise<{ path: string }> {
  const desktop = bridge()

  if (!isDesktopFsRemoteMode()) {
    if (!desktop.writeTextFile) {
      throw new Error('Saving is not available')
    }

    return desktop.writeTextFile(path, content)
  }

  const result = await remoteFsApi<{ ok?: boolean; path?: string }>('/api/fs/write-text', { content, path })

  return { path: result.path || path }
}

export async function readDesktopFileDataUrl(path: string): Promise<string> {
  if (!isDesktopFsRemoteMode()) {
    return bridge().readFileDataUrl(path)
  }

  const result = await remoteFsApi<string | { dataUrl?: string }>(fsPath('read-data-url', path))

  return typeof result === 'string' ? result : result.dataUrl || ''
}

/**
 * Read a composer image local-shell first, even when the active agent is
 * remote. Picker, clipboard, and OS-drop paths belong to this machine; in-app
 * project-tree paths may belong only to the gateway and fall back there.
 */
export async function readDesktopFileDataUrlLocalFirst(path: string): Promise<string> {
  try {
    const local = await window.hermesDesktop?.readFileDataUrl?.(path)

    if (local) {
      return local
    }
  } catch (error) {
    if (!isDesktopFsRemoteMode()) {
      throw error
    }

    // Not on this machine (or unreadable locally) — try the active gateway.
  }

  return readDesktopFileDataUrl(path)
}

export async function desktopGitRoot(path: string): Promise<string | null> {
  const desktop = bridge()

  if (!isDesktopFsRemoteMode()) {
    return desktop.gitRoot ? desktop.gitRoot(path) : null
  }

  return (await remoteFsApi<{ root: string | null }>(fsPath('git-root', path))).root
}

export async function desktopDefaultCwd(): Promise<{ branch: string; cwd: string } | null> {
  if (!isDesktopFsRemoteMode()) {
    return null
  }

  return remoteFsApi<{ branch: string; cwd: string }>('/api/fs/default-cwd')
}

// Reveal a path in the OS file manager (Finder / Explorer / Files). Local only.
export async function revealDesktopPath(path: string): Promise<void> {
  await bridge().revealPath?.(path)
}

// Rename a file/folder in place; returns the new absolute path. Local only.
export async function renameDesktopPath(path: string, newName: string): Promise<string> {
  const desktop = bridge()

  if (!desktop.renamePath) {
    throw new Error('Rename is not available')
  }

  const result = await desktop.renamePath(path, newName)

  return result.path
}

// Move a file/folder to the OS trash (recoverable). Local only.
export async function trashDesktopPath(path: string): Promise<void> {
  const desktop = bridge()

  if (!desktop.trashPath) {
    throw new Error('Delete is not available')
  }

  await desktop.trashPath(path)
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await bridge().writeClipboard(text)
}

// Working-tree-vs-HEAD diff for one file. Empty when unchanged / not a repo.
// Remote gateway → backend git (/api/git/file-diff); local → Electron git.
export async function desktopFileDiff(repoRoot: string, filePath: string): Promise<string> {
  if (isDesktopFsRemoteMode()) {
    const result = await remoteFsApi<{ diff: string }>(
      `/api/git/file-diff?path=${encodeURIComponent(repoRoot)}&file=${encodeURIComponent(filePath)}`
    )

    return result.diff || ''
  }

  const git = bridge().git

  return git?.fileDiff ? git.fileDiff(repoRoot, filePath) : ''
}

export async function selectDesktopPaths(options?: HermesSelectPathsOptions): Promise<string[]> {
  const desktop = bridge()
  const profile = desktopFsProfile()
  const localOptions = profile ? { ...options, profile } : options

  if (!isDesktopFsRemoteMode()) {
    return desktop.selectPaths(localOptions)
  }

  if (!options?.directories) {
    return desktop.selectPaths(localOptions)
  }

  return remotePicker ? remotePicker.selectPaths({ ...options, multiple: false }) : []
}

// ── gateway media addresses ──────────────────────────────────────────────────
//
// The other half of "the same operation, two backends": a media path resolves to
// a URL this shell can hand to the OS or to an <img>/<video>. Local paths live on
// THIS disk; a remote gateway's live over there, so they need an authenticated
// gateway URL instead.
//
// These live here rather than in `lib/media.ts` because they are the only part of
// media handling that needs the connection — and the connection is injected into
// this module. Keeping them together means one injection point, not two.
// `lib/media.ts` keeps the pure half (path → kind / MIME / label), which needs no
// connection at all.

/** True when this desktop shell is wired to a remote gateway. Local media paths
 *  then live on the gateway machine, not this disk, so we fetch them over the API. */
export function isRemoteGateway(): boolean {
  return readConnection()?.mode === 'remote'
}

// Resolve a media path to a URL the shell can open. Remote mode rewrites
// gateway-local paths to an authenticated /api/files/download URL (the file
// lives on the gateway, not this disk); local mode keeps the file:// form.
export function mediaExternalUrl(path: string): string {
  if (/^https?:/i.test(path)) {
    return path
  }

  if (isRemoteGateway()) {
    const conn = readConnection()

    if (conn?.baseUrl && conn.token) {
      const file = encodeURIComponent(filePathFromMediaPath(path))

      return `${conn.baseUrl}/api/files/download?path=${file}&token=${encodeURIComponent(conn.token)}`
    }
  }

  return /^file:/i.test(path) ? path : `file://${path}`
}

// Remote gateway audio/video is proxied by the Electron main process. OAuth
// connections intentionally expose no static token to the renderer, so a bare
// HTTPS source cannot authenticate reliably. The custom protocol keeps secrets
// out of renderer URLs while forwarding Range requests to /api/files/stream.
export function mediaGatewayStreamUrl(path: string): string {
  const conn = readConnection()

  if (isRemoteGateway()) {
    const file = encodeURIComponent(filePathFromMediaPath(path))

    const scope = [
      conn?.connectionId ? `connectionId=${encodeURIComponent(conn.connectionId)}` : '',
      conn?.profile ? `profile=${encodeURIComponent(conn.profile)}` : ''
    ]
      .filter(Boolean)
      .join('&')

    return `hermes-media://remote/${file}${scope ? `?${scope}` : ''}`
  }

  return mediaExternalUrl(path)
}

// Fetch gateway-local media as a data URL via the authenticated desktop FS
// bridge. Remote Desktop artifacts can live anywhere the gateway can read
// (workspace, skills, ~/.hermes/cache, etc.); /api/media is intentionally
// narrower and rejects non-images plus images outside its media roots.
export async function gatewayMediaDataUrl(path: string): Promise<string> {
  return readDesktopFileDataUrl(filePathFromMediaPath(path))
}

// Remote-mode replacement for opening gateway-local file paths with file://.
// The file lives on the gateway, so ask the Electron main process to fetch the
// bytes through the authenticated backend connection and save them locally. This
// avoids browser/OS downloads losing OAuth cookies and avoids the data-URL cap
// used by preview endpoints.
export async function downloadGatewayMediaFile(
  path: string,
  origin?: { sessionId: string; profile?: string }
): Promise<{ canceled?: boolean; path?: string; saved: boolean }> {
  // URI conversion belongs to the gateway OS, not the renderer's URL parser.
  const file = path
  const conn = readConnection()

  if (!window.hermesDesktop?.saveGatewayFile) {
    throw new Error('Desktop file download bridge is unavailable')
  }

  return window.hermesDesktop.saveGatewayFile({
    connectionId: conn?.connectionId,
    path: file,
    profile: origin?.profile ?? conn?.profile,
    ...(origin ? { sessionId: origin.sessionId } : {}),
    suggestedName: mediaName(file).replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
      try {
        return decodeURIComponent(encoded)
      } catch {
        return encoded
      }
    })
  })
}

export async function resolveMediaDisplaySrc(path: string): Promise<string> {
  if (isInlineMediaSrc(path) || !isFileMediaPath(path)) {
    return path
  }

  if (window.hermesDesktop && isRemoteGateway()) {
    return gatewayMediaDataUrl(path)
  }

  if (!window.hermesDesktop?.readFileDataUrl) {
    return mediaExternalUrl(path)
  }

  return window.hermesDesktop.readFileDataUrl(filePathFromMediaPath(path))
}

// Audio/video need a seekable source instead of a whole-file data URL. Keep
// remote URLs untouched and route filesystem paths through the Electron media
// protocol. Its main-process handler reads local files directly or proxies a
// remote gateway with the connection's bearer/cookie/token authentication.
export async function resolveMediaPlaybackSrc(path: string): Promise<string> {
  if (isInlineMediaSrc(path)) {
    return path
  }

  if (window.hermesDesktop && ['audio', 'video'].includes(mediaKind(path))) {
    return isRemoteGateway() ? mediaGatewayStreamUrl(path) : mediaStreamUrl(path)
  }

  return resolveMediaDisplaySrc(path)
}

