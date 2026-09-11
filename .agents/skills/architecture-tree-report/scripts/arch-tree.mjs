#!/usr/bin/env node
// arch-tree — the counting half of the architecture-tree report.
//
// It answers "WHERE is the debt and HOW MUCH", never "why" or "where should it
// go". Those are the judgment half and they belong to the person writing the
// report; a script that guesses at them produces confident nonsense.
//
//   node arch-tree.mjs                      what is left, by zone and direction
//   node arch-tree.mjs --move lib/x.ts --to store/
//                                           is moving this up safe, or does
//                                           something below already import it
//
// No dependencies. Reads only:
//   apps/desktop/src/dev/contracts/renderer-layers.ts       the rank table
//   apps/desktop/src/dev/contracts/renderer-layers.debt.ts  the frozen ledger

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── locate the renderer ──────────────────────────────────────────────────────

function findSrc() {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))]

  for (const start of starts) {
    let dir = resolve(start)

    for (let i = 0; i < 8; i += 1) {
      const candidate = join(dir, 'apps/desktop/src')

      if (existsSync(candidate)) {
        return candidate
      }

      const parent = dirname(dir)

      if (parent === dir) {
        break
      }

      dir = parent
    }
  }

  throw new Error('cannot find apps/desktop/src — run from inside the repo')
}

const SRC = findSrc()
const CONTRACTS = join(SRC, 'dev/contracts')

// ── the rank table, read from the one place that owns it ─────────────────────

function readRanks() {
  const source = readFileSync(join(CONTRACTS, 'renderer-layers.ts'), 'utf8')
  const ranks = new Map()
  const roots = new Map()

  for (const line of source.split('\n')) {
    const zone = /zone:\s*'([^']+)'/.exec(line)
    const rank = /rank:\s*(\d+)/.exec(line)

    if (zone && rank) {
      ranks.set(zone[1], Number(rank[1]))
    }
  }

  const rootBlock = /ROOT_RANKS[^{]*\{([\s\S]*?)\n\}/.exec(source)

  if (rootBlock) {
    for (const m of rootBlock[1].matchAll(/'([^']+)':\s*(\d+)/g)) {
      roots.set(m[1], Number(m[2]))
    }
  }

  if (ranks.size === 0) {
    throw new Error('could not parse LAYERS from renderer-layers.ts')
  }

  return { ranks, roots }
}

const { ranks: RANKS, roots: ROOT_RANKS } = readRanks()

function zoneOf(path) {
  for (const zone of RANKS.keys()) {
    if (path === zone || path.startsWith(`${zone}/`)) {
      return zone
    }
  }

  return null
}

function rankOf(path) {
  const zone = zoneOf(path)

  return zone ? RANKS.get(zone) : (ROOT_RANKS.get(path) ?? null)
}

// ── the ledger ───────────────────────────────────────────────────────────────

function readLedger() {
  const source = readFileSync(join(CONTRACTS, 'renderer-layers.debt.ts'), 'utf8')

  return source
    .split('\n')
    .map(line => /^\s*'(.+?)',\s*$/.exec(line))
    .filter(Boolean)
    .map(m => {
      const [importer, specifier] = m[1].split(' -> ')

      return { importer, specifier }
    })
}

// ── walking the tree ─────────────────────────────────────────────────────────

const SKIP = ['agentbox', 'plugins/agentbox-lab']

function isSkipped(path) {
  return SKIP.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

function collect(dir = SRC, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(SRC, full)

    if (isSkipped(rel)) {
      continue
    }

    if (statSync(full).isDirectory()) {
      collect(full, acc)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      acc.push(rel)
    }
  }

  return acc
}

const MODULES = collect()
const KNOWN = new Set(MODULES)

function importSpecifiers(source) {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*['"]([^'"]+)['"]/g
  ]
  const found = []

  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      found.push(m[1])
    }
  }

  return found
}

function resolveSpecifier(from, specifier) {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(SRC, dirname(from), specifier)
      : null

  if (!base) {
    return null
  }

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    const path = relative(SRC, candidate)

    if (KNOWN.has(path)) {
      return path
    }
  }

  return null
}

// ── reporting ────────────────────────────────────────────────────────────────

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)))

/** The bucket a debt entry belongs to: a subdirectory when the importer sits in
 *  one, else the file itself. This is what makes the tree show WHERE inside a
 *  zone the debt is, instead of just "lib/ has 16". */
function bucketOf(importer) {
  const parts = importer.split('/')

  if (parts.length > 1 && existsSync(join(SRC, parts[0], parts[1])) && statSync(join(SRC, parts[0], parts[1])).isDirectory()) {
    return `${parts[0]}/${parts[1]}/`
  }

  return importer
}

function zoneFileCount(zone) {
  return MODULES.filter(m => m === zone || m.startsWith(`${zone}/`)).length
}

function report() {
  const ledger = readLedger()

  console.log('## 剩余债务\n')
  console.log(`账本共 **${ledger.length}** 条上行边。\n`)

  const byDirection = new Map()

  for (const { importer, specifier } of ledger) {
    const from = zoneOf(importer) ?? '(root)'
    const to = zoneOf(specifier.replace(/^@\//, '')) ?? specifier.replace(/^@\//, '').split('/')[0]
    const key = `${from} → ${to}`

    byDirection.set(key, (byDirection.get(key) ?? 0) + 1)
  }

  console.log('### 按方向\n')
  console.log('| 方向 | 条数 |')
  console.log('| --- | --- |')

  for (const [key, n] of [...byDirection].sort((a, b) => b[1] - a[1])) {
    console.log(`| \`${key}\` | ${n} |`)
  }

  const byImporter = new Map()

  for (const { importer, specifier } of ledger) {
    const entry = byImporter.get(importer) ?? { n: 0, targets: new Set() }

    entry.n += 1
    entry.targets.add(specifier.split('/').slice(0, 3).join('/'))
    byImporter.set(importer, entry)
  }

  const ranked = [...byImporter].sort((a, b) => b[1].n - a[1].n)

  console.log('\n### 导入者排名\n')
  console.log('集中的地方才是活；长尾基本都挂在头部那几个上。\n')
  console.log('| 条数 | 导入者 |')
  console.log('| --- | --- |')

  for (const [importer, { n }] of ranked.slice(0, 15)) {
    console.log(`| ${n} | \`${importer}\` |`)
  }

  if (ranked.length > 15) {
    console.log(`| … | 另 ${ranked.length - 15} 个各 1–${ranked[15]?.[1].n ?? 1} 条 |`)
  }

  console.log('\n### 树骨架\n')
  console.log('（顶层全列；有债的分支下钻到子目录/文件。诊断和去留由你写。）\n')
  console.log('```')
  console.log('apps/desktop/src/')

  const source = readFileSync(join(CONTRACTS, 'renderer-layers.ts'), 'utf8')
  const sandbox = /PLUGIN_SANDBOX\s*=\s*'([^']+)'/.exec(source)?.[1]

  const rows = []

  const zoneDirs = [...RANKS.entries()]
    .filter(([zone]) => !zone.includes('/') && existsSync(join(SRC, zone)))
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))

  for (const [zone] of zoneDirs) {
    const entries = ledger.filter(e => e.importer.startsWith(`${zone}/`) || e.importer === zone)
    const buckets = new Map()

    for (const e of entries) {
      const b = bucketOf(e.importer).replace(new RegExp(`^${zone}/`), '')

      buckets.set(b, (buckets.get(b) ?? 0) + 1)
    }

    rows.push({
      desc: ` ${zoneFileCount(zone)} 文件`,
      label: `${zone}/`,
      mark: entries.length === 0 ? '✓ 0 条' : `⚠ ${entries.length} 条`,
      sub: [...buckets].sort((a, b) => b[1] - a[1]).map(([b, c]) => [`${b}`, `⚠ ${c} 条`])
    })
  }

  if (sandbox && existsSync(join(SRC, sandbox))) {
    const inSandbox = MODULES.filter(m => m.startsWith(`${sandbox}/`))
    const leaks = inSandbox.filter(m =>
      importSpecifiers(readFileSync(join(SRC, m), 'utf8')).some(s => s.startsWith('@/'))
    )

    rows.push({
      desc: ` ${inSandbox.length} 文件`,
      label: `${sandbox}/`,
      mark: leaks.length === 0 ? '✓ 沙箱成立：零个 @/ 导入' : `⚠⚠ ${leaks.length} 个文件伸手到 src/`,
      sub: leaks.map(m => [m.replace(new RegExp(`^${sandbox}/`), ''), '✗'])
    })
  }

  // Directories that carry no production module (`assets/`, `fonts/`) still
  // belong in the picture: their absence from it is what makes someone wonder
  // whether the report is complete.
  const emptyDirs = readdirSync(SRC, { withFileTypes: true })
    .filter(e => e.isDirectory() && zoneFileCount(e.name) === 0)
    .map(e => e.name)
    .filter(name => name !== sandbox && !isSkipped(name))

  if (emptyDirs.length) {
    rows.push({ desc: '', label: `${emptyDirs.sort().join('/ ')}/`, mark: '✓ 无模块', sub: [] })
  }

  const rootFiles = [...ROOT_RANKS.keys()].filter(f => existsSync(join(SRC, f)))

  for (const file of rootFiles) {
    rows.push({ desc: '', label: file, mark: '✓ 0 条', sub: [] })
  }

  rows.forEach((row, index) => {
    const last = index === rows.length - 1
    const indent = last ? '    ' : '│   '

    console.log(`${last ? '└── ' : '├── '}${pad(row.label, 26)}${row.mark}${row.desc}`)

    row.sub.forEach(([name, mark], i) => {
      console.log(`${indent}${i === row.sub.length - 1 ? '└── ' : '├── '}${pad(name, 30)}${mark}`)
    })
  })

  console.log('```')
}

// ── the one trap worth automating ────────────────────────────────────────────

function checkMove(targetArg, destArg) {
  const target = targetArg
    .replace(/^(\.\/)?(apps\/desktop\/)?(src\/)?/, '')
    .replace(/\.tsx?$/, '')
  const dest = destArg
    .replace(/^(\.\/)?(apps\/desktop\/)?(src\/)?/, '')
    .replace(/\/$/, '')

  // A single module, or every module under a directory — `--move lib/keybinds`
  // is the case that actually bites, because moving a whole directory is what
  // looks obviously safe and is not.
  const asModule = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`].find(p => KNOWN.has(p))
  const asDir = MODULES.filter(m => m.startsWith(`${target}/`))
  const moving = asModule ? [asModule] : asDir

  if (moving.length === 0) {
    console.error(`找不到 ${targetArg}（apps/desktop/src 下既没有这个模块，也没有这个目录）`)
    process.exit(2)
  }

  const destRank = RANKS.has(dest) ? RANKS.get(dest) : null

  if (destRank === null) {
    console.error(`不认识目的地 ${destArg} — 层序表里没有这个区域`)
    process.exit(2)
  }

  const movingSet = new Set(moving)
  const importers = []

  for (const module of MODULES) {
    if (movingSet.has(module)) {
      continue
    }

    const source = readFileSync(join(SRC, module), 'utf8')

    if (importSpecifiers(source).some(s => movingSet.has(resolveSpecifier(module, s)))) {
      importers.push(module)
    }
  }

  const fromRanks = [...new Set(moving.map(rankOf).filter(r => r !== null))]
  const label = asModule ? `\`${asModule}\`` : `\`${target}/\`（${moving.length} 个模块）`

  console.log(`把 ${label} 搬到 \`${dest}/\`（rank ${destRank}，原 rank ${fromRanks.join('/')}）\n`)
  console.log(`外部生产导入者 ${importers.length} 个（不含被搬模块之间的互相引用）：`)

  const byLayer = new Map()

  for (const importer of importers) {
    const zone = zoneOf(importer) ?? '(root)'

    byLayer.set(zone, (byLayer.get(zone) ?? 0) + 1)
  }

  for (const [zone, n] of [...byLayer].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${zone} — ${n}`)
  }

  const blockers = importers
    .map(i => ({ i, rank: rankOf(i) }))
    .filter(x => x.rank !== null && x.rank < destRank)

  console.log('')

  if (blockers.length === 0) {
    console.log('✓ 安全：没有更下层的导入者，搬上去只会让这些边变成下行或同层。')
  } else {
    console.log(`✗ 不安全：${blockers.length} 个导入者比目的地更靠下，搬上去会新增上行边（方向反了，条数不变甚至更多）。`)

    for (const b of blockers) {
      console.log(`    ${b.i}  (rank ${b.rank} < ${destRank})`)
    }

    console.log('\n先把这些处理掉，或者改目的地：往下的层只能靠下沉/参数化解决，不能靠搬迁绕开。')
  }
}

// ── cli ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const moveAt = argv.indexOf('--move')

if (moveAt === -1) {
  report()
} else {
  const toAt = argv.indexOf('--to')

  if (toAt === -1) {
    console.error('--move 需要配 --to <区域>')
    process.exit(2)
  }

  checkMove(argv[moveAt + 1], argv[toAt + 1])
}
