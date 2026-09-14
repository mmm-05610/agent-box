import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectModules,
  edgeKey,
  IN_FLIGHT,
  isSanctioned,
  LAYERS,
  PLUGIN_SANDBOX,
  pluginSandboxViolations,
  ROOT_RANKS,
  SANCTIONED,
  SRC_DIR,
  upwardEdges,
  zoneOfPath
} from './renderer-layers'
import { DEBT_LEDGER } from './renderer-layers.debt'

// Contract: the renderer's layers only ever point DOWNWARD.
//
// `themes/`, `i18n/` and `api/` each prove their own directory is a leaf. This
// guard covers the rest of the ladder and the direction between layers, using
// the rank table in `renderer-layers.ts`.
//
// It is a RATCHET, not a wish. The tree does not satisfy it today: the ledger in
// `renderer-layers.ts` freezes the exact upward edges that exist, and two
// assertions hold it honest — nothing may be added, and nothing may be left
// behind. So each refactor round deletes lines from the ledger, and a round that
// re-introduces an edge fails immediately, naming the line it would have had to
// add.
//
// Tests are modules here on purpose, exactly as in `api/import-boundary.test.ts`:
// a scanner that cannot fail is worth nothing, so the reverse controls at the
// bottom feed it violations it must catch.

const srcEntries = readdirSync(SRC_DIR, { withFileTypes: true })

/** Root modules in the ladder. `*.d.ts` are excluded deliberately: a declaration
 *  file emits nothing, so it has no position in a runtime order. */
const rootModules = srcEntries
  .filter(entry => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
  .map(entry => entry.name)

describe('the renderer layer ladder is written down completely', () => {
  it('claims every top-level directory that carries modules', () => {
    // A new top-level directory is a decision about authority, not a place to
    // put files. Failing here is the prompt to make that decision explicitly.
    // Directories with no production modules (`assets/`, `fonts/`) need no rank,
    // and `plugins/` has a rule instead of one.
    const moduleDirs = [
      ...new Set(
        collectModules()
          .map(module => module.path)
          .filter(path => path.includes('/'))
          .map(path => path.split('/')[0])
      )
    ].sort()

    const unclaimed = moduleDirs.filter(dir => dir !== PLUGIN_SANDBOX && zoneOfPath(`${dir}/x.ts`) === null)

    expect(unclaimed).toEqual([])
    expect(moduleDirs).toContain(PLUGIN_SANDBOX)
  })

  it('claims every root-level module', () => {
    const unclaimed = rootModules.filter(file => ROOT_RANKS[file] === undefined && zoneOfPath(file) === null)

    expect(unclaimed).toEqual([])
  })

  it('has no zone whose prefix shadows another', () => {
    // `zoneOfPath` takes the first match, so an overlapping pair would make the
    // ladder depend on the order of the table rather than on the path.
    const shadowed = LAYERS.flatMap(layer =>
      LAYERS.filter(other => other !== layer && other.zone.startsWith(`${layer.zone}/`)).map(
        other => `${layer.zone} shadows ${other.zone}`
      )
    )

    expect(shadowed).toEqual([])
  })

  it('leaves no in-flight exclusion stale', () => {
    // The exclusion list is what keeps someone else's uncommitted branch out of
    // this round's numbers. It may not grow silently, and it may not outlive the
    // work: every entry must still be a real directory — checked in full, so a
    // nested prefix whose top-level directory survives is still reported.
    const missing = IN_FLIGHT.filter(
      prefix => !statSync(join(SRC_DIR, prefix), { throwIfNoEntry: false })?.isDirectory()
    )

    expect(missing).toEqual([])
    expect(IN_FLIGHT).toHaveLength(0)
  })
})

describe('the renderer only imports downward', () => {
  const modules = collectModules()
  const edges = upwardEdges(modules)
  const unsanctioned = edges.filter(edge => !isSanctioned(edge))
  const actual = unsanctioned.map(edgeKey).sort()
  const ledger = [...DEBT_LEDGER].sort()

  it('has modules and edges to judge', () => {
    expect(modules.length).toBeGreaterThan(1000)
    expect(edges.length).toBeGreaterThan(0)
  })

  it('adds no upward edge that is not already recorded', () => {
    const added = actual.filter(key => !ledger.includes(key))

    // Fix the direction instead of adding to the ledger: move the module up,
    // sink the leaf it wants, or take the state as a parameter.
    expect(added).toEqual([])
  })

  it('records no debt that has already been paid', () => {
    const paid = ledger.filter(key => !actual.includes(key))

    // These edges are gone. Delete their lines: the ledger is the record of what
    // is left, and a stale line is a claim the tree no longer makes.
    expect(paid).toEqual([])
  })

  it('keeps the ledger a duplicate-free record', () => {
    // One line per edge, so a round that fixes an edge has exactly one line to
    // delete and a reviewer can read the count off the length.
    expect(new Set(DEBT_LEDGER).size).toBe(DEBT_LEDGER.length)
  })

  it('counts the sanctioned directions separately from the debt', () => {
    // `edges` minus `unsanctioned` is the set the ladder permits by written
    // policy. If that is ever zero, `SANCTIONED` has gone stale and the store's
    // calls into `application/` are being reported as debt.
    expect(edges.length - unsanctioned.length).toBeGreaterThan(0)
    expect(SANCTIONED.length).toBeGreaterThan(0)
  })
})

describe('a plugin reaches the host only through the SDK', () => {
  const modules = collectModules()
  const plugins = modules.filter(module => module.path.startsWith(`${PLUGIN_SANDBOX}/`))

  it('has plugins to judge', () => {
    expect(plugins.length).toBeGreaterThan(20)
  })

  it('names nothing from src/ by alias', () => {
    // A plugin's provided surface is `@hermes/plugin-sdk`. An `@/…` import is the
    // plugin reaching past that surface into an internal layer, which is how a
    // plugin ends up unable to load before the app it is extending.
    expect(pluginSandboxViolations(modules).map(edgeKey)).toEqual([])
  })
})

describe('the scanner can fail', () => {
  const graph = [
    { path: 'lib/probe.ts', source: "import { $x } from '@/store/probe'" },
    { path: 'store/probe.ts', source: 'export const $x = 1' },
    { path: 'lib/sibling.ts', source: "import { helper } from './probe'" },
    { path: 'types/probe.ts', source: '' }
  ]

  it('catches a leaf reaching a store, however the import is written', () => {
    const spellings = [
      "import { $x } from '@/store/probe'",
      "import type { X } from '@/store/probe'",
      "import '@/store/probe'",
      "export { $x } from '@/store/probe'",
      "const m = await import('@/store/probe')",
      "const m = require('@/store/probe')",
      "vi.mock('@/store/probe')"
    ]

    for (const source of spellings) {
      expect(upwardEdges([{ path: 'lib/probe.ts', source }, ...graph.slice(1)])).toHaveLength(1)
    }
  })

  it('catches a store reaching a component, and a component reaching a route', () => {
    const cases = [
      { from: 'store/probe.ts', to: 'components/probe.tsx' },
      { from: 'components/probe.tsx', to: 'app/probe.tsx' },
      { from: 'application/probe.ts', to: 'app/probe.tsx' },
      { from: 'lib/probe.ts', to: 'application/probe.ts' },
      { from: 'extension/probe.ts', to: 'app/probe.tsx' }
    ]

    for (const { from, to } of cases) {
      const specifier = `@/${to.replace(/\.tsx?$/, '')}`

      const edges = upwardEdges([
        { path: from, source: `import { x } from '${specifier}'` },
        { path: to, source: '' }
      ])

      expect(edges).toHaveLength(1)
    }
  })

  it('allows every direction the ladder does sanction', () => {
    // A scanner that flags everything is as useless as one that flags nothing.
    const allowed = [
      { from: 'api/probe.ts', to: 'types/probe.ts' },
      { from: 'api/probe.ts', to: 'lib/probe.ts' },
      { from: 'lib/probe.ts', to: 'types/probe.ts' },
      { from: 'store/probe.ts', to: 'lib/probe.ts' },
      { from: 'application/probe.ts', to: 'store/probe.ts' },
      { from: 'components/probe.tsx', to: 'store/probe.ts' },
      { from: 'components/probe.tsx', to: 'components/other.tsx' },
      { from: 'components/probe.tsx', to: 'extension/other.ts' },
      { from: 'extension/probe.ts', to: 'components/other.tsx' },
      { from: 'app/probe.tsx', to: 'components/other.tsx' },
      { from: 'app/probe.tsx', to: 'extension/sdk/probe.ts' },
      { from: 'components/probe.tsx', to: 'application/probe.ts' },
      { from: 'store/probe.ts', to: 'types/probe.ts' },
      { from: 'lib/probe.ts', to: 'i18n/probe.ts' }
    ]

    for (const { from, to } of allowed) {
      const specifier = `@/${to.replace(/\.tsx?$/, '')}`

      const edges = upwardEdges([
        { path: from, source: `import { x } from '${specifier}'` },
        { path: to, source: '' }
      ])

      expect({ edges, from, to }).toEqual({ edges: [], from, to })
    }
  })

  it('catches a plugin that reaches past the SDK', () => {
    const modules = [{ path: `${PLUGIN_SANDBOX}/probe/plugin.ts`, source: "import { Button } from '@/components/ui/button'" }]

    expect(pluginSandboxViolations(modules)).toHaveLength(1)

    // The ABI and a sibling are what a plugin stands on.
    expect(
      pluginSandboxViolations([
        { path: `${PLUGIN_SANDBOX}/probe/plugin.ts`, source: "import { host } from '@hermes/plugin-sdk'\nimport { x } from './shared'" }
      ])
    ).toEqual([])
  })

  it('treats the sanctioned store-to-application direction as allowed', () => {
    const edge = {
      from: 'store/probe.ts',
      fromRank: 1,
      specifier: '@/application/probe',
      to: 'application/probe.ts',
      toRank: 2
    }

    expect(isSanctioned(edge)).toBe(true)
    expect(isSanctioned({ ...edge, to: 'app/probe.tsx', toRank: 5 })).toBe(false)
  })
})
