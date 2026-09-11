// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import fs from 'node:fs'
import path from 'node:path'

import {
  app
} from 'electron'

import {
  rememberLog
} from '../app/log-buffer'
import {
  fileExists,
  POOL_LIMITS_PATH,
  resolveUpdateRoot,
} from '../composition/bootstrap-env-composition'

export function persistPoolLimits(limits) {
  try {
    fs.mkdirSync(path.dirname(POOL_LIMITS_PATH), { recursive: true })
    // Atomic write: write to a temp file in the same directory, then rename.
    // A crash mid-write would otherwise leave truncated JSON and silently
    // lose the user's saved sizing.
    const tmpPath = `${POOL_LIMITS_PATH}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(limits, null, 2), 'utf8')
    fs.renameSync(tmpPath, POOL_LIMITS_PATH)
  } catch (error) {
    rememberLog(`[pool-limits] write failed: ${error.message}`)
  }
}

export function resolveHermesVersion() {
  try {
    const root = resolveUpdateRoot()
    const initPath = path.join(root, 'hermes_cli', '__init__.py')

    if (fileExists(initPath)) {
      const raw = fs.readFileSync(initPath, 'utf8')
      const match = raw.match(/__version__\s*=\s*["']([^"']+)["']/)

      if (match) {
        return match[1]
      }
    }
  } catch {
    // Fall through to the Electron app version below.
  }

  return app.getVersion()
}
