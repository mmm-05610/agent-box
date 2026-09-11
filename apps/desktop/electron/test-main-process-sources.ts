// Test-only helper: the main process' source is spread over main.ts plus the
// composition modules extracted from it (see
// docs/desktop-megafile-decomposition.md). Wiring assertions that used to read
// main.ts alone must look at the whole set — the call sites moved, the contract
// did not.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export interface MainProcessFile {
  name: string
  text: string
}

export function mainProcessFiles(): MainProcessFile[] {
  const rel = [
    'main.ts',
    ...fs
      .readdirSync(path.join(here, 'composition'))
      .filter(f => f.endsWith('.ts'))
      .map(f => path.join('composition', f)),
    ...fs
      .readdirSync(path.join(here, 'composition', 'ipc'))
      .filter(f => f.endsWith('.ts'))
      .map(f => path.join('composition', 'ipc', f))
  ]

  return rel.map(name => ({ name, text: fs.readFileSync(path.join(here, name), 'utf8').replace(/\r\n/g, '\n') }))
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
