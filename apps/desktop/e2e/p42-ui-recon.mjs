/**
 * UI reconnaissance: what controls the product actually exposes.
 *
 * Not a gate. It launches the built app against a prepared Server and dumps the
 * labels, roles and editable regions a driver can address, so the real UI driver
 * is written against the product's own vocabulary instead of guessed selectors.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { _electron } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const SANDBOX_ROOT = process.argv[2]
const OUT_DIR = process.argv[3]
const SERVER_PORT = Number(process.env.AGENTBOX_UI_GATE_PORT ?? '18770')
const DEPLOYMENT = process.env.AGENTBOX_UI_GATE_DEPLOYMENT

// UI survey additions (2026-09-17): optional per-step screenshots and the
// artifact mount bindings the current Server CLI requires.
const SHOTS_DIR = (() => {
  const index = process.argv.indexOf('--shots')
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : null
})()
const MOUNTS = (process.env.AGENTBOX_UI_GATE_MOUNTS ?? '').split(',').map(v => v.trim()).filter(Boolean)

if (SHOTS_DIR) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
}

function shotSlug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'step'
}

function electronBinary() {
  for (const candidate of [
    path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(DESKTOP_ROOT, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('electron.exe not found')
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })

  const serverDataRoot = path.join(SANDBOX_ROOT, 'server-data')
  const serverLog = path.join(OUT_DIR, 'server.log')
  const logFd = fs.openSync(serverLog, 'a')
  const serverEnv = {
    ...process.env,
    AGENT_BOX_WSL_WORKER_LINUX_PATH: path.posix.join(
      process.env.AGENTBOX_SERVER_LINUX_ROOT,
      'workers/agent-box-worker/.acceptance-bundle-c8/agent-box-worker'
    ),
    AGENT_BOX_WSL_WORKER_MANIFEST: path.join(
      process.env.AGENTBOX_SERVER_SOURCE_ROOT,
      'workers/agent-box-worker/.acceptance-bundle-c8/manifest.json'
    ),
    PYTHONPATH: [
      path.join(process.env.AGENTBOX_SERVER_SOURCE_ROOT, 'src'),
      path.join(process.env.AGENTBOX_SERVER_SOURCE_ROOT, 'plugins/agent-box-harnesses/src'),
      path.join(process.env.AGENTBOX_SERVER_SOURCE_ROOT, 'plugins/agent-box-runtime-wsl/src'),
      path.join(process.env.AGENTBOX_SERVER_SOURCE_ROOT, 'plugins/agent-box-sandbox-bwrap/src')
    ].join(';')
  }

  const backendWindowsRoot = process.env.AGENTBOX_SERVER_SOURCE_ROOT ?? ''
  const server = spawn('py.exe', ['-3.12', '-m', 'agent_box.server', '--data-root', serverDataRoot,
    '--port', String(SERVER_PORT), '--sidecar-deployment', DEPLOYMENT,
    ...(backendWindowsRoot ? ['--plugin-root', path.join(backendWindowsRoot, 'plugins', 'agent-box-harnesses')] : []),
    ...MOUNTS.flatMap(binding => ['--mount', binding])],
    { env: serverEnv, stdio: ['ignore', logFd, logFd] })

  const deadline = Date.now() + 30000
  let live = false

  while (Date.now() < deadline && !live) {
    try {
      live = (await fetch(`http://127.0.0.1:${SERVER_PORT}/live`)).ok
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }

  const home = path.join(SANDBOX_ROOT, 'hermes-home')
  const userData = path.join(SANDBOX_ROOT, 'user-data')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })

  const app = await _electron.launch({
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    cwd: DESKTOP_ROOT,
    env: {
      ...process.env,
      AGENTBOX_CREDENTIALS: path.join(SANDBOX_ROOT, 'credentials.json'),
      AGENTBOX_SERVER_PORT: String(SERVER_PORT),
      AGENTBOX_SERVER_ROOT: serverDataRoot,
      HERMES_DESKTOP_APP_NAME: 'HermesUiRecon',
      HERMES_DESKTOP_USER_DATA_DIR: userData,
      HERMES_HOME: home
    },
    executablePath: electronBinary()
  })

  try {
    const page = await app.firstWindow()

    await page.waitForLoadState('domcontentloaded')
    await new Promise(resolve => setTimeout(resolve, 6000))

    let shotIndex = 0

    const snap = async label => {
      if (!SHOTS_DIR) {
        return
      }

      shotIndex += 1
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${String(shotIndex).padStart(2, '0')}-${shotSlug(label)}.png`)
      })
    }

    await snap('boot')

    // Optionally open one dialog first, so the dump describes what a user sees
    // after clicking: `--click "Open folder"` or `--click "Choose a profile"`.
    // Every `--click <label>` opens one dialog or page, in order, so a whole
    // journey can be walked before the dump is taken.
    for (let index = 0; index < process.argv.length; index += 1) {
      if (process.argv[index] !== '--click') {
        continue
      }

      const label = process.argv[index + 1]

      try {
        await page.getByRole('button', { name: label }).first().click({ timeout: 5000 })
      } catch (error) {
        console.error(`click skipped: ${label} (${error.message.split('\n')[0]})`)
      }

      await new Promise(resolve => setTimeout(resolve, 2500))
      await snap(label)
    }

    const dump = await page.evaluate(() => {
      const labelled = Array.from(document.querySelectorAll('[aria-label]'))
        .map(node => ({ label: node.getAttribute('aria-label'), role: node.getAttribute('role') ?? node.tagName.toLowerCase() }))
      const buttons = Array.from(document.querySelectorAll('button'))
        .map(node => ((node.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40))
        .filter(Boolean)
      const editables = Array.from(document.querySelectorAll('[contenteditable], textarea, [role="textbox"]'))
        .map(node => ({ tag: node.tagName.toLowerCase(), editable: node.getAttribute('contenteditable'),
                        role: node.getAttribute('role'), label: node.getAttribute('aria-label'),
                        placeholder: node.getAttribute('data-placeholder') ?? node.getAttribute('placeholder') }))
      const slots = Array.from(document.querySelectorAll('[data-slot]'))
        .map(node => node.getAttribute('data-slot')).slice(0, 60)
      const testIds = Array.from(document.querySelectorAll('[data-testid]'))
        .map(node => node.getAttribute('data-testid')).slice(0, 60)
      const dialogText = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [data-state="open"]'))
        .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600)).slice(0, 4)
      const inputs = Array.from(document.querySelectorAll('input, select'))
        .map(node => ({ tag: node.tagName.toLowerCase(), type: node.getAttribute('type'),
                        label: node.getAttribute('aria-label'), placeholder: node.getAttribute('placeholder'),
                        options: node.tagName === 'SELECT' ? Array.from(node.options).map(o => o.textContent) : undefined }))
        .slice(0, 30)
      const settingsEntries = Array.from(document.querySelectorAll('a,button,[role="tab"],[role="menuitem"]'))
        .map(node => ((node.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 40))
        .filter(text => /setting|model|profile|workspace|设置|模型|角色/i.test(text)).slice(0, 40)

      return { buttons: [...new Set(buttons)], dialogText, editables, inputs, labelled: labelled.slice(0, 80),
               settingsEntries: [...new Set(settingsEntries)], slots: [...new Set(slots)],
               testIds: [...new Set(testIds)], url: location.hash, title: document.title }
    })

    fs.writeFileSync(path.join(OUT_DIR, 'ui-recon.json'), `${JSON.stringify(dump, null, 2)}\n`)
    console.log(JSON.stringify({
      url: dump.url,
      buttons: dump.buttons.slice(0, 30),
      dialogText: dump.dialogText,
      inputs: dump.inputs,
      editables: dump.editables
    }, null, 1))
  } finally {
    await app.close()
    server.kill()

    if (server.pid) {
      try {
        const { execFileSync } = await import('node:child_process')

        execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // already gone
      }
    }
  }
}

void main()
