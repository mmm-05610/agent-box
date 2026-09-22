import assert from 'node:assert/strict'
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchSmoke } from './launch-smoke.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const home = await mkdtemp(path.join(tmpdir(), 'ordessa-foundations-'))
try {
  const defaults = await launchSmoke(home, { ORDESSA_EMPTY_HOST: '0' })
  assert.deepEqual(defaults.errors, [])
  assert.equal(defaults.rootMounted, true); assert.equal(defaults.settingsEntry, true)
  const ids = ['ordessa.contracts', 'ordessa.commands', 'ordessa.workbench', 'ordessa.settings', 'example.foundation']
  await mkdir(path.join(home, 'extensions'))
  await cp(path.join(root, 'examples/dist/example.foundation'), path.join(home, 'extensions/example.foundation'), { recursive: true })
  await writeFile(path.join(home, 'extensions.json'), JSON.stringify({ enabled: ids }))
  const result = await launchSmoke(home, { ORDESSA_EMPTY_HOST: '0', MODULAR_FOUNDATION_SMOKE: '1', MODULAR_LAYOUT_SMOKE: '1', ...(process.env.MODULAR_SCREENSHOT ? { MODULAR_SCREENSHOT: process.env.MODULAR_SCREENSHOT } : {}) })
  assert.deepEqual(result.errors, [])
  assert.equal(result.pages.length, 5)
  for (const [name, passed] of Object.entries(result.foundation)) assert.equal(passed, true, name)
  console.log(JSON.stringify(result.layout))
  for (const [name, passed] of Object.entries(result.layout.checks)) assert.equal(passed, true, name)
  await writeFile(path.join(home, 'extensions.json'), JSON.stringify({ enabled: [] }))
  const empty = await launchSmoke(home, { ORDESSA_EMPTY_HOST: '0' })
  assert.deepEqual(empty.pages, []); assert.deepEqual(empty.errors, [])
  assert.equal(empty.emptyHost, true); assert.equal(empty.rootMounted, false)
  console.log(JSON.stringify({ defaults, result, empty }, null, 2))
} finally { await rm(home, { recursive: true, force: true }) }
