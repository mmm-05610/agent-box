import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: THE SESSION VIEW STATE IS STATE, AND THE GATEWAY IS TRANSPORT.
//
// Two directions that used to be one cycle, and must stay two rules:
//
//   1. `store/session-states/**` holds session STATE — the per-runtime state
//      mirror, the tile registry, the owner ladder's ledger, the synchronous
//      transitions over them. It answers what a session's state is and who owns
//      it. It may NOT send a request: not to the gateway transport, not to the
//      API, not through an application use-case. Routing a session RPC to its
//      owner is `application/session/**`, which reads this store and talks to
//      the gateway.
//   2. `store/gateway/**` is a TRANSPORT: dialing, pooling, leases, reconnect,
//      event fan-in. It may not reach the session view store — not to
//      invalidate a tile binding and not to reconcile a busy claim. A pooled
//      socket reopen publishes a lifecycle fact
//      (`store/gateway/secondary-lifecycle.ts`) and the application reacts to
//      it (`application/gateway/reconnect-session-effects.ts`).
//
// Together those two edges were SCC-B: gateway → secondary-pool →
// session-states → session-state-registry → session-request-router → gateway.
// The reverse controls at the bottom prove the scanners can still fail.
//
// Type-only imports are judged by the DIRECT rule (a specifier that names a
// forbidden zone is a violation however it is written, because it is what puts
// the zone in this module's public type surface) but excluded from the
// TRANSITIVE walk: `import type` is erased, so it cannot create the runtime
// initialization cycle this walk exists to prevent. `store/session-states/**
// imports `@/types/session` for `ClientSessionState`, and `@/types/session` —
// which imports nothing but types itself — is only the first link of a chain
// that textually ends at `api/client.ts`; no runtime edge to the API exists,
// and the direct rule is what keeps it that way.

const STORE_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(STORE_DIR, '..')
/** This file names the forbidden specifiers on purpose — it is not a module the
 *  app loads, and its fixtures are the point. */
const SELF = relative(SRC_DIR, fileURLToPath(import.meta.url))

const SESSION_STATE_ENTRY = 'store/session-states.ts'
const SESSION_STATE_DIR = 'store/session-states/'
const GATEWAY_ENTRY = 'store/gateway.ts'
const GATEWAY_DIR = 'store/gateway/'
const OWNER_RESOLUTION = 'store/session-owner-resolution.ts'

/** Upper layers of the renderer plus the transport: what a store of session
 *  state may not reach, by directory under `src/`. */
const SESSION_STATE_FORBIDDEN = ['api/', 'application/', 'hermes.ts', 'hermes/', GATEWAY_ENTRY, GATEWAY_DIR] as const

/** The session view store: what the transport may not reach. */
const GATEWAY_FORBIDDEN = [SESSION_STATE_ENTRY, SESSION_STATE_DIR] as const

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

/** The specifiers that survive compilation. `import type { … }` / `export type
 *  { … }` statements are dropped whole, and a named import with every binding
 *  `type`-modified is dropped too — the compiler emits no edge for either. */
export function runtimeImportSpecifiers(source: string): string[] {
  const erased = source
    .replace(/\b(?:import|export)\s+type\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]/g, '')
    .replace(/(\{)([^}]*)(\}\s*from\s*['"][^'"]+['"])/g, (_match, open: string, body: string, close: string) => {
      const kept = body
        .split(',')
        .map(binding => binding.trim())
        .filter(Boolean)
        .filter(binding => !binding.startsWith('type '))

      return kept.length > 0 ? `${open}${kept.join(', ')}${close}` : ''
    })

  return importSpecifiers(erased)
}

export interface Module {
  /** Path relative to `src/`. */
  path: string
  source: string
}

export interface Violation {
  detail: string
  file: string
}

/** Resolve a specifier against the modules that exist in the graph. Aliases are
 *  `@/…`; anything else must be relative or it is an external package. */
export function resolveSpecifier(from: string, specifier: string, known: Set<string>): null | string {
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

/** The zone a `src/`-relative path sits in, or null. Compares PATHS, so the
 *  relative spelling (`../session-states`) is caught by the same rule as the
 *  alias one. */
export function forbiddenPath(path: string, forbidden: readonly string[]): null | string {
  for (const zone of forbidden) {
    if (zone.endsWith('/') ? path.startsWith(zone) || path === zone.slice(0, -1) : path === zone) {
      return zone
    }
  }

  return null
}

/** The forbidden thing a bare specifier names, or null. Matches both the zone
 *  (`@/api`) and anything under it (`@/api/sessions`). */
function forbiddenSpecifier(specifier: string, forbidden: readonly string[]): null | string {
  if (!specifier.startsWith('@/')) {
    return null
  }

  const named = forbidden.find(zone => {
    const stem = (zone.endsWith('/') ? zone.slice(0, -1) : zone).replace(/\.ts$/, '')

    return specifier === `@/${stem}` || specifier.startsWith(`@/${stem}/`)
  })

  return named ? `@/${named}` : null
}

/** Rule 1: what the pinned modules name themselves, in ANY import form. */
export function directViolations(modules: readonly Module[], forbidden: readonly string[]): Violation[] {
  const violations: Violation[] = []

  for (const module of modules) {
    for (const specifier of importSpecifiers(module.source)) {
      const named = forbiddenSpecifier(specifier, forbidden)

      if (named) {
        violations.push({ detail: `names ${named} via ${specifier}`, file: module.path })
      }
    }
  }

  return violations
}

/** Rule 2: what a pinned module can reach at RUNTIME — the graph that decides
 *  module initialization order, which is the cycle this boundary exists to
 *  keep out. */
export function closureViolations(
  pinned: readonly Module[],
  graph: readonly Module[],
  forbidden: readonly string[]
): Violation[] {
  const known = new Set(graph.map(module => module.path))
  const byPath = new Map(graph.map(module => [module.path, module]))
  const edges = new Map<string, string[]>()

  for (const module of graph) {
    const targets = new Set<string>()

    for (const specifier of runtimeImportSpecifiers(module.source)) {
      const target = resolveSpecifier(module.path, specifier, known)

      if (target && target !== module.path) {
        targets.add(target)
      }
    }

    edges.set(module.path, [...targets])
  }

  const violations: Violation[] = []

  for (const start of pinned) {
    const via = new Map<string, string[]>([[start.path, [start.path]]])
    const queue = [start.path]

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
      const zone = forbiddenPath(reached, forbidden)

      if (zone) {
        violations.push({ detail: `reaches ${zone} through ${path.join(' -> ')}`, file: start.path })

        continue
      }

      // A specifier the graph cannot resolve (a module the walk does not hold)
      // is still an edge when it names a forbidden zone.
      const owner = byPath.get(reached)

      for (const specifier of runtimeImportSpecifiers(owner?.source ?? '')) {
        if (resolveSpecifier(reached, specifier, known)) {
          continue
        }

        const named = forbiddenSpecifier(specifier, forbidden)

        if (named) {
          violations.push({ detail: `reaches ${named} through ${[...path, specifier].join(' -> ')}`, file: start.path })
        }
      }
    }
  }

  return violations
}

/** Every `.ts`/`.tsx` under `src/`, as `src/`-relative PRODUCTION modules. */
function productionModules(): Module[] {
  const collect = (current: string): string[] =>
    readdirSync(current).flatMap(entry => {
      const full = join(current, entry)

      return statSync(full).isDirectory() ? collect(full) : /\.tsx?$/.test(entry) ? [full] : []
    })

  return collect(SRC_DIR)
    .map(full => relative(SRC_DIR, full))
    .filter(path => path !== SELF && !/\.test\.tsx?$/.test(path))
    .map(path => ({ path, source: readFileSync(join(SRC_DIR, path), 'utf8') }))
}

function under(graph: readonly Module[], entry: string, dir: string): Module[] {
  return graph.filter(module => module.path === entry || module.path.startsWith(dir))
}

const graph = productionModules()

const inSessionStates = (path: string) => path === SESSION_STATE_ENTRY || path.startsWith(SESSION_STATE_DIR)
const inGateway = (path: string) => path === GATEWAY_ENTRY || path.startsWith(GATEWAY_DIR)

describe('the session view store sends nothing', () => {
  const pinned = under(graph, SESSION_STATE_ENTRY, SESSION_STATE_DIR)

  it('has the modules that carry the state to judge', () => {
    const paths = pinned.map(module => module.path)

    expect(paths).toContain(SESSION_STATE_ENTRY)
    expect(paths).toContain(`${SESSION_STATE_DIR}session-state-registry.ts`)
    expect(paths.length).toBeGreaterThanOrEqual(5)
  })

  it('names no API, application, transport or barrel module', () => {
    expect(directViolations(pinned, SESSION_STATE_FORBIDDEN).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })

  it('reaches none of them at runtime through the rest of the tree', () => {
    expect(closureViolations(pinned, graph, SESSION_STATE_FORBIDDEN).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })
})

describe('the gateway transport does not know session state', () => {
  const pinned = under(graph, GATEWAY_ENTRY, GATEWAY_DIR)

  it('has the transport modules to judge', () => {
    const paths = pinned.map(module => module.path)

    expect(paths).toContain(GATEWAY_ENTRY)
    expect(paths).toContain(`${GATEWAY_DIR}secondary-pool.ts`)
    expect(paths.length).toBeGreaterThanOrEqual(5)
  })

  it('names no session-state module', () => {
    expect(directViolations(pinned, GATEWAY_FORBIDDEN).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })

  it('reaches none of them at runtime through the rest of the tree', () => {
    expect(closureViolations(pinned, graph, GATEWAY_FORBIDDEN).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })
})

describe('fail-closed owner resolution stays a store query', () => {
  const pinned = graph.filter(module => module.path === OWNER_RESOLUTION)
  const forbidden = ['application/', 'hermes.ts', 'hermes/', GATEWAY_ENTRY, GATEWAY_DIR] as const

  it('exists to judge', () => {
    expect(pinned).toHaveLength(1)
  })

  it('names no transport or application module', () => {
    expect(directViolations(pinned, forbidden).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })

  it('reaches none of them at runtime', () => {
    expect(closureViolations(pinned, graph, forbidden).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })
})

// The two rules above are bans; these are the PERMISSIONS that make them
// livable. A boundary that also forbade the layer above from coordinating both
// sides would have no way to act on a reopen, and no way to route an RPC — the
// fix for SCC-B is the direction of the edges, not their absence.
describe('the application layer is where the two sides meet', () => {
  /** Does `from` reach `to` through the runtime graph? A permission is only
   *  real when the edge is actually there. */
  const reaches = (from: string, to: string): boolean => {
    const known = new Set(graph.map(module => module.path))
    const seen = new Set([from])
    const queue = [from]

    while (queue.length) {
      const current = queue.shift() as string
      const owner = graph.find(module => module.path === current)

      for (const specifier of runtimeImportSpecifiers(owner?.source ?? '')) {
        const target = resolveSpecifier(current, specifier, known)

        if (target && !seen.has(target)) {
          seen.add(target)
          queue.push(target)
        }
      }
    }

    return seen.has(to)
  }

  const imports = (path: string, prefix: string, label: string): void => {
    const module = graph.find(candidate => candidate.path === path)

    expect(module, `${label} (${path}) should exist`).toBeDefined()
    expect(
      runtimeImportSpecifiers(module?.source ?? '').filter(specifier => specifier.startsWith(prefix)),
      `${path} should import ${prefix}`
    ).not.toEqual([])
  }

  it('lets application/gateway consume the lifecycle port AND the session effects', () => {
    const effects = 'application/gateway/reconnect-session-effects.ts'

    // It installs into the port the transport publishes …
    imports(effects, '@/store/gateway', 'the reconnect effects module')
    // … and makes session state react to the fact.
    imports(effects, '@/store/session-states', 'the reconnect effects module')
    expect(reaches(effects, GATEWAY_ENTRY)).toBe(true)
    expect(reaches(effects, SESSION_STATE_ENTRY)).toBe(true)
  })

  it('lets application/session route through the gateway and read session state', () => {
    const router = 'application/session/request-router.ts'
    const owned = 'application/session/request-owned-session.ts'

    imports(router, '@/store/gateway', 'the routing use-case')
    imports(owned, '@/store/session-states', 'the owned-session entry point')
    expect(reaches(owned, router)).toBe(true)
    expect(reaches(router, GATEWAY_ENTRY)).toBe(true)
  })
})

describe('the two store facades re-export nothing from above', () => {
  // `application/` only. The gateway facade DOES legitimately reach `@/hermes`
  // and the API modules — it is the RPC client — and the session-state facade's
  // own rule above is already stricter. What neither facade may ever carry is an
  // application USE-CASE: that is the edge that would hand every consumer of the
  // store the orchestration, and through it the transport, back.
  const forbidden = ['application/'] as const
  const facades = graph.filter(module => module.path === GATEWAY_ENTRY || module.path === SESSION_STATE_ENTRY)

  it('has both facades to judge', () => {
    expect(facades.map(module => module.path).sort()).toEqual([GATEWAY_ENTRY, SESSION_STATE_ENTRY].sort())
  })

  it('names no application use-case', () => {
    expect(directViolations(facades, forbidden).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })

  it('reaches none of them at runtime through the rest of the tree', () => {
    expect(closureViolations(facades, graph, forbidden).map(v => `${v.file} ${v.detail}`)).toEqual([])
  })

  it('keeps each facade to its own directory', () => {
    // The entry is a stable import path over ITS OWN leaf, not a second place
    // where the store's capability set is decided. A session RPC use-case
    // re-exported here would hand every session-state consumer the transport
    // back — the SCC-B edge, one re-export away.
    for (const facade of facades) {
      const own = facade.path === GATEWAY_ENTRY ? './gateway/' : './session-states/'
      const foreign = runtimeImportSpecifiers(facade.source).filter(specifier => !specifier.startsWith(own))

      expect(foreign.map(specifier => `${facade.path} -> ${specifier}`)).toEqual([])
    }
  })
})

describe('the scanners can fail', () => {
  const forbidden = SESSION_STATE_FORBIDDEN

  it('catches a forbidden direct import however it is written', () => {
    const cases = [
      "import { requestForOwnedSession } from '@/application/session/request-owned-session'",
      "import type { SessionOwnerRoute } from '@/application/session/request-router'",
      "export { requestGatewayForAgent } from '@/store/gateway'",
      "export * from '@/api/sessions'",
      "const { markSessionUnread } = await import('@/application/session-read-state')",
      "const remote = require('@/api/sessions')",
      "vi.mock('@/store/gateway', () => ({ requestGatewayForProfile: vi.fn() }))",
      "import { HermesGateway } from '@/hermes'"
    ]

    for (const source of cases) {
      expect(directViolations([{ path: SESSION_STATE_ENTRY, source }], forbidden)).toHaveLength(1)
    }

    // What a state store legitimately stands on: its own submodules, the shape
    // leaf, protocol types, pure helpers and the UI primitives it renders into.
    const allowed = [
      "import type { ClientSessionState } from '@/types/session'",
      "import { atom } from 'nanostores'",
      "import { normalizeProfileKey } from '@/lib/profile-identity'",
      "import type { SessionOwnerRoute } from '../session/types'",
      "import { readJson } from '@/lib/storage'",
      "import { sharedRemote } from '@hermes/shared'"
    ]

    for (const source of allowed) {
      expect(directViolations([{ path: SESSION_STATE_ENTRY, source }], forbidden)).toEqual([])
    }
  })

  it('catches the relative spelling through the path rule', () => {
    // `../gateway` names no alias, so only the resolved PATH can judge it —
    // which is why the closure walk exists next to the specifier scan.
    const graph: Module[] = [
      { path: SESSION_STATE_ENTRY, source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { requestGatewayForAgent } from '../gateway'" },
      { path: 'store/gateway.ts', source: '' }
    ]

    expect(forbiddenPath('store/gateway.ts', forbidden)).toBe(GATEWAY_ENTRY)
    expect(closureViolations([graph[0]], graph, forbidden).map(v => v.detail)).toHaveLength(1)
    expect(closureViolations([graph[0]], graph, forbidden)[0].detail).toContain('store/gateway.ts')
  })

  it('catches a forbidden module reached through a helper chain', () => {
    const graph: Module[] = [
      { path: SESSION_STATE_ENTRY, source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { requestForOwnedSession } from '@/store/gateway'" },
      { path: 'store/gateway.ts', source: '' }
    ]

    expect(closureViolations([graph[0]], graph, forbidden).map(v => v.detail)).toHaveLength(1)

    // …and through a module the walk cannot resolve, which is judged by its own
    // specifier rather than by a path.
    const unresolvable: Module[] = [
      { path: SESSION_STATE_ENTRY, source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import { x } from '@/application/session-read-state'" }
    ]

    expect(closureViolations([unresolvable[0]], unresolvable, forbidden).map(v => v.detail)).toHaveLength(1)
    expect(closureViolations([unresolvable[0]], unresolvable, forbidden)[0].detail).toContain('@/application')

    // A chain that stays inside the store, the shape leaf and pure helpers is clean.
    const clean: Module[] = [
      { path: SESSION_STATE_ENTRY, source: "import { helper } from './session-states/helper'" },
      { path: 'store/session-states/helper.ts', source: "import type { SessionInfo } from '@/types/hermes'" },
      { path: 'types/hermes.ts', source: '' }
    ]

    expect(closureViolations([clean[0]], clean, forbidden)).toEqual([])
  })

  it('judges a type-only import by the direct rule but not by the runtime walk', () => {
    const modules: Module[] = [
      { path: SESSION_STATE_ENTRY, source: "import type { HermesGateway } from '@/hermes'" }
    ]

    // Naming the transport in the store's own type surface is the violation the
    // direct rule exists for …
    expect(directViolations(modules, forbidden)).toHaveLength(1)

    // … and it is not a runtime edge, so it cannot form the cycle the walk hunts.
    expect(closureViolations(modules, modules, forbidden)).toEqual([])

    // An inline type modifier erases the same way; a mixed import does not.
    expect(runtimeImportSpecifiers("import { type HermesGateway } from '@/hermes'")).toEqual([])
    expect(runtimeImportSpecifiers("import { type HermesGateway, $gateway } from '@/hermes'")).toEqual(['@/hermes'])
  })

  it('catches a session-state module reached from the gateway', () => {
    const graph: Module[] = [
      { path: GATEWAY_ENTRY, source: "import { helper } from './gateway/helper'" },
      { path: 'store/gateway/helper.ts', source: "await import('@/store/session-states')" }
    ]

    expect(closureViolations([graph[0]], graph, GATEWAY_FORBIDDEN).map(v => v.detail)).toHaveLength(1)
    expect(directViolations([graph[1]], GATEWAY_FORBIDDEN)).toHaveLength(1)
    expect(forbiddenPath('store/session-states/tile-rebinding.ts', GATEWAY_FORBIDDEN)).toBe(SESSION_STATE_DIR)
    expect(forbiddenPath('store/session-states.ts', GATEWAY_FORBIDDEN)).toBe(SESSION_STATE_ENTRY)
    expect(forbiddenPath('store/session.ts', GATEWAY_FORBIDDEN)).toBeNull()
  })
})
