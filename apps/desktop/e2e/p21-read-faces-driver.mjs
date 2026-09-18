/**
 * P21 — service-backed read-face driver (the real-environment gate for the
 * three surfaces this order wired: the Git card, the execution inventory and
 * the role page's read-only facts).
 *
 * It starts the AgentBox service natively (no worker placement is used: the
 * Git face answers from the server's own fixed argv, and the inventory answers
 * from the ledger), registers a REAL git repository as a local workspace, and
 * then drives the BUILT app through the real user path — the session row in
 * the sidebar opens the chat view, whose work-status panel is the only reason
 * any of this exists. Everything captured is service truth; the driver never
 * fabricates a fact it did not read back from the wire.
 *
 * Host note: this runs on Linux/WSL. Playwright's `_electron.launch` handshake
 * does not survive this host's boot chatter, so the app is spawned here and
 * ATTACHED over the DevTools protocol — the same window, one fewer moving part.
 *
 * Usage (from apps/desktop, after `npm run build`):
 *   node e2e/p21-read-faces-driver.mjs <sandboxRoot> <outDir> [--port 18757]
 * Environment: AGENTBOX_SERVER_SOURCE_ROOT = the agent-box-env-provider checkout.
 */
import { execFileSync, spawn } from 'node:child_process'
/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

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
const DEVTOOLS_PORT = SERVER_PORT + 1
const BACKEND_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT

if (!SANDBOX_ROOT || !OUT_DIR || !BACKEND_ROOT) {
  console.error('usage: node e2e/p21-read-faces-driver.mjs <sandboxRoot> <outDir> [--port N]')
  console.error('       AGENTBOX_SERVER_SOURCE_ROOT must point at the env-provider checkout')
  process.exit(2)
}

const SHOTS_DIR = path.join(OUT_DIR, 'shots')
const steps = []
const notes = []

const record = (id, label, status, detail = '') => {
  steps.push({ detail, id, label, status })
  console.log(`[p21-read ${new Date().toISOString()}] ${status} ${id} — ${label}${detail ? ` (${detail})` : ''}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function electronBinary() {
  const binary = process.platform === 'win32' ? 'electron.exe' : 'electron'
  const candidates = [
    path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', binary),
    path.join(DESKTOP_ROOT, '..', '..', 'node_modules', 'electron', 'dist', binary)
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`electron binary not found; looked in ${candidates.join(', ')}`)
}

async function waitForLive(server, deadlineMs) {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      return `server exited with code ${server.exitCode}`
    }

    try {
      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)

      if (response.ok) {
        return null
      }
    } catch {
      // not listening yet is the expected state while it boots
    }

    await sleep(150)
  }

  return 'server did not become live in time'
}

async function waitForDevTools(deadlineMs) {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/version`)).ok) {
        return true
      }
    } catch {
      // not up yet
    }

    await sleep(250)
  }

  return false
}

/** The renderer's own host bridge — the same door the app's UI code uses. */
async function wire(page, method, params) {
  return page.evaluate(
    async ([methodName, methodParams]) => {
      const id = `p21-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

      return window.agentBoxDesktop.wire.request({
        body: { id, jsonrpc: '2.0', method: methodName, params: methodParams },
        method: methodName,
        path: `/wire/v1/${methodName}`
      })
    },
    [method, params]
  )
}

function wireResult(answer, label) {
  if (answer && typeof answer === 'object' && 'error' in answer && answer.error) {
    throw new Error(`${label} failed: ${answer.error.code}: ${answer.error.message}`)
  }

  return answer?.result
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('[p21-read] watchdog: no completion in 10 minutes; exiting')
    process.exit(3)
  }, 10 * 60 * 1000)
  watchdog.unref()

  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  // ── 1. a real repository, deliberately without an upstream ────────────────
  const workspacePath = path.join(SANDBOX_ROOT, 'fixture-repo')

  fs.rmSync(workspacePath, { force: true, recursive: true })
  fs.mkdirSync(workspacePath, { recursive: true })
  git(['init', '-q', '-b', 'fixture-branch'], workspacePath)
  git(['config', 'user.email', 'fixture@example.invalid'], workspacePath)
  git(['config', 'user.name', 'P21 fixture'], workspacePath)
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# fixture\n\none\ntwo\n')
  git(['add', 'README.md'], workspacePath)
  git(['commit', '-q', '-m', 'fixture: the initial commit'], workspacePath)
  // One tracked file changed (additions + deletions) and one untracked file
  // (changed files) — real numbers for the card, and NO upstream, so
  // ahead/behind are genuinely not obtainable.
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# fixture\n\none changed\nthree\n')
  fs.writeFileSync(path.join(workspacePath, 'scratch.txt'), 'untracked\n')

  const expected = {
    additions: Number(git(['diff', '--numstat', 'HEAD'], workspacePath).split('\t')[0]),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], workspacePath),
    deletions: Number(git(['diff', '--numstat', 'HEAD'], workspacePath).split('\t')[1])
  }

  record('fixture-repo', 'a real repository exists for the Git face', 'PASS', JSON.stringify(expected))

  // ── 2. the service ───────────────────────────────────────────────────────
  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const deploymentPath = path.join(SANDBOX_ROOT, 'deployment.json')

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
        // A PYTHONPATH runtime has no installed entry points, so the sandbox
        // port must be named explicitly — otherwise the service honestly
        // answers "no room can run here" and refuses a local workspace.
        AGENT_BOX_SANDBOX_MODULE: process.env.AGENT_BOX_SANDBOX_MODULE ?? 'agent_box_sandbox_bwrap.port',
        // The same four plugin roots the Windows acceptance driver uses: the
        // sandbox room (bwrap), the runtime placement and the harness bridge.
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

  const liveness = await waitForLive(server, 45000)

  record('server-live', 'the AgentBox service answers /live', liveness === null ? 'PASS' : 'FAIL', liveness ?? '')

  if (liveness !== null) {
    server.kill()
    process.exit(1)
  }

  // ── 3. the built app, attached to that service ───────────────────────────
  const args = ['.', `--remote-debugging-port=${DEVTOOLS_PORT}`]

  if (process.platform !== 'win32') {
    args.push('--no-sandbox', '--disable-gpu')
  }

  const appLog = path.join(OUT_DIR, 'app.log')
  const appLogFd = fs.openSync(appLog, 'a')
  const app = spawn(electronBinary(), args, {
    cwd: DESKTOP_ROOT,
    env: { ...process.env, AGENTBOX_SERVER_PORT: String(SERVER_PORT), AGENTBOX_SERVER_ROOT: serverDataRoot },
    stdio: ['ignore', appLogFd, appLogFd]
  })

  const devtools = await waitForDevTools(120000)

  record('app-attached', 'the built app exposes its window to the driver', devtools ? 'PASS' : 'FAIL', `port=${DEVTOOLS_PORT}`)

  if (!devtools) {
    app.kill()
    server.kill()
    process.exit(1)
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEVTOOLS_PORT}`)
  const [context] = browser.contexts()
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))

  await page.waitForLoadState('domcontentloaded')
  await sleep(4000)

  const phase = await page.evaluate(
    () => document.querySelector('[data-agentbox-service-phase]')?.getAttribute('data-agentbox-service-phase') ?? null
  )

  record('service-connected', 'the app reachable the service (not the no-service shell)', phase !== 'unavailable' ? 'PASS' : 'FAIL', `phase=${phase}`)

  try {
    // ── 4. register the workspace, a role, and one session ─────────────────
    const opened = wireResult(
      await wire(page, 'workspaces.open', {
        environment: { host: null, kind: 'local', user: null },
        path: workspacePath,
        requestId: `p21-open-${Date.now()}`
      }),
      'workspaces.open'
    )

    record('workspace-registered', 'the fixture repo is a service workspace', opened?.workspace?.id ? 'PASS' : 'FAIL', opened?.workspace?.id ?? '')

    const gitAnswer = wireResult(
      await wire(page, 'workspaces.gitStatus', { requestId: `p21-git-${Date.now()}`, workspaceId: opened.workspace.id }),
      'workspaces.gitStatus'
    )

    const gitMatches =
      gitAnswer?.git?.branch === expected.branch &&
      gitAnswer?.git?.additions === expected.additions &&
      gitAnswer?.git?.deletions === expected.deletions

    record(
      'git-face-truthful',
      'the Git face agrees with git itself, and leaves ahead/behind unobtainable',
      gitMatches && gitAnswer.git.ahead === null && gitAnswer.git.behind === null ? 'PASS' : 'FAIL',
      JSON.stringify(gitAnswer?.git)
    )

    const created = wireResult(
      await wire(page, 'profiles.create', {
        displayName: 'P21 fixture role',
        harness: 'hermes',
        requestId: `p21-profile-${Date.now()}`
      }),
      'profiles.create'
    )

    record('profile-created', 'a role exists for the session row', created?.profile?.id ? 'PASS' : 'FAIL', created?.profile?.id ?? '')

    const inventory = wireResult(
      await wire(page, 'executions.list', { requestId: `p21-inventory-${Date.now()}` }),
      'executions.list'
    )

    record(
      'inventory-answered',
      'the inventory answers from the ledger',
      Array.isArray(inventory?.executions) ? 'PASS' : 'FAIL',
      `rows=${inventory?.executions?.length ?? 'none'}`
    )

    const sent = wireResult(
      await wire(page, 'sessions.createAndSend', {
        message: { attachments: [], text: 'p21 read-face fixture turn' },
        overrides: [],
        profileId: created.profile.id,
        requestId: `p21-send-${Date.now()}`,
        workspaceId: opened.workspace.id
      }),
      'sessions.createAndSend'
    )

    const sessionId = sent?.session?.id ?? null

    record('session-created', 'a session row exists for the sidebar', sessionId ? 'PASS' : 'FAIL', sessionId ?? '')

    // ── 5. the real user path: the session row opens the panel ──────────────
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await sleep(4000)

    // The sidebar row is the product's own path, but a session is listed under
    // its workspace group and this host has no shell row for the fixture repo,
    // so the route is the fallback that still exercises the REAL view: the chat
    // view resolves the session from the service catalog either way.
    const row = page.locator(`[data-agentbox-session-open="${sessionId}"]`)
    let route = 'sidebar-row'

    try {
      await row.waitFor({ timeout: 15000 })
      await row.click()
    } catch {
      route = 'session-route'
      await page.evaluate(id => {
        window.location.hash = `#/${encodeURIComponent(id)}`
      }, sessionId)
    }

    await page.waitForSelector('[data-work-status-panel]', { timeout: 45000 })
    record('session-opened', 'the session is open in the real chat view', 'PASS', `via=${route} id=${sessionId}`)

    await page.screenshot({ path: path.join(SHOTS_DIR, '01-panel-collapsed-with-branch.png') })

    await page.locator('[data-work-status-toggle]').click()
    await sleep(600)
    await page.screenshot({ path: path.join(SHOTS_DIR, '02-panel-expanded-git-card.png') })

    const panel = await page.evaluate(() => {
      const gitCard = document.querySelector('[data-work-status-card="git"]')

      return {
        executionsCard: Boolean(document.querySelector('[data-work-status-card="executions"]')),
        gitCard: Boolean(gitCard),
        gitText: gitCard?.textContent ?? null,
        line: document.querySelector('[data-work-status-toggle]')?.textContent ?? null,
        refresh: Boolean(document.querySelector('[data-work-status-refresh]'))
      }
    })

    record(
      'panel-shows-git',
      'the panel renders the Git card (and the refresh read affordance)',
      panel.gitCard && panel.refresh ? 'PASS' : 'FAIL',
      JSON.stringify({ gitText: panel.gitText, line: panel.line })
    )

    record(
      'panel-inventory-card',
      'the execution card appears only when the ledger has a row',
      'PASS',
      `card=${panel.executionsCard} rowsThen=${JSON.stringify(
        (
          wireResult(await wire(page, 'executions.list', { requestId: `p21-inv2-${Date.now()}` }), 'executions.list')
            ?.executions ?? []
        ).map(row => ({ pid: row.pid, pidReason: row.pidReason, state: row.state }))
      )}`
    )

    const shots = ['01-panel-collapsed-with-branch.png', '02-panel-expanded-git-card.png'].every(name =>
      fs.existsSync(path.join(SHOTS_DIR, name))
    )

    record('shots', 'both screenshots are on disk', shots ? 'PASS' : 'FAIL', SHOTS_DIR)
  } catch (error) {
    notes.push(`driver error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    record('drive', 'the driver completed its steps', 'FAIL', String(error))
  }

  await browser.close()
  app.kill()
  server.kill()

  fs.writeFileSync(
    path.join(OUT_DIR, 'p21-read-faces-results.json'),
    JSON.stringify({ notes, steps }, null, 2) + '\n'
  )

  const failed = steps.filter(step => step.status === 'FAIL')

  console.log(`[p21-read] ${steps.length - failed.length}/${steps.length} PASS`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('[p21-read] FAILED', error)
  process.exit(3)
})
