// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import fs from 'node:fs'
import path from 'node:path'

import {
  clipboard,
  dialog,
  webContents as electronWebContents,
  ipcMain
} from 'electron'

import {
  looksBinary,
  PREVIEW_LANGUAGE_BY_EXT,
  TEXT_PREVIEW_MAX_BYTES
} from '../../composition/media-protocol'
import {
  ATTACHMENT_UPLOAD_DEFAULT_MAX_BYTES,
  dataUrlReadMaxBytesFromMb,
  readFileDataUrlForIpc,
  resolveReadableFileForIpc,
  resolveRequestedPathForIpc,
  TEXT_PREVIEW_SOURCE_MAX_BYTES
} from '../../hardening'
import { capturePreviewContents } from '../../preview-capture'
import { readWslWindowsClipboardImage } from '../../wsl-clipboard-image'
import { resolvePickerDefaultPath } from '../../wsl-path-bridge'

export interface RegisterFilesIpcDeps {
  mimeTypeForPath: any
  getDataUrlReadMaxMb: () => any
  PLUGIN_SOURCE_MAX_BYTES: any
  IS_WINDOWS: any
  getMainWindow: () => any
  saveGatewayFile: any
  saveImageFromUrl: any
  writeComposerImage: any
  IS_WSL: any
  normalizePreviewTarget: any
  watchPreviewFile: any
  watchDirectory: any
  stopPreviewFileWatch: any
  sanitizeWorkspaceCwd: any
}

export function registerFilesIpc({ mimeTypeForPath, getDataUrlReadMaxMb, PLUGIN_SOURCE_MAX_BYTES, IS_WINDOWS, getMainWindow, saveGatewayFile, saveImageFromUrl, writeComposerImage, IS_WSL, normalizePreviewTarget, watchPreviewFile, watchDirectory, stopPreviewFileWatch, sanitizeWorkspaceCwd }: RegisterFilesIpcDeps) {
ipcMain.handle('hermes:readFileDataUrl', async (_event, filePath) => {
  return readFileDataUrlForIpc(filePath, {
    maxBytes: dataUrlReadMaxBytesFromMb(getDataUrlReadMaxMb()),
    mimeType: mimeTypeForPath(resolveRequestedPathForIpc(filePath, { purpose: 'File preview' })),
    purpose: 'File preview'
  })
})

ipcMain.handle('hermes:readFileDataUrlForAttach', async (_event, filePath) => {
  return readFileDataUrlForIpc(filePath, {
    maxBytes: ATTACHMENT_UPLOAD_DEFAULT_MAX_BYTES,
    mimeType: mimeTypeForPath(resolveRequestedPathForIpc(filePath, { purpose: 'Attachment upload' })),
    purpose: 'Attachment upload'
  })
})

ipcMain.handle('hermes:readFileText', async (_event, filePath) => {
  const { resolvedPath, stat } = await resolveReadableFileForIpc(filePath, {
    maxBytes: TEXT_PREVIEW_SOURCE_MAX_BYTES,
    purpose: 'Text preview'
  })

  const ext = path.extname(resolvedPath).toLowerCase()
  const handle = await fs.promises.open(resolvedPath, 'r')
  const bytesToRead = Math.min(stat.size, TEXT_PREVIEW_MAX_BYTES)

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0)

    return {
      binary: looksBinary(buffer.subarray(0, Math.min(bytesRead, 4096))),
      byteSize: stat.size,
      language: PREVIEW_LANGUAGE_BY_EXT[ext] || 'text',
      mimeType: mimeTypeForPath(resolvedPath),
      path: resolvedPath,
      text: buffer.subarray(0, bytesRead).toString('utf8'),
      truncated: stat.size > TEXT_PREVIEW_MAX_BYTES
    }
  } finally {
    await handle.close()
  }
})

ipcMain.handle('hermes:readPluginSource', async (_event: unknown, filePath: unknown) => {
  const { resolvedPath, stat } = await resolveReadableFileForIpc(filePath, {
    maxBytes: PLUGIN_SOURCE_MAX_BYTES,
    purpose: 'Plugin source'
  })

  return {
    byteSize: stat.size,
    path: resolvedPath,
    text: await fs.promises.readFile(resolvedPath, 'utf8'),
    truncated: false
  }
})

ipcMain.handle('hermes:selectPaths', async (_event, options: any = {}) => {
  const properties = options?.directories ? ['openDirectory'] : ['openFile']

  if (options?.multiple !== false) {
    properties.push('multiSelections')
  }

  let resolvedDefaultPath

  if (options?.defaultPath) {
    try {
      // On a Windows host with a WSL backend the cwd may be a POSIX/WSL path;
      // bridge it to a UNC/drive form the native dialog can actually open.
      const bridged = IS_WINDOWS
        ? resolvePickerDefaultPath(String(options.defaultPath), undefined, options?.profile)
        : String(options.defaultPath)

      resolvedDefaultPath = bridged ? path.resolve(bridged) : undefined
    } catch {
      resolvedDefaultPath = undefined
    }
  }

  const result = await dialog.showOpenDialog(getMainWindow(), {
    title: options?.title || 'Add context',
    defaultPath: resolvedDefaultPath,
    properties: properties as any,
    filters: Array.isArray(options?.filters) ? options.filters : undefined
  })

  if (result.canceled) {
    return []
  }

  return result.filePaths
})

ipcMain.handle('hermes:writeClipboard', (_event, text) => {
  clipboard.writeText(String(text || ''))

  return true
})

ipcMain.handle('hermes:selectSavePath', async (_event, options: any = {}) => {
  const result = await dialog.showSaveDialog(getMainWindow(), {
    title: options?.title || 'Save',
    defaultPath: options?.defaultPath ? String(options.defaultPath) : undefined,
    filters: Array.isArray(options?.filters) ? options.filters : undefined
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
})

ipcMain.handle('hermes:readClipboard', () => clipboard.readText())

ipcMain.handle('hermes:saveGatewayFile', (_event, payload) => saveGatewayFile(payload))

ipcMain.handle('hermes:saveImageFromUrl', (_event, url) => saveImageFromUrl(String(url || '')))

ipcMain.handle('hermes:capturePreview', async (_event, payload) => {
  const guest = electronWebContents.fromId(Number(payload?.webContentsId))

  return capturePreviewContents(guest, payload?.rect, payload?.viewport)
})

ipcMain.handle('hermes:saveImageBuffer', async (_event, payload) => {
  const data = payload?.data

  if (!data) {
    throw new Error('saveImageBuffer: missing data')
  }

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

  return writeComposerImage(buffer, payload?.ext || '.png', payload?.name)
})

ipcMain.handle('hermes:saveClipboardImage', async () => {
  const image = clipboard.readImage()

  if (image && !image.isEmpty()) {
    return writeComposerImage(image.toPNG(), '.png')
  }

  // WSL2/WSLg doesn't bridge clipboard *images* from the Windows host to the
  // Linux clipboard Electron reads, so a host screenshot looks empty above.
  // Pull it straight off the Windows clipboard via PowerShell as a fallback.
  if (IS_WSL) {
    const png = readWslWindowsClipboardImage()

    if (png) {
      return writeComposerImage(png, '.png')
    }
  }

  return ''
})

ipcMain.handle('hermes:normalizePreviewTarget', (_event, target, baseDir) =>
  normalizePreviewTarget(String(target || ''), baseDir ? String(baseDir) : '')
)

ipcMain.handle('hermes:watchPreviewFile', (_event, url) => watchPreviewFile(String(url || '')))

ipcMain.handle('hermes:watchDirectory', (_event, dir) => watchDirectory(String(dir || '')))

ipcMain.handle('hermes:stopPreviewFileWatch', (_event, id) => stopPreviewFileWatch(String(id || '')))

ipcMain.handle('hermes:workspace:sanitize', async (_event, cwd) => sanitizeWorkspaceCwd(cwd))
}
