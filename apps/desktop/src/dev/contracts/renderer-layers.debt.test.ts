import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectModules, edgeKey, isSanctioned, SRC_DIR, upwardEdges } from './renderer-layers'
import { DEBT_LEDGER } from './renderer-layers.debt'

// Keeps `renderer-layers.debt.ts` honest — the ledger is a generated file, and
// this is the generator. It is a test because the scanner it needs is TypeScript
// and vitest is how this repo runs TypeScript; it is NOT a normal test, and it
// writes nothing unless you ask it to.
//
//   npm run ledger:layers      (from apps/desktop) — rewrite the ledger
//   npm run test:ui            — assert the ledger is current, every run
//
// Regenerating is the supported way to pay off debt. `renderer-layers.test.ts`
// fails on an unlisted edge AND on a stale line, so a round that fixes an edge
// without touching the ledger leaves the suite red. Rounds that move files
// should regenerate rather than hand-edit: the ledger is keyed by
// `<importer> -> <specifier>`, so it depends on what the tree looks like, not on
// which lines somebody meant to delete.
//
// Generated shape: sorted, deduplicated, grouped by the layer that owns the
// offending import, because that is how the work gets scheduled.

const HEADER = `// The renderer's upward-import debt, frozen.
//
// GENERATED — do not hand-edit. Regenerate with \`npm run ledger:layers\` from
// \`apps/desktop\`. In a round that only fixes an edge you do not need to: delete
// the line \`renderer-layers.test.ts\` names. Regenerate whenever files move,
// because every entry is keyed by the importer's path and the specifier as
// written.
//
// Each entry is \`<src-relative importer> -> <specifier as written>\`. It records
// an import that points at a layer ranked ABOVE the one that wrote it. The list
// exists for one reason: to make the remaining work visible and to make a
// regression impossible to land quietly. It is not a list of things that are
// fine.
//
// Grouped by the layer that owns the offending import, because that is how the
// work gets scheduled: a \`lib/\` batch, a \`store/\` batch, and so on.

`

function currentLedger(): string[] {
  return upwardEdges(collectModules())
    .filter(edge => !isSanctioned(edge))
    .map(edgeKey)
    .sort()
}

function render(keys: readonly string[]): string {
  const byLayer = new Map<string, string[]>()

  for (const key of keys) {
    const layer = key.split('/')[0]

    byLayer.set(layer, [...(byLayer.get(layer) ?? []), key])
  }

  const body = [...byLayer.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([layer, entries]) => `  // ${layer}/ — ${entries.length}\n${entries.map(key => `  '${key}',`).join('\n')}`
    )
    .join('\n\n')

  return `${HEADER}export const DEBT_LEDGER: readonly string[] = [\n${body}\n]\n`
}

describe('the layer debt ledger', () => {
  it(
    process.env.UPDATE_LAYER_LEDGER ? 'rewrites the ledger' : 'is current',
    () => {
      const keys = currentLedger()

      if (process.env.UPDATE_LAYER_LEDGER) {
        writeFileSync(join(SRC_DIR, 'dev/contracts/renderer-layers.debt.ts'), render(keys))
        console.log(`ledger: wrote ${keys.length} entries`)

        return
      }

      const recorded = [...DEBT_LEDGER].sort()

      // Both directions matter and `renderer-layers.test.ts` reports them with a
      // better message; this exists so the GENERATED file cannot drift while that
      // suite is green for some other reason.
      expect({
        added: keys.filter(k => !recorded.includes(k)),
        count: keys.length,
        paid: recorded.filter(k => !keys.includes(k))
      }).toEqual({ added: [], count: recorded.length, paid: [] })
    },
    30_000
  )
})
