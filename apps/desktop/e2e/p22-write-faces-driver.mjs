/**
 * P22 — service-backed WRITE-face driver (the real-environment gate for the
 * five write paths this order wired).
 *
 * It starts the AgentBox service, drives the BUILT app's own host bridge, and
 * walks each write path against the real backend: publish a skill from a host
 * directory, bind it to a role, read the bindings back, unbind it, clone the
 * role, write its permission posture, list the hooks (and try the ones the
 * service refuses), and ask for the managed accounts — printing whatever the
 * service actually answers, typed refusals included. Nothing is asserted
 * against a local model of the service; the transcript IS the evidence.
 *
 * Usage (from apps/desktop, after `npm run build`):
 *   node e2e/p22-write-faces-driver.mjs <sandboxRoot> <outDir> [--port 18757]
 * Environment: AGENTBOX_SERVER_SOURCE_ROOT = the agent-box-env-provider checkout.
 */
/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const SANDBOX_ROOT = process.argv[2]
const OUT_DIR = process.argv[3]
const portIndex = process.argv.indexOf('--port')
const SERVER_PORT = portIndex > -1 ? Number(process.argv[portIndex + 1]) : 18757
const DEVTOOLS_PORT = SERVER_PORT + 2
const BACKEND_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT

if (!SANDBOX_ROOT || !OUT_DIR || !BACKEND_ROOT) {
  console.error('usage: node e2e/p22-write-faces-driver.mjs <sandboxRoot> <outDir> [--port N]')
  process.exit(2)
}

const steps = []
const record = (id, label, status, detail = '') => {
  steps.push({ detail, id, label, status })
  console.log(`[p22-write ${new Date().toISOString()}] ${status} ${id} — ${label}${detail ? ` (${detail})` : ''}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function statusOf(answer) {
  if (answer && typeof answer === 'object' && 'error' in answer && answer.error) {
    const { code, details, message } = answer.error

    return { code, detail: details?.internalCode ?? null, message, ok: false }
  }

  return { ok: true, result: answer?.result }
}

async function waitFor(probe, deadlineMs, label) {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    try {
      if (await probe()) {
        return true
      }
    } catch {
      // not up yet
    }

    await sleep(200)
  }

  console.log(`[p22-write] timed out waiting for ${label}`)

  return false
}

function electronBinary() {
  const binary = process.platform === 'win32' ? 'electron.exe' : 'electron'

  for (const candidate of [
    path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', binary),
    path.join(DESKTOP_ROOT, '..', '..', 'node_modules', 'electron', 'dist', binary)
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('electron binary not found')
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('[p22-write] watchdog: no completion in 10 minutes')
    process.exit(3)
  }, 10 * 60 * 1000)

  watchdog.unref()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // ── fixtures: a real skill directory and a code asset to publish ─────────
  const skillDir = path.join(SANDBOX_ROOT, 'fixture-skill')

  fs.rmSync(skillDir, { force: true, recursive: true })
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: p22-fixture-skill\ndescription: A fixture skill the P22 driver publishes\n---\n\n# Fixture\n\nNothing to see.\n'
  )
  fs.writeFileSync(path.join(skillDir, 'notes.md'), 'fixture payload\n')

  const pluginFile = path.join(SANDBOX_ROOT, 'fixture-plugin.mjs')

  fs.writeFileSync(pluginFile, 'export default { name: "p22-fixture-plugin" }\n')

  // ── the service ─────────────────────────────────────────────────────────
  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const deploymentPath = path.join(SANDBOX_ROOT, 'deployment.json')
  const serverLog = path.join(OUT_DIR, 'server.log')

  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify({
      harnesses: [
        {
          adapter: {
            args: [path.join(BACKEND_ROOT, 'tests/server/fixtures/stateful_acp_peer.mjs')],
            command: process.execPath
          },
          capabilityClaims: { native_continuation: true, stream: true },
          controlOptions: { model: ['fixture-model'] },
          id: 'hermes',
          timeoutMs: 30000
        }
      ],
      schemaVersion: 1
    }),
    'utf8'
  )

  const logFd = fs.openSync(serverLog, 'a')
  const server = spawn(
    'python3',
    [
      '-m',
      'agent_box.server',
      '--data-root',
      serverDataRoot,
      '--port',
      String(SERVER_PORT),
      '--sidecar-deployment',
      deploymentPath,
      '--plugin-root',
      path.join(BACKEND_ROOT, 'plugins/agent-box-harnesses')
    ],
    {
      cwd: BACKEND_ROOT,
      env: {
        ...process.env,
        AGENT_BOX_SANDBOX_MODULE: process.env.AGENT_BOX_SANDBOX_MODULE ?? 'agent_box_sandbox_bwrap.port',
        PYTHONPATH: [
          path.join(BACKEND_ROOT, 'src'),
          path.join(BACKEND_ROOT, 'plugins/agent-box-harnesses/src'),
          path.join(BACKEND_ROOT, 'plugins/agent-box-runtime-wsl/src'),
          path.join(BACKEND_ROOT, 'plugins/agent-box-sandbox-bwrap/src')
        ].join(':')
      },
      stdio: ['ignore', logFd, logFd]
    }
  )

  const live = await waitFor(
    async () => (await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)).ok,
    45000,
    'the service'
  )

  record('server-live', 'the AgentBox service answers /live', live ? 'PASS' : 'FAIL')

  if (!live) {
    server.kill()
    process.exit(1)
  }

  // ── the built app, attached ─────────────────────────────────────────────
  const app = spawn(electronBinary(), ['.', `--remote-debugging-port=${DEVTOOLS_PORT}`, '--no-sandbox', '--disable-gpu'], {
    cwd: DESKTOP_ROOT,
    env: { ...process.env, AGENTBOX_SERVER_PORT: String(SERVER_PORT), AGENTBOX_SERVER_ROOT: serverDataRoot },
    stdio: ['ignore', fs.openSync(path.join(OUT_DIR, 'app.log'), 'a'), fs.openSync(path.join(OUT_DIR, 'app.log'), 'a')]
  })

  const attached = await waitFor(
    async () => (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).ok,
    120000,
    'the window'
  )

  record('app-attached', 'the built app exposes its window', attached ? 'PASS' : 'FAIL')

  if (!attached) {
    app.kill()
    server.kill()
    process.exit(1)
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEVTOOLS_PORT}`)
  const [context] = browser.contexts()
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))

  await page.waitForLoadState('domcontentloaded')
  await sleep(4000)

  const call = async (method, params) =>
    page.evaluate(
      async ([methodName, methodParams]) => {
        const id = `p22-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

        return window.agentBoxDesktop.wire.request({
          body: { id, jsonrpc: '2.0', method: methodName, params: methodParams },
          method: methodName,
          path: `/wire/v1/${methodName}`
        })
      },
      [method, params]
    )

  const transcript = []

  const step = async (id, label, method, params, expect = 'ok') => {
    const answer = statusOf(await call(method, params))
    const ok = expect === 'ok' ? answer.ok : !answer.ok

    transcript.push({ answer, id, method, params })
    record(
      id,
      label,
      ok ? 'PASS' : 'FAIL',
      answer.ok ? JSON.stringify(answer.result).slice(0, 220) : `${answer.code}: ${answer.message} [${answer.detail ?? '-'}]`
    )

    return answer
  }

  try {
    const workspace = statusOf(
      await call('workspaces.open', {
        environment: { host: null, kind: 'local', user: null },
        path: SANDBOX_ROOT,
        requestId: `p22-open-${Date.now()}`
      })
    )
    const role = statusOf(
      await call('profiles.create', { displayName: 'P22 write fixture', harness: 'hermes', requestId: `p22-role-${Date.now()}` })
    )

    if (!workspace.ok || !role.ok) {
      record('fixtures', 'a workspace and a role exist', 'FAIL', JSON.stringify({ role, workspace }))
    } else {
      const profileId = role.result.profile.id

      // 1. publish a skill from a host directory — the real 58 write path
      await step(
        'publish-skill',
        'assets.publishSkill stores the directory and answers its digest',
        'assets.publishSkill',
        { assetId: 'p22-fixture-skill', requestId: `p22-pub-${Date.now()}`, revision: 1, sourcePath: skillDir }
      )
      // 2. publish a code asset — the real 59 write path (answered with a preview)
      await step(
        'publish-plugin',
        'assets.publishPlugin stores the file verbatim and previews it',
        'assets.publishPlugin',
        { assetId: 'p22-fixture-plugin', requestId: `p22-plug-${Date.now()}`, revision: 1, sourcePath: pluginFile }
      )
      // 3. bind it to the role, read it back, unbind
      await step('bind', 'assets.bind binds the published revision to the role', 'assets.bind', {
        assetId: 'p22-fixture-skill',
        profileId,
        requestId: `p22-bind-${Date.now()}`
      })
      await step('bindings', 'assets.bindings lists the binding for that role', 'assets.bindings', { profileId })
      await step('unbind', 'assets.unbind removes it again', 'assets.unbind', {
        assetId: 'p22-fixture-skill',
        profileId,
        requestId: `p22-unbind-${Date.now()}`
      })
      // 4. clone the role (with the migration report) and write its posture
      const clone = await step('clone', 'profiles.clone answers the migration report', 'profiles.clone', {
        displayName: 'P22 write fixture copy',
        profileId,
        requestId: `p22-clone-${Date.now()}`
      })

      await step('set-permissions', 'profiles.setPermissions writes the posture', 'profiles.setPermissions', {
        expectedVersion: role.result.profile.version,
        preset: 'plan',
        profileId,
        requestId: `p22-perm-${Date.now()}`,
        rules: [{ action: 'allow', key: 'read', pattern: null }]
      })

      if (clone.ok) {
        const copy = clone.result.profile
        const report = clone.result.migration

        record(
          'clone-report',
          'the clone report names what traveled and what did not',
          Array.isArray(report.items) && report.items.some(item => item.item === 'native-sessions' && !item.migrated)
            ? 'PASS'
            : 'FAIL',
          `${report.migratedCount} migrated / ${report.refusedCount} refused · origin=${copy.originProfileId ? 'set' : 'unset'}`
        )
      }

      // 5. hooks: list, then create one the family may or may not accept
      await step('hooks-list', 'hooks.list answers the ledger', 'hooks.list', { requestId: `p22-hooks-${Date.now()}` })
      await step(
        'hooks-create',
        'hooks.create is answered (accepted or refused by code)',
        'hooks.create',
        {
          family: 'opencode',
          model: { event: 'session_end', handlers: [{ async: false, command: '/usr/bin/true', timeout: 30, type: 'command' }] },
          name: 'P22 fixture hook',
          requestId: `p22-hook-${Date.now()}`
        },
        'any'
      )
      // 6. accounts: whatever the deployment answers (a missing secret store is
      //    the honest answer, not a failure of this driver)
      await step('accounts-list', 'accounts.list is answered (typed either way)', 'accounts.list', {}, 'any')
    }
  } catch (error) {
    record('drive', 'the driver completed its steps', 'FAIL', String(error))
  }

  await browser.close()
  app.kill()
  server.kill()

  fs.writeFileSync(path.join(OUT_DIR, 'p22-write-faces-results.json'), JSON.stringify({ steps, transcript }, null, 2) + '\n')

  const failed = steps.filter(item => item.status === 'FAIL')

  console.log(`[p22-write] ${steps.length - failed.length}/${steps.length} PASS`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('[p22-write] FAILED', error)
  process.exit(3)
})
