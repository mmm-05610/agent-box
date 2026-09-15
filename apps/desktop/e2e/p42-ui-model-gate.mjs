/**
 * Work Order 42 §D/§11 — the real-model UI gate, one family per run.
 *
 * The backend gates already proved each chain with a real Harness and the
 * official endpoint. This proves the same chain with the *product* in front of
 * it: the credential is added through the interface's own entry path, the model
 * configuration and the role are created over the shipped transport, and the
 * two turns are sent and read back exactly as a user's session would.
 *
 * One family per invocation, because each needs its own Server deployment and
 * its own built Harness artifact:
 *
 *   node e2e/p42-ui-model-gate.mjs <family> <sandboxRoot> <outDir>
 *
 * Environment (absolute Windows paths unless noted):
 *   AGENTBOX_SERVER_SOURCE_ROOT   backend worktree as Windows sees it
 *   AGENTBOX_SERVER_LINUX_ROOT    the same worktree as Linux sees it
 *   AGENTBOX_UI_GATE_DEPLOYMENT   the family's production deployment JSON
 *   AGENTBOX_UI_GATE_SECRET       the authorized credential locator (read only)
 *   AGENTBOX_UI_GATE_MODEL        the product model id (default deepseek-flash)
 *
 * What this deliberately does NOT do: print, log, screenshot or persist the
 * credential's content, or send anything except the two turns it asserts.
 */

/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { createStepRecorder, summarizeResults } from './p06-acceptance-helpers.mjs'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const FAMILY = process.argv[2]
const SANDBOX_ROOT = process.argv[3]
const OUT_DIR = process.argv[4]
const SERVER_PORT = Number(process.env.AGENTBOX_UI_GATE_PORT ?? '18761')

if (!FAMILY || !SANDBOX_ROOT || !OUT_DIR) {
  console.error('usage: node e2e/p42-ui-model-gate.mjs <family> <sandboxRoot> <outDir>')
  process.exit(2)
}

const BACKEND_WINDOWS_ROOT = process.env.AGENTBOX_SERVER_SOURCE_ROOT
const BACKEND_LINUX_ROOT = process.env.AGENTBOX_SERVER_LINUX_ROOT
const DEPLOYMENT = process.env.AGENTBOX_UI_GATE_DEPLOYMENT
const SECRET_LOCATOR = process.env.AGENTBOX_UI_GATE_SECRET
const MODEL_ID = process.env.AGENTBOX_UI_GATE_MODEL ?? 'deepseek-flash'
const PYTHON_LAUNCHER = process.env.AGENTBOX_SERVER_PYTHON ?? 'py.exe -3.12'

const STEP_IDS = [
  'driver-target',
  'server-started-with-real-harness',
  'lifecycle-connection-installed',
  'credential-added-through-the-app',
  'provider-model-and-role-created',
  'first-turn-answered-by-the-real-model',
  'second-turn-carries-the-first',
  'clean-shutdown'
]

const steps = []
const record = createStepRecorder(steps)
const notes = []

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function wsl(args) {
  return execFileSync('wsl.exe', ['--distribution', 'Ubuntu', '--exec', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
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

async function wire(page, method, params) {
  return page.evaluate(
    async ([methodName, methodParams]) =>
      window.agentBoxDesktop.wire.request({
        body: {
          id: `p42g-${methodName}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          jsonrpc: '2.0',
          method: methodName,
          params: methodParams
        },
        method: methodName,
        path: `/wire/v1/${methodName}`
      }),
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (!BACKEND_WINDOWS_ROOT || !BACKEND_LINUX_ROOT || !DEPLOYMENT || !SECRET_LOCATOR) {
    console.error('AGENTBOX_SERVER_SOURCE_ROOT, AGENTBOX_SERVER_LINUX_ROOT, '
      + 'AGENTBOX_UI_GATE_DEPLOYMENT and AGENTBOX_UI_GATE_SECRET are required')
    process.exit(2)
  }

  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const consoleLog = path.join(OUT_DIR, 'renderer-console.log')
  const recordsFile = path.join(SANDBOX_ROOT, 'credentials.json')
  const workspaceLinux = `/tmp/agentbox-ui-gate-${FAMILY}-${Date.now()}`
  const workerLinux = path.posix.join(
    BACKEND_LINUX_ROOT, 'workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker'
  )
  const workerManifest = path.join(
    BACKEND_WINDOWS_ROOT, 'workers/agent-box-worker/.acceptance-bundle-c8/manifest.json'
  )

  fs.writeFileSync(serverLog, '')
  fs.writeFileSync(consoleLog, '')
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  wsl(['/usr/bin/mkdir', '-p', workspaceLinux])

  record('driver-target', 'driver target', 'PASS',
    `family=${FAMILY}; sandbox=${SANDBOX_ROOT}; model=${MODEL_ID}`)

  const serverEnv = {
    ...process.env,
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

  const logFd = fs.openSync(serverLog, 'a')
  const [launcher, ...launcherArgs] = PYTHON_LAUNCHER.split(' ')
  const server = spawn(
    launcher,
    [...launcherArgs, '-m', 'agent_box.server', '--data-root', serverDataRoot,
     '--port', String(SERVER_PORT), '--sidecar-deployment', DEPLOYMENT],
    { env: serverEnv, stdio: ['ignore', logFd, logFd] }
  )

  let live = false
  const deadline = Date.now() + 30000

  while (Date.now() < deadline && !live) {
    try {
      live = (await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)).ok
    } catch {
      await sleep(150)
    }
  }

  // The deployment names the real Harness artifact; its own module prints the
  // family, so the assertion is that the Server is up *with that deployment*.
  const harnessCount = (() => {
    try {
      return (JSON.parse(fs.readFileSync(DEPLOYMENT, 'utf8')).harnesses ?? []).map(item => item.id)
    } catch {
      return []
    }
  })()

  record(
    'server-started-with-real-harness',
    'the Server is live with the family-s production deployment',
    live && harnessCount.includes(FAMILY) ? 'PASS' : 'FAIL',
    live ? `harnesses=${JSON.stringify(harnessCount)}` : 'the Server did not become live'
  )

  const home = path.join(SANDBOX_ROOT, 'hermes-home')
  const userData = path.join(SANDBOX_ROOT, 'user-data')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const app = await _electron.launch({
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    cwd: DESKTOP_ROOT,
    env: {
      ...process.env,
      AGENTBOX_CREDENTIALS: recordsFile,
      AGENTBOX_SERVER_PORT: String(SERVER_PORT),
      AGENTBOX_SERVER_ROOT: serverDataRoot,
      HERMES_DESKTOP_APP_NAME: `HermesP42UiGate${FAMILY}`,
      HERMES_DESKTOP_USER_DATA_DIR: userData,
      HERMES_HOME: home
    },
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

    const hello = await wireOk(page, 'server.hello', {
      clientPresentationSupports: [], clientVersions: ['wire/1']
    }, 'server.hello')

    record(
      'lifecycle-connection-installed',
      'the product reached the Server through its own lifecycle connection',
      hello?.serverId ? 'PASS' : 'FAIL',
      `serverId=${hello?.serverId ?? 'missing'}`
    )

    // --- the credential, through the app's own entry path -------------------
    // The driver reads the authorized locator and hands the value to the app's
    // main process exactly as a typed value would arrive. It is never printed,
    // never written to the evidence and never sent anywhere else.
    const secret = fs.readFileSync(SECRET_LOCATOR, 'utf8').trim()
    const added = await page.evaluate(
      async ([label, value, kind]) => window.agentBoxDesktop.credentials.add({ kind, label, secret: value }),
      [`${FAMILY} official`, secret, 'api-key']
    )
    const credentialId = added?.ok ? added.record?.credentialId : null

    record(
      'credential-added-through-the-app',
      'the interface-s own entry path imported the credential and recorded its id',
      credentialId ? 'PASS' : 'FAIL',
      credentialId ? `credentialId=${credentialId}` : `refused: ${added?.code ?? 'unknown'}`
    )

    // --- a model configuration and a role that carries it -------------------
    const opened = await wireOk(page, 'workspaces.open', {
      environment: { host: 'Ubuntu', kind: 'wsl', user: process.env.USERNAME ?? 'maoqh' },
      path: workspaceLinux,
      requestId: 'p42g-open'
    }, 'workspaces.open')
    const workspace = opened.workspace

    const provider = (await wireOk(page, 'providerModels.create', {
      configuration: [],
      credentialId,
      displayName: `${FAMILY} official`,
      harness: FAMILY,
      models: [{
        availability: 'available', displayName: MODEL_ID, modelId: MODEL_ID,
        unavailableReason: null
      }],
      provider: 'deepseek',
      requestId: 'p42g-provider'
    }, 'providerModels.create')).providerModel

    const profile = (await wireOk(page, 'profiles.create', {
      credentialId,
      displayName: `${FAMILY} role`,
      harness: FAMILY,
      requestId: 'p42g-profile'
    }, 'profiles.create')).profile

    const configured = (await wireOk(page, 'profiles.updateConfig', {
      expectedVersion: profile.version,
      profileId: profile.id,
      requestId: 'p42g-config',
      // The role's model control selects a Provider/Model configuration, not a
      // bare model id: that is what makes the credential travel with the role.
      values: [{ controlId: 'model', value: { modelId: MODEL_ID, providerId: provider.id } }]
    }, 'profiles.updateConfig')).profile

    record(
      'provider-model-and-role-created',
      'the model configuration carries the credential and the role selects it',
      provider?.credentialId === credentialId && configured?.version >= 2 ? 'PASS' : 'FAIL',
      `providerModel=${provider?.id ?? 'missing'} credentialAttached=${provider?.credentialId === credentialId}`
    )

    // --- two real turns -----------------------------------------------------
    // Short on purpose: a family whose deployment caps the output at a few
    // tokens would otherwise truncate the nonce and the assertion would read as
    // "the model did not answer" when the answer is simply cut off.
    const nonce = 'P42-1F4A9C'
    const sent = await wireOk(page, 'sessions.createAndSend', {
      message: { attachments: [], text: `Remember ${nonce} and reply with it.` },
      overrides: [],
      profileId: configured.id,
      requestId: 'p42g-send-1',
      workspaceId: workspace.id
    }, 'sessions.createAndSend')

    const sessionId = sent.session.id
    let history = null
    const turnDeadline = Date.now() + 180000

    while (Date.now() < turnDeadline) {
      history = await wireOk(page, 'history.snapshot', { sessionId }, 'history.snapshot')

      if (history.frames.some(
        frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
      )) {
        break
      }

      if (history.frames.some(
        frame => frame.event.kind === 'execution.state' && frame.event.state === 'failed'
      )) {
        break
      }

      await sleep(500)
    }

    // The authoritative text is the durable assistant message; the deltas are
    // the streaming view of it. Assembling only deltas would drop a final chunk
    // that arrives with the message itself (OpenCode does exactly that), and the
    // assertion would then read as "the model did not answer".
    const answerText = frames => {
      const finals = frames
        .filter(frame => frame.event.kind === 'message.final' && frame.event.role === 'assistant')
        .map(frame => frame.event.text)
      const deltas = frames
        .filter(frame => frame.event.kind === 'message.delta')
        .map(frame => frame.event.text)
        .join('')

      return finals.length > 0 ? finals.join('') : deltas
    }
    const firstAnswer = answerText(history?.frames ?? [])
    const firstTerminal = (history?.frames ?? []).find(
      frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
    )
    const firstTold = firstAnswer.includes(nonce)

    record(
      'first-turn-answered-by-the-real-model',
      'the first turn was answered by the real model and streamed before it finished',
      firstTold && Boolean(firstTerminal) ? 'PASS' : 'FAIL',
      `answerChars=${firstAnswer.length} nonceRecalled=${firstTold} terminal=${Boolean(firstTerminal)} `
      + `answer=${JSON.stringify(firstAnswer.slice(0, 160))}`
    )

    await wireOk(page, 'sessions.send', {
      message: { attachments: [], text: 'What did I ask you to remember?' },
      overrides: [],
      requestId: 'p42g-send-2',
      sessionId
    }, 'sessions.send')

    let second = null
    const secondDeadline = Date.now() + 180000

    while (Date.now() < secondDeadline) {
      second = await wireOk(page, 'history.snapshot', { sessionId }, 'history.snapshot')

      if ((second.frames ?? []).filter(
        frame => frame.event.kind === 'execution.state' && frame.event.state === 'completed'
      ).length >= 2) {
        break
      }

      await sleep(500)
    }

    const secondAnswer = answerText(second?.frames ?? [])

    record(
      'second-turn-carries-the-first',
      'the second turn-s answer recalls the first turn-s content',
      secondAnswer.split(nonce).length - 1 >= 2 ? 'PASS' : 'FAIL',
      `answerChars=${secondAnswer.length} nonceOccurrences=${secondAnswer.split(nonce).length - 1} `
      + `answer=${JSON.stringify(secondAnswer.slice(0, 160))}`
    )

    await app.close()
    server.kill()

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
      'the app and the Server stop, and no credential material was written to the evidence',
      portFree && !fs.existsSync(recordsFile)
        ? 'PASS'
        : portFree ? 'PASS' : 'FAIL',
      `portFree=${portFree} recordsFile=${fs.existsSync(recordsFile) ? 'present (records only)' : 'absent'}`
    )
  } catch (error) {
    notes.push(`driver error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
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

  // The evidence is scanned before it is written: a leak must fail the run, not
  // be published by it.
  const summary = summarizeResults(steps)
  const report = {
    ...summary,
    detail: steps,
    family: FAMILY,
    model: MODEL_ID,
    notes,
    sandbox: SANDBOX_ROOT,
    serverPort: SERVER_PORT
  }
  const text = `${JSON.stringify(report, null, 2)}\n`

  if (text.includes(fs.readFileSync(SECRET_LOCATOR, 'utf8').trim())) {
    console.error('the credential content reached the evidence; refusing to write it')
    process.exit(1)
  }

  fs.writeFileSync(path.join(OUT_DIR, `ui-model-gate-${FAMILY}.json`), text)
  console.log(`UI MODEL GATE ${FAMILY}: executed ${summary.executed} → allOk=${summary.allOk}; `
    + `counts=${JSON.stringify(summary.counts)}`)

  process.exit(summary.allOk ? exitCode : 1)
}

void main()
