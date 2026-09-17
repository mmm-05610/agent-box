// Conformance probe: runs *inside* the room and reports what the room allows.
// The gate stages this file at the template's fixed entrypoint path, so the
// room executes it exactly as it would execute the sidecar worker entry.
//
// The guest environment is a whitelist (PATH/LANG/HOME/XDG*/AGENTBOX_*), so the
// probe carries no configuration from outside: the paths below are the fixed
// guest layout, and `workspace/linger` is a marker file the gate stages when it
// wants the probe to stay alive for the process-tree check.
import fs from 'node:fs'
import { spawn } from 'node:child_process'

// Guest paths by default (the Linux shape); a platform without bind mounts
// passes its real paths through the environment instead.
const HOME = process.env.PROBE_HOME || '/runtime/home/.fixture'
const WORKSPACE = process.env.PROBE_WORKSPACE || '/workspace'
const HOST_ROOT = process.env.PROBE_HOST_ROOT || '/home'
const CHILD_MARKER = process.env.PROBE_CHILD_MARKER || '593.417'
const result = { writes: {}, facts: {} }

const write = (target, text) => {
  const parent = target.split('/').slice(0, -1).join('/')
  fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(target, text)
}

try { write(`${WORKSPACE}/probe-workspace.txt`, 'workspace-ok'); result.writes.workspace = 'ok' }
catch (error) { result.writes.workspace = String(error.code || error) }

try { write(`${HOME}/ro-input.txt`, 'tampered'); result.writes.ro = 'unexpected' }
catch (error) { result.writes.ro = String(error.code || error) }

try { write(`${HOME}/probe-home.txt`, 'home-ok'); result.writes.home = 'ok' }
catch (error) { result.writes.home = String(error.code || error) }

try { write(`${HOME}/.tmp/residue.txt`, 'ephemeral'); result.writes.ephemeral = 'ok' }
catch (error) { result.writes.ephemeral = String(error.code || error) }

result.facts.hostHomeVisible = fs.existsSync(HOST_ROOT)
result.facts.cwd = process.cwd()

const linger = fs.existsSync(`${WORKSPACE}/linger`)
if (linger) {
  // A unique argv: the child lives in the room's PID namespace, so the host
  // identifies it by this argument, not by any pid the probe could report.
  // The Android/Windows portability note: the child is node itself.
  const child = spawn(process.execPath, ['-e', `setTimeout(()=>{}, 600000); // ${CHILD_MARKER}`], { stdio: 'ignore' })
  result.facts.childPid = child.pid
}

// A pipe is block-buffered for node; a lingering probe would never flush
// its report, and the gate's reader would time out waiting for it.
fs.writeSync(1, JSON.stringify(result) + '\n')
if (linger) {
  setInterval(() => {}, 1000)
} else {
  process.exit(0)
}
