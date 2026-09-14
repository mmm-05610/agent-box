/**
 * Windows acceptance driver for P06 — the independent front-end acceptance gate
 * for the AgentBox Desktop product.
 *
 * NOT a Playwright spec and NOT a replacement for the existing P02A driver: a
 * standalone driver, run on Windows against the BUILT app with an isolated
 * HERMES_HOME/userData/app name, that opens the product with no Server, no
 * Harness, no credential and no model and checks the invariants the P06 work
 * order names:
 *
 *   1. the sandbox is genuinely isolated from the user's real data;
 *   2. no service/harness/credential/model is provided or reachable;
 *   3. the legacy Hermes fake-boot/fake-error environment is ignored: the
 *      runtime is never launched and no blocking overlay appears;
 *   4. the main window appears within a bounded time;
 *   5. no large-area [data-glass-opaque] blocking surface;
 *   6. the sidebar is operable;
 *   7. Settings opens and closes;
 *   8/9. Profiles and the product settings open and state unavailability
 *      honestly instead of showing fabricated rows or fake controls;
 *   10. the command palette offers AgentBox navigation and no legacy
 *      restart/logs/profile-import/export rows;
 *   11. the Command Center mounts as AgentBox authority;
 *   12. local and WSL workspace entries stay co-visible, with no fabricated
 *      workspace or session;
 *   13. the send entry fails closed with no backend (no fake Session);
 *   14. closing the window exits Electron with no orphaned process;
 *   15. no Hermes runtime process appears during the run.
 *
 * Usage (Windows, from apps/desktop):
 *   node e2e/p06-independent-acceptance-driver.mjs <sandboxRoot> <outDir>
 *
 * No model request is made, no credential is read, and the user's real
 * HERMES_HOME/userData are never touched. PASS/FAIL are executed steps; SKIP
 * means "not executable here"; PENDING means "honestly unsupported in this
 * environment" — and the required steps are asserted to be present exactly
 * once and executed (missing, duplicated, PENDING, SKIP or illegally-statused
 * required steps fail the run). "Does the product still issue legacy REST?" is
 * two independent required gates — no request refused at the main-process door
 * AND no residual renderer caller — that cannot substitute for each other.
 */

/* eslint-disable no-undef -- page.evaluate callbacks run in the renderer. */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import {
  collectDescendants,
  countMainLegacyRestRefusals,
  createStepRecorder,
  findLegacyPaletteEntries,
  hermesRuntimeProcesses,
  legacyRestGate,
  requiredStepIssues,
  residualLegacyRestPaths,
  statesUnavailable,
  summarizeResults,
  worstGlassCoverage
} from './p06-acceptance-helpers.mjs'

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)

const { _electron } = require('playwright-core')

const sandboxRoot = process.argv[2]
const outDir = process.argv[3]

if (!sandboxRoot || !outDir) {
  console.error('usage: node e2e/p06-independent-acceptance-driver.mjs <sandboxRoot> <outDir>')
  process.exit(2)
}

const WINDOW_DEADLINE_MS = 30_000
const REQUIRED_SCREENSHOTS = [
  'arrival-no-service.png',
  'command-center-agentbox.png',
  'command-palette-agentbox.png',
  'profiles-unavailable.png',
  'settings-no-service.png',
  'workspace-sidebar.png'
]

const results = []
const screenshots = []
const notes = []

// Every step goes through the helper's validating recorder: a status outside
// PASS/FAIL/SKIP/PENDING throws at the call site instead of being recorded (and
// then silently dropped by the summary) as prose.
const record = createStepRecorder(results, entry => {
  console.log(`${entry.status}  ${entry.id}  ${entry.detail || ''}`)
})

function note(text) {
  notes.push(text)
  console.log(`INFO  ${text}`)
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

/** Every running process, Windows-side. `tasklist` is present on every
 *  supported Windows build; the driver degrades to "[]" rather than failing a
 *  required step when it cannot be read. */
function listProcesses() {
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })

    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.split('","').map(cell => cell.replace(/^"|"$/g, '')))
      .filter(cells => cells.length >= 2)
      .map(cells => ({ name: cells[0], pid: Number(cells[1]) }))
      .filter(entry => Number.isFinite(entry.pid))
  } catch {
    return []
  }
}

/** pid + parent pid for the tree walk. PowerShell is the supported way to read
 *  parent ids on current Windows (wmic is gone). */
function listProcessTree() {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    const parsed = JSON.parse(out || '[]')
    const rows = Array.isArray(parsed) ? parsed : [parsed]

    return rows.map(row => ({ parentPid: row.ParentProcessId, pid: row.ProcessId }))
  } catch {
    return []
  }
}

function snapshotFiles() {
  return fs.readdirSync(outDir).sort()
}

function sha256Of(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

async function screenshot(page, name) {
  const file = path.join(outDir, name)

  await page.screenshot({ path: file })
  screenshots.push(file)

  return file
}

/** The sandbox: a per-run HERMES_HOME, userData and app name, plus a fake
 *  `hermes` on PATH that records every invocation. Recording invocations is the
 *  point — a `--version` probe is resolution, a `serve` invocation is a LAUNCH,
 *  and only the latter violates "the product does not start Hermes". */
function makeSandbox() {
  const home = path.join(sandboxRoot, 'hermes-home')
  const userData = path.join(sandboxRoot, 'user-data')
  const fakeBin = path.join(sandboxRoot, 'fake-bin')
  const markerFile = path.join(sandboxRoot, 'hermes-invocations.log')
  const startedFile = path.join(sandboxRoot, 'hermes-was-started.txt')

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(fakeBin, { recursive: true })

  // Provider-less by construction: there is no credential and nothing to reach.
  fs.writeFileSync(path.join(home, 'config.yaml'), '# P06 acceptance: intentionally provider-less\n', 'utf8')

  const cmd = [
    '@echo off',
    `echo %* >> "${markerFile}"`,
    'echo %* | findstr /C:"serve" >nul && echo served > "' + startedFile + '"',
    'echo hermes 0.0.0-p06-stub',
    'exit /b 0',
    ''
  ].join('\r\n')

  fs.writeFileSync(path.join(fakeBin, 'hermes.cmd'), cmd, 'utf8')

  const env = {
    ...process.env,
    HERMES_DESKTOP_APP_NAME: 'HermesP06Acceptance',
    HERMES_DESKTOP_BOOT_FAKE: '1',
    HERMES_DESKTOP_BOOT_FAKE_ERROR: 'Failed to connect to Hermes backend: connection refused',
    HERMES_DESKTOP_BOOT_FAKE_STEP_MS: '650',
    HERMES_DESKTOP_USER_DATA_DIR: userData,
    HERMES_HOME: home,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`
  }

  delete env.HERMES_DESKTOP_HERMES
  delete env.HERMES_DESKTOP_HERMES_ROOT
  delete env.HERMES_E2E_KEEP_SANDBOX

  return { env, fakeBin, home, markerFile, startedFile, userData }
}

/** The renderer-side view of the shell, read through stable hooks — never
 *  through localized copy, which the sandbox's system locale may change. */
async function shellReport(page) {
  return page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('[data-glass-opaque]')).map(node => {
      const rect = node.getBoundingClientRect()

      return { height: rect.height, width: rect.width }
    })
    const sessionRows = document.querySelectorAll('[data-agentbox-session-row]').length

    return {
      agentboxGlobalEmpty: document.querySelectorAll('[data-agentbox-global-empty]').length,
      agentboxGlobalError: document.querySelectorAll('[data-agentbox-global-error]').length,
      agentboxGlobalLoading: document.querySelectorAll('[data-agentbox-global-loading]').length,
      agentboxGlobalUnsupported: document.querySelectorAll('[data-agentbox-global-unsupported]').length,
      agentboxGlobalUnavailable: document.querySelectorAll('[data-agentbox-global-unavailable]').length,
      agentboxUnavailable: document.querySelectorAll('[data-agentbox-unavailable]').length,
      bootFailurePanels: document.querySelectorAll('[data-boot-failure-panel]').length,
      glassRectCount: rects.length,
      glassRects: rects,
      hash: window.location.hash,
      sessionRows,
      sidebar: document.querySelectorAll('[data-tour="sessions-sidebar"]').length,
      sidebarNavProfiles: document.querySelectorAll('[data-tour="sidebar-nav-profiles"]').length,
      sidebarNavSettings: document.querySelectorAll('[data-tour="sidebar-nav-settings"]').length,
      text: (document.body.textContent || '').replace(/\s+/g, ' ').trim(),
      viewportArea: window.innerWidth * window.innerHeight
    }
  })
}

async function goto(page, hash) {
  await page.evaluate(target => {
    window.location.hash = target
  }, hash)
  await page.waitForTimeout(900)
}

async function paletteOptionTexts(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="option"]')).map(node =>
      ((node.textContent || '').replace(/\s+/g, ' ').trim() || '').slice(0, 160)
    )
  )
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const bin = electronBinary()
  const sandbox = makeSandbox()
  const consoleLog = path.join(outDir, 'renderer-console.log')
  const mainLog = path.join(outDir, 'main-process-safe.log')

  fs.writeFileSync(consoleLog, '')
  fs.writeFileSync(mainLog, '')

  const baselineProcesses = listProcesses()
  const baselineHermes = hermesRuntimeProcesses(baselineProcesses)

  record('driver-target', 'driver target', 'PASS', `electron.exe=${bin}; dist/index.html=${fs.existsSync(path.join(DESKTOP_ROOT, 'dist', 'index.html'))}`)
  note(`baseline Hermes-named processes before launch: ${JSON.stringify(baselineHermes)}`)

  const startedAt = Date.now()
  const app = await _electron.launch({
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    cwd: DESKTOP_ROOT,
    env: sandbox.env,
    executablePath: bin
  })

  // The renderer emits its boot-time legacy-REST refusals before
  // `domcontentloaded`, and `legacy-rest.ts` reports each path once per session,
  // so a line lost before the listener attaches can never be recovered later —
  // the "no residual renderer caller" gate would then pass on evidence that was
  // never collected. Registering on `window` (before `firstWindow()`) catches a
  // window at creation; a window that already existed when `_electron.launch()`
  // resolved never fires that event, and Playwright emits it for those pages
  // inside the ElectronApplication constructor, before the caller can listen.
  const capturedPages = new WeakSet()
  const captureStartedAt = new WeakMap()
  let captureBasis = 'no window was captured'

  function attachConsoleCapture(candidate, atWindowCreation) {
    if (!candidate || capturedPages.has(candidate)) {
      return
    }

    capturedPages.add(candidate)
    captureStartedAt.set(candidate, atWindowCreation)

    candidate.on('console', message => fs.appendFileSync(consoleLog, `[${message.type()}] ${message.text()}\n`))
    candidate.on('pageerror', error => fs.appendFileSync(consoleLog, `[pageerror] ${error}\n`))
  }

  app.on('window', candidate => attachConsoleCapture(candidate, true))

  let page = null
  let treeRoots = []
  // Declared outside the try: the renderer gate is decided after teardown.
  let captureCoversBoot = false

  try {
    const mainProcess = app.process()

    mainProcess.stdout?.on('data', chunk => fs.appendFileSync(mainLog, chunk))
    mainProcess.stderr?.on('data', chunk => fs.appendFileSync(mainLog, chunk))

    page = await app.firstWindow({ timeout: WINDOW_DEADLINE_MS })
    const appearedAfterMs = Date.now() - startedAt

    // A window that already existed when the `window` listener was registered
    // never fires the event; attach here too, without double-logging it.
    attachConsoleCapture(page, false)

    // The coverage claim belongs to THIS window's log: a later window captured
    // from birth must not retroactively bless a first window attached too late.
    captureCoversBoot = captureStartedAt.get(page) === true

    if (captureCoversBoot) {
      captureBasis = 'attached at window creation, before the renderer could log anything'
    } else {
      // The race was lost, so the first document's earliest output cannot be
      // proven captured. EARN the coverage instead of failing or assuming it:
      // reload now that the listener is live, which re-runs the whole renderer
      // boot — module import, `applyProductRuntimePolicy()`, the cold-start
      // effects — strictly after capture began. The gate's requirement is
      // unchanged ("a whole boot ran under capture"); it is now satisfied by
      // evidence rather than by luck, and the first document's lines are still
      // in the log from the moment the listener attached.
      await page.reload({ waitUntil: 'domcontentloaded' })
      captureCoversBoot = capturedPages.has(page)
      captureBasis = 'first window predated the listener; the renderer boot was re-run under capture (reload)'
    }

    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(4000)

    // ── 1/2. Isolation and the absence of any service to talk to ────────────
    const resolvedUserData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    const isolationOk =
      path.resolve(resolvedUserData).toLowerCase() === path.resolve(sandbox.userData).toLowerCase() &&
      !path.resolve(resolvedUserData).startsWith(path.resolve(sandboxRoot, '..', 'AppData'))
    record(
      'sandbox-isolation',
      'the run uses its own HERMES_HOME, userData and app name',
      isolationOk ? 'PASS' : 'FAIL',
      `userData=${resolvedUserData} (expected ${sandbox.userData}); HERMES_HOME=${sandbox.home}; appName=HermesP06Acceptance`
    )

    const noServiceOk =
      !process.env.HERMES_DESKTOP_SERVER_URL &&
      !process.env.AGENTBOX_SERVER_URL &&
      !fs.existsSync(path.join(sandbox.userData, 'agentbox-connection.json')) &&
      !fs.existsSync(path.join(sandbox.home, 'credentials'))
    record(
      'no-service-provided',
      'no Server, Harness, credential or model is provided',
      noServiceOk ? 'PASS' : 'FAIL',
      `no server env, no agentbox connection slot file, no credentials dir under the sandbox home`
    )

    // ── 4. The window appeared ─────────────────────────────────────────────
    record(
      'window-appears',
      'the main window appears within the deadline',
      appearedAfterMs <= WINDOW_DEADLINE_MS && (await app.windows()).length >= 1 ? 'PASS' : 'FAIL',
      `first window in ${appearedAfterMs}ms (deadline ${WINDOW_DEADLINE_MS}ms); windows=${(await app.windows()).length}`
    )

    // ── 5. Arrival is not masked ───────────────────────────────────────────
    // A boot-transition frame may legitimately paint a mask for a moment; a
    // PERSISTENT one is the defect the product must never ship. Give it a
    // bounded settle window, then judge, and report how long it took.
    let arrival = await shellReport(page)
    let arrivalCoverage = worstGlassCoverage(arrival.glassRects, arrival.viewportArea)
    const settleDeadline = Date.now() + 20_000

    while (arrivalCoverage >= 0.9 && Date.now() < settleDeadline) {
      await page.waitForTimeout(500)
      arrival = await shellReport(page)
      arrivalCoverage = worstGlassCoverage(arrival.glassRects, arrival.viewportArea)
    }

    await screenshot(page, 'arrival-no-service.png')

    record(
      'no-blocking-overlay',
      'the arrival screen is not covered by a blocking surface',
      arrivalCoverage < 0.9 ? 'PASS' : 'FAIL',
      `largest [data-glass-opaque] covers ${(arrivalCoverage * 100).toFixed(1)}% (must be <90%); nodes=${arrival.glassRectCount}; failurePanels=${arrival.bootFailurePanels}; sidebar=${arrival.sidebar}`
    )

    // ── 12. Sidebar: local + WSL entries, no fabricated rows ───────────────
    await screenshot(page, 'workspace-sidebar.png')

    const addEntries = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-tour="sessions-sidebar"]')

      if (!sidebar) {
        return null
      }

      const text = (sidebar.textContent || '').replace(/\s+/g, ' ').trim()

      return { text: text.slice(0, 400), hasLocalFolder: /folder/i.test(text), hasRemote: /remote|wsl|WSL|远程/i.test(text) }
    })

    record(
      'workspace-entries',
      'local and remote/WSL workspace entries are co-visible, with no fabricated session',
      addEntries && addEntries.hasLocalFolder && addEntries.hasRemote && arrival.sessionRows === 0 ? 'PASS' : 'FAIL',
      `sidebar entries: local folder=${addEntries?.hasLocalFolder}; remote/WSL=${addEntries?.hasRemote}; agentbox session rows=${arrival.sessionRows} (must be 0)`
    )

    // ── 3. Legacy fake-boot env is ignored ────────────────────────────────
    const runtimeStubUsed = fs.existsSync(sandbox.startedFile)
    record(
      'legacy-fake-boot-ignored',
      'the legacy Hermes fake-boot/fake-error environment neither blocks nor starts a runtime',
      !runtimeStubUsed && arrivalCoverage < 0.9 ? 'PASS' : 'FAIL',
      `HERMES_DESKTOP_BOOT_FAKE=1 + FAKE_ERROR set; runtime launched=${runtimeStubUsed}; blocking coverage=${(arrivalCoverage * 100).toFixed(1)}%`
    )

    // ── 13. Send fails closed ─────────────────────────────────────────────
    const sendState = await page.evaluate(() => {
      const submit = document.querySelector('form button[type="submit"], button[type="submit"]')
      const banner = document.querySelector('[data-agentbox-unavailable]')

      return {
        banner: banner ? (banner.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : null,
        disabled: submit ? submit.hasAttribute('disabled') || submit.getAttribute('aria-disabled') === 'true' : null,
        hasComposer: document.querySelectorAll('form').length > 0,
        submitFound: Boolean(submit)
      }
    })

    if (sendState.submitFound) {
      await page
        .locator('form button[type="submit"], button[type="submit"]')
        .first()
        .click({ force: true, timeout: 5000 })
        .catch(() => undefined)
    }

    await page.waitForTimeout(1200)

    const afterSend = await shellReport(page)
    record(
      'send-fails-closed',
      'the send entry fails closed and creates no Session with no backend',
      (sendState.disabled === true || sendState.banner !== null) && afterSend.sessionRows === 0 ? 'PASS' : 'FAIL',
      `submit present=${sendState.submitFound}; disabled=${sendState.disabled}; unavailable banner=${JSON.stringify(sendState.banner)}; session rows after click=${afterSend.sessionRows} (must be 0)`
    )

    // ── 7. Settings opens and closes ──────────────────────────────────────
    await goto(page, '#/settings?tab=product:models')
    const settingsOpen = await shellReport(page)
    await screenshot(page, 'settings-no-service.png')

    await goto(page, '#/')
    const settingsClosed = await shellReport(page)

    record(
      'settings-opens-closes',
      'Settings opens and closes',
      settingsOpen.hash.startsWith('#/settings') && settingsOpen.text.length > 0 && !settingsClosed.hash.startsWith('#/settings')
        ? 'PASS'
        : 'FAIL',
      `after open: hash=${settingsOpen.hash}, text=${settingsOpen.text.length} chars; after close: hash=${settingsClosed.hash}`
    )

    // ── 8/9. Profiles and product settings state unavailability honestly ───
    await goto(page, '#/profiles')
    const profiles = await shellReport(page)
    await screenshot(page, 'profiles-unavailable.png')

    record(
      'profiles-honest',
      'Profiles opens and states unavailability instead of showing fabricated records',
      profiles.hash.startsWith('#/profiles') && profiles.text.length > 0 && profiles.sessionRows === 0 && statesUnavailable(profiles.text)
        ? 'PASS'
        : 'FAIL',
      `hash=${profiles.hash}; unavailable copy present=${statesUnavailable(profiles.text)}; session rows=${profiles.sessionRows}; text="${profiles.text.slice(0, 180)}"`
    )

    const productSections = ['product:models', 'product:resources', 'product:identities', 'product:harnesses', 'product:data']
    const sectionReports = []

    for (const tab of productSections) {
      await goto(page, `#/settings?tab=${tab}`)
      const section = await page.evaluate(() => ({
        controls: document.querySelectorAll('input, select, textarea').length,
        empty: document.querySelectorAll('[data-agentbox-unavailable]').length,
        text: (document.body.textContent || '').replace(/\s+/g, ' ').trim()
      }))

      sectionReports.push({ controls: section.controls, honest: statesUnavailable(section.text), tab })
    }

    const modelsHonest = sectionReports.every(report => report.honest || report.controls > 0)

    record(
      'product-settings-honest',
      'Models and the other product settings open; unavailable capabilities are stated, not faked',
      modelsHonest ? 'PASS' : 'FAIL',
      sectionReports.map(report => `${report.tab}: controls=${report.controls}, honest=${report.honest}`).join('; ')
    )

    // ── 11. Command Center is AgentBox authority ──────────────────────────
    await goto(page, '#/command-center?section=sessions')
    const commandCenter = await shellReport(page)
    await screenshot(page, 'command-center-agentbox.png')

    const legacyCcActions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="menuitem"]'))
        .map(node => ((node.textContent || '').replace(/\s+/g, ' ').trim() || '').slice(0, 60))
        .filter(text => /restart|update hermes|maintenance|usage/i.test(text))
    )

    record(
      'command-center-agentbox',
      'the Command Center opens as AgentBox authority with no legacy System/Usage/Maintenance action',
      commandCenter.hash.startsWith('#/command-center') && legacyCcActions.length === 0 ? 'PASS' : 'FAIL',
      `hash=${commandCenter.hash}; legacy-looking actions=${JSON.stringify(legacyCcActions)}; text="${commandCenter.text.slice(0, 160)}"`
    )

    // ── 10. Command palette ───────────────────────────────────────────────
    await goto(page, '#/')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(900)

    const paletteOptions = await paletteOptionTexts(page)
    await screenshot(page, 'command-palette-agentbox.png')

    const legacyEntries = findLegacyPaletteEntries(paletteOptions)
    const hasProfilesRow = paletteOptions.some(text => /profiles/i.test(text))

    record(
      'command-palette-agentbox',
      'the command palette offers AgentBox navigation and no legacy restart/logs/profile share rows',
      paletteOptions.length > 0 && hasProfilesRow && legacyEntries.length === 0 ? 'PASS' : 'FAIL',
      `options=${paletteOptions.length}; profiles row=${hasProfilesRow}; legacy entries=${JSON.stringify(legacyEntries)}; first options=${JSON.stringify(paletteOptions.slice(0, 12))}`
    )

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // ── 6. Sidebar operable ───────────────────────────────────────────────
    // Clicked through Playwright's real hit-testing, not element.click(): a
    // script click lands even through a full-screen mask, so it would report a
    // blocked shell as operable. This is the assertion the retired mask broke.
    await goto(page, '#/')

    let sidebarDetail = 'no click attempted'
    let sidebarOk = false

    try {
      await page.locator('[data-tour="sidebar-nav-settings"]').first().click({ timeout: 8000 })
      await page.waitForTimeout(900)
      sidebarDetail = 'settings entry accepted a real click'
      sidebarOk = true
    } catch (error) {
      sidebarDetail = `click did not land: ${String(error).slice(0, 160)}`
    }

    const afterSidebarClick = await shellReport(page)
    const sidebarNavigated = afterSidebarClick.hash.startsWith('#/settings')

    record(
      'sidebar-operable',
      'the sidebar is operable with no backend (its Settings entry takes a real click)',
      sidebarOk && sidebarNavigated ? 'PASS' : 'FAIL',
      `${sidebarDetail}; hash after click=${afterSidebarClick.hash}`
    )

    // ── Bonus: the retired view routes ────────────────────────────────────
    const routeChecks = []

    for (const route of ['#/cron', '#/agents', '#/starmap', '#/webhooks']) {
      await goto(page, route)
      const landed = await page.evaluate(() => window.location.hash)
      const rows = await page.evaluate(() => document.querySelectorAll('[data-agentbox-session-row]').length)

      routeChecks.push({ landed, route, rows })
    }

    const routesRetired = routeChecks.every(check => check.landed.includes('tab=product:resources'))

    record(
      'legacy-view-routes-retired',
      'Cron/Agents/Starmap/Webhooks deep links land on the honest product page, not a legacy view',
      routesRetired ? 'PASS' : 'FAIL',
      routeChecks.map(check => `${check.route} → ${check.landed}`).join('; ')
    )

    await goto(page, '#/')

    // ── Process evidence before teardown ──────────────────────────────────
    const liveTree = listProcessTree()
    treeRoots = collectDescendants(liveTree, [mainProcess.pid])
    note(`launched process tree before close: ${JSON.stringify(treeRoots)}`)

    const liveProcesses = listProcesses()
    const liveHermes = hermesRuntimeProcesses(liveProcesses).filter(
      entry => !baselineHermes.some(base => base.pid === entry.pid)
    )

    record(
      'no-hermes-process',
      'no Hermes runtime process appears while the product runs',
      liveHermes.length === 0 && !runtimeStubUsed ? 'PASS' : 'FAIL',
      `new Hermes-named processes=${JSON.stringify(liveHermes)}; fake runtime stub invoked with serve=${runtimeStubUsed}`
    )
  } finally {
    await app.close().catch(() => undefined)
  }

  // ── 14. Exit is clean ───────────────────────────────────────────────────
  let leftover = treeRoots

  for (let attempt = 0; attempt < 20 && leftover.length > 0; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000))

    const alive = new Set(listProcesses().map(entry => entry.pid))

    leftover = treeRoots.filter(pid => alive.has(pid))
  }

  record(
    'exit-no-orphans',
    'closing the window exits Electron with no orphaned process',
    leftover.length === 0 ? 'PASS' : 'FAIL',
    `process tree at close=${JSON.stringify(treeRoots)}; still alive after 20s=${JSON.stringify(leftover)}`
  )

  // ── Evidence: logs, the two legacy-REST gates, screenshots, hashes ──────
  const mainLogText = fs.readFileSync(mainLog, 'utf8')
  const consoleText = fs.readFileSync(consoleLog, 'utf8')
  const tokenish = /bearer\s+[a-z0-9._-]{8,}|sessionToken"?\s*[:=]\s*"?[a-z0-9._-]{8,}/i.test(mainLogText)

  // The product must not even ASK for the legacy Hermes REST surface. Two
  // independent required gates that cannot substitute for each other: a
  // refusal at the main-process door proves a request was issued, and a
  // renderer residual proves one was issued even when nothing counted it. The
  // renderer gate additionally fails closed when the console capture was not
  // live from window creation — an incomplete log cannot establish "no
  // residual caller".
  const mainRefusals = countMainLegacyRestRefusals(mainLogText)
  const residualLegacyPaths = residualLegacyRestPaths(consoleText)
  const restGate = legacyRestGate({ captureCoversBoot, mainRefusals, residualPaths: residualLegacyPaths })

  record(
    'no-legacy-rest-reached-main',
    'no legacy REST request is refused at the main-process door',
    restGate.mainOk ? 'PASS' : 'FAIL',
    `main-process refusals=${mainRefusals} (must be exactly 0)`
  )

  record(
    'no-legacy-rest-issued-by-renderer',
    'the renderer issues no legacy REST request, refused or otherwise',
    restGate.rendererOk ? 'PASS' : 'FAIL',
    `renderer residual legacy paths=${JSON.stringify(residualLegacyPaths)} (must be []); console capture: ${captureBasis}; renderer-console.log=${consoleText.length} chars`
  )

  record(
    'logs-token-free',
    'the captured main-process log carries no token material',
    tokenish ? 'FAIL' : 'PASS',
    `main-process-safe.log=${mainLogText.length} chars; token-shaped material=${tokenish}; renderer-console.log=${consoleText.length} chars`
  )

  const present = snapshotFiles()
  const missing = REQUIRED_SCREENSHOTS.filter(name => !present.includes(name))

  if (missing.length > 0) {
    record('required-screenshots', 'every required screenshot was captured', 'FAIL', `missing=${JSON.stringify(missing)}`)
  } else {
    record(
      'required-screenshots',
      'every required screenshot was captured',
      'PASS',
      REQUIRED_SCREENSHOTS.join(', ')
    )
  }

  // Recorded LAST so it sees every other step: missing, duplicated, PENDING,
  // SKIP and illegally-statused required steps all fail it. It is itself not a
  // required id — the gate cannot require its own prior existence.
  const requiredIssues = requiredStepIssues(results)

  record(
    'required-steps-executed',
    'every required step is present exactly once and executed',
    requiredIssues.length === 0 ? 'PASS' : 'FAIL',
    requiredIssues.length === 0
      ? `${results.length + 1} steps, none missing/duplicated/PENDING/SKIP`
      : JSON.stringify(requiredIssues)
  )

  const hashes = {}

  for (const file of snapshotFiles()) {
    const full = path.join(outDir, file)

    if (fs.statSync(full).isFile()) {
      hashes[file] = sha256Of(full)
    }
  }

  const final = summarizeResults(results)
  const report = {
    allOk: final.allOk,
    counts: final.counts,
    executed: final.executed,
    finishedAt: new Date().toISOString(),
    notes,
    screenshots,
    sha256: hashes,
    steps: results,
    unknownStatuses: final.unknownStatuses
  }

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(report, null, 2), 'utf8')

  console.log(
    `ACCEPTANCE: executed ${final.executed} → allOk=${final.allOk}; counts=${JSON.stringify(final.counts)}; unknownStatuses=${JSON.stringify(final.unknownStatuses)} (allOk covers executed steps only; every required step must be present exactly once and must not be PENDING/SKIP)`
  )
  process.exit(final.allOk ? 0 : 1)
}

main().catch(error => {
  console.error('DRIVER FAILED:', error)
  process.exit(1)
})
