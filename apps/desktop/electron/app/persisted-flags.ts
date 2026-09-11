/**
 * app/persisted-flags.ts
 *
 * The two boolean preferences the window layer reads on demand: keep-awake and
 * the F12 devtools lock. Both are a single `{ on: boolean }` file under userData,
 * and both fail closed to "off" when the file is missing or malformed.
 *
 * Extracted from `main.ts` (E5b) so the paths and their readers sit together and
 * the IPC layer can take them as deps without the composition root holding an
 * implementation.
 */

import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export const KEEP_AWAKE_CONFIG_PATH = path.join(app.getPath('userData'), 'keep-awake.json')

export const DISABLE_F12_CONFIG_PATH = path.join(app.getPath('userData'), 'disable-f12.json')

function readOnFlag(filePath: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).on === true
  } catch {
    return false
  }
}

export function readPersistedKeepAwake(): boolean {
  return readOnFlag(KEEP_AWAKE_CONFIG_PATH)
}

export function readPersistedDisableF12(): boolean {
  return readOnFlag(DISABLE_F12_CONFIG_PATH)
}
