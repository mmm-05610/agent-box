// Real local agent processes (P evidence), no model calls and no user state:
// Pi and Codex children get isolated temp config dirs via PI_CODING_AGENT_DIR
// and CODEX_HOME; the workspace cwd is a temp directory. Run explicitly:
//   node apps/desktop/scripts/test-agent-process.mjs
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const home = await mkdtemp(path.join(tmpdir(), 'ordessa-agent-proc-'))
const workspace = await mkdtemp(path.join(tmpdir(), 'ordessa-agent-ws-'))
process.env.ORDESSA_AGENT_CWD = workspace
process.env.PI_CODING_AGENT_DIR = path.join(home, 'pi')
process.env.CODEX_HOME = path.join(home, 'codex')
await mkdir(process.env.PI_CODING_AGENT_DIR, { recursive: true })
await mkdir(process.env.CODEX_HOME, { recursive: true }) // Codex exits when CODEX_HOME is missing.
const loadNative = id => import(pathToFileURL(path.join(root, `extensions/dist/extensions/${id}/native.js`)).href)
  .then(module => { assert.equal(typeof module.default, 'function', `${id} native entry`); return module.default() })

const results = {}
try {
  // Pi: two concurrent sessions are two owned RPC processes. Empty new
  // sessions are deliberately absent from SessionManager history: Pi only
  // flushes a session file after the first assistant message.
  const pi = await loadNative('ordessa.agent-pi')
  const piEvents = []
  const piConn = await pi.open(frame => piEvents.push(frame))
  const first = await piConn.send({ method: 'new' })
  assert.ok(first.sessionId && first.state.sessionId === first.sessionId, 'Pi new session state')
  const second = await piConn.send({ method: 'new' })
  assert.notEqual(second.sessionId, first.sessionId, 'Pi sessions are distinct processes')
  // Seed one persisted history session through the official SessionManager,
  // the same authority the native list operation uses.
  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const seeded = SessionManager.create(workspace)
  seeded.appendMessage({ role: 'user', content: [{ type: 'text', text: 'Seed question' }] })
  seeded.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Recorded without a model call.' }],
    api: 'pi-messages', provider: 'anthropic', model: 'seed-model', stopReason: 'stop',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } })
  const list = await piConn.send({ method: 'list' })
  assert.ok(list.some(item => item.id === seeded.getSessionId()), 'Pi history lists the persisted session')
  assert.ok(!list.some(item => item.id === first.sessionId), 'Pi empty sessions stay out of history until flushed')
  const resumed = await piConn.send({ method: 'open', params: { sessionId: seeded.getSessionId() } })
  assert.equal(resumed.sessionId, seeded.getSessionId(), 'Pi resume via --session returns the same id')
  assert.ok(resumed.messages.some(message => Array.isArray(message.content) &&
    message.content.some(part => part.type === 'text' && part.text === 'Recorded without a model call.')), 'Pi resumed history messages')
  const reopened = await piConn.send({ method: 'open', params: { sessionId: first.sessionId } })
  assert.equal(reopened.sessionId, first.sessionId, 'Pi reopen reuses the open process')
  // The model catalog depends on configured providers; an isolated agent dir
  // has none, so only the typed shape is asserted here.
  const models = await piConn.send({ method: 'models', params: { sessionId: first.sessionId } })
  assert.ok(Array.isArray(models), 'Pi declared models are a list')
  const levels = await piConn.send({ method: 'thinking-levels', params: { sessionId: first.sessionId } })
  assert.ok(Array.isArray(levels), 'Pi declared thinking levels are a list')
  if (levels.length) await piConn.send({ method: 'set-thinking-level', params: { sessionId: first.sessionId, level: levels[0] } })
  await piConn.send({ method: 'abort', params: { sessionId: first.sessionId } }) // Idle abort waits for idle and returns.
  await assert.rejects(piConn.send({ method: 'respond', params: { sessionId: first.sessionId, requestId: 'missing',
    response: { type: 'extension_ui_response', id: 'missing', value: 'x' } } }), /expired|already answered/, 'Pi one-shot interaction guard')
  await assert.rejects(piConn.send({ method: 'bogus' }), /Unsupported/, 'Pi rejects unknown native operations')
  await piConn.close()
  await assert.rejects(piConn.send({ method: 'list' }), /closed/, 'Pi transport closed')
  results.pi = { parallelSessions: true, history: true, options: true, oneShotGuard: true, cleanup: true }

  // Codex: App Server handshake, empty isolated history and a local thread
  // start; responses are correlated the way the renderer adapter does.
  const codex = await loadNative('ordessa.agent-codex')
  const pending = new Map()
  let nextId = 0
  let exited
  const exit = new Promise(resolve => { exited = resolve })
  const codexConn = await codex.open(frame => {
    if (frame.type === 'exit') exited(frame)
    if (frame.id !== undefined && pending.has(frame.id)) {
      const item = pending.get(frame.id)
      pending.delete(frame.id); clearTimeout(item.timer)
      frame.error ? item.reject(Error(frame.error?.message ?? 'Codex request failed')) : item.resolve(frame.result)
    }
  })
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => reject(Error(`Codex ${method} timed out`)), 20000)
    pending.set(id, { resolve, reject, timer })
    void codexConn.send({ id, method, params }).catch(reject)
  })
  const initialized = await request('initialize', { clientInfo: { name: 'ordessa-desktop', title: 'Ordessa Desktop process test', version: '0.1.0' }, capabilities: null })
  assert.ok(initialized, 'Codex initialize result')
  await codexConn.send({ method: 'initialized', params: {} })
  const threads = await request('thread/list', { cursor: null, limit: 100 })
  assert.ok(Array.isArray(threads.data), 'Codex isolated history is a list')
  const started = await request('thread/start', {})
  assert.ok(started.thread?.id, 'Codex local thread start')
  await codexConn.close()
  await exit
  results.codex = { handshake: true, history: threads.data.length === 0, localThreadStart: true, exitEvent: true }
  console.log(JSON.stringify({ pi: results.pi, codex: results.codex, piEvents: piEvents.length }))
} finally {
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
}
