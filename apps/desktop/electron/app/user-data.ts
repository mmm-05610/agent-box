/**
 * app/user-data.ts
 *
 * Where this Desktop instance keeps its own state.
 *
 * The sandbox override (used by `scripts/dev-sandbox.sh` and by the boot smoke)
 * must be known before Electron's `userData` path is set AND by the Hermes home
 * resolver, so it lives in a leaf module that neither of them has to own.
 */

import path from 'node:path'

export const USER_DATA_OVERRIDE: string | undefined = process.env.HERMES_DESKTOP_USER_DATA_DIR

/**
 * The Desktop's app-data directory: the sandbox override when one is set,
 * otherwise whatever Electron reports.
 */
export function resolveUserDataDir(fallback: string): string {
  return USER_DATA_OVERRIDE ? path.resolve(USER_DATA_OVERRIDE) : fallback
}
