import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: `src/themes/**` is a LEAF.
//
// The theme math (`ThemeMode`, the palette algorithms, the presets, retint,
// contrast, `resolveTheme`, `resolveAppearance`) is plain data in, plain data
// out, and the React layer above it paints what it is handed. Neither may know
// that a Profile store, a plugin registry, a gateway, a storage helper, a native
// bridge or a Hermes payload type exists.
//
// The rule is the whole of it: a file under `themes/` may import React,
// third-party packages, and other files in this directory — and NOTHING from the
// app. `@/…` and `@hermes/…` are product modules by construction, so the ban is
// on those prefixes, with no per-file exception list to keep in sync.
//
// What made this directory un-leafable was the reverse edge: the provider used
// to reach UP into the stores it was supposed to be a client of, which is how
// `themes/context.tsx` ended up inside the app's second-largest import cycle
// (SCC-B) through `store/profile → store/notifications → i18n → settings`.
// Every product integration now sits in `@/application/theme`, one level above,
// and imports DOWN into this directory.
//
// Tests are skipped: a test is not a module the app loads.

const THEMES_DIR = dirname(fileURLToPath(import.meta.url))
const SELF = relative(THEMES_DIR, fileURLToPath(import.meta.url))

/** Module prefixes that only exist above the leaf: the app's own modules, the
 *  Hermes payload types, the host bridge, and the node runtime. */
const PRODUCT_PREFIXES = ['@/', '@hermes/', 'electron', 'node:'] as const

/** Every module specifier a file pulls in — static imports and re-exports,
 *  side-effect imports, dynamic `import()`, and `require()`. */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g
  ]

  const found: string[] = []

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      found.push(match[1])
    }
  }

  return found
}

export interface Module {
  /** Path relative to `themes/`. */
  path: string
  source: string
}

export interface Violation {
  file: string
  detail: string
}

export function boundaryViolations(modules: readonly Module[]): Violation[] {
  const violations: Violation[] = []

  for (const module of modules) {
    for (const specifier of importSpecifiers(module.source)) {
      if (PRODUCT_PREFIXES.some(prefix => specifier.startsWith(prefix))) {
        violations.push({ file: module.path, detail: `imports product module ${specifier}` })

        continue
      }

      if (!specifier.startsWith('.')) {
        // React and third-party packages are what a leaf is allowed to stand on.
        continue
      }

      const target = resolve(THEMES_DIR, dirname(module.path), specifier)

      // A `../` that leaves the directory is not a sibling, however it resolves.
      if (relative(THEMES_DIR, target).startsWith('..')) {
        violations.push({ file: module.path, detail: `escapes the directory: ${specifier}` })
      }
    }
  }

  return violations
}

function themeModules(): Module[] {
  const collect = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry)

      if (statSync(full).isDirectory()) {
        return collect(full)
      }

      const relativePath = relative(THEMES_DIR, full)

      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [relativePath] : []
    })

  return collect(THEMES_DIR)
    .filter(path => path !== SELF)
    .map(path => ({ path, source: readFileSync(join(THEMES_DIR, path), 'utf8') }))
}

describe('the theme directory is a leaf', () => {
  const modules = themeModules()

  it('has modules to judge', () => {
    expect(modules.length).toBeGreaterThan(5)
  })

  it('imports no product module — only React, third parties, and its own files', () => {
    const violations = boundaryViolations(modules)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('catches a product import however it is written', () => {
    // Reverse control: the scanner above is worth nothing if it cannot fail.
    const cases = [
      "import { $activeGatewayProfile } from '@/store/profile'",
      "import { persistString } from '@/lib/storage'",
      "import { registry } from '@/lib/contributions'",
      "import { requestGateway } from '@/api/gateway'",
      "import { getHermesConfigRecord } from '@/api/config'",
      "import { ingestBackendSkin } from '@/application/theme/adapters/backend-sync'",
      "import type { HermesSkin } from '@hermes/shared/skin'",
      "export { modePref } from '@/application/theme/adapters/preferences'",
      "const mod = await import('@/themes/context')",
      "const legacy = require('@/lib/storage')",
      "import { app } from 'electron'",
      "import { readFileSync } from 'node:fs'",
      "import '@/store/notifications'"
    ]

    for (const source of cases) {
      expect(boundaryViolations([{ path: 'probe.ts', source }]).map(violation => violation.detail)).toHaveLength(1)
    }

    // React, a third-party package and a sibling are what a leaf stands on.
    expect(boundaryViolations([{ path: 'probe.ts', source: "import { createContext } from 'react'" }])).toEqual([])
    expect(boundaryViolations([{ path: 'probe.ts', source: "import { mix } from './color'" }])).toEqual([])
    expect(boundaryViolations([{ path: 'probe.ts', source: "import { useStore } from '@nanostores/react'" }])).toEqual([])
    expect(boundaryViolations([{ path: 'probe.ts', source: "import { x } from 'nanostores'" }])).toEqual([])
    // A relative path that leaves the directory is not a sibling.
    expect(boundaryViolations([{ path: 'probe.ts', source: "import { x } from '../lib/storage'" }])).toHaveLength(1)
  })
})
