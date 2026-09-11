/**
 * app/downloads.ts
 *
 * The `will-download` save-dialog policy: suggest a sane filename and filter for
 * what Chromium is about to write, and never let a missing Downloads directory
 * break the download.
 *
 * Extracted from `main.ts` (E5b). `extensionForMimeType` is injected because it
 * belongs to the link-title/MIME helper set; this module only owns the dialog
 * policy.
 */

import path from 'node:path'

import { app, session } from 'electron'

export interface DownloadHandlingDeps {
  extensionForMimeType: (mimeType: string) => string
}

/**
 * Attach the save-dialog defaults to the default session. Chromium keeps its own
 * default prompt when the Downloads directory cannot be resolved.
 */
export function installDownloadHandling(deps: DownloadHandlingDeps): void {
  session.defaultSession.on('will-download', (_event, item) => {
    const suggested = item.getFilename() || 'download'
    const hasExtension = Boolean(path.extname(suggested))
    const extension = hasExtension ? '' : deps.extensionForMimeType(item.getMimeType())
    const filename = `${suggested}${extension}`

    try {
      item.setSaveDialogOptions({
        title: 'Save File',
        defaultPath: path.join(app.getPath('downloads'), filename),
        filters:
          extension || /^image\//i.test(item.getMimeType() || '')
            ? [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            : undefined
      })
    } catch {
      // No Downloads directory to offer — keep Chromium's default prompt.
    }
  })
}
