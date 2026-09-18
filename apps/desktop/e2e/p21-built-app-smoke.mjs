/**
 * P21 — built-artifact boot smoke (DoD-3: run the build output once).
 *
 * Launches the ELECTRON BUILD OUTPUT (`dist/electron-main.mjs` + `dist/assets`)
 * with no service attached, attaches over the DevTools protocol and captures
 * what the window actually shows. The product's own contract makes that a
 * meaningful state: with no runtime/service found the window still opens and
 * says so — it never pretends to connect. The wired AgentBox faces are
 * exercised by the service-backed acceptance drivers; this one only proves the
 * artifact boots, mounts, and reports its honest state.
 *
 * Playwright's `_electron.launch` handshake does not survive this host's
 * boot (the app's own dbus/GPU chatter drowns the handshake), so the driver
 * spawns Electron itself and ATTACHES over CDP — the same window, one fewer
 * moving part.
 *
 * Usage (from apps/desktop, after `npm run build`):
 *   node e2e/p21-built-app-smoke.mjs <outDir> [--port 9333] [--keep-open]
 */
import { spawn } from 'node:child_process'
/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = process.argv[2]
const portIndex = process.argv.indexOf('--port')
const PORT = portIndex > -1 ? Number(process.argv[portIndex + 1]) : 9333

if (!OUT_DIR) {
  console.error('usage: node e2e/p21-built-app-smoke.mjs <outDir> [--port 9333]')
  process.exit(2)
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

const steps = []
const record = (id, label, status, detail = '') => {
  steps.push({ detail, id, label, status })
  console.log(`[p21-smoke] ${status} ${id} — ${label}${detail ? ` (${detail})` : ''}`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForDevTools(deadlineMs) {
  const deadline = Date.now() + deadlineMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`)

      if (response.ok) {
        return true
      }
    } catch {
      // not listening yet is the expected state while the app boots
    }

    await sleep(250)
  }

  return false
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const built = path.join(DESKTOP_ROOT, 'dist', 'electron-main.mjs')

  record('build-present', 'the build output exists', fs.existsSync(built) ? 'PASS' : 'FAIL', built)

  if (!fs.existsSync(built)) {
    process.exit(1)
  }

  const args = ['.', `--remote-debugging-port=${PORT}`]

  if (process.platform !== 'win32') {
    // The container has no setuid sandbox; the app itself is unchanged.
    args.push('--no-sandbox', '--disable-gpu')
  }

  const logPath = path.join(OUT_DIR, 'p21-built-app.log')
  const logFd = fs.openSync(logPath, 'a')
  const app = spawn(electronBinary(), args, {
    cwd: DESKTOP_ROOT,
    env: process.env,
    stdio: ['ignore', logFd, logFd]
  })

  record('app-spawned', 'electron started the built main', 'PASS', `pid=${app.pid ?? '?'}`)

  const ready = await waitForDevTools(60_000)

  record('devtools-ready', 'the window exposed a DevTools endpoint', ready ? 'PASS' : 'FAIL', `port=${PORT}`)

  if (!ready) {
    app.kill()
    process.exit(1)
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const [context] = browser.contexts()
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))

  await page.waitForLoadState('domcontentloaded')
  record('window-opened', 'a window loaded its document', 'PASS', await page.title())

  // Give the renderer its boot cycle: resolve → (nothing found) → honest state.
  await sleep(5000)

  const facts = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 800),
    chat: Boolean(document.querySelector('[data-agentbox-chat]')),
    phase:
      document.querySelector('[data-agentbox-service-phase]')?.getAttribute('data-agentbox-service-phase') ?? null,
    rootChildren: document.querySelector('#root')?.children.length ?? 0,
    workStatusPanel: Boolean(document.querySelector('[data-work-status-panel]'))
  }))

  record(
    'renderer-mounted',
    'the renderer mounted the shell',
    facts.rootChildren > 0 || facts.chat ? 'PASS' : 'FAIL',
    `root children=${facts.rootChildren} chat=${facts.chat} phase=${facts.phase}`
  )

  const shot = path.join(OUT_DIR, 'p21-built-app-boot.png')

  await page.screenshot({ path: shot })
  record('screenshot', 'the boot screenshot is on disk', fs.existsSync(shot) ? 'PASS' : 'FAIL', shot)

  fs.writeFileSync(path.join(OUT_DIR, 'p21-built-app-smoke.json'), JSON.stringify({ facts, steps }, null, 2) + '\n')

  await browser.close()
  app.kill()
  record('shutdown', 'the app was asked to close', 'PASS')

  const failed = steps.filter(step => step.status === 'FAIL')

  console.log(`[p21-smoke] ${steps.length - failed.length}/${steps.length} PASS`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch(error => {
  console.error('[p21-smoke] FAILED', error)
  process.exit(3)
})
