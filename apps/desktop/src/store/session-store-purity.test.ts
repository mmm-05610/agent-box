import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Contract: THE SESSION STORE IS A STORE.
//
// `store/session.ts` and `store/session/**` hold session STATE: atoms, the
// synchronous transitions over them, and the invariants those atoms keep. They
// do not send requests, do not roll back failures on the wire, and do not
// orchestrate opening a session — a request/rollback/use-case lives in
// `application/` (or `api/` + `application/`), and the UI calls it.
//
// The dependency order that makes that real:
//
//     UI / application  ->  store
//     UI / application  ->  api
//     store             ->  nothing above it
//
// So a module under `store/session*` may never reach `@/api`, `@/application`,
// `@/app` or `@/components` — directly, or through any
// chain of helpers. The rule is checked twice for the same reason the api leaf
// is: a direct read of the import statement in front of you misses the helper
// that reaches a store/API two hops away, and the `from '…'` form is not the
// only way to write an edge (`import()`, `require()`, `vi.mock()` all count —
// a dynamic import that hides the cycle is the same violation as a static one).
//
// `store/session-unread-remote.ts` is named explicitly: it was the mix of store
// state and remote read-state workflow that closed the Session ↔ Unread cycle,
// and it is deleted. Nothing may depend on it again — not even through a
// re-created forwarding shim at that path.
//
// The reverse controls at the bottom prove the scanners can fail. A scanner
// that cannot fail is worth nothing.

const STORE_DIR = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(STORE_DIR, '..')
/** This file names every forbidden specifier on purpose — it is not a module
 *  the app loads, and its fixtures are the point. */
const SELF = relative(SRC_DIR, fileURLToPath(import.meta.url))

/** The session store's public entry point and the two modules it is built from
 *  that a renderer surface must be able to import without dragging in the API. */
const PINNED = ['store/session.ts', 'store/session/atoms.ts', 'store/session/unread.ts'] as const

/** Upper layers of the renderer, by directory under `src/`. */
const FORBIDDEN_ZONES = ['api', 'application', 'app', 'components'] as const

/** The deleted mixed-responsibility module: neither the file nor an import of
 *  it may come back. */
const DELETED = 'store/session-unread-remote.ts'

const DELETED_NAME = 'session-unread-remote'

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

/** The forbidden thing a bare specifier names, or null when it names none.
 *  Matches both the zone (`@/api`) and anything under it (`@/api/sessions`),
 *  plus the relative spelling of the deleted module. */
export function forbiddenSpecifier(specifier: string): string | null {
  if (specifier.includes(DELETED_NAME)) {
    return DELETED
  }

  for (const zone of FORBIDDEN_ZONES) {
    if (specifier === `@/${zone}` || specifier.startsWith(`@/${zone}/`)) {
      return `@/${zone}`
    }
  }

  return null
}

/** The forbidden zone a `src/`-relative path sits in, or null. Catches the
 *  relative spelling (`../api/sessions`) that no alias prefix would. */
export function forbiddenPath(path: string): string | null {
  if (path === DELETED) {
    return DELETED
  }

  for (const zone of FORBIDDEN_ZONES) {
    if (path.startsWith(`${zone}/`)) {
      return `${zone}/`
    }
  }

  return null
}

/** Rule 1: the specifiers the pinned modules write themselves. */
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

/** Resolve a specifier against the modules that exist in the graph. Aliases are
 *  `@/…`; anything else must be relative or it is an external package. */
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

/** Rule 2: everything a pinned module can reach through this repo. A module
 *  that stays out of the forbidden zones but IMPORTS one of them is the
 *  violation, because the pinned module inherits its edge. */
export function closureViolations(pinned: readonly Module[], graph: readonly Module[]): Violation[] {
  const known = new Set(graph.map(module => module.path))
  const byPath = new Map(graph.map(module => [module.path, module]))
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
      const zone = forbiddenPath(reached)

      if (zone) {
        violations.push({ file: start.path, detail: `reaches ${zone} through ${path.join(' -> ')}` })

        continue
      }

      const owner = byPath.get(reached)

      for (const specifier of importSpecifiers(owner?.source ?? '')) {
        // A specifier that resolves to a module in the graph is already judged
        // by the path check above; what needs judging HERE is the edge the scan
        // cannot map — an import of the DELETED module, which no longer
        // resolves to anything, or of a zone file the graph does not hold.
        if (resolveSpecifier(reached, specifier, known)) {
          continue
        }

        const forbidden = forbiddenSpecifier(specifier)

        if (forbidden) {
          violations.push({
            file: start.path,
            detail: `reaches ${forbidden} through ${[...path, specifier].join(' -> ')}`
          })
        }
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

describe('the session store reaches nothing above itself', () => {
  const production = modulesUnder(SRC_DIR).filter(isProduction)
  const pinned = production.filter(module => (PINNED as readonly string[]).includes(module.path))

  it('has every pinned module to judge', () => {
    expect(pinned.map(module => module.path).sort()).toEqual([...PINNED].sort())
  })

  it('names no API, application, app, component or barrel module', () => {
    const violations = directViolations(pinned)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('reaches none of them through the rest of the tree', () => {
    const violations = closureViolations(pinned, production)

    expect(violations.map(violation => `${violation.file} ${violation.detail}`)).toEqual([])
  })

  it('has no mixed-responsibility unread module left to import', () => {
    expect(existsSync(join(SRC_DIR, DELETED))).toBe(false)
    expect(production.filter(module => module.path.includes(DELETED_NAME))).toEqual([])
  })

  it('catches a forbidden import however it is written', () => {
    // Reverse control: the scanners above are worth nothing if they cannot fail.
    const cases = [
      "import { setSessionUnreadRemote } from '@/api/sessions'",
      "import { markSessionUnread } from '@/application/session-read-state'",
      "import type { ContextSuggestion } from '@/app/shell/chrome/statusbar/statusbar-controls'",
      "import { Button } from '@/components/ui/button'",
      "import { getHermesConfigRecord } from '@/api/config'",
      "import { clearUnreadOnOpen } from '../session-unread-remote'",
      "export { markSessionUnread } from '@/application/session-read-state'",
      "export * from '@/api/sessions'",
      "const { markSessionUnread } = await import('@/application/session-read-state')",
      "const remote = require('@/api/sessions')",
      "vi.mock('@/api/sessions', () => ({ setSessionUnreadRemote: vi.fn() }))"
    ]

    for (const source of cases) {
      expect(directViolations([{ path: 'store/session/atoms.ts', source }]).map(v => v.detail)).toHaveLength(1)
    }

    // What a store legitimately stands on: its own submodules, protocol types,
    // pure helpers and the transport package.
    const allowed = [
      "import { $sessions } from './session'",
      "import type { SessionInfo } from '@/types/hermes'",
      "import type { ContextSuggestion } from '@/types/context-suggestion'",
      "import { lastVisibleMessageIsUser } from '@/lib/message-tail'",
      "import type { ChatMessage } from '@/lib/chat-messages/types'",
      "import type { SessionOwnerRoute } from './types'",
      "import { atom } from 'nanostores'",
      "import type { ConnectionState } from '@hermes/shared'"
    ]

    for (const source of allowed) {
      expect(directViolations([{ path: 'store/session/unread.ts', source }])).toEqual([])
    }
  })

  it('catches a forbidden module reached through a helper chain', () => {
    // Reverse control for the closure walk: the pinned module names only a
    // sibling here, but the edge is there all the same.
    const graph = [
      { path: 'store/session/unread.ts', source: "import { helper } from './helper'" },
      { path: 'store/session/helper.ts', source: "import { setSessionUnreadRemote } from '@/api/sessions'" },
      { path: 'api/sessions.ts', source: '' }
    ]

    expect(closureViolations([graph[0]], graph).map(v => v.detail)).toHaveLength(1)

    // …and the same walk through the deleted module's path, or into a
    // forbidden zone, spelled relatively.
    const shim = [
      { path: 'store/session.ts', source: "import { markSessionUnread } from './session-unread-remote'" },
      { path: DELETED, source: "import { setSessionUnreadRemote } from '@/api/sessions'" }
    ]

    expect(closureViolations([shim[0]], shim).map(v => v.detail)).toHaveLength(1)

    const intoApi = [
      { path: 'store/session/atoms.ts', source: "import { helper } from '../session-helper'" },
      { path: 'store/session-helper.ts', source: "import { getProfiles } from '../api/profiles'" },
      { path: 'api/profiles.ts', source: '' }
    ]

    expect(closureViolations([intoApi[0]], intoApi).map(v => v.detail)).toHaveLength(1)

    // A zone the graph cannot even resolve (a deleted module, a file that does
    // not exist yet) is still an edge: the specifier itself is judged.
    const unresolvable = [
      { path: 'store/session.ts', source: "import { helper } from './session-helper'" },
      { path: 'store/session-helper.ts', source: "import { markSessionUnread } from '@/application/session-read-state'" }
    ]

    expect(closureViolations([unresolvable[0]], unresolvable).map(v => v.detail)).toHaveLength(1)
    expect(closureViolations([unresolvable[0]], unresolvable)[0].detail).toContain('@/application')

    // A chain that stays inside the store, types and pure helpers is clean.
    const clean = [
      { path: 'store/session/unread.ts', source: "import { helper } from './helper'" },
      { path: 'store/session/helper.ts', source: "import type { SessionInfo } from '@/types/hermes'" },
      { path: 'types/hermes.ts', source: '' }
    ]

    expect(closureViolations([clean[0]], clean)).toEqual([])
  })
})
