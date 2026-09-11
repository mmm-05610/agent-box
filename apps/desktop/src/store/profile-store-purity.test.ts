import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: THE PROFILE STORE IS A STORE.
//
// `store/profile.ts` and `store/profile/**` hold profile STATE — atoms, the
// types they carry, pure transforms, synchronous setters, and the rail's
// local-only preferences (each of which persists in the module that owns it).
// They do not fetch a catalog, do not dial a gateway, do not create a session,
// and do not know that a React component exists. Those use-cases live in
// `application/profile/**` and are imported by the call site that needs them.
//
// The dependency order that makes that real:
//
//     UI / application  ->  store
//     UI / application  ->  api
//     store             ->  nothing above it
//
// Two ways to lose that, both checked here:
//
//  1. A leaf that reaches UP — `@/api`, `@/application`, `@/app`,
//     `@/components`, the `@/hermes` barrel, or the gateway runtime. This is
//     what put the profile store inside SCC-B: `store/profile.ts → store/gateway
//     → store/gateway/secondary-pool → store/session-states →
//     store/session-states/tile-operations → store/profile.ts`.
//  2. A low-level consumer that reaches the AGGREGATE instead of the leaf it
//     needs, which puts the whole profile surface (and anything the aggregate
//     grows) back into that consumer's closure. `store/session-states` needs
//     `normalizeProfileKey` and nothing else — it takes `profile/identity`.
//
// The reverse controls at the bottom prove the scanners can fail. A scanner
// that cannot fail is worth nothing.

const STORE_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(STORE_DIR, '..')
/** This file names the forbidden specifiers on purpose — it is not a module the
 *  app loads, and its fixtures are the point. */
const SELF = relative(SRC_DIR, fileURLToPath(import.meta.url))

/** The store's public entry and the leaf directory under it. */
const ENTRY = 'store/profile.ts'
const LEAF_DIR = 'store/profile/'

/** Upper layers of the renderer, by directory under `src/`. */
const FORBIDDEN_ZONES = ['api', 'application', 'app', 'components', 'themes', 'theme-composition'] as const

/** Store modules a leaf may not reach: the gateway runtime and the session
 *  store's state both route BACK into the profile leaves, so a leaf that
 *  imported them would close a cycle instead of a dependency. */
const FORBIDDEN_STORE = ['@/store/gateway', '@/store/session'] as const

/** `src/hermes.ts` — the compatibility barrel over `api/**`. */
const BARREL = 'hermes.ts'

/** Product modules that are not a zone but are just as forbidden to a leaf:
 *  `@/global` declares the Electron bridge the renderer talks to. */
const FORBIDDEN_MODULES = ['@/global'] as const

/** The ONE shape a leaf may take from the session store: the owner route TYPE.
 *  A draft's owner IS the session-scoped route (one shape, not two), and
 *  `store/session/types.ts` stands on `@/types/**` alone — it is not session
 *  application. Nothing else under `store/session/` is allowed. */
const SHARED_TYPES = '@/store/session/types'

/** Low-level consumers that must take the leaf, not the aggregate: the modules
 *  whose imports of the profile store closed (or would close) SCC-B. */
const PINNED = [
  'store/session-states.ts',
  'store/session-states/bot-chat-scope.ts',
  'store/session-states/owner-holds.ts',
  'store/session-states/session-state-registry.ts',
  'store/session-states/state-projections.ts',
  'store/session-states/tile-operations.ts',
  'store/session-states/tile-rebinding.ts',
  'store/session-owner-resolution.ts',
  'store/session-pin-sync.ts',
  'store/session-unread.ts',
  'store/windows.ts'
] as const

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

const isLeaf = (path: string) => path.startsWith(LEAF_DIR)

/** What an upward specifier names, or null when a leaf may use it. */
export function forbiddenSpecifier(specifier: string): string | null {
  if (specifier === SHARED_TYPES) {
    return null
  }

  if (specifier === '@/hermes' || specifier.startsWith('@/hermes/')) {
    return 'the @/hermes barrel'
  }

  for (const zone of FORBIDDEN_ZONES) {
    if (specifier === `@/${zone}` || specifier.startsWith(`@/${zone}/`)) {
      return `@/${zone}`
    }
  }

  for (const store of FORBIDDEN_STORE) {
    if (specifier === store || specifier.startsWith(`${store}/`)) {
      return store
    }
  }

  for (const module of FORBIDDEN_MODULES) {
    if (specifier === module || specifier.startsWith(`${module}/`)) {
      return module
    }
  }

  return null
}

/** The forbidden zone a `src/`-relative path sits in, or null. Catches the
 *  relative spelling (`../application/session-lists`) no alias prefix would. */
export function forbiddenPath(path: string): string | null {
  if (path === BARREL || path.startsWith('hermes/')) {
    return 'the @/hermes barrel'
  }

  if (path === 'store/session/types.ts') {
    return null
  }

  for (const zone of FORBIDDEN_ZONES) {
    if (path.startsWith(`${zone}/`) || path === `${zone}.ts`) {
      return `${zone}/`
    }
  }

  for (const store of FORBIDDEN_STORE) {
    const bare = store.replace('@/', '')

    if (path === bare || path === `${bare}.ts` || path.startsWith(`${bare}/`)) {
      return store
    }
  }

  for (const module of FORBIDDEN_MODULES) {
    const bare = module.replace('@/', '')

    if (path === bare || path === `${bare}.ts`) {
      return module
    }
  }

  return null
}

/** Rule 1: what the profile store names itself. */
export function directViolations(modules: readonly Module[]): Violation[] {
  const violations: Violation[] = []

  for (const module of modules) {
    for (const specifier of importSpecifiers(module.source)) {
      const forbidden = forbiddenSpecifier(specifier)

      if (forbidden) {
        violations.push({ file: module.path, detail: `names ${forbidden} via ${specifier}` })
      }
    }
  }

  return violations
}

/** Everything `start` can reach through `graph`, with the path that got there. */
function reachable(start: string, edges: Map<string, string[]>): Map<string, string[]> {
  const via = new Map<string, string[]>([[start, [start]]])
  const queue = [start]

  while (queue.length) {
    const current = queue.shift() as string

    for (const next of edges.get(current) ?? []) {
      if (via.has(next)) {
        continue
      }

      via.set(next, [...(via.get(current) as string[]), next])
      queue.push(next)
    }
  }

  return via
}

function buildEdges(graph: readonly Module[]): { edges: Map<string, string[]>; known: Set<string> } {
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

  return { edges, known }
}

/** Rule 2: a leaf's own closure stays inside the store — no request layer, no
 *  gateway, no session state, no React, no barrel, however many hops away. */
export function leafClosureViolations(leaves: readonly Module[], graph: readonly Module[]): Violation[] {
  const { edges, known } = buildEdges(graph)
  const violations: Violation[] = []

  for (const start of leaves) {
    for (const [path, via] of reachable(start.path, edges)) {
      const zone = forbiddenPath(path)

      if (zone) {
        violations.push({ file: start.path, detail: `reaches ${zone} through ${via.join(' -> ')}` })

        continue
      }

      // A specifier that resolves to a module in the graph is judged by the
      // path check above; what needs judging here is the edge the scan cannot
      // map — a zone file this graph does not hold.
      const owner = graph.find(module => module.path === path)

      for (const specifier of importSpecifiers(owner?.source ?? '')) {
        if (resolveSpecifier(path, specifier, known)) {
          continue
        }

        const forbidden = forbiddenSpecifier(specifier)

        if (forbidden) {
          violations.push({ file: start.path, detail: `reaches ${forbidden} through ${[...via, specifier].join(' -> ')}` })
        }
      }
    }
  }

  return violations
}

/** Rule 3: a low-level consumer must not reach the profile AGGREGATE. Taking
 *  the leaf it needs keeps the rest of the profile surface — and anything the
 *  entry grows — out of its closure (and, when it is store state, out of its
 *  cycle). What such a consumer reaches on its OWN account (the gateway's API
 *  client, say) is not this file's business. */
export function aggregateViolations(consumers: readonly Module[], graph: readonly Module[]): Violation[] {
  const { edges } = buildEdges(graph)

  return consumers.flatMap(start =>
    [...reachable(start.path, edges)]
      .filter(([path]) => path === ENTRY)
      .map(([, via]) => ({ file: start.path, detail: `reaches the profile entry through ${via.join(' -> ')}` }))
  )
}

function resolveSpecifier(from: string, specifier: string, known: Set<string>): string | null {
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

describe('the profile store reaches nothing above itself', () => {
  const production = modulesUnder(SRC_DIR).filter(isProduction)
  const storeModules = production.filter(module => module.path === ENTRY || isLeaf(module.path))
  const pinned = production.filter(module => (PINNED as readonly string[]).includes(module.path))

  it('has the entry and its leaves to judge', () => {
    expect(storeModules.map(module => module.path).sort()).toEqual([
      'store/profile.ts',
      'store/profile/appearance-preferences.ts',
      'store/profile/catalog-state.ts',
      'store/profile/identity.ts',
      'store/profile/new-chat-state.ts',
      'store/profile/request-atoms.ts',
      'store/profile/runtime-route-state.ts',
      'store/profile/sidebar-scope.ts'
    ])
  })

  it('names no API, application, app, component, theme, barrel or gateway module', () => {
    const violations = directViolations(storeModules)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('keeps its own closure inside the store', () => {
    const violations = leafClosureViolations(
      storeModules.filter(module => module.path !== ENTRY),
      production
    )

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('has every pinned low-level consumer present', () => {
    expect(pinned.map(module => module.path).sort()).toEqual([...PINNED].sort())
  })

  it('leaves the aggregate to the UI: a low-level consumer takes the leaf', () => {
    const violations = aggregateViolations(pinned, production)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('catches a forbidden import however it is written', () => {
    // Reverse control: the scanners above are worth nothing if they cannot fail.
    const leaf = { path: 'store/profile/catalog-state.ts', source: '' }

    const cases = [
      "import { getProfiles } from '@/hermes'",
      "import { refreshProfiles } from '@/application/profile/catalog'",
      "import { ensureGatewayProfile } from '@/application/profile/runtime-selection'",
      "import { $gateway } from '@/store/gateway'",
      "import { $connection } from '@/store/session'",
      "import { Button } from '@/components/ui/button'",
      "import { paintStoredAppearance } from '@/theme-composition/boot'",
      "import { resolveAppearance } from '@/themes/appearance'",
      "import type { HermesConnection } from '@/global'",
      "export { markSessionUnread } from '@/application/session-read-state'",
      "const mod = await import('@/store/gateway')",
      "const legacy = require('@/hermes')",
      "vi.mock('@/application/profile/catalog', () => ({}))"
    ]

    for (const source of cases) {
      expect(
        directViolations([{ ...leaf, source }]).map(violation => violation.detail),
        source
      ).toHaveLength(1)
    }

    // What a leaf legitimately stands on: its sibling leaves, the pure storage
    // helper, the payload types, the shared owner-route shape, and nanostores.
    const allowed = [
      "import { atom } from 'nanostores'",
      "import { storedStringArray } from '@/lib/storage'",
      "import type { ProfileInfo } from '@/types/hermes'",
      "import type { SessionOwnerRoute } from '@/store/session/types'",
      "import { normalizeProfileKey } from './identity'",
      "import { $activeGatewayProfile } from './runtime-route-state'"
    ]

    for (const source of allowed) {
      expect(directViolations([{ ...leaf, source }]), source).toEqual([])
    }
  })

  it('catches a low-level consumer that reaches the aggregate instead of a leaf', () => {
    // Reverse control for the aggregate walk: the pinned module names a sibling,
    // and the sibling takes the aggregate — the edge is there all the same.
    const graph = [
      { path: PINNED[0], source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { $profiles } from '@/store/profile'" },
      { path: ENTRY, source: '' }
    ]

    expect(aggregateViolations([graph[0]], graph).map(v => v.detail)).toHaveLength(1)

    // …and the same walk when the aggregate is reached by relative spelling.
    const relative = [
      { path: PINNED[0], source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { normalizeProfileKey } from '../profile'" },
      { path: ENTRY, source: '' }
    ]

    expect(aggregateViolations([relative[0]], relative).map(v => v.detail)).toHaveLength(1)

    // A chain that stays on the leaf is exactly what the split is for.
    const clean = [
      { path: PINNED[0], source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { normalizeProfileKey } from '@/store/profile/identity'" },
      { path: 'store/profile/identity.ts', source: "import type { ProfileInfo } from '@/types/hermes'" },
      { path: 'types/hermes.ts', source: '' }
    ]

    expect(aggregateViolations([clean[0]], clean)).toEqual([])
  })

  it('catches a leaf that reaches up through a helper', () => {
    // Reverse control for the leaf walk: the leaf names only a sibling, and the
    // sibling reaches the gateway — two hops, same violation.
    const upward = [
      { path: 'store/profile/helper.ts', source: "import { helper } from './helper2'" },
      { path: 'store/profile/helper2.ts', source: "import { $gateway } from '@/store/gateway'" },
      { path: 'store/gateway.ts', source: '' }
    ]

    expect(leafClosureViolations([upward[0]], upward).map(v => v.detail)).toHaveLength(1)

    // …and when the far hop is unreadable (a zone file the graph does not hold),
    // the specifier itself is still judged.
    const unmapped = [
      { path: 'store/profile/helper.ts', source: "import { helper } from './helper2'" },
      { path: 'store/profile/helper2.ts', source: "import { requestGateway } from '@/api/gateway'" }
    ]

    expect(leafClosureViolations([unmapped[0]], unmapped).map(v => v.detail)).toHaveLength(1)
    expect(leafClosureViolations([unmapped[0]], unmapped)[0].detail).toContain('@/api')

    // A chain of leaves, pure helpers and payload types is clean.
    const clean = [
      { path: 'store/profile/sidebar-scope.ts', source: "import { $activeGatewayProfile } from './runtime-route-state'" },
      { path: 'store/profile/runtime-route-state.ts', source: "import { atom } from 'nanostores'" },
      { path: 'store/profile/identity.ts', source: "import { storedBoolean } from '@/lib/storage'" },
      { path: 'lib/storage.ts', source: '' }
    ]

    expect(leafClosureViolations([clean[0]], clean)).toEqual([])
  })
})
