/**
 * P20 — work status panel screenshot driver.
 *
 * Seeds one workspace with two fast sessions (for sidebar realism) and one
 * SLOW turn (the fixture holds its answer), opens that running session in the
 * chat view, and captures the work status panel in its three states plus the
 * session area around it. Everything on screen is service truth: the running
 * state, the elapsed stamp and the queue come from the wire projection.
 *
 * Usage (Windows, from apps/desktop):
 *   node e2e/p20-panel-shot-driver.mjs <sandboxRoot> <outDir> --shots <dir>
 * Environment: same contract as the P19/P42 drivers.
 */

/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { createStepRecorder, summarizeResults } from './p06-acceptance-helpers.mjs'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const SANDBOX_ROOT = process.argv[2]
const OUT_DIR = process.argv[3]
const shotsIndex = process.argv.indexOf('--shots')
const SHOTS_DIR = shotsIndex > -1 ? process.argv[shotsIndex + 1] : path.join(OUT_DIR, 'shots')
const SERVER_PORT = Number(process.env.AGENTBOX_SERVER_PORT ?? '18757')

if (!SANDBOX_ROOT || !OUT_DIR) {
  console.error('usage: node e2e/p20-panel-shot-driver.mjs <sandboxRoot> <outDir> [--shots <dir>]')
  process.exit(2)
}

const BACKEND_WINDOWS_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT
const BACKEND_LINUX_ROOT = process.env.AGENTBOX_SERVER_LINUX_ROOT
const PYTHON_LAUNCHER = process.env.AGENTBOX_SERVER_PYTHON ?? 'py.exe -3.12'
const WIRE_SCHEMA = process.env.AGENTBOX_WIRE_SCHEMA
const WSL_USER = process.env.USERNAME ?? 'maoqh'

const STEP_IDS = [
  'driver-target',
  'sandbox-isolated',
  'server-started',
  'lifecycle-connection-installed',
  'workspaces-registered',
  'profiles-created',
  'fast-sessions-seeded',
  'slow-turn-running',
  'session-opened-with-panel',
  'panel-shots-captured',
  'clean-shutdown'
]

const steps = []
const record = createStepRecorder(steps)
const notes = []

function note(message) {
  notes.push(message)
}

function progress(message) {
  console.log(`[p20 ${new Date().toISOString()}] ${message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function wsl(args) {
  return execFileSync('wsl.exe', ['--distribution', 'Ubuntu', '--exec', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

async function wire(page, method, params) {
  return page.evaluate(
    async ([methodName, methodParams]) => {
      const id = `p20-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

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

async function wireOk(page, method, params, label) {
  return wireResult(await wire(page, method, params), label ?? method)
}

function electronBinary() {
  const candidates = [
    path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(DESKTOP_ROOT, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`electron.exe not found; looked in ${candidates.join(', ')}`)
}

async function waitForLiveness(process_, deadlineMs) {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    if (process_.exitCode !== null) {
      return `server exited with code ${process_.exitCode}`
    }

    try {
      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)

      if (response.ok) {
        return null
      }
    } catch {
      // not listening yet is the expected state while it boots
    }

    await sleep(100)
  }

  return 'server did not become live in time'
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('[p20] watchdog: no completion in 8 minutes; exiting')
    console.error(notes.length ? notes.join('\n') : '(no notes)')
    process.exit(3)
  }, 8 * 60 * 1000)
  watchdog.unref()

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  if (!BACKEND_WINDOWS_ROOT || !BACKEND_LINUX_ROOT) {
    console.error('AGENTBOX_SERVER_SOURCE_ROOT and AGENTBOX_SERVER_LINUX_ROOT are required')
    process.exit(2)
  }

  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const stamp = Date.now().toString(36)
  const workspaceLinux = `/tmp/agentbox-p20-${stamp}`
  const fixtureLinux = path.posix.join(BACKEND_LINUX_ROOT, 'tests/server/fixtures/stateful_acp_peer.mjs')
  const slowFixtureLinux = path.posix.join(
    BACKEND_LINUX_ROOT, 'plugins/agent-box-harnesses/tests/harness_remote/fake_acp_peer.mjs'
  )
  const workerLinux = path.posix.join(
    BACKEND_LINUX_ROOT,
    'workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker'
  )
  const workerManifest = path.join(BACKEND_WINDOWS_ROOT, 'workers/agent-box-worker/.acceptance-bundle-c8/manifest.json')

  fs.writeFileSync(serverLog, '')

  record('driver-target', 'driver target', 'PASS', `sandbox=${SANDBOX_ROOT}`)

  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  wsl(['/usr/bin/mkdir', '-p', workspaceLinux])
  wsl(['/usr/bin/cp', fixtureLinux, `${workspaceLinux}/stateful_acp_peer.mjs`])
  wsl(['/usr/bin/cp', slowFixtureLinux, `${workspaceLinux}/fake_acp_peer.mjs`])

  const projected = wsl(['/usr/bin/ls', `${workspaceLinux}/stateful_acp_peer.mjs`]).trim()

  record(
    'sandbox-isolated',
    'the isolated WSL workspace exists with both fixtures projected',
    projected.endsWith('stateful_acp_peer.mjs') ? 'PASS' : 'FAIL',
    `workspace=${workspaceLinux}`
  )

  const deployment = {
    schemaVersion: 1,
    harnesses: [
      {
        id: 'pi',
        capabilityClaims: { stream: true },
        controlOptions: { model: ['fixture-model'] },
        adapter: {
          args: ['/workspace/fake_acp_peer.mjs'],
          command: '/usr/bin/node',
          environment: { AGENTBOX_FIXTURE_SILENCE_MS: '20000' }
        },
        timeoutMs: 30000
      },
      {
        id: 'hermes',
        capabilityClaims: { native_continuation: true, stream: true },
        controlOptions: { model: ['fixture-model'] },
        adapter: { args: ['/workspace/stateful_acp_peer.mjs'], command: '/usr/bin/node' },
        stateProjection: { target: '/runtime/home/sessions' },
        timeoutMs: 30000
      }
    ]
  }
  const deploymentPath = path.join(SANDBOX_ROOT, 'deployment.json')

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment), 'utf8')

  const serverEnv = {
    ...process.env,
    AGENT_BOX_WIRE_SCHEMA: WIRE_SCHEMA ?? '',
    AGENT_BOX_WSL_WORKER_LINUX_PATH: workerLinux,
    AGENT_BOX_WSL_WORKER_MANIFEST: workerManifest,
    PYTHONPATH: [
      path.join(BACKEND_WINDOWS_ROOT, 'src'),
      path.join(BACKEND_WINDOWS_ROOT, 'plugins/agent-box-harnesses/src'),
      path.join(BACKEND_WINDOWS_ROOT, 'plugins/agent-box-runtime-wsl/src'),
      path.join(BACKEND_WINDOWS_ROOT, 'plugins/agent-box-sandbox-bwrap/src')
    ].join(';')
  }
  delete serverEnv.AGENTBOX_SERVER_ROOT
  delete serverEnv.AGENTBOX_SERVER_PORT

  const serverLogFd = fs.openSync(serverLog, 'a')
  const [launcher, ...launcherArgs] = PYTHON_LAUNCHER.split(' ')
  const server = spawn(
    launcher,
    [
      ...launcherArgs,
      '-m',
      'agent_box.server',
      '--data-root',
      serverDataRoot,
      '--port',
      String(SERVER_PORT),
      '--sidecar-deployment',
      deploymentPath,
      '--plugin-root',
      path.join(BACKEND_WINDOWS_ROOT, 'plugins/agent-box-harnesses')
    ],
    { env: serverEnv, stdio: ['ignore', serverLogFd, serverLogFd] }
  )

  const livenessFailure = await waitForLiveness(server, 30000)
  const tokenPath = path.join(serverDataRoot, 'secrets', 'http-token')

  record(
    'server-started',
    'the AgentBox Server is live on loopback with its own token',
    livenessFailure === null && fs.existsSync(tokenPath) ? 'PASS' : 'FAIL',
    livenessFailure ?? `dataRoot=${serverDataRoot}`
  )

  const home = path.join(SANDBOX_ROOT, 'hermes-home')
  const userData = path.join(SANDBOX_ROOT, 'user-data')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const appEnv = {
    ...process.env,
    AGENTBOX_SERVER_PORT: String(SERVER_PORT),
    AGENTBOX_SERVER_ROOT: serverDataRoot,
    HERMES_DESKTOP_APP_NAME: 'HermesP20Panel',
    HERMES_DESKTOP_USER_DATA_DIR: userData,
    HERMES_HOME: home
  }
  delete appEnv.HERMES_DESKTOP_BOOT_FAKE
  delete appEnv.HERMES_DESKTOP_BOOT_FAKE_ERROR

  const app = await _electron.launch({
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    cwd: DESKTOP_ROOT,
    env: appEnv,
    executablePath: electronBinary()
  })

  let exitCode = 0
  let serverKilled = false

  try {
    const page = await app.firstWindow()
    progress('firstWindow resolved')

    await page.waitForLoadState('domcontentloaded')

    const hello = await wireOk(page, 'server.hello', { clientPresentationSupports: [], clientVersions: ['wire/1'] }, 'server.hello')

    record(
      'lifecycle-connection-installed',
      'the lifecycle connection is installed and reachable from the renderer',
      hello?.serverId ? 'PASS' : 'FAIL',
      `hello.serverId=${hello?.serverId ?? 'missing'}`
    )

    const opened = await wireOk(
      page,
      'workspaces.open',
      {
        environment: { host: 'Ubuntu', kind: 'wsl', user: WSL_USER },
        path: workspaceLinux,
        requestId: 'p20-open'
      },
      'workspaces.open'
    )

    const hostStore = {
      version: 2,
      workspaces: [
        {
          id: 'p20-workspace',
          name: 'Panel Demo',
          kind: 'wsl',
          distribution: opened.workspace.environment.host,
          configuredUser: null,
          actualUser: opened.workspace.environment.user,
          rootPath: workspaceLinux,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archivedAt: null
        }
      ],
      savedRequests: {}
    }

    fs.writeFileSync(path.join(userData, 'wsl-workspaces.json'), `${JSON.stringify(hostStore, null, 2)}\n`, 'utf8')

    record('workspaces-registered', 'the workspace registers and the host row is saved', 'PASS', `id=${opened.workspace.id}`)

    const fastProfile = (
      await wireOk(
        page,
        'profiles.create',
        { displayName: 'Fast role', harness: 'hermes', requestId: 'p20-fast-profile' },
        'profiles.create (fast)'
      )
    ).profile

    await wireOk(
      page,
      'profiles.updateConfig',
      {
        expectedVersion: fastProfile.version,
        profileId: fastProfile.id,
        requestId: 'p20-fast-config',
        values: [{ controlId: 'model', value: 'fixture-model' }]
      },
      'profiles.updateConfig (fast)'
    )

    const slowProfile = (
      await wireOk(
        page,
        'profiles.create',
        { displayName: 'Slow role', harness: 'pi', requestId: 'p20-slow-profile' },
        'profiles.create (slow)'
      )
    ).profile

    await wireOk(
      page,
      'profiles.updateConfig',
      {
        expectedVersion: slowProfile.version,
        profileId: slowProfile.id,
        requestId: 'p20-slow-config',
        values: [{ controlId: 'model', value: 'fixture-model' }]
      },
      'profiles.updateConfig (slow)'
    )

    record('profiles-created', 'fast and slow roles exist', 'PASS', `fast=${fastProfile.id} slow=${slowProfile.id}`)

    // Two fast sessions so the sidebar reads populated while the panel acts.
    for (const text of ['Inspect build warnings', 'Tidy the changelog']) {
      const sent = await wireOk(
        page,
        'sessions.createAndSend',
        {
          message: { attachments: [], text },
          overrides: [],
          profileId: fastProfile.id,
          requestId: `p20-fast-${text}`,
          workspaceId: opened.workspace.id
        },
        'sessions.createAndSend (fast)'
      )

      const deadline = Date.now() + 60000

      while (Date.now() < deadline) {
        const history = await wireOk(page, 'history.snapshot', { sessionId: sent.session.id }, 'history.snapshot')

        if (history.frames.some(frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed')) {
          break
        }

        await sleep(400)
      }
    }

    record('fast-sessions-seeded', 'two fast sessions completed', 'PASS', 'titles=2')

    // The slow turn: running long enough to photograph the panel mid-run.
    const slow = await wireOk(
      page,
      'sessions.createAndSend',
      {
        message: { attachments: [], text: 'Wait quietly, then answer.' },
        overrides: [],
        profileId: slowProfile.id,
        requestId: 'p20-slow-turn',
        workspaceId: opened.workspace.id
      },
      'sessions.createAndSend (slow)'
    )

    let runningSeen = false
    const runningDeadline = Date.now() + 30000

    while (Date.now() < runningDeadline) {
      const history = await wireOk(page, 'history.snapshot', { sessionId: slow.session.id }, 'history.snapshot')

      if (history.frames.some(frame => frame.event.kind === 'execution.state' && frame.event.state === 'running')) {
        runningSeen = true
        break
      }

      await sleep(300)
    }

    record('slow-turn-running', 'the slow turn is running on the service', runningSeen ? 'PASS' : 'FAIL', `session=${slow.session.id}`)

    // Reload so the boot catalog carries everything, expand the workspace row
    // and open the RUNNING session — the real user path to the panel.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-workspace-list]', { timeout: 30000 })

    const expandButtons = page.locator('[data-wsl-workspace-expand]')

    for (let index = 0; index < (await expandButtons.count()); index += 1) {
      await expandButtons.nth(index).click()
      await sleep(250)
    }

    const sessionRow = page.locator(`[data-agentbox-session-open="${slow.session.id}"]`)

    await sessionRow.click()
    await page.waitForSelector('[data-work-status-panel]', { timeout: 30000 })
    progress('panel visible')

    record('session-opened-with-panel', 'the running session is open and the panel shows its facts', 'PASS', `sessionId=${slow.session.id}`)

    await page.screenshot({ path: path.join(SHOTS_DIR, '01-panel-collapsed.png') })

    await page.locator('[data-work-status-toggle]').click()
    await sleep(400)
    await page.screenshot({ path: path.join(SHOTS_DIR, '02-panel-expanded.png') })

    await page.locator('[data-work-status-close]').click()
    await sleep(300)
    await page.screenshot({ path: path.join(SHOTS_DIR, '03-panel-closed-ghost.png') })

    await page.locator('[data-work-status-reopen]').click()
    await sleep(300)

    const shot = ['01-panel-collapsed.png', '02-panel-expanded.png', '03-panel-closed-ghost.png'].every(name =>
      fs.existsSync(path.join(SHOTS_DIR, name))
    )

    record('panel-shots-captured', 'collapsed, expanded and closed-ghost shots captured', shot ? 'PASS' : 'FAIL', SHOTS_DIR)

    await app.close()
    server.kill()
    serverKilled = true

    if (server.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // already gone
      }
    }

    let portFree = false

    try {
      await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)
    } catch {
      portFree = true
    }

    record('clean-shutdown', 'the app and the Server both stop', portFree ? 'PASS' : 'FAIL', `portFree=${portFree}`)
  } catch (error) {
    note(`driver error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
    exitCode = 1
  } finally {
    try {
      await app.close()
    } catch {
      // already closed
    }

    if (!serverKilled && server.exitCode === null) {
      server.kill()
    }
  }

  const summary = summarizeResults(steps)
  const report = { ...summary, detail: steps, notes, sandbox: SANDBOX_ROOT, serverPort: SERVER_PORT }

  fs.writeFileSync(path.join(OUT_DIR, 'panel-results.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`PANEL: executed ${summary.executed} → allOk=${summary.allOk}; counts=${JSON.stringify(summary.counts)}`)

  if (steps.length !== STEP_IDS.length) {
    console.error(`expected ${STEP_IDS.length} steps, recorded ${steps.length}`)
    exitCode = 1
  }

  if (!summary.allOk) {
    exitCode = 1
  }

  process.exit(exitCode)
}

void main()
