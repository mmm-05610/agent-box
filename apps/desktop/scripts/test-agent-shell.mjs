import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchSmoke } from './launch-smoke.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const home = await mkdtemp(path.join(tmpdir(), 'ordessa-agent-shell-'))
try {
  await writeFile(path.join(home, 'extensions.json'), await readFile(path.join(root, 'extensions/agent-preview.json')))
  const result = await launchSmoke(home, { ORDESSA_EMPTY_HOST: '0', MODULAR_AGENT_SHELL_SMOKE: '1' })
  assert.equal(result.ready, true)
  assert.equal(result.rootMounted, true)
  assert.equal(result.nodeAbsent, true)
  assert.deepEqual(result.errors, [])
  assert.ok(result.pages.includes('Conversation'))
  assert.ok(result.pages.includes('Sessions'))
  assert.ok(result.pages.includes('Requests'))
  assert.deepEqual(result.agentShell, { navigation: true, codexVisible: true, piVisible: true, emptyConversation: true, requestsView: true })
  console.log(JSON.stringify({ ready: result.ready, pages: result.pages, agentShell: result.agentShell, nodeAbsent: result.nodeAbsent }))
} finally { await rm(home, { recursive: true, force: true }) }
