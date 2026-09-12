import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The renderer's layer order, written down ONCE, as data.
//
// `themes/`, `i18n/` and `api/` each carry their own leaf guard
// (`*/import-boundary.test.ts`), which answers "may this directory reach the
// product at all?". None of them answers the other half of the question: in
// WHICH DIRECTION may two product layers reach each other? That is what this
// module records, and `renderer-layers.test.ts` enforces.
//
// Why it matters here specifically: this directory tree was flattened out of a
// two-cycle knot (SCC-A was type-level across 77 files; SCC-B was runtime). A
// cycle is not a property any single file can be blamed for — it is an edge
// pointing the wrong way. Reviewing one import at a time cannot see it, and a
// greps-and-eyeballs audit cannot prove it stayed fixed. An explicit rank per
// zone plus a frozen debt ledger can.
//
// The rank table is deliberately coarse: it judges TOP-LEVEL directories, not
// individual files. A per-file exception table would be re-litigated by every
// refactor; a rank is a claim about authority that a reviewer can argue with
// once. The one place a rank could not carry the truth is `plugins/`, and that
// is expressed as its own rule rather than a rank (see `PLUGIN_SANDBOX`).

export const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface LayerRule {
  /** Directory under `src/`, as it appears in a path relative to `src/`. */
  zone: string
  /** Lower is deeper. An import whose target ranks HIGHER than its importer is
   *  an upward edge — the thing this file exists to prevent. */
  rank: number
  rationale: string
}

/** The layer ladder. Same rank = same layer, so those imports are lateral and
 *  always allowed; only a strictly higher target rank is an upward edge. */
export const LAYERS: readonly LayerRule[] = [
  { rank: 0, rationale: 'Protocol and shared shapes. Carries no behaviour and imports nothing product-side.', zone: 'types' },
  { rank: 0, rationale: 'Message catalogs. A catalog that reads app state cannot be loaded before the app.', zone: 'i18n' },
  { rank: 0, rationale: 'Theme math: plain data in, plain data out. The React layer above paints what it is handed.', zone: 'themes' },
  { rank: 0, rationale: 'Builds, sends and parses requests. The documented bottom of the renderer.', zone: 'api' },
  { rank: 0, rationale: 'Pure helpers. A helper that reads a store or mounts a component is not a helper.', zone: 'lib' },
  { rank: 1, rationale: 'Shared renderer state. Owns atoms; does not own presentation.', zone: 'store' },
  { rank: 2, rationale: 'Use-cases that need more than one request or store. `src/AGENTS.md` sanctions store/ reaching here.', zone: 'application' },
  { rank: 4, rationale: 'Reusable UI. Sits above the state it renders and below the routes that choose it.', zone: 'components' },
  { rank: 4, rationale: 'Distribution over the layers below: the SDK facade and the contribution surfaces.', zone: 'extension' },
  { rank: 4, rationale: 'Dev-only tooling and contract guards. Imported by the app; imports the stores it inspects.', zone: 'dev' },
  { rank: 5, rationale: 'Routes, pages and shell composition. Nothing may import a route back.', zone: 'app' },
  { rank: 5, rationale: 'Product feature trees, moved whole out of `app/` (batch 30) so composition and product are separable by location. Same rank as `app/`: lateral, not a new layer.', zone: 'features' }
]

/** Root-level modules that belong to the ladder. A file that is not listed here
 *  and does not sit under a zone is skipped, not silently treated as legal:
 *  `*.d.ts` are declarations, and adding a new root module is a decision. */
export const ROOT_RANKS: Readonly<Record<string, number>> = {
  // The renderer entry point: mounting the app is the top of the ladder.
  'main.tsx': 5
}

/** Upward pairs that are sanctioned by written policy, not debt. Kept separate
 *  from the ledger (`renderer-layers.debt.ts`) so "we decided this is fine" and
 *  "we have not fixed this yet" never look alike. */
export const SANCTIONED: readonly { from: string; rationale: string; to: string }[] = [
  {
    from: 'store',
    rationale:
      '`apps/desktop/src/AGENTS.md`: `application/` "imports `api/` and the stores freely, and is imported by `app/`/`store/` call sites".',
    to: 'application'
  }
]

/** Work that is not part of the shipped tree yet. Scanning it would report
 *  whoever's uncommitted branch as this round's regression. Pinned by a test so
 *  the exclusion cannot quietly grow. */
export const IN_FLIGHT: readonly string[] = ['agentbox', 'plugins/agentbox-lab']

/** Plugins get a rule, not a rank. A plugin is handed the host through
 *  `@hermes/plugin-sdk` (aliased to `extension/sdk`, which itself sits at the
 *  top), so ranking it would make its only legitimate import an upward edge.
 *  The real invariant is the sandbox: a plugin names the ABI, its own files and
 *  third-party packages, and nothing from `src/` by alias. */
export const PLUGIN_SANDBOX = 'plugins'

/** The plugin ABI. Treated as an external package because that is what it is to
 *  a plugin: a provided surface, not an internal module it may reach through. */
const EXTERNAL_PREFIXES = ['@hermes/'] as const

export interface Module {
  /** Path relative to `src/`. */
  path: string
  source: string
}

export interface UpwardEdge {
  from: string
  fromRank: number
  specifier: string
  to: string
  toRank: number
}

/** Every module specifier a file names — static imports and re-exports,
 *  side-effect imports, dynamic `import()`, `require()`, and the Vitest mock
 *  helpers that take a module id. Same set `api/import-boundary.test.ts` scans,
 *  because a `vi.mock` is the same tell as a runtime import. */
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

export function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('@/') && EXTERNAL_PREFIXES.some(prefix => specifier.startsWith(prefix))
}

/** The zone a `src/`-relative path sits in, or null when no rule claims it. */
export function zoneOfPath(path: string): string | null {
  return LAYERS.find(layer => path === layer.zone || path.startsWith(`${layer.zone}/`))?.zone ?? null
}

export function rankOfPath(path: string): null | number {
  const zone = zoneOfPath(path)

  if (zone) {
    return LAYERS.find(layer => layer.zone === zone)?.rank ?? null
  }

  return ROOT_RANKS[path] ?? null
}

/** Resolve a specifier against the modules that exist in the graph. Aliases are
 *  `@/…`; anything else must be relative, or it is an external package. */
export function resolveSpecifier(from: string, specifier: string, known: ReadonlySet<string>): null | string {
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

function isExcluded(path: string): boolean {
  return IN_FLIGHT.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/** Every production `.ts`/`.tsx` under `src/`.
 *
 *  `*.test.*` files are skipped. The `api/` guard deliberately keeps them,
 *  because an `api/` test that mocks a store is the same tell as the import it
 *  mocks; layer rank is different — a `store/` test legitimately mounts an
 *  `app/` component to assert what the user sees, and that is not a layering
 *  decision about shipped code. */
export function collectModules(root: string = SRC_DIR): Module[] {
  const collect = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
      const full = join(dir, entry)

      if (statSync(full).isDirectory()) {
        return collect(full)
      }

      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry) ? [full] : []
    })

  return collect(root)
    .map(full => relative(SRC_DIR, full))
    .filter(path => !isExcluded(path))
    .map(path => ({ path, source: readFileSync(join(SRC_DIR, path), 'utf8') }))
}

/** An upward edge as the ledger spells it, so a failure names the line to delete. */
export function edgeKey(edge: UpwardEdge): string {
  return `${edge.from} -> ${edge.specifier}`
}

/** Rule 1: no module may name a specifier that ranks strictly above it.
 *
 *  Deduplicated by `(from, specifier)`: a file that imports one module twice —
 *  once for a type, once for a value, which is what a barrel-free codebase looks
 *  like — has ONE edge pointing the wrong way, not two. The ledger is a list of
 *  edges, so counting statements would make the number move for a reason that
 *  has nothing to do with layering. */
export function upwardEdges(modules: readonly Module[]): UpwardEdge[] {
  const known = new Set(modules.map(module => module.path))
  const edges = new Map<string, UpwardEdge>()

  for (const module of modules) {
    const fromRank = rankOfPath(module.path)

    if (fromRank === null) {
      continue
    }

    for (const specifier of importSpecifiers(module.source)) {
      if (isExternalSpecifier(specifier)) {
        continue
      }

      const target = resolveSpecifier(module.path, specifier, known)

      if (!target || target === module.path) {
        continue
      }

      const toRank = rankOfPath(target)

      if (toRank !== null && toRank > fromRank) {
        const edge = { from: module.path, fromRank, specifier, to: target, toRank }

        edges.set(edgeKey(edge), edge)
      }
    }
  }

  return [...edges.values()]
}

/** Rule 2: a plugin names the ABI and its own files, never `src/` through the
 *  alias. Verified true today, so this guard can only ever report new debt. */
export function pluginSandboxViolations(modules: readonly Module[]): UpwardEdge[] {
  return modules
    .filter(module => module.path.startsWith(`${PLUGIN_SANDBOX}/`))
    .flatMap(module =>
      importSpecifiers(module.source)
        .filter(specifier => specifier.startsWith('@/'))
        .map(specifier => ({ from: module.path, fromRank: 0, specifier, to: specifier, toRank: 0 }))
    )
}

export function isSanctioned(edge: UpwardEdge): boolean {
  const fromZone = zoneOfPath(edge.from)
  const toZone = zoneOfPath(edge.to)

  return SANCTIONED.some(rule => rule.from === fromZone && rule.to === toZone)
}
