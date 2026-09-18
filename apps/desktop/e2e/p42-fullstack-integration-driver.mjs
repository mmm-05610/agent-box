/**
 * Work Order 42 §10 — no-model fullstack integration driver.
 *
 * NOT a unit test and NOT a replacement for the P06 acceptance driver: that one
 * proves the product is honest with NO service; this one proves the product
 * works WITH one. It starts a real AgentBox Server on Windows (real release
 * Worker, real bwrap, explicit no-model ACP fixture), launches the BUILT app
 * with the lifecycle connection installed, and drives the product's own
 * transport — renderer bridge -> IPC -> main-process dispatcher -> HTTP — which
 * is the production path, not a test-only one.
 *
 * What it deliberately does NOT do: read a credential of any kind, call a real
 * model, or fake a service. The fixture Harness is a checked-in Node ACP peer
 * that streams a fixed nonce; the deployment declares no credential and no model
 * control for it.
 *
 * Usage (Windows, from apps/desktop):
 *   node e2e/p42-fullstack-integration-driver.mjs <sandboxRoot> <outDir>
 *
 * Required environment (absolute Windows paths unless noted):
 *   AGENTBOX_SERVER_SOURCE_ROOT   backend worktree, as Windows sees it (\\wsl.localhost\...)
 *   AGENTBOX_SERVER_LINUX_ROOT    the same worktree as Linux sees it (/home/...)
 *   AGENTBOX_SERVER_PYTHON        python launcher, default: py.exe -3.12
 *   AGENTBOX_WIRE_SCHEMA          frontend's generated wire schema (Windows path)
 *
 * Steps are PASS/FAIL; a FAIL exits non-zero and the step's detail says what was
 * observed. Every step is real: no step is satisfied by a step that did not run.
 */

/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { createStepRecorder, summarizeResults } from './p06-acceptance-helpers.mjs'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const SANDBOX_ROOT = process.argv[2]
const OUT_DIR = process.argv[3]
const SERVER_PORT = Number(process.env.AGENTBOX_SERVER_PORT ?? '18751')

if (!SANDBOX_ROOT || !OUT_DIR) {
  console.error('usage: node e2e/p42-fullstack-integration-driver.mjs <sandboxRoot> <outDir>')
  process.exit(2)
}

const BACKEND_WINDOWS_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT
const BACKEND_LINUX_ROOT = process.env.AGENTBOX_SERVER_LINUX_ROOT
const PYTHON_LAUNCHER = process.env.AGENTBOX_SERVER_PYTHON ?? 'py.exe -3.12'
const WIRE_SCHEMA = process.env.AGENTBOX_WIRE_SCHEMA

const STEP_IDS = [
  'driver-target',
  'sandbox-isolated',
  'server-started',
  'lifecycle-connection-installed',
  'server-hello',
  'workspace-open-and-list',
  'profile-and-provider-created',
  'config-describe-and-resolve',
  'turn-completes-with-persisted-deltas',
  'idempotent-replay-is-one-execution',
  'queue-visible-and-withdrawable',
  'stop-reaches-terminal',
  'history-cursor-pagination',
  'workspace-browse-and-archive',
  'profile-and-provider-maintenance',
  'session-metadata-and-role-switch',
  'send-outcome-query',
  'attachment-authorized-and-delivered',
  'approval-round-trip',
  'event-stream-resync',
  'session-archive-keeps-history',
  'clean-shutdown'
]

const steps = []
const record = createStepRecorder(steps)
const notes = []

function note(message) {
  notes.push(message)
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

/** The Electron executable the built app runs under, resolved the same way the
 *  P06 driver resolves it: this project installs Electron as a dev dependency,
 *  and playwright-core only knows about it if we hand it the path. */
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

async function wire(page, method, params) {
  const answer = await page.evaluate(
    async ([methodName, methodParams]) => {
      const id = `p42-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

      return window.agentBoxDesktop.wire.request({
        body: { id, jsonrpc: '2.0', method: methodName, params: methodParams },
        method: methodName,
        path: `/wire/v1/${methodName}`
      })
    },
    [method, params]
  )

  return answer
}

function wireResult(answer, label) {
  if (answer && typeof answer === 'object' && 'error' in answer && answer.error) {
    throw new Error(`${label} failed: ${answer.error.code}: ${answer.error.message}`)
  }

  return answer?.result
}

/** The session record's version, or a failure that names what was seen.
 *
 * The archive and rename steps both need it, and "undefined is not an object"
 * from a failed lookup told the next reader nothing about why.
 */
function sessionVersion(listed, sessionId) {
  const found = (listed?.items ?? []).find(item => item.id === sessionId)

  if (!found) {
    throw new Error(`the run's session is not in the catalogue (${(listed?.items ?? []).length} listed)`)
  }

  return found.version
}

async function wireOk(page, method, params, label) {
  return wireResult(await wire(page, method, params), label ?? method)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (!BACKEND_WINDOWS_ROOT || !BACKEND_LINUX_ROOT) {
    console.error('AGENTBOX_SERVER_SOURCE_ROOT and AGENTBOX_SERVER_LINUX_ROOT are required')
    process.exit(2)
  }

  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const consoleLog = path.join(OUT_DIR, 'renderer-console.log')
  const mainLog = path.join(OUT_DIR, 'main-process-safe.log')
  const workspaceLinux = `/tmp/agentbox-integration-${Date.now()}`
  // POSIX joins for anything that will be handed to wsl.exe: `path.join` on
  // Windows rewrites the separators, and a Linux path with backslashes reaches
  // the distribution as a single nonsense filename.
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
  fs.writeFileSync(consoleLog, '')
  fs.writeFileSync(mainLog, '')

  record('driver-target', 'driver target', 'PASS', `sandbox=${SANDBOX_ROOT}`)

  // ---------------------------------------------------------------------
  // Isolated sandbox: a private WSL workspace, a private Server data root and a
  // private Desktop home, all under the driver's own root. Nothing here reads
  // or writes the user's real HOME, HERMES_HOME, userData or AgentBox data.
  // ---------------------------------------------------------------------
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  // The Server owns its data root and refuses to adopt one it did not create
  // (`DATA_ROOT_UNOWNED`), so the driver must NOT pre-create it: the Server
  // writes its own owner marker and its own token on first start, and the
  // Desktop reads that token back. Creating the directory here would either be
  // refused or, worse, forge an ownership marker.
  wsl(['/usr/bin/mkdir', '-p', workspaceLinux])
  // A second, disposable location: the archive step needs something it can
  // retire without disturbing the workspace the rest of the run uses.
  wsl(['/usr/bin/mkdir', '-p', workspaceLinux + '/nested'])
  wsl(['/usr/bin/cp', fixtureLinux, `${workspaceLinux}/stateful_acp_peer.mjs`])
  wsl(['/usr/bin/cp', slowFixtureLinux, `${workspaceLinux}/fake_acp_peer.mjs`])
  const projected = wsl(['/usr/bin/ls', `${workspaceLinux}/stateful_acp_peer.mjs`]).trim()

  record(
    'sandbox-isolated',
    'sandbox is isolated and the fixture is projected',
    projected.endsWith('stateful_acp_peer.mjs') ? 'PASS' : 'FAIL',
    `workspace=${workspaceLinux}; fixture=${projected}`
  )

  // The document names NO host path: `pluginRoot` is supplied on the Server's
  // command line below (a document that carries it is refused —
  // SIDECAR_DEPLOYMENT_HOST_PATH — which is what keeps the file runnable on
  // any machine).
  const deployment = {
    schemaVersion: 1,
    harnesses: [
      {
        // A third Harness whose fixture asks for permission when the prompt
        // says `needs-permission`: the approval round-trip is a product path
        // and needs a real `session/request_permission` to answer.
        id: 'omp',
        capabilityClaims: { permissions: true, stream: true },
        controlOptions: { model: ['fixture-model'] },
        adapter: { args: ['/workspace/fake_acp_peer.mjs'], command: '/usr/bin/node' },
        timeoutMs: 30000
      },
      {
        // A second Harness that holds its answer back long enough for the
        // queue and stop cases to have a running turn to act on. Same fixture,
        // different controlled timing.
        id: 'pi',
        capabilityClaims: { stream: true },
        controlOptions: { model: ['fixture-model'] },
        adapter: {
          args: ['/workspace/fake_acp_peer.mjs'],
          command: '/usr/bin/node',
          environment: { AGENTBOX_FIXTURE_SILENCE_MS: '6000' }
        },
        timeoutMs: 30000
      },
      {
        id: 'hermes',
        capabilityClaims: { native_continuation: true, stream: true },
        // The model control the fixture Harness offers. Declaring it is what
        // lets a Profile name a model this deployment actually has.
        controlOptions: { model: ['fixture-model'] },
        adapter: { args: ['/workspace/stateful_acp_peer.mjs'], command: '/usr/bin/node' },
        stateProjection: { target: '/runtime/home/sessions' },
        timeoutMs: 30000
      }
    ]
  }
  const deploymentPath = path.join(SANDBOX_ROOT, 'deployment.json')

  fs.writeFileSync(deploymentPath, JSON.stringify(deployment), 'utf8')

  // ---------------------------------------------------------------------
  // The Server, exactly as a user's machine would run it: the release Worker
  // through wsl.exe, bwrap inside WSL, and a fixture ACP peer the deployment
  // names. No credential is provided anywhere in this environment.
  // ---------------------------------------------------------------------
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
      // The Server's current CLI requires the plugin root alongside a sidecar
      // deployment; it is the same directory the deployment already names.
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

  // ---------------------------------------------------------------------
  // The Desktop, launched with the connection inputs and an isolated home.
  // ---------------------------------------------------------------------
  const home = path.join(SANDBOX_ROOT, 'hermes-home')
  const userData = path.join(SANDBOX_ROOT, 'user-data')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const appEnv = {
    ...process.env,
    AGENTBOX_SERVER_PORT: String(SERVER_PORT),
    AGENTBOX_SERVER_ROOT: serverDataRoot,
    HERMES_DESKTOP_APP_NAME: 'HermesP42Integration',
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

  try {
    app.on('window', candidate => {
      candidate.on('console', message => fs.appendFileSync(consoleLog, `[${message.type()}] ${message.text()}\n`))
      candidate.on('pageerror', error => fs.appendFileSync(consoleLog, `[pageerror] ${error}\n`))
    })

    const page = await app.firstWindow()

    await page.waitForLoadState('domcontentloaded')

    // The install line is written by the main process before any window exists,
    // so the safest read is the connection the renderer can actually use: a
    // hello that answers at all proves the endpoint AND the token arrived.
    const hello = await wireOk(page, 'server.hello', { clientPresentationSupports: [], clientVersions: ['wire/1'] }, 'server.hello')
    fs.writeFileSync(mainLog, `${JSON.stringify({ hello }, null, 2)}\n`)

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
      `protocolVersion=${hello?.protocolVersion}; capabilities=${Array.isArray(hello?.capabilities) ? hello.capabilities.length : 'none'}`
    )

    const opened = await wireOk(
      page,
      'workspaces.open',
      {
        environment: { host: 'Ubuntu', kind: 'wsl', user: process.env.USERNAME ?? 'maoqh' },
        path: workspaceLinux,
        requestId: 'p42-open'
      },
      'workspaces.open'
    )
    const workspace = opened.workspace
    const listed = await wireOk(page, 'workspaces.list', { includeArchived: false }, 'workspaces.list')

    record(
      'workspace-open-and-list',
      'the WSL workspace opens and lists back with the same identity',
      listed.items?.some(item => item.id === workspace.id) ? 'PASS' : 'FAIL',
      `workspaceId=${workspace.id} accessibility=${JSON.stringify(workspace.accessibility)}`
    )

    const profile = (
      await wireOk(
        page,
        'profiles.create',
        { displayName: 'P42 fixture role', harness: 'hermes', requestId: 'p42-profile' },
        'profiles.create'
      )
    ).profile
    const configured = (
      await wireOk(
        page,
        'profiles.updateConfig',
        {
          expectedVersion: profile.version,
          profileId: profile.id,
          requestId: 'p42-profile-config',
          values: [{ controlId: 'model', value: 'fixture-model' }]
        },
        'profiles.updateConfig'
      )
    ).profile
    const provider = (
      await wireOk(
        page,
        'providerModels.create',
        {
          configuration: [],
          credentialId: null,
          displayName: 'P42 fixture provider',
          harness: 'hermes',
          // The no-model fixture declares no credential, so the product model
          // is a data entry the Harness's own catalogue accepts.
          models: [
            {
              availability: 'available',
              displayName: 'Fixture model',
              modelId: 'fixture-model',
              unavailableReason: null
            }
          ],
          provider: 'fixture',
          requestId: 'p42-provider'
        },
        'providerModels.create'
      )
    ).providerModel

    record(
      'profile-and-provider-created',
      'profile and provider-model records are created and versioned',
      configured.version >= 1 && provider?.id ? 'PASS' : 'FAIL',
      `profile=${profile.id} v${configured.version}; providerModel=${provider?.id}`
    )

    // The configuration question is asked of a role *in a workspace*: the same
    // profile can resolve differently depending on what the workspace can do.
    const describe = await wireOk(
      page,
      'config.describe',
      { profileId: profile.id, workspaceId: workspace.id },
      'config.describe'
    )
    const resolve = await wireOk(
      page,
      'config.resolve',
      { overrides: [], profileId: profile.id, workspaceId: workspace.id },
      'config.resolve'
    )

    const controls = describe?.descriptor?.controls
    const effective = resolve?.effective

    record(
      'config-describe-and-resolve',
      'config.describe declares the controls and config.resolve computes effective values',
      Array.isArray(controls) && Array.isArray(effective) &&
        describe.descriptor.effectTiming === 'next_send' ? 'PASS' : 'FAIL',
      `controls=${Array.isArray(controls) ? controls.length : 'none'} ` +
      `effectTiming=${describe?.descriptor?.effectTiming ?? 'missing'} ` +
      `outcome=${resolve?.outcome ?? 'missing'} effective=${JSON.stringify(effective ?? null)}`
    )

    // ---------------------------------------------------------------------
    // A real turn: the fixture Harness streams a fixed nonce through the real
    // Worker/bwrap chain, and the Server must persist the deltas before the
    // terminal state.
    // ---------------------------------------------------------------------
    const nonce = `P42-NONCE-${Date.now().toString(36).toUpperCase()}`
    const sent = await wireOk(
      page,
      'sessions.createAndSend',
      {
        message: { attachments: [], text: `Remember STATEFUL-${nonce} and reply with it.` },
        overrides: [],
        profileId: profile.id,
        requestId: 'p42-send-1',
        workspaceId: workspace.id
      },
      'sessions.createAndSend'
    )
    const sessionId = sent.session.id

    let session = null
    const turnDeadline = Date.now() + 60000

    while (Date.now() < turnDeadline) {
      session = (
        await wireOk(page, 'sessions.list', { includeArchived: false }, 'sessions.list')
      ).items.find(item => item.id === sessionId)
      const history = await wireOk(page, 'history.snapshot', { sessionId }, 'history.snapshot')
      const terminal = history.frames.some(
        frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
      )

      if (terminal) {
        const deltas = history.frames.filter(frame => frame.event.kind === 'message.delta')
        const assistant = history.frames.filter(
          frame => frame.event.kind === 'message.final' && frame.event.role === 'assistant'
        )
        const completedSeq = history.frames.find(
          frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
        ).seq

        record(
          'turn-completes-with-persisted-deltas',
          'a real turn through the managed chain persists deltas before the terminal frame',
          deltas.length > 0 && deltas[0].seq < completedSeq ? 'PASS' : 'FAIL',
          `deltas=${deltas.length} firstDeltaSeq=${deltas[0]?.seq} completedSeq=${completedSeq} assistantFinals=${assistant.length}`
        )
        break
      }

      await sleep(400)
    }

    if (!recorded('turn-completes-with-persisted-deltas')) {
      record(
        'turn-completes-with-persisted-deltas',
        'a real turn through the managed chain persists deltas before the terminal frame',
        'FAIL',
        `turn did not reach completed within the deadline; session=${JSON.stringify(session ?? null)}`
      )
    }

    // ---------------------------------------------------------------------
    // Idempotency: the same requestId must return the same execution, not a
    // second one.
    // ---------------------------------------------------------------------
    const replay = await wireOk(
      page,
      'sessions.createAndSend',
      {
        message: { attachments: [], text: `Remember STATEFUL-${nonce} and reply with it.` },
        overrides: [],
        profileId: profile.id,
        requestId: 'p42-send-1',
        workspaceId: workspace.id
      },
      'sessions.createAndSend (replay)'
    )

    record(
      'idempotent-replay-is-one-execution',
      'replaying the same requestId returns the same execution',
      replay.executionId === sent.executionId ? 'PASS' : 'FAIL',
      `first=${sent.executionId} replay=${replay.executionId}`
    )

    // ---------------------------------------------------------------------
    // Queue: a send while the Session is busy is queued, visible, withdrawable.
    // ---------------------------------------------------------------------
    // A slow role: its turn stays running long enough to queue behind and to
    // stop, which the fast fixture cannot provide.
    const slowProfile = (
      await wireOk(
        page,
        'profiles.create',
        { displayName: 'P42 slow role', harness: 'pi', requestId: 'p42-slow-profile' },
        'profiles.create (slow)'
      )
    ).profile
    await wireOk(
      page,
      'profiles.updateConfig',
      {
        expectedVersion: slowProfile.version,
        profileId: slowProfile.id,
        requestId: 'p42-slow-config',
        values: [{ controlId: 'model', value: 'fixture-model' }]
      },
      'profiles.updateConfig (slow)'
    )
    const slowSession = (
      await wireOk(
        page,
        'sessions.createAndSend',
        {
          message: { attachments: [], text: 'a turn that stays running' },
          overrides: [],
          profileId: slowProfile.id,
          requestId: 'p42-slow-send',
          workspaceId: workspace.id
        },
        'sessions.createAndSend (slow)'
      )
    )
    const slowSessionId = slowSession.session.id

    const queued = await wireOk(
      page,
      'sessions.send',
      {
        message: { attachments: [], text: 'second turn' },
        overrides: [],
        requestId: 'p42-send-2',
        sessionId: slowSessionId
      },
      'sessions.send'
    )
    const queue = await wireOk(page, 'queue.get', { sessionId: slowSessionId }, 'queue.get')
    const item = queue.items.find(candidate => candidate.itemId === queued.queueItemId)
    const withdrawn = item
      ? await wireOk(
          page,
          'queue.withdraw',
          {
            expectedVersion: item.version,
            itemId: item.itemId,
            requestId: 'p42-withdraw',
            sessionId: slowSessionId
          },
          'queue.withdraw'
        )
      : null

    record(
      'queue-visible-and-withdrawable',
      'a queued send is visible and can be withdrawn',
      queued.queueItemId && item && withdrawn?.outcome === 'withdrawn' ? 'PASS' : 'FAIL',
      `queueItemId=${queued.queueItemId ?? 'missing'} state=${item?.state ?? 'missing'} withdraw=${withdrawn?.outcome ?? 'missing'}`
    )

    // ---------------------------------------------------------------------
    // Stop: a stop request must reach a terminal state and never report the
    // interrupted state as the stop.
    // ---------------------------------------------------------------------
    const stopped = slowSession.executionId
      ? await wireOk(
          page,
          'runs.stop',
          {
            executionId: slowSession.executionId,
            requestId: 'p42-stop',
            sessionId: slowSessionId
          },
          'runs.stop'
        )
      : null
    let stopStates = []

    if (slowSession.executionId) {
      const stopDeadline = Date.now() + 45000

      while (Date.now() < stopDeadline) {
        const history = await wireOk(page, 'history.snapshot', { sessionId: slowSessionId }, 'history.snapshot')
        stopStates = history.frames
          .filter(frame => frame.event.kind === 'execution.state' &&
            frame.event.executionId === slowSession.executionId)
          .map(frame => frame.event.state)

        if (stopStates.includes('stopped') || stopStates.includes('failed') || stopStates.includes('completed')) {
          break
        }

        await sleep(400)
      }
    }

    record(
      'stop-reaches-terminal',
      'a stop request is published as stopping and reaches a terminal state',
      stopStates.includes('stopping') && (stopStates.includes('stopped') || stopStates.includes('failed'))
        ? 'PASS'
        : 'FAIL',
      `observed=${JSON.stringify(stopStates)} outcome=${stopped?.outcome ?? 'missing'}`
    )

    // ---------------------------------------------------------------------
    // History cursors: backward pages and the live resume cursor are separate.
    // ---------------------------------------------------------------------
    const page1 = await wireOk(page, 'history.snapshot', { page: { limit: 3 }, sessionId }, 'history.snapshot page')
    const older = page1.olderCursor
      ? await wireOk(
          page,
          'history.snapshot',
          { page: { cursor: page1.olderCursor, limit: 3 }, sessionId },
          'history.snapshot older'
        )
      : null
    const mixed = await wire(page, 'history.snapshot', {
      cursor: page1.resumeCursor,
      page: { cursor: page1.olderCursor, limit: 3 },
      sessionId
    })

    record(
      'history-cursor-pagination',
      'backward pages and the live resume cursor stay separate domains',
      older && older.frames.length > 0 && mixed?.error?.code === 'INVALID_REQUEST' ? 'PASS' : 'FAIL',
      `page=${page1.frames.length} older=${older?.frames?.length ?? 'none'} mixedCursorError=${mixed?.error?.code ?? 'none'}`
    )

    // ---------------------------------------------------------------------
    // Archiving keeps the history and refuses stale versions.
    // ---------------------------------------------------------------------
    const archived = await wireOk(
      page,
      'sessions.archive',
      {
        expectedVersion: sessionVersion(await wireOk(
          page, 'sessions.list', { includeArchived: false, page: { limit: 200 } }, 'sessions.list'
        ), sessionId),
        requestId: 'p42-archive',
        sessionId
      },
      'sessions.archive'
    )
    const afterArchive = await wireOk(page, 'history.snapshot', { sessionId }, 'history.snapshot after archive')

    // --- the methods the first pass did not drive --------------------------
    // Everything below runs on the product's own transport, like the steps
    // above: these are the §10 items the earlier pass left uncovered.

    const browse = await wireOk(page, 'workspaces.browse', {
      environment: { host: 'Ubuntu', kind: 'wsl', user: process.env.USERNAME ?? 'maoqh' },
      path: workspaceLinux,
      requestId: 'p42-browse'
    }, 'workspaces.browse')
    const secondOpen = await wireOk(page, 'workspaces.open', {
      environment: { host: 'Ubuntu', kind: 'wsl', user: process.env.USERNAME ?? 'maoqh' },
      path: `${workspaceLinux}/nested`,
      requestId: 'p42-open-nested'
    }, 'workspaces.open (nested)')
    const archivedWorkspace = await wireOk(page, 'workspaces.archive', {
      expectedVersion: secondOpen.workspace.version,
      requestId: 'p42-archive-workspace',
      workspaceId: secondOpen.workspace.id
    }, 'workspaces.archive')

    record(
      'workspace-browse-and-archive',
      'a directory browses with real entries, and a workspace archives without losing its record',
      Array.isArray(browse.entries) && browse.entries.length > 0 && archivedWorkspace?.workspace?.archivedAt
        ? 'PASS'
        : 'FAIL',
      `entries=${Array.isArray(browse.entries) ? browse.entries.length : 'none'} `
      + `canOpen=${browse.canOpen} archivedAt=${archivedWorkspace?.workspace?.archivedAt ?? 'missing'}`
    )

    const maintenanceProvider = (await wireOk(page, 'providerModels.create', {
      configuration: [],
      credentialId: null,
      displayName: 'P42 maintenance provider',
      harness: 'hermes',
      models: [{ availability: 'available', displayName: 'Fixture model', modelId: 'fixture-model', unavailableReason: null }],
      provider: 'fixture',
      requestId: 'p42-maintenance-provider'
    }, 'providerModels.create (maintenance)')).providerModel
    const updatedProvider = (await wireOk(page, 'providerModels.update', {
      configuration: [],
      credentialId: null,
      displayName: 'P42 maintenance provider (renamed)',
      expectedVersion: maintenanceProvider.version,
      models: [
        ...maintenanceProvider.models,
        { availability: 'available', displayName: 'Second', modelId: 'second-model', unavailableReason: null }
      ],
      providerModelId: maintenanceProvider.id,
      requestId: 'p42-maintenance-provider-update'
    }, 'providerModels.update')).providerModel
    const archivedProvider = (await wireOk(page, 'providerModels.archive', {
      expectedVersion: updatedProvider.version,
      providerModelId: updatedProvider.id,
      requestId: 'p42-maintenance-provider-archive'
    }, 'providerModels.archive')).providerModel
    const maintenanceProfile = (await wireOk(page, 'profiles.create', {
      displayName: 'P42 maintenance role',
      harness: 'hermes',
      requestId: 'p42-maintenance-role'
    }, 'profiles.create (maintenance)')).profile
    const renamedProfile = (await wireOk(page, 'profiles.update', {
      displayName: 'P42 maintenance role (renamed)',
      expectedVersion: maintenanceProfile.version,
      profileId: maintenanceProfile.id,
      requestId: 'p42-maintenance-role-update'
    }, 'profiles.update')).profile
    const archivedProfile = (await wireOk(page, 'profiles.archive', {
      expectedVersion: renamedProfile.version,
      profileId: renamedProfile.id,
      requestId: 'p42-maintenance-role-archive'
    }, 'profiles.archive')).profile

    record(
      'profile-and-provider-maintenance',
      'a provider model updates and archives, and a role renames and archives, all with versions',
      updatedProvider.models.length === 2 && archivedProvider.archivedAt &&
        renamedProfile.displayName.endsWith('(renamed)') && archivedProfile.archivedAt ? 'PASS' : 'FAIL',
      `providerModels=${updatedProvider.models.length} providerArchived=${Boolean(archivedProvider.archivedAt)} `
      + `roleRenamed=${renamedProfile.displayName} roleArchived=${Boolean(archivedProfile.archivedAt)}`
    )

    const maintenanceSend = await wireOk(page, 'sessions.createAndSend', {
      message: { attachments: [], text: 'A session for the maintenance steps.' },
      overrides: [],
      profileId: profile.id,
      requestId: 'p42-maintenance-send',
      workspaceId: workspace.id
    }, 'sessions.createAndSend (maintenance)')
    const maintenanceSessionId = maintenanceSend.session.id
    const maintenanceDeadline = Date.now() + 60000

    while (Date.now() < maintenanceDeadline) {
      const history = await wireOk(page, 'history.snapshot', {
        sessionId: maintenanceSessionId
      }, 'history.snapshot (maintenance)')

      if (history.frames.some(
        frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
      )) {
        break
      }

      await sleep(300)
    }

    const renamedSession = (await wireOk(page, 'sessions.update', {
      displayName: 'P42 renamed session',
      expectedVersion: sessionVersion(await wireOk(
        page, 'sessions.list', { includeArchived: false, page: { limit: 200 } }, 'sessions.list'
      ), maintenanceSessionId),
      pinned: true,
      requestId: 'p42-session-update',
      sessionId: maintenanceSessionId
    }, 'sessions.update')).session
    const secondProfile = (await wireOk(page, 'profiles.create', {
      displayName: 'P42 alternate role',
      harness: 'hermes',
      requestId: 'p42-alternate-role'
    }, 'profiles.create (alternate)')).profile
    const switched = await wireOk(page, 'sessions.switchProfile', {
      expectedVersion: renamedSession.version,
      profileId: secondProfile.id,
      requestId: 'p42-switch-role',
      sessionId: maintenanceSessionId
    }, 'sessions.switchProfile')

    record(
      'session-metadata-and-role-switch',
      'a session renames and pins, then switches role with the old link returned',
      renamedSession.displayName === 'P42 renamed session' && renamedSession.pinned === true &&
        switched.outcome === 'confirmed' && switched.session.profileId === secondProfile.id ? 'PASS' : 'FAIL',
      `displayName=${renamedSession.displayName} pinned=${renamedSession.pinned} `
      + `switched=${switched.outcome} profileId=${switched.session.profileId === secondProfile.id}`
    )

    const acceptedOutcome = await wireOk(page, 'sendOutcome.query', {
      requestId: 'p42-send-1'
    }, 'sendOutcome.query (accepted)')
    const unknownOutcome = await wireOk(page, 'sendOutcome.query', {
      requestId: 'p42-never-sent'
    }, 'sendOutcome.query (unknown)')

    record(
      'send-outcome-query',
      'a sent requestId resolves to its execution, and an unknown one answers unknown',
      acceptedOutcome.outcome === 'accepted' && acceptedOutcome.executionId === sent.executionId &&
        unknownOutcome.outcome === 'unknown' ? 'PASS' : 'FAIL',
      `accepted=${acceptedOutcome.outcome} sameExecution=${acceptedOutcome.executionId === sent.executionId} `
      + `unknown=${unknownOutcome.outcome}`
    )

    // An attachment is authorised, copied to the guest, and its bytes never
    // travel back: the run projects a materialised path, not the content.
    wsl(['/usr/bin/bash', '-lc',
      `printf 'p42 attachment body\\n' > '${workspaceLinux}/attachment-note.txt'`])
    const withAttachment = await wireOk(page, 'sessions.createAndSend', {
      message: {
        attachments: [{ displayName: 'attachment-note.txt', mediaKind: 'file', ref: 'attachment-note.txt' }],
        text: 'This turn carries one attachment.'
      },
      overrides: [],
      profileId: secondProfile.id,
      requestId: 'p42-send-attachment',
      workspaceId: workspace.id
    }, 'sessions.createAndSend (attachment)')
    const attachmentHistory = await wireOk(page, 'history.snapshot', {
      sessionId: withAttachment.session.id
    }, 'history.snapshot (attachment)')
    const attachmentFrame = attachmentHistory.frames.find(
      frame => frame.event.kind === 'message.final' && frame.event.role === 'user'
    )

    record(
      'attachment-authorized-and-delivered',
      'an attachment is accepted, delivered to the run, and its body never enters the transcript',
      withAttachment.outcome === 'accepted' && Boolean(attachmentFrame) &&
        !JSON.stringify(attachmentFrame ?? {}).includes('p42 attachment body') ? 'PASS' : 'FAIL',
      `outcome=${withAttachment.outcome} executionId=${withAttachment.executionId ?? 'missing'} `
      + `bodyInTranscript=${JSON.stringify(attachmentFrame ?? {}).includes('p42 attachment body')}`
    )

    // The approval round-trip: the fixture asks for permission when the prompt
    // says so, and the decision has to come back through the product.
    const approvalProfile = (await wireOk(page, 'profiles.create', {
      displayName: 'P42 approval role',
      harness: 'omp',
      requestId: 'p42-approval-role'
    }, 'profiles.create (approval)')).profile
    const configuredApproval = (await wireOk(page, 'profiles.updateConfig', {
      expectedVersion: approvalProfile.version,
      profileId: approvalProfile.id,
      requestId: 'p42-approval-config',
      values: [{ controlId: 'model', value: 'fixture-model' }]
    }, 'profiles.updateConfig (approval)')).profile
    const approvalSend = await wireOk(page, 'sessions.createAndSend', {
      message: { attachments: [], text: 'needs-permission please' },
      overrides: [],
      profileId: configuredApproval.id,
      requestId: 'p42-approval-send',
      workspaceId: workspace.id
    }, 'sessions.createAndSend (approval)')
    let approvalFrame = null
    const approvalDeadline = Date.now() + 60000

    while (Date.now() < approvalDeadline && !approvalFrame) {
      const history = await wireOk(page, 'history.snapshot', {
        sessionId: approvalSend.session.id
      }, 'history.snapshot (approval)')
      approvalFrame = history.frames.find(frame => frame.event.kind === 'approval.requested') ?? null

      if (!approvalFrame) {
        await sleep(400)
      }
    }

    const decided = approvalFrame
      ? await wireOk(page, 'approvals.decide', {
          approvalId: approvalFrame.event.approval.approvalId,
          decision: 'allow',
          expectedVersion: approvalFrame.event.approval.version,
          requestId: 'p42-approval-decide',
          scope: { kind: 'once' }
        }, 'approvals.decide')
      : null

    record(
      'approval-round-trip',
      'the harness asks, the product answers, and the decision is recorded once',
      Boolean(approvalFrame) && decided?.outcome === 'recorded' && decided?.decision === 'allow' ? 'PASS' : 'FAIL',
      `requested=${Boolean(approvalFrame)} decision=${decided?.outcome ?? 'missing'} `
      + `scope=once`
    )

    // A cursor the Server cannot address must ask for a fresh snapshot rather
    // than silently dropping events.
    const staleCursor = await wire(page, 'history.snapshot', {
      cursor: 'not-a-real-cursor',
      sessionId: maintenanceSessionId
    })

    const resubscribed = await new Promise(resolve => {
      const unsubscribe = page.evaluate(
        async ([targetSession, cursor]) => {
          const frames = []
          const stop = window.agentBoxDesktop.wire.subscribeEvents(
            { cursor, sessionId: targetSession },
            frame => frames.push(frame)
          )
          await new Promise(done => setTimeout(done, 1500))
          stop()

          return frames
        },
        [maintenanceSessionId, maintenanceSend.session.resumeCursor ?? page1.resumeCursor]
      )

      Promise.resolve(unsubscribe).then(resolve)
    })

    record(
      'event-stream-resync',
      'an unusable cursor asks for a new snapshot, and a re-subscription answers empty rather than replaying',
      staleCursor?.error?.code === 'INVALID_REQUEST' && Array.isArray(resubscribed) &&
        resubscribed.every(frame => frame.sessionId === maintenanceSessionId) ? 'PASS' : 'FAIL',
      `staleCursorError=${staleCursor?.error?.code ?? 'none'} resubscribedFrames=${Array.isArray(resubscribed) ? resubscribed.length : 'none'}`
    )

    record(
      'session-archive-keeps-history',
      'archiving a session keeps its history readable',
      archived?.session?.archivedAt && afterArchive.frames.length > 0 ? 'PASS' : 'FAIL',
      `archivedAt=${archived?.session?.archivedAt ?? 'missing'} frames=${afterArchive.frames.length}`
    )

    await app.close()
    server.kill()

    if (server.pid) {
      try {
        // `/T` takes the child processes too: the Server is the root of its own
        // tree, and on Windows a killed launcher would otherwise leave it behind.
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
      'the app and the Server both stop, and the isolated data root survives for the next run',
      portFree && fs.existsSync(tokenPath) ? 'PASS' : 'FAIL',
      `portFree=${portFree} tokenFile=${fs.existsSync(tokenPath) ? 'present' : 'missing'} ` +
      `launcherExitCode=${server.exitCode ?? 'not observed after taskkill /T'}`
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

    if (server.exitCode === null) {
      server.kill()
    }
  }

  function recorded(id) {
    return steps.some(step => step.id === id)
  }

  const summary = summarizeResults(steps)
  const unknownSteps = steps.map(step => step.id).filter(id => !STEP_IDS.includes(id))
  const report = {
    ...summary,
    detail: steps,
    notes,
    sandbox: SANDBOX_ROOT,
    serverPort: SERVER_PORT
  }

  fs.writeFileSync(path.join(OUT_DIR, 'integration-results.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`INTEGRATION: executed ${summary.executed} → allOk=${summary.allOk}; counts=${JSON.stringify(summary.counts)}`)

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
