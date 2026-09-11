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
//     "01 lib-services": ["lib/oneshot'", "lib/yolo-session'"],
//     "06a1 statusbar":  ["lib/statusbar'"]
//   }
//
// Each value is a list of ripgrep patterns that find the modules the batch moves
// or changes. A batch's touched set is every production file that imports one of
// those modules — which is exactly what "two batches touch the same file" means
// in practice.
//
// `dev/contracts/renderer-layers.debt.ts` is deliberately excluded. Every batch
// regenerates it, so it would collide with everything and tell us nothing; the
// ledger is handled by the integration step instead (see the master plan).
//
// No dependencies.

import { execFileSync } from 'node:child_process'
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

const sets = Object.fromEntries(batches.map(([name, patterns]) => [name, touched(patterns)]))

console.log('touched-file counts\n')
for (const [name, files] of Object.entries(sets)) {
  console.log(`  ${name.padEnd(20)} ${String(files.size).padStart(4)}`)
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
