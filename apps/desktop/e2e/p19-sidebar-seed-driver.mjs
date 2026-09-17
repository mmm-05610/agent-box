/**
 * P19 G2 — seeded-sidebar screenshot driver.
 *
 * Starts a real AgentBox Server (the same way the P42 integration driver does:
 * release Worker, explicit no-model ACP fixture), registers THREE workspaces,
 * seeds THREE completed sessions in each, renames and pins them, then reloads
 * the renderer so the boot catalog picks everything up and captures the
 * populated sidebar — the density evidence the work order asks for.
 *
 * Every fact on screen is real: the sessions went through the production
 * transport, the titles are service records, the workspaces are the host's own
 * saved WSL rows. Nothing is mocked and no number is invented.
 *
 * Usage (Windows, from apps/desktop):
 *   node e2e/p19-sidebar-seed-driver.mjs <sandboxRoot> <outDir> --shots <dir>
 *
 * Required environment (same contract as the P42 driver):
 *   AGENTBOX_SERVER_SOURCE_ROOT   backend worktree, as Windows sees it
 *   AGENTBOX_SERVER_LINUX_ROOT    the same worktree as Linux sees it
 *   AGENTBOX_SERVER_PYTHON        python launcher, default: py.exe -3.12
 *   AGENTBOX_WIRE_SCHEMA          frontend's generated wire schema (Windows path)
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
const SERVER_PORT = Number(process.env.AGENTBOX_SERVER_PORT ?? '18753')

if (!SANDBOX_ROOT || !OUT_DIR) {
  console.error('usage: node e2e/p19-sidebar-seed-driver.mjs <sandboxRoot> <outDir> [--shots <dir>]')
  process.exit(2)
}

const BACKEND_WINDOWS_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT
const BACKEND_LINUX_ROOT = process.env.AGENTBOX_SERVER_LINUX_ROOT
const PYTHON_LAUNCHER = process.env.AGENTBOX_SERVER_PYTHON ?? 'py.exe -3.12'
const WIRE_SCHEMA = process.env.AGENTBOX_WIRE_SCHEMA
const WSL_USER = process.env.USERNAME ?? 'maoqh'

// Three "projects": each a workspace with its own name, path and three tasks.
const WORKSPACES = [
  {
    id: 'p19g2-alpha',
    dir: 'alpha-web',
    name: 'Alpha Web',
    sessions: [
      { title: 'Fix login redirect loop', text: 'Remember P19G2-A1 and reply with it.' },
      { title: 'Add dark mode toggle', text: 'Remember P19G2-A2 and reply with it.' },
      { title: 'Speed up dashboard query', text: 'Remember P19G2-A3 and reply with it.' }
    ]
  },
  {
    id: 'p19g2-beta',
    dir: 'beta-api',
    name: 'Beta API',
    sessions: [
      { title: 'Design webhook retry policy', text: 'Remember P19G2-B1 and reply with it.' },
      { title: 'Migrate auth to OAuth2', text: 'Remember P19G2-B2 and reply with it.' },
      { title: 'Add rate limiting', text: 'Remember P19G2-B3 and reply with it.' }
    ]
  },
  {
    id: 'p19g2-gamma',
    dir: 'gamma-docs',
    name: 'Gamma Docs',
    sessions: [
      { title: 'Draft onboarding guide', text: 'Remember P19G2-C1 and reply with it.' },
      { title: 'Update API reference', text: 'Remember P19G2-C2 and reply with it.' },
      { title: 'Translate landing page', text: 'Remember P19G2-C3 and reply with it.' }
    ]
  }
]

const STEP_IDS = [
  'driver-target',
  'sandbox-isolated',
  'server-started',
  'lifecycle-connection-installed',
  'server-hello',
  'workspaces-registered',
  'profile-created',
  'sessions-seeded-completed',
  'session-titles-and-pins',
  'catalog-refreshed',
  'sidebar-populated-three-by-three',
  'screenshots-captured',
  'clean-shutdown'
]

const steps = []
const record = createStepRecorder(steps)
const notes = []

function note(message) {
  notes.push(message)
}

function progress(message) {
  console.log(`[p19 ${new Date().toISOString()}] ${message}`)
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
      const id = `p19-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

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

const WATCHDOG_MINUTES = 8

async function main() {
  const watchdog = setTimeout(() => {
    console.error(`[p19] watchdog: no completion in ${WATCHDOG_MINUTES} minutes; dumping state and exiting`)
    console.error(notes.length ? notes.join('\n') : '(no notes)')
    process.exit(3)
  }, WATCHDOG_MINUTES * 60 * 1000)
  watchdog.unref()

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(SHOTS_DIR, { recursive: true })

  if (!BACKEND_WINDOWS_ROOT || !BACKEND_LINUX_ROOT) {
    console.error('AGENTBOX_SERVER_SOURCE_ROOT and AGENTBOX_SERVER_LINUX_ROOT are required')
    process.exit(2)
  }

  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const consoleLog = path.join(OUT_DIR, 'renderer-console.log')
  const stamp = Date.now().toString(36)
  const workspaceBase = `/tmp/agentbox-p19g2-${stamp}`
  const fixtureLinux = path.posix.join(BACKEND_LINUX_ROOT, 'tests/server/fixtures/stateful_acp_peer.mjs')
  const workerLinux = path.posix.join(
    BACKEND_LINUX_ROOT,
    'workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker'
  )
  const workerManifest = path.join(BACKEND_WINDOWS_ROOT, 'workers/agent-box-worker/.acceptance-bundle-c8/manifest.json')

  fs.writeFileSync(serverLog, '')
  fs.writeFileSync(consoleLog, '')

  record('driver-target', 'driver target', 'PASS', `sandbox=${SANDBOX_ROOT}`)

  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })

  for (const workspace of WORKSPACES) {
    wsl(['/usr/bin/mkdir', '-p', `${workspaceBase}/${workspace.dir}`])
    wsl(['/usr/bin/cp', fixtureLinux, `${workspaceBase}/${workspace.dir}/stateful_acp_peer.mjs`])
  }

  const projected = wsl(['/usr/bin/ls', `${workspaceBase}/${WORKSPACES[0].dir}/stateful_acp_peer.mjs`]).trim()

  record(
    'sandbox-isolated',
    'three isolated WSL workspaces exist with the fixture projected',
    projected.endsWith('stateful_acp_peer.mjs') ? 'PASS' : 'FAIL',
    `base=${workspaceBase}; fixture=${projected}`
  )

  const deployment = {
    schemaVersion: 1,
    harnesses: [
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
  const tokenExists = fs.existsSync(tokenPath)

  record(
    'server-started',
    'the AgentBox Server is live on loopback with its own token',
    livenessFailure === null && tokenExists ? 'PASS' : 'FAIL',
    livenessFailure ?? `dataRoot=${serverDataRoot}; tokenFile=${tokenExists ? 'present' : 'missing'}`
  )

  const home = path.join(SANDBOX_ROOT, 'hermes-home')
  const userData = path.join(SANDBOX_ROOT, 'user-data')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const appEnv = {
    ...process.env,
    AGENTBOX_SERVER_PORT: String(SERVER_PORT),
    AGENTBOX_SERVER_ROOT: serverDataRoot,
    HERMES_DESKTOP_APP_NAME: 'HermesP19Seed',
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
    app.on('window', candidate => {
      candidate.on('console', message => fs.appendFileSync(consoleLog, `[${message.type()}] ${message.text()}\n`))
      candidate.on('pageerror', error => fs.appendFileSync(consoleLog, `[pageerror] ${error}\n`))
    })

    const page = await app.firstWindow()
    progress('firstWindow resolved')

    page.on('pageerror', error => progress(`pageerror: ${error}`))
    page.on('console', message => {
      if (message.type() === 'error') {
        progress(`console.error: ${message.text()}`)
      }
    })

    await page.waitForLoadState('domcontentloaded')
    progress('domcontentloaded')

    progress('calling server.hello')
    const hello = await wireOk(page, 'server.hello', { clientPresentationSupports: [], clientVersions: ['wire/1'] }, 'server.hello')
    progress(`hello ok: ${hello?.serverId}`)

    record(
      'lifecycle-connection-installed',
      'the lifecycle connection is installed and reachable from the renderer',
      hello?.serverId ? 'PASS' : 'FAIL',
      `hello.serverId=${hello?.serverId ?? 'missing'} protocol=${hello?.protocolVersion ?? 'missing'}`
    )

    record(
      'server-hello',
      'server.hello answers over the product transport',
      hello?.protocolVersion === 'wire/1' ? 'PASS' : 'FAIL',
      `protocolVersion=${hello?.protocolVersion}`
    )

    // Register the three workspaces and keep the identity the SERVICE recorded:
    // the host's saved rows must match it exactly for the sidebar to pair them.
    const serviceWorkspaces = []

    for (const workspace of WORKSPACES) {
      const opened = await wireOk(
        page,
        'workspaces.open',
        {
          environment: { host: 'Ubuntu', kind: 'wsl', user: WSL_USER },
          path: `${workspaceBase}/${workspace.dir}`,
          requestId: `p19-open-${workspace.id}`
        },
        `workspaces.open (${workspace.name})`
      )

      serviceWorkspaces.push({ planned: workspace, opened: opened.workspace })
    }

    progress('workspaces opened; listing')
    const listed = await wireOk(page, 'workspaces.list', { includeArchived: false }, 'workspaces.list')
    const allRegistered = serviceWorkspaces.every(({ opened }) =>
      listed.items?.some(item => item.id === opened.id)
    )

    record(
      'workspaces-registered',
      'all three workspaces register and list back',
      allRegistered && listed.items.length >= 3 ? 'PASS' : 'FAIL',
      `listed=${listed.items.length}; ids=${serviceWorkspaces.map(({ opened }) => opened.id).join(',')}`
    )

    // The sidebar's WSL rows come from the HOST's saved workspace store
    // (`userData/wsl-workspaces.json`), not from the service catalog — the
    // pairing is by exact identity (distribution + user + path). Save the rows
    // using the identity the SERVICE recorded, then reload below remounts the
    // sidebar and picks both sides up.
    const hostStore = {
      version: 2,
      workspaces: serviceWorkspaces.map(({ planned, opened }, index) => ({
        id: planned.id,
        name: planned.name,
        kind: 'wsl',
        distribution: opened.environment.host,
        configuredUser: null,
        actualUser: opened.environment.user,
        rootPath: `${workspaceBase}/${planned.dir}`,
        createdAt: Date.now() + index,
        updatedAt: Date.now() + index,
        archivedAt: null
      })),
      savedRequests: {}
    }

    fs.writeFileSync(path.join(userData, 'wsl-workspaces.json'), `${JSON.stringify(hostStore, null, 2)}\n`, 'utf8')

    progress('creating profile')
    const profile = (
      await wireOk(
        page,
        'profiles.create',
        { displayName: 'Seed role', harness: 'hermes', requestId: 'p19-profile' },
        'profiles.create'
      )
    ).profile

    await wireOk(
      page,
      'profiles.updateConfig',
      {
        expectedVersion: profile.version,
        profileId: profile.id,
        requestId: 'p19-profile-config',
        values: [{ controlId: 'model', value: 'fixture-model' }]
      },
      'profiles.updateConfig'
    )

    record('profile-created', 'the seed role exists with the fixture model', 'PASS', `profileId=${profile.id}`)

    // Nine real turns, one per session, awaited to completion so every record
    // on screen carries service truth (title source, updatedAt, a full history).
    progress('profile ready; seeding sessions')
    const seeded = []
    let allCompleted = true

    for (const { planned, opened } of serviceWorkspaces) {
      for (const task of planned.sessions) {
        const sent = await wireOk(
          page,
          'sessions.createAndSend',
          {
            message: { attachments: [], text: task.text },
            overrides: [],
            profileId: profile.id,
            requestId: `p19-send-${planned.id}-${task.title}`,
            workspaceId: opened.id
          },
          `sessions.createAndSend (${task.title})`
        )

        const deadline = Date.now() + 60000
        let completed = false

        while (Date.now() < deadline) {
          const history = await wireOk(page, 'history.snapshot', { sessionId: sent.session.id }, 'history.snapshot')

          if (history.frames.some(frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed')) {
            completed = true
            break
          }

          await sleep(400)
        }

        if (!completed) {
          allCompleted = false
          note(`turn did not complete: ${planned.name} / ${task.title}`)
          break
        }

        seeded.push({ planned, session: sent.session, task })
      }

      if (!allCompleted) {
        break
      }
    }

    record(
      'sessions-seeded-completed',
      'nine sessions seeded with completed turns',
      allCompleted && seeded.length === 9 ? 'PASS' : 'FAIL',
      `completed=${seeded.length}/9`
    )

    if (allCompleted) {
      // Read each session's current version, then rename — and pin the first
      // task of each workspace so the pinned-first ordering shows.
      let renamed = 0
      let pinned = 0
      const catalogue = async () => (await wireOk(page, 'sessions.list', { includeArchived: false }, 'sessions.list')).items

      for (const { planned, session, task } of seeded) {
        const index = planned.sessions.findIndex(candidate => candidate.title === task.title)
        const current = (await catalogue()).find(item => item.id === session.id)

        await wireOk(
          page,
          'sessions.update',
          {
            displayName: task.title,
            expectedVersion: current.version,
            requestId: `p19-rename-${session.id}`,
            sessionId: session.id
          },
          `sessions.update (${task.title})`
        )
        renamed += 1

        if (index === 0) {
          const bumped = (await catalogue()).find(item => item.id === session.id)

          await wireOk(
            page,
            'sessions.update',
            {
              expectedVersion: bumped.version,
              pinned: true,
              requestId: `p19-pin-${session.id}`,
              sessionId: session.id
            },
            `sessions.update pin (${task.title})`
          )
          pinned += 1
        }
      }

      record(
        'session-titles-and-pins',
        'sessions carry service titles; one per workspace is pinned',
        renamed === 9 && pinned === 3 ? 'PASS' : 'FAIL',
        `renamed=${renamed}/9 pinned=${pinned}/3`
      )
    } else {
      record('session-titles-and-pins', 'sessions carry service titles; one per workspace is pinned', 'FAIL', 'skipped: turns incomplete')
    }

    // Reload: the boot catalog refresh (workspaces.list + sessions.list) runs on
    // the mount, which is exactly what a restarting user's app would do.
    progress('reload for catalog refresh')
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-workspace-list]', { timeout: 30000 })
    progress('workspace list mounted')

    const rows = await page.locator('[data-wsl-workspace-row]').count()

    record(
      'catalog-refreshed',
      'after reload the sidebar lists the three WSL workspace rows',
      rows === 3 ? 'PASS' : 'FAIL',
      `workspaceRows=${rows}`
    )

    // Expand each row through its own disclosure control — the user's gesture,
    // not a store poke. Each control is clicked exactly once: the caret stays
    // mounted after expanding, so a count-driven loop would toggle forever.
    const expandButtons = page.locator('[data-wsl-workspace-expand]')

    for (let index = 0; index < (await expandButtons.count()); index += 1) {
      await expandButtons.nth(index).click()
      await sleep(250)
    }

    await page.waitForSelector('[data-agentbox-session-row]', { timeout: 30000 })
    const sessionRows = await page.locator('[data-agentbox-session-row]').count()

    record(
      'sidebar-populated-three-by-three',
      'all nine seeded sessions are visible under their workspace rows',
      sessionRows === 9 ? 'PASS' : 'FAIL',
      `sessionRows=${sessionRows}`
    )

    progress('capturing screenshots')
    // The evidence shots: populated sidebar first, then the composer with a
    // real session open behind it.
    await page.screenshot({ path: path.join(SHOTS_DIR, '01-sidebar-populated.png') })

    const firstSession = page.locator('[data-agentbox-session-open]').first()

    await firstSession.click()
    await sleep(1200)
    await page.screenshot({ path: path.join(SHOTS_DIR, '02-session-open.png') })

    const shot = fs.existsSync(path.join(SHOTS_DIR, '01-sidebar-populated.png')) &&
      fs.existsSync(path.join(SHOTS_DIR, '02-session-open.png'))

    record(
      'screenshots-captured',
      'populated-sidebar and session-open screenshots captured',
      shot ? 'PASS' : 'FAIL',
      `shotsDir=${SHOTS_DIR}`
    )

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

    const stoppedDeadline = Date.now() + 20000

    while (Date.now() < stoppedDeadline && server.exitCode === null) {
      await sleep(200)
    }

    let portFree = false

    try {
      await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)
    } catch {
      portFree = true
    }

    record(
      'clean-shutdown',
      'the app and the Server both stop',
      portFree && fs.existsSync(tokenPath) ? 'PASS' : 'FAIL',
      `portFree=${portFree} tokenFile=${fs.existsSync(tokenPath) ? 'present' : 'missing'}`
    )
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
  const unknownSteps = steps.map(step => step.id).filter(id => !STEP_IDS.includes(id))
  const report = {
    ...summary,
    detail: steps,
    notes,
    sandbox: SANDBOX_ROOT,
    serverPort: SERVER_PORT,
    workspaces: WORKSPACES.map(workspace => workspace.name)
  }

  fs.writeFileSync(path.join(OUT_DIR, 'seed-results.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`SEED: executed ${summary.executed} → allOk=${summary.allOk}; counts=${JSON.stringify(summary.counts)}`)

  if (unknownSteps.length > 0) {
    console.error(`a step ran that this driver does not declare: ${JSON.stringify(unknownSteps)}`)
    exitCode = 1
  }

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
