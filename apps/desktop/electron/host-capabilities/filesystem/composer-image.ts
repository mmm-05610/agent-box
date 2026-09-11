/**
 * host-capabilities/filesystem/composer-image.ts
 *
 * Persist an image the user pasted into the composer, and hand back its path.
 *
 * Extracted from `main.ts` (E5b). Two contract details are load-bearing:
 *
 *  - the extension is *normalized*, never trusted: an extension that is not
 *    `.[a-z0-9]{1,5}` becomes `.png`, so a caller cannot direct the write to an
 *    unexpected suffix;
 *  - the name is sanitized to letters/numbers/`._-` and capped, so a display name
 *    cannot escape the destination directory or blow past the filesystem's limit.
 *
 * Images land in `userData/composer-images/`, which is app state, not a
 * user-visible directory.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export async function writeComposerImage(buffer: Buffer | Uint8Array, ext = '.png', name = ''): Promise<string> {
  const rawExt = String(ext || '.png')
    .trim()
    .toLowerCase()

  const normalizedExt = rawExt.startsWith('.') ? rawExt : `.${rawExt}`
  const safeExt = /^\.[a-z0-9]{1,5}$/.test(normalizedExt) ? normalizedExt : '.png'
  const dir = path.join(app.getPath('userData'), 'composer-images')

  await fs.promises.mkdir(dir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const random = crypto.randomBytes(3).toString('hex')

  const baseName = String(name || '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')

  const safeName = (baseName || '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80)

  const fileName = safeName ? `${safeName}_${random}${safeExt}` : `composer_${stamp}_${random}${safeExt}`
  const filePath = path.join(dir, fileName)

  await fs.promises.writeFile(filePath, buffer as any)

  return filePath
}
