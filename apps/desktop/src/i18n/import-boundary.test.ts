import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: `src/i18n/**` is a coordinated LEAF. The catalog, the locale
// messages, the language metadata and the translate runtime may depend on
// their own relative modules, React, third-party packages, and nothing else.
//
// Hermes config, the gateway, Settings, the theme, the stores and the shared
// lib helpers all sit ABOVE i18n and reach DOWN into it. An edge the other way
// is what welded the catalog into the app's largest import cycle: every
// `@/i18n` consumer pulled in Settings, which pulled in the theme store, which
// pulled the notifications store back into the i18n barrel.
//
// Both journeys that used to justify the reverse edges are now coordinated
// from outside this directory:
//   - persisting `display.language` is a `LocalePreferencePort` the composition
//     root injects (`src/application/hermes-locale-preference.ts`);
//   - Settings field copy is authored here and CONSUMED by Settings
//     (`src/app/settings/constants.ts`, `config-field.tsx`, `settings-search.ts`).
const I18N_DIR = dirname(fileURLToPath(import.meta.url))
// The scanner's own ban list contains the banned specifiers as data, so it
// cannot be one of the files it judges.
const SELF = fileURLToPath(import.meta.url)

const FORBIDDEN_ROOTS = ['@/hermes', '@/api', '@/app', '@/store', '@/themes', '@/components', '@/lib'] as const

/** Every module specifier a TypeScript/TSX source pulls in — static imports
 *  and re-exports, side-effect imports, dynamic `import()`, `require()`, and
 *  the vitest module hooks that load a module for a test. */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bvi\s*\.\s*(?:doMock|importActual|importMock|mock|unmock)\s*\(\s*['"]([^'"]+)['"]/g
  ]

  const found: string[] = []

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      found.push(match[1])
    }
  }

  return found
}

export function isForbiddenSpecifier(specifier: string): boolean {
  return FORBIDDEN_ROOTS.some(root => specifier === root || specifier.startsWith(`${root}/`))
}

export interface BoundaryViolation {
  file: string
  specifier: string
}

export function boundaryViolations(files: Array<{ path: string; source: string }>): BoundaryViolation[] {
  const violations: BoundaryViolation[] = []

  for (const file of files) {
    for (const specifier of importSpecifiers(file.source)) {
      if (isForbiddenSpecifier(specifier)) {
        violations.push({ file: file.path, specifier })
      }
    }
  }

  return violations
}

function i18nSources(): Array<{ path: string; source: string }> {
  const collect = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry)

      if (statSync(full).isDirectory()) {
        return collect(full)
      }

      return /\.tsx?$/.test(entry) && full !== SELF ? [full] : []
    })

  return collect(I18N_DIR).map(path => ({ path: relative(I18N_DIR, path), source: readFileSync(path, 'utf8') }))
}

describe('the i18n directory is a leaf', () => {
  it('imports no product module — only its own files, React and third parties', () => {
    const violations = boundaryViolations(i18nSources())

    expect(violations.map(v => `${v.file} imports ${v.specifier}`)).toEqual([])
  })

  it('catches a forbidden import however it is written', () => {
    // Reverse control: the scanner above is worth nothing if it cannot fail.
    const cases = [
      "import { getHermesConfigRecord } from '@/hermes'",
      "import { FIELD_LABELS } from '@/app/settings/constants'",
      "export { defineFieldCopy } from '@/app/settings/field-copy'",
      "import type { TipId } from '@/lib/tips/catalog'",
      "import '@/store/notifications'",
      "const mod = await import('@/themes/context')",
      "vi.mock('@/api/gateway', () => ({}))"
    ]

    for (const source of cases) {
      expect(boundaryViolations([{ path: 'i18n/probe.ts', source }])).toHaveLength(1)
    }

    // A sibling root that merely shares a prefix is not a violation, and a
    // relative import never is.
    expect(boundaryViolations([{ path: 'i18n/probe.ts', source: "import { x } from '@/library' " }])).toEqual([])
    expect(boundaryViolations([{ path: 'i18n/probe.ts', source: "import { x } from './catalog'" }])).toEqual([])
  })
})
