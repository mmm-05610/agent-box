import { withSessionNotFoundResume } from '@/application/session/recovery'
import { pathLabel } from '@/lib/chat-runtime'
import type { FileAttachResponse, ImageAttachResponse } from '@/types/api-responses'
import type { ComposerAttachment } from '@/types/composer'
import type { GatewayRequester } from '@/types/gateway'

const WINDOWS_ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\)/
const POSIX_ABSOLUTE_PATH_RE = /^\/(?!\/)/

// Terminal backends whose execution environment has its own filesystem
// (docker/ssh/singularity/modal/...) cannot see the desktop's host paths —
// they must be crossed as bytes, like remote attachments. Mirrors the
// container_backend set in tools/terminal_tool.py::_get_env_config.
const CONTAINER_TERMINAL_BACKENDS = new Set(['docker', 'ssh', 'singularity', 'modal', 'daytona', 'vercel_sandbox'])

// `mode: local` means the gateway was launched locally, not necessarily that
// Electron and the gateway share a filesystem. Windows Desktop can front a
// WSL/Docker backend whose cwd is POSIX, so a Windows host path must cross the
// boundary as bytes just like a remote attachment. Container terminal backends
// (docker, ssh, ...) always need bytes: the sandbox has its own filesystem and
// the host path would dangle inside it (#76577).
function attachmentPathNeedsUpload(path: string, backendCwd?: null | string, terminalBackend?: string): boolean {
  if (CONTAINER_TERMINAL_BACKENDS.has((terminalBackend || '').trim().toLowerCase())) {
    return true
  }

  return WINDOWS_ABSOLUTE_PATH_RE.test(path.trim()) && POSIX_ABSOLUTE_PATH_RE.test(backendCwd?.trim() || '')
}

export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')

  return comma >= 0 ? dataUrl.slice(comma + 1) : ''
}

export function imageFilenameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || 'image.png'
}

// Remote gateway: the local composer-image file lives on THIS machine's disk,
// not the gateway's, so read the bytes here and upload them via
// image.attach_bytes. Returns null when the file can't be read.
//
// `cachedDataUrl` is the attachment's `previewUrl` when the composer already
// read the file for the chip thumbnail — that preview is the FULL file as a
// base64 data URL (attachmentPreviewDataUrl → readFileDataUrl), not a
// downscaled copy, so reusing it skips a second disk read + IPC round-trip of
// the same bytes at submit. Only a `;base64,` data URL qualifies; anything
// else falls through to the disk read.
export async function readImageForRemoteAttach(
  filePath: string,
  cachedDataUrl?: string
): Promise<{ contentBase64: string; filename: string } | null> {
  if (cachedDataUrl?.includes(';base64,')) {
    const cached = base64FromDataUrl(cachedDataUrl)

    if (cached) {
      return { contentBase64: cached, filename: imageFilenameFromPath(filePath) }
    }
  }

  const dataUrl = await window.hermesDesktop?.readFileDataUrl(filePath)
  const contentBase64 = dataUrl ? base64FromDataUrl(dataUrl) : ''

  return contentBase64 ? { contentBase64, filename: imageFilenameFromPath(filePath) } : null
}

// Read a non-image file as a data URL for upload via file.attach. Returns null
// when the desktop bridge can't read the file (e.g. it was moved/deleted).
// Prefer the attach-specific IPC (256 MiB) so remote uploads are not stuck on
// the preview/Settings default; fall back for older Electron shells.
export async function readFileDataUrlForAttach(filePath: string): Promise<string | null> {
  const reader = window.hermesDesktop?.readFileDataUrlForAttach ?? window.hermesDesktop?.readFileDataUrl

  if (!reader) {
    return null
  }

  const dataUrl = await reader(filePath)

  return dataUrl || null
}

// The attach/preview IPC base64-loads the whole file into memory and rejects
// with a raw "file is too large (N bytes; limit M bytes)" string when over
// cap. In remote mode every attachment's bytes go through that read, so a big
// file surfaces that internal message verbatim in the failure toast. Translate
// it into a friendly "too large to upload to the remote gateway" line, parsing
// the limit out of the message so it tracks the real cap. Non-cap errors pass
// through unchanged.
export function friendlyRemoteAttachError(err: unknown, label: string): Error {
  const message = err instanceof Error ? err.message : String(err)

  if (!/too large/i.test(message)) {
    return err instanceof Error ? err : new Error(message)
  }

  const limitBytes = Number(message.match(/limit (\d+) bytes/)?.[1])
  const cap = Number.isFinite(limitBytes) && limitBytes > 0 ? ` (max ${Math.floor(limitBytes / (1024 * 1024))} MB)` : ''

  return new Error(`${label} is too large to upload to the remote gateway${cap}.`)
}

/**
 * Stage one file/image attachment into the session workspace and return the
 * attachment rewritten with the gateway-side ref. Attachments upload their
 * bytes for remote gateways and local cross-filesystem backends; otherwise the
 * gateway receives the shared local path. Throws on failure so callers can
 * surface an error. Shared by submit-time sync, the eager drop-time upload, and
 * the message-edit composer drop — keep them in lockstep.
 */
export async function uploadComposerAttachment(
  attachment: ComposerAttachment,
  opts: {
    backendCwd?: null | string
    remote: boolean
    requestGateway: GatewayRequester
    sessionId: string
    /** Durable id used to re-register after sleep/wake or a backend restart. */
    storedSessionId?: null | string
    /** Called when the attach recovered onto a fresh live id. */
    onSessionRecovered?: (sessionId: string) => void
    terminalBackend?: string
  }
): Promise<ComposerAttachment> {
  const { backendCwd, remote, requestGateway, storedSessionId, onSessionRecovered, terminalBackend } = opts
  const path = attachment.path ?? ''
  const label = attachment.label || pathLabel(path)
  const uploadBytes = remote || attachmentPathNeedsUpload(path, backendCwd, terminalBackend)

  // Read bytes/paths ONCE, outside the retry. Only the session-scoped RPC is
  // replayed on recovery — re-reading a multi-MB file to retry a dead session
  // id would double the disk/IPC cost of every recovered attach. For images,
  // the chip's previewUrl already holds the full file as a base64 data URL,
  // so passing it avoids re-reading the same bytes off disk at submit.
  let imagePayload: Awaited<ReturnType<typeof readImageForRemoteAttach>> | null = null
  let fileDataUrl: null | string = null

  if (uploadBytes) {
    try {
      if (attachment.kind === 'image') {
        imagePayload = await readImageForRemoteAttach(path, attachment.previewUrl)
      } else {
        fileDataUrl = await readFileDataUrlForAttach(path)
      }
    } catch (err) {
      throw friendlyRemoteAttachError(err, label)
    }

    if (attachment.kind === 'image' ? !imagePayload : !fileDataUrl) {
      throw new Error(`Could not read ${label}`)
    }
  }

  const stageForSession = async (liveSessionId: string): Promise<ComposerAttachment> => {
    if (attachment.kind === 'image') {
      const result = imagePayload
        ? await requestGateway<ImageAttachResponse>('image.attach_bytes', {
            session_id: liveSessionId,
            content_base64: imagePayload.contentBase64,
            filename: imagePayload.filename
          })
        : await requestGateway<ImageAttachResponse>('image.attach', {
            path,
            session_id: liveSessionId
          })

      if (!result.attached) {
        throw new Error(result.message || `Could not attach ${label}`)
      }

      const attachedPath = result.path || path

      return {
        ...attachment,
        attachedSessionId: liveSessionId,
        label: attachedPath ? pathLabel(attachedPath) : attachment.label,
        path: attachedPath,
        uploadState: undefined
      }
    }

    const result = await requestGateway<FileAttachResponse>('file.attach', {
      name: label,
      path,
      session_id: liveSessionId,
      ...(fileDataUrl ? { data_url: fileDataUrl } : {})
    })

    if (!result.attached || !result.ref_text) {
      throw new Error(result.message || `Could not attach ${label}`)
    }

    return {
      ...attachment,
      attachedSessionId: liveSessionId,
      refText: result.ref_text,
      uploadState: undefined
    }
  }

  // Attach runs BEFORE prompt.submit, so submit's own recovery never gets a
  // chance: a stale runtime id fails here first and the user sees "session not
  // found" on an image while plain text works.
  const { result, sessionId: usedSessionId } = await withSessionNotFoundResume(
    opts.sessionId,
    storedSessionId,
    stageForSession,
    { requestGateway }
  )

  if (usedSessionId !== opts.sessionId) {
    onSessionRecovered?.(usedSessionId)
  }

  return result
}
