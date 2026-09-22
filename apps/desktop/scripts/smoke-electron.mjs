import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userData = await mkdtemp(path.join(tmpdir(), 'modular-smoke-'))
const electron = path.resolve(root, '../../node_modules/electron/dist/electron')
const child = spawn(electron, ['--no-sandbox', '--disable-gpu', '--ozone-platform=x11', '.'], { cwd: root, env: { ...process.env, MODULAR_USER_DATA: userData, MODULAR_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
const timer = setTimeout(() => child.kill('SIGTERM'), 25000)
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); if (/MODULAR_EMPTY_READY \{[^\n]*\}\r?\n/.test(output)) child.kill('SIGTERM') })
await new Promise(resolve => child.on('close', resolve))
clearTimeout(timer)
await rm(userData, { recursive: true, force: true })
let ready = false
try { const line = output.match(/MODULAR_EMPTY_READY (\{[^\n]+\})/); const state = JSON.parse(line?.[1] ?? 'null'); ready = state.contextIsolationConfigured && state.empty && state.pages === 0 && state.nodeAbsent && state.bridgeAbsent } catch { ready = false }
if (!ready) { console.error(output); process.exitCode = 1 } else console.log(output.match(/MODULAR_EMPTY_READY[^\n]*/)?.[0])
