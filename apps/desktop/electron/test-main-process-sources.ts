// Test-only helper: the main process' source is spread over main.ts plus the
// modules extracted from it (see docs/desktop-megafile-decomposition.md and
// docs/architecture/electron-host-boundary.md). Wiring assertions that used to
// read main.ts alone must look at the whole set — the call sites moved, the
// contract did not.
//
// Discovery walks the main-process tree rather than naming directories, so a
// module that moves behind a boundary (process/, legacy-hermes/,
// host-capabilities/) stays visible to the assertions instead of silently
// dropping out of the scanned set. Two files are deliberately excluded:
// `preload.ts` is the renderer bridge bundle, not main-process wiring, and this
// helper itself is test support rather than production behaviour.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export interface MainProcessFile {
  name: string
  text: string
}

const EXCLUDED = new Set(['preload.ts', 'test-main-process-sources.ts'])

function mainProcessModulePaths(dir = here): string[] {
  const out: string[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'fixtures') {
        continue
      }

      out.push(...mainProcessModulePaths(full))

      continue
    }

    if (!entry.name.endsWith('.ts')) {
      continue
    }

    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts') || EXCLUDED.has(entry.name)) {
      continue
    }

    out.push(path.relative(here, full))
  }

  return out
}

export function mainProcessFiles(): MainProcessFile[] {
  // main.ts first, then the rest in a stable path order. These assertions use
  // `indexOf` and read the FIRST match, so ordering is load-bearing: the
  // composition root must be scanned before the modules it assembles, or a
  // declaration would shadow the call site the assertion is about.
  const names = mainProcessModulePaths().sort((a, b) => {
    if (a === b) {
      return 0
    }

    if (a === 'main.ts') {
      return -1
    }

    if (b === 'main.ts') {
      return 1
    }

    return a.localeCompare(b)
  })

  return names.map(name => ({
    name,
    text: fs.readFileSync(path.join(here, name), 'utf8').replace(/\r\n/g, '\n')
  }))
}

export function mainProcessSources(): string {
  return mainProcessFiles()
    .map(f => f.text)
    .join('\n')
}

/**
 * Slice a function body out of whichever module now declares it. Accepts a
 * marker written without the `export` prefix the extraction added, and falls
 * back to the next top-level declaration when the caller's end marker lives in
 * a different module than the start marker.
 */
export function sliceFromAnyModule(startMarker: string, endMarker: string): string {
  const exported = startMarker.replace(/^(async )?function /, '$1export function ')
  const boundaries = [endMarker, '\nasync function ', '\nfunction ', '\nconst ', '\nexport ']

  for (const { text } of mainProcessFiles()) {
    for (const marker of [startMarker, exported]) {
      const start = text.indexOf(marker)

      if (start === -1) {
        continue
      }

      const end = boundaries
        .map(b => text.indexOf(b, start + marker.length))
        .filter(i => i !== -1)
        .sort((a, b) => a - b)[0]

      if (end !== undefined && end > start) {
        return text.slice(start, end)
      }

      return text.slice(start)
    }
  }

  throw new Error(`${startMarker} not found in the main process sources`)
}
