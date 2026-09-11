#!/usr/bin/env node
// batch-collisions — which work orders can run at the same time, and which cannot.
//
// The master plan's parallel groups are only worth anything if they are checked
// against the tree rather than reasoned about. This is that check. Re-run it
// every time a work order is added or a module moves; the groups table in
// `docs/architecture/renderer-layer-master-plan.md` is its output, not its input.
//
//   node batch-collisions.mjs <manifest.json>
//
// The manifest is the one input a human maintains:
//
//   {
//     "01 lib-services": { "edges": 6, "modules": ["lib/oneshot'", "lib/yolo-session'"] },
//     "06a1 statusbar":  { "edges": 1, "modules": ["lib/statusbar'"] }
//   }
//
// `modules` is a list of ripgrep patterns that find the modules the batch moves or
// changes. A batch's touched set is every production file that imports one of
// those modules — which is exactly what "two batches touch the same file" means
// in practice.
//
// `edges` is what the batch's work order claims. The script sums it and prints the
// expected final ledger, which is the whole point: the aggregate numbers in the
// master plan are DERIVED from this file, so a plan that says "36 edges" while the
// manifest sums to something else is a detectable inconsistency rather than a
// stale claim nobody notices.
//
// `dev/contracts/renderer-layers.debt.ts` is deliberately excluded. Every batch
// regenerates it, so it would collide with everything and tell us nothing; the
// ledger is handled by the integration step instead (see the master plan).
//
// No dependencies.

import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const LEDGER = 'dev/contracts/renderer-layers.debt.ts'

const manifestPath = process.argv[2]

if (!manifestPath) {
  console.error('usage: batch-collisions.mjs <manifest.json>   (run from apps/desktop/src)')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// JSON has no comments, so the manifest's own documentation lives in `_`-prefixed
// keys. Skipping them here is the whole convention — without it a `_comment`
// entry becomes a phantom batch with no collisions and adds a wave.
const batches = Object.entries(manifest).filter(([name]) => !name.startsWith('_'))

for (const [name, spec] of batches) {
  if (typeof spec?.edges !== 'number' || !Array.isArray(spec?.modules)) {
    console.error(`manifest entry "${name}" needs { edges: number, modules: string[] }`)
    process.exit(2)
  }
}

/** Every production file that imports one of `patterns`. */
function touched(patterns) {
  const found = new Set()

  for (const pattern of patterns) {
    const out = execFileSync('rg', ['-l', pattern, '--glob', '!*.test.*', '.'], { encoding: 'utf8' })

    for (const line of out.split('\n')) {
      const path = line.replace(/^\.\//, '').trim()

      if (path && path !== LEDGER) {
        found.add(path)
      }
    }
  }

  return found
}

const sets = Object.fromEntries(batches.map(([name, spec]) => [name, touched(spec.modules)]))
const claimed = batches.reduce((sum, [, spec]) => sum + spec.edges, 0)

console.log('batches\n')
console.log('  batch                 edges   touched files')
for (const [name, spec] of batches) {
  console.log(`  ${name.padEnd(20)} ${String(spec.edges).padStart(5)}   ${String(sets[name].size).padStart(4)}`)
}

// The ledger is the objective measure of progress, so the arithmetic that matters
// is read from it rather than restated anywhere. `ledgerNow` is the truth;
// `ledgerAfterAll` is what the plan is allowed to claim.
const ledgerSource = readFileSync(LEDGER, 'utf8')
const ledgerNow = ledgerSource.split('\n').filter(line => /^\s*'/.test(line)).length

console.log(`\n  claimed by every batch   ${String(claimed).padStart(3)} edges`)
console.log(`  ledger right now         ${String(ledgerNow).padStart(3)}`)
console.log(`  ledger after all of them ${String(ledgerNow - claimed).padStart(3)}`)
// Detect the drift rather than merely declaring a winner. The plan labels its
// aggregate as derived; if the label is there and the number disagrees with this
// arithmetic, the plan was not updated when a batch was added. That is exactly the
// failure this project already hit once, and it is cheap to catch.
const planPath = join(dirname(resolve(manifestPath)), '..', 'renderer-layer-master-plan.md')

try {
  const plan = readFileSync(planPath, 'utf8')
  const stated = /\|\s*after every work order in §3\s*\|\s*\*\*(\d+)\*\*/.exec(plan)

  if (!stated) {
    console.log('\n  (the plan states no §3 target — nothing to cross-check)')
  } else if (Number(stated[1]) === ledgerNow - claimed) {
    console.log('\n  ✓ the plan\'s §3 target agrees with this arithmetic')
  } else {
    console.log(`\n  ✗ THE PLAN IS STALE: it says ${stated[1]}, the manifest and ledger say ${ledgerNow - claimed}.`)
    console.log('    The manifest and the ledger are the source; fix the plan.')
    process.exitCode = 1
  }
} catch {
  console.log(`\n  (could not read ${planPath} to cross-check the plan's target)`)
}

const names = Object.keys(sets)
const collisions = []

for (let i = 0; i < names.length; i += 1) {
  for (let j = i + 1; j < names.length; j += 1) {
    const shared = [...sets[names[i]]].filter(path => sets[names[j]].has(path))

    if (shared.length) {
      collisions.push({ a: names[i], b: names[j], shared })
    }
  }
}

console.log('\ncollisions\n')

if (collisions.length === 0) {
  console.log('  none — every batch is independent')
} else {
  for (const { a, b, shared } of collisions) {
    console.log(`  ${a}  ∩  ${b}`)

    for (const path of shared.sort()) {
      console.log(`      ${path}`)
    }
  }
}

// Greedy graph colouring over the collision graph: each colour is a group that
// can run concurrently, and the number of colours is the minimum number of
// sequential waves. Greedy is not optimal in general, but the graph here is
// small and sparse, and a group that is one batch too small costs a wave, not
// correctness.
const colour = new Map()
const adjacent = new Map(names.map(name => [name, new Set()]))

for (const { a, b } of collisions) {
  adjacent.get(a).add(b)
  adjacent.get(b).add(a)
}

for (const name of [...names].sort((a, b) => adjacent.get(b).size - adjacent.get(a).size)) {
  const taken = new Set([...adjacent.get(name)].map(n => colour.get(n)).filter(c => c !== undefined))
  let c = 0

  while (taken.has(c)) {
    c += 1
  }

  colour.set(name, c)
}

const waves = Math.max(...[...colour.values()]) + 1

console.log('\nparallel groups (same group = no shared file)\n')

for (let c = 0; c < waves; c += 1) {
  const group = names.filter(name => colour.get(name) === c)

  console.log(`  wave ${c + 1}: ${group.join(', ')}`)
}

console.log(`\n  ${waves} waves. Cap the concurrency — the test suite is CPU-heavy and this`)
console.log('  repo already documents flakes caused by contention (vitest.setup.ts).')
