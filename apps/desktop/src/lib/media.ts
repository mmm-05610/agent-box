import { capitalize } from '@/lib/text'

// Path → kind / MIME / label. Pure: no connection, no DOM beyond the URL parser,
// nothing else in the renderer. The half of media handling that needs the active
// connection — resolving a path to a URL the shell or an <img> can use — is
// `@/lib/desktop-fs`, next to the connection it needs.

export type MediaKind = 'audio' | 'image' | 'video' | 'file'

interface MediaInfo {
  kind: MediaKind
  mime: string
}

const MEDIA_BY_EXT: Record<string, MediaInfo> = {
  avi: { kind: 'video', mime: 'video/x-msvideo' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  gif: { kind: 'image', mime: 'image/gif' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/ogg; codecs=opus' },
  png: { kind: 'image', mime: 'image/png' },
  svg: { kind: 'image', mime: 'image/svg+xml' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  webm: { kind: 'video', mime: 'video/webm' },
  webp: { kind: 'image', mime: 'image/webp' }
}

function mediaInfo(path: string): MediaInfo | undefined {
  const ext = path.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase()

  return ext ? MEDIA_BY_EXT[ext] : undefined
}

export function mediaKind(path: string): MediaKind {
  return mediaInfo(path)?.kind ?? 'file'
}

// Markdown is renderable content, not an opaque download: the preview rail
// already knows how to render a `.md` file (rendered/source toggle), so the
// MEDIA delivery path routes these to a preview instead of a download link.
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd'])

export function isMarkdownDocumentPath(path: string): boolean {
  const ext = path.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase()

  return ext ? MARKDOWN_EXTENSIONS.has(ext) : false
}

export function mediaMime(path: string): string {
  return mediaInfo(path)?.mime ?? 'application/octet-stream'
}

export function mediaName(path: string): string {
  try {
    const url = new URL(path)

    return url.pathname.split('/').filter(Boolean).pop() || path
  } catch {
    return path.split(/[\\/]/).filter(Boolean).pop() || path
  }
}

export function mediaMarkdownHref(path: string): string {
  return `#media:${encodeURIComponent(path)}`
}

export function isInlineMediaSrc(path: string): boolean {
  return /^(?:https?|data):/i.test(path)
}

export function isArtifactFilePath(path: string): boolean {
  return /^(?:file:|\/|[~.][\\/]|\.\.[\\/]|[a-z]:[\\/]|\\\\)/i.test(path)
}

export function isFileMediaPath(path: string): boolean {
  return /^(?:file:|\/|~\/|[a-z]:[\\/]|\\\\)/i.test(path)
}

// Custom Electron scheme (registered in electron/main.ts) that streams a local
// file with Range support. Used for audio/video so playback bypasses the data
// URL size cap and supports seeking. `path` may be a plain path or `file://…`.
export function mediaStreamUrl(path: string): string {
  return `hermes-media://stream/${encodeURIComponent(filePathFromMediaPath(path))}`
}

export function mediaPathFromMarkdownHref(href?: string): string | null {
  if (!href?.startsWith('#media:')) {
    return null
  }

  try {
    return decodeURIComponent(href.slice('#media:'.length))
  } catch {
    return null
  }
}

export function filePathFromMediaPath(path: string): string {
  if (!path.startsWith('file:')) {
    return path
  }

  try {
    return decodeURIComponent(new URL(path).pathname)
  } catch {
    return path.replace(/^file:\/\//, '')
  }
}

export function mediaDisplayLabel(path: string): string {
  const escaped = mediaName(path).replace(/[[\]\\]/g, '\\$&')
  const kind = mediaKind(path)

  return `${capitalize(kind)}: ${escaped}`
}
