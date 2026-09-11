/**
 * host-capabilities/filesystem/fs-probe.ts
 *
 * The two existence questions the resolver and the capabilities ask constantly:
 * is there a file here, is there a directory here.
 *
 * Both answer `false` on any error — a permission problem, a broken symlink or a
 * path that is too long are all "not usable", and a probe must never throw into a
 * boot path. Nothing else belongs in this module: it is a leaf that the platform,
 * the resolver and the capabilities can all import without a cycle.
 */

import fs from 'node:fs'

export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function directoryExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory()
  } catch {
    return false
  }
}
