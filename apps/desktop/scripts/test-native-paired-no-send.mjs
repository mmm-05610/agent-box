// C-0048: one real Server pairing, UI only. This file never reads a bearer or submits a message.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.umask(0o077)
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pairRoot = '/tmp/hd002-c0048-pair-834rpsal'
const readyPath = path.join(pairRoot, 'ready.json')
const donePath = path.join(pairRoot, 'fc-done.json')
const userData = path.join(pairRoot, 'electron-userdata')
const tracePath = path.join(userData, 'electron-connect.trace')
const logPath = path.join(userData, 'electron-smoke.log')
const expectedOrigin = 'http://127.0.0.1:50491'
const timeoutMs = 25_000

function secureFile(info) {
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o777) === 0o600)
}
function secureDir(info) {
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o777) === 0o700)
}
function nativeSummary(result) {
  const pair = result?.nativePair
  assert.equal(result?.ready, true)
  assert.equal(result?.nodeAbsent, true)
  assert.deepEqual(result?.errors, [])
  for (const field of ['oneServer', 'connectionIdMatches', 'connected', 'listed', 'selected',
    'draftVisible', 'projectGateOpen', 'emptyComposerCannotSend', 'directConnectorsAbsent', 'errorsAbsent']) {
    assert.equal(pair?.[field], true, `Native pair UI check failed: ${field}`)
  }
  return Object.fromEntries(Object.entries(pair).filter(([, value]) => typeof value === 'boolean'))
}
function assertLoopbackOnly(trace) {
  const calls = trace.split('\n').filter(line => line.includes('connect(') && /AF_INET6?/.test(line))
  assert.ok(calls.some(call => call.includes('sin_port=htons(50491)') && call.includes('sin_addr=inet_addr("127.0.0.1")')),
    'No connection to this batch Server was observed')
  for (const call of calls) {
    const ipv4 = call.match(/sin_addr=inet_addr\("([^"]+)"\)/)?.[1]
    const ipv6 = call.match(/inet_pton\(AF_INET6, "([^"]+)"/)?.[1]
    assert.ok((ipv4 && ipv4.startsWith('127.')) || (ipv6 && (ipv6 === '::1' || ipv6.startsWith('::ffff:127.'))),
      'Electron attempted a non-loopback connection')
  }
  return calls.length
}
async function markStopped() {
  const staging = `${donePath}.${process.pid}.tmp`
  await writeFile(staging, JSON.stringify({ schema: 'hd002-c0048/1', done: true, electronStopped: true, sendCount: 0 }), { mode: 0o600, flag: 'wx' })
  await rename(staging, donePath)
}

let readyAccepted = false
let child
try {
  assert.equal(process.argv[2], readyPath, 'Expected this batch ready.json path')
  secureDir(await lstat(pairRoot))
  secureFile(await lstat(readyPath))
  const ready = JSON.parse(await readFile(readyPath, 'utf8'))
  assert.equal(ready.schema, 'hd002-c0048/1')
  assert.equal(ready.origin, expectedOrigin)
  assert.equal(ready.tokenFile, path.join(pairRoot, 'data/secrets/http-token'))
  assert.ok(typeof ready.serverId === 'string' && ready.serverId.length > 0)
  assert.deepEqual(ready.nativeExecution && { mode: ready.nativeExecution.mode, harness: ready.nativeExecution.harness },
    { mode: 'native', harness: 'pi' })
  assert.ok(typeof ready.nativeExecution.profileId === 'string' && ready.nativeExecution.profileId.length > 0)
  assert.equal(ready.bcProfileUniqueReady, true)
  assert.equal(ready.project?.normalizedPath, path.join(pairRoot, 'project'))
  assert.ok(typeof ready.project.workspaceId === 'string' && ready.project.workspaceId.length > 0)
  secureFile(await lstat(ready.tokenFile)) // metadata only; native main opens and reads it.
  await mkdir(userData, { mode: 0o700 })
  secureDir(await lstat(userData))
  readyAccepted = true

  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORDESSA_') && !key.startsWith('MODULAR_')))
  Object.assign(env, {
    MODULAR_USER_DATA: userData, ORDESSA_EXTENSION_HOME: userData, ORDESSA_EMPTY_HOST: '0',
    MODULAR_SMOKE: '1', MODULAR_NATIVE_PAIR_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ORDESSA_SERVER_ORIGIN: ready.origin, ORDESSA_SERVER_TOKEN_FILE: ready.tokenFile,
    ORDESSA_PAIR_SERVER_ID: ready.serverId, ORDESSA_PAIR_PROJECT_PATH: ready.project.normalizedPath,
  })
  child = spawn('strace', ['-f', '-e', 'trace=connect', '-o', tracePath,
    path.resolve(app, '../../node_modules/electron/dist/electron'),
    '--no-sandbox', '--disable-gpu', '--ozone-platform=x11', '--disable-background-networking', '.'],
  { cwd: app, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    output = (output + chunk.toString()).slice(-1_000_000)
  })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, timeoutMs)
  let code
  try {
    code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  } finally { clearTimeout(timer); try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  await writeFile(logPath, output, { mode: 0o600, flag: 'wx' })
  assert.equal(timedOut, false, 'Electron pair timed out')
  assert.equal(code, 0, 'Electron pair exited unsuccessfully')
  const line = output.split('\n').find(item => item.startsWith('MODULAR_LOADER_READY '))
  assert.ok(line, 'Electron pair result missing')
  const checks = nativeSummary(JSON.parse(line.slice('MODULAR_LOADER_READY '.length)))
  const loopbackCalls = assertLoopbackOnly(await readFile(tracePath, 'utf8'))
  console.log(JSON.stringify({ gate: 'C-0048', pass: true, checks, loopbackCalls, sendsByFC: 0 }))
} catch (error) {
  console.error(JSON.stringify({ gate: 'C-0048', pass: false, reason: error instanceof Error ? error.message : 'unknown error' }))
  process.exitCode = 1
} finally {
  if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
  if (readyAccepted) {
    try { await markStopped() } catch { console.error(JSON.stringify({ gate: 'C-0048', doneMarker: false })); process.exitCode = 1 }
  }
}
