import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: `src/api/**` is a LEAF of the renderer.
//
// `api/` builds requests, sends them, parses responses and raises typed errors.
// It is the bottom of the front-end's own dependency order: the stores, the
// routes, the components, the themes, the i18n catalogs, the contribution
// registry and the `@/hermes` compatibility barrel all sit ABOVE it, and every
// one of them is free to import `api/`. None of them may be reachable back.
//
// The rule is checked twice, because one check is not enough:
//
//   1. DIRECT — no specifier under `api/` names an upper layer, however it is
//      written: static import, re-export, side-effect import, `import()`,
//      `require()`, or `vi.mock()`. A `vi.mock('@/store/…')` in an `api/` test
//      is the same tell as a runtime import: it means the module under test
//      reaches that store.
//   2. TRANSITIVE — walking the production import graph out of every `api/`
//      module must never arrive in an upper layer. A helper in `lib/` that
//      reaches a store makes `api/` reach the store too, and a scanner that
//      only reads the import statement in front of it would call that clean.
//
// The reverse controls at the bottom prove both checks can fail. A scanner
// that cannot fail is worth nothing.
//
// What may stay: `@/types/**` (protocol shapes with no imports of their own),
// `@hermes/shared` (the transport package, not the barrel), and any `lib/`
// helper that is itself a leaf. React and third-party packages are likewise
// fine — they are what a leaf stands on.
//
// Tests are modules here on purpose: unlike `themes/`, this scan keeps `*.test.*`
// files under `api/`, so a test that has to mock an upper layer fails the same
// way the mock's target would.

const API_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(API_DIR, '..')
/** This file names every forbidden specifier on purpose — it is not a module
 *  the app loads, and its fixtures are the point. */
const SELF = relative(SRC_DIR, fileURLToPath(import.meta.url))

/** Upper layers of the renderer, by directory under `src/`. */
const UPPER_ZONES = ['store', 'app', 'components', 'themes', 'i18n', 'extension/contrib'] as const

/** `src/hermes.ts` — the compatibility barrel over `api/**` itself. Nothing
 *  under `api/` may close the loop back through it. */
const BARREL = 'hermes.ts'

/** `application/` is the layer that composes `api/` with the stores; being
 *  above `api/`, it is off limits in the same direction. (The objective names
 *  this explicitly: an application use-case must never be routed back into the
 *  API layer through a compatibility shim.) */
const APPLICATION_ZONE = 'application'

const ZONES = [...UPPER_ZONES, APPLICATION_ZONE] as const

/** Every module specifier a file names — static imports and re-exports,
 *  side-effect imports, dynamic `import()`, `require()`, and the Vitest mock
 *  helpers that take a module id. */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*['"]([^'"]+)['"]/g
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
  /** Path relative to `src/`. */
  path: string
  source: string
}

export interface Violation {
  file: string
  detail: string
}

/** The upper layer a bare specifier names, or null when it names none. Matches
 *  both the directory (`@/store`) and anything under it (`@/store/session`). */
export function upperLayerOfSpecifier(specifier: string): string | null {
  if (specifier === '@/hermes' || specifier.startsWith('@/hermes/')) {
    return 'the @/hermes barrel'
  }

  for (const zone of ZONES) {
    if (specifier === `@/${zone}` || specifier.startsWith(`@/${zone}/`)) {
      return `@/${zone}`
    }
  }

  return null
}

/** The upper layer a `src/`-relative path sits in, or null. Catches the
 *  relative spelling (`../store/session`) that no alias prefix would. */
export function upperLayerOfPath(path: string): string | null {
  if (path === BARREL || path.startsWith('hermes/')) {
    return 'the @/hermes barrel'
  }

  for (const zone of ZONES) {
    if (path.startsWith(`${zone}/`)) {
      return `${zone}/`
    }
  }

  return null
}

/** Rule 1: the specifiers written under `api/` themselves. */
export function directViolations(modules: readonly Module[]): Violation[] {
  const violations: Violation[] = []

  for (const module of modules) {
    for (const specifier of importSpecifiers(module.source)) {
      const layer = upperLayerOfSpecifier(specifier)

      if (layer) {
        violations.push({ file: module.path, detail: `names ${layer} via ${specifier}` })
      }
    }
  }

  return violations
}

/** The one module allowed to name the preload REST bridge. */
const BRIDGE_OWNER = 'api/client.ts'

const REST_BRIDGE = /window\s*\.\s*hermesDesktop\s*\??\.\s*api\b/

/** Rule 3: the platform seam has ONE address. Every other module under `api/`
 *  goes through `requestHermesApi`/`hermesApi`, so a new helper cannot quietly
 *  grow a second, untagged door to the main process. */
export function bridgeViolations(modules: readonly Module[]): Violation[] {
  return modules
    .filter(module => module.path !== BRIDGE_OWNER && REST_BRIDGE.test(module.source))
    .map(module => ({ file: module.path, detail: 'names the preload REST bridge directly' }))
}

/** Resolve a specifier against the modules that exist in the graph. Aliases are
 *  `@/…`; anything else must be relative or it is an external package. */function resolveSpecifier(from: string, specifier: string, known: Set<string>): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC_DIR, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(SRC_DIR, dirname(from), specifier)
      : null

  if (!base) {
    return null
  }

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    const path = relative(SRC_DIR, candidate)

    if (known.has(path)) {
      return path
    }
  }

  return null
}

/** Rule 2: everything a module under `api/` can reach through this repo. */
export function closureViolations(apiModules: readonly Module[], graph: readonly Module[]): Violation[] {
  const known = new Set(graph.map(module => module.path))
  const edges = new Map<string, string[]>()

  for (const module of graph) {
    const targets = new Set<string>()

    for (const specifier of importSpecifiers(module.source)) {
      const target = resolveSpecifier(module.path, specifier, known)

      if (target && target !== module.path) {
        targets.add(target)
      }
    }

    edges.set(module.path, [...targets])
  }

  const violations: Violation[] = []

  for (const api of apiModules) {
    const via = new Map<string, string[]>([[api.path, [api.path]]])
    const queue = [api.path]

    while (queue.length) {
      const current = queue.shift() as string

      for (const next of edges.get(current) ?? []) {
        if (via.has(next)) {
          continue
        }

        const path = [...(via.get(current) as string[]), next]

        via.set(next, path)
        queue.push(next)
      }
    }

    for (const [reached, path] of via) {
      const layer = upperLayerOfPath(reached)

      if (layer) {
        violations.push({ file: api.path, detail: `reaches ${layer} through ${path.join(' -> ')}` })
      }
    }
  }

  return violations
}

/** Every `.ts`/`.tsx` under a directory, as `src/`-relative modules. */
function modulesUnder(dir: string): Module[] {
  const collect = (current: string): string[] =>
    readdirSync(current).flatMap(entry => {
      const full = join(current, entry)

      return statSync(full).isDirectory() ? collect(full) : /\.tsx?$/.test(entry) ? [full] : []
    })

  return collect(dir)
    .map(full => relative(SRC_DIR, full))
    .filter(path => path !== SELF)
    .map(path => ({ path, source: readFileSync(join(SRC_DIR, path), 'utf8') }))
}

const isProduction = (module: Module) => !/\.test\.tsx?$/.test(module.path)

describe('the api directory is a leaf', () => {
  const apiModules = modulesUnder(API_DIR)
  const apiProduction = apiModules.filter(isProduction)

  it('has modules to judge', () => {
    expect(apiProduction.length).toBeGreaterThan(8)
  })

  it('names no upper layer — however the import is written', () => {
    const violations = directViolations(apiModules)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('reaches no upper layer through the rest of the tree', () => {
    const violations = closureViolations(apiProduction, modulesUnder(SRC_DIR).filter(isProduction))

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('reaches the platform REST bridge from exactly one module', () => {
    const violations = bridgeViolations(apiModules)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('catches a second door onto the platform bridge', () => {
    const cases = [
      "const result = window.hermesDesktop.api({ path: '/api/cron' })",
      "return window.hermesDesktop?.api({ path })",
      'if (!window.hermesDesktop.api) throw new Error("bridge down")'
    ]

    for (const source of cases) {
      expect(bridgeViolations([{ path: 'api/probe.ts', source }])).toHaveLength(1)
    }

    // The bridge owner itself, and an api module that goes through the seam.
    expect(bridgeViolations([{ path: BRIDGE_OWNER, source: 'window.hermesDesktop.api(request)' }])).toEqual([])
    expect(
      bridgeViolations([{ path: 'api/probe.ts', source: 'return requestHermesApi({ path: "/api/cron" })' }])
    ).toEqual([])
  })

  it('catches an upper-layer import however it is written', () => {
    // Reverse control: the scanners above are worth nothing if they cannot fail.
    const cases = [
      "import { $activeSession } from '@/store/session'",
      "import type { SessionState } from '@/store/session'",
      "import '@/store/notifications'",
      "export { $activeSession } from '@/store/session'",
      "export * from '@/store/session'",
      "const { $activeSession } = await import('@/store/gateway')",
      "const legacy = require('@/store/session')",
      "vi.mock('@/store/transcript-tail', () => ({ recordTranscriptTail: vi.fn() }))",
      "vi.doMock('@/store/gateway')",
      "import { useStore } from '@/store'",
      "import { translate } from '@/i18n'",
      "import { registry } from '@/extension/contrib/registry'",
      "import { modePref } from '@/themes/context'",
      "import { ingestBackendSkin } from '@/application/theme/adapters/backend-sync'",
      "import { overlay } from '@/components/ui/dialog'",
      "import { getHermesConfigRecord } from '@/hermes'",
      "import { mcpOAuthRpc } from '@/application/mcp-oauth'"
    ]

    for (const source of cases) {
      expect(directViolations([{ path: 'api/probe.ts', source }]).map(violation => violation.detail)).toHaveLength(1)
    }

    // A sibling, a protocol type, the transport package and a leaf helper are
    // what this layer stands on.
    expect(directViolations([{ path: 'api/probe.ts', source: "import { hermesApi } from './client'" }])).toEqual([])
    expect(
      directViolations([{ path: 'api/probe.ts', source: "import type { SessionInfo } from '@/types/hermes'" }])
    ).toEqual([])
    expect(
      directViolations([{ path: 'api/probe.ts', source: "import { JsonRpcGatewayClient } from '@hermes/shared'" }])
    ).toEqual([])
    expect(
      directViolations([{ path: 'api/probe.ts', source: "import { isMissingRestEndpoint } from '@/lib/gateway-rpc'" }])
    ).toEqual([])
  })

  it('catches an upper layer reached through a helper module', () => {
    // Reverse control for the closure walk: none of these files name a store
    // from `api/`, but the edge is there all the same.
    const graph = [
      { path: 'api/probe.ts', source: "import { helper } from '../lib/helper'" },
      { path: 'lib/helper.ts', source: "import { $activeSession } from '../store/session'" },
      { path: 'store/session.ts', source: 'export const $activeSession = null' }
    ]

    expect(closureViolations([graph[0]], graph).map(violation => violation.detail)).toHaveLength(1)

    // …and the same walk through the barrel, spelled relatively.
    const barrelGraph = [
      { path: 'api/probe.ts', source: "import { getProfiles } from '../hermes'" },
      { path: 'hermes.ts', source: "export * from './api/profiles'" },
      { path: 'api/profiles.ts', source: '' }
    ]

    expect(closureViolations([barrelGraph[0]], barrelGraph).map(violation => violation.detail)).toHaveLength(1)

    // A helper chain that stays below `api/` is clean.
    const clean = [
      { path: 'api/probe.ts', source: "import { helper } from '../lib/helper'" },
      { path: 'lib/helper.ts', source: "import type { SessionInfo } from '../types/hermes'" },
      { path: 'types/hermes.ts', source: '' }
    ]

    expect(closureViolations([clean[0]], clean)).toEqual([])
  })
})
