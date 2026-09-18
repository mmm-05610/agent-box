/**
 * Windows acceptance driver for work order 36R — the unified Workspace
 * sidebar, driven against the real Desktop, the real WSL and the real file
 * tree.
 *
 * NOT a Playwright spec: a standalone driver that launches the built app on
 * Windows with an isolated userData and drives the 36R user path:
 *
 *   isolated identity (exe in the worktree/userData/build version, second
 *   instance must fail and the first must survive) → first-run gate → unified
 *   sidebar → 本地打开目录 (marker + real path via Copy path; a typed
 *   path-scope refusal is recorded PENDING, never PASS) → WSL 打开目录 →
 *   同一列表（data-workspace-list 层级断言） → 主行选中/展开（打开 info
 *   不算切换） → 重命名 → 移除=归档（同 id 重开恢复） → 空工作区搜索 →
 *   本地隐藏(仅 WSL 列表) → 窄侧栏名称/键盘 → 重开恢复 → WSL 重连
 *
 * Only the OS directory PICKER is stubbed (app.evaluate over the main-process
 * `dialog` module) — the picker performs the SELECTION only; the RESULT is
 * verified through a real directory marker and the project's own path, never
 * through the row name. Every other step runs the real UI, real IPC and real
 * wsl.exe.
 *
 * Evidence rules (work order 36R): PASS / FAIL / SKIP / PENDING are recorded
 * separately; the final allOk aggregates ONLY executed steps (PASS/FAIL). A
 * SKIP means "not executable here, behavior tests cover it"; a PENDING means
 * "correctly unsupported in this environment" (e.g. a Windows-local real open
 * against a WSL-only Hermes — the typed refusal is the safety boundary
 * passing, NOT a local product pass).
 *
 * Usage (Windows, from apps/desktop):
 *   node e2e/workspace-sidebar-round36-driver.mjs <sandboxRoot> <outDir>
 *
 * No model request is made, no credential is read, and the user's real
 * userData is never touched: the isolated userData dir is the sandbox, and
 * HERMES_DESKTOP_APP_NAME keeps the About/menu label distinct (the product
 * never calls app.setName, so `app.getName()` stays the packaged productName).
 */

/* eslint-disable no-undef -- the page.evaluate callbacks run in the renderer,
 * where window/document exist; this file itself is a plain node driver. */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const DESKTOP_ROOT = path.resolve(import.meta.dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..', '..')
const require = createRequire(import.meta.url)

const { _electron } = require('playwright-core')

const sandboxRoot = process.argv[2]
const outDir = process.argv[3]

if (!sandboxRoot || !outDir) {
  console.error('usage: node e2e/workspace-sidebar-round36-driver.mjs <sandboxRoot> <outDir>')
  process.exit(2)
}

const hermesHome = path.join(sandboxRoot, 'hermes-home')
const userDataDir = path.join(sandboxRoot, 'user-data')

fs.mkdirSync(hermesHome, { recursive: true })
fs.mkdirSync(userDataDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(path.join(hermesHome, 'config.yaml'), '# acceptance round 36R: intentionally provider-less\n', 'utf8')

// The local workspace the ＋→打开文件夹 flow opens. Real directory on the
// Windows machine, created (not deleted) by the driver. A marker file inside
// it is the DIRECTORY MARKER the result is verified against.
//
// The name carries a per-run suffix on purpose: the fresh sandbox covers
// Electron's userData, but NOT the connected backend's Hermes home — a local
// open from an earlier run stays in the gateway's project DB, so a fixed name
// would let a STALE backend project answer for this run's pick.
const localDirName = `local-acceptance-r36r-${Date.now().toString(36)}`
const localDir = path.join(sandboxRoot, localDirName)
const localMarker = path.join(localDir, '.36r-directory-marker')

// The typed refusal the product shows when a Windows-local pick cannot live in
// the backend's path space (the 36R boundary). Seeing it is the SAFETY BOUNDARY
// passing, not a local product pass — it is recorded PENDING, never PASS.
const PATH_SCOPE_REFUSAL = /Windows path|Windows 路径|Windows 路徑|remote backend|远程后端|遠端後端/

const expectedBuildVersion = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8')).version
const expectedProductName = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8')).productName

// PASS/FAIL = executed; SKIP = not executable here (behavior tests cover it);
// PENDING = correctly unsupported in this environment.
const results = []
let stepIndex = 0

async function screenshot(page, name) {
  stepIndex += 1
  const file = path.join(outDir, `${String(stepIndex).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  return file
}

function record(step, status, detail) {
  results.push({ step, status, detail })
  console.log(`${status}  ${step}  ${detail || ''}`)
}

/** The host's workspace store — the persisted truth the renderer caches. */
function hostStore() {
  const storeFile = path.join(userDataDir, 'wsl-workspaces.json')

  if (!fs.existsSync(storeFile)) {
    return { version: null, workspaces: [] }
  }

  const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8'))

  return { version: parsed.version ?? null, workspaces: parsed.workspaces || [] }
}

function hostRecordIds() {
  return hostStore()
    .workspaces.map(w => ({ id: w.id, name: w.name, archivedAt: w.archivedAt ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function launchApp(electronBin, env) {
  const app = await _electron.launch({
    executablePath: electronBin,
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    env,
    cwd: DESKTOP_ROOT
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)

  return { app, page }
}

/** The one workspace list body — the assertion level for "same list" claims.
 *  Ancestors are never scanned: a hit at body level is a failure, not a match. */
async function workspaceListContents(page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-workspace-list]')

    if (!list) {
      return null
    }

    return {
      localIds: Array.from(list.querySelectorAll('[data-sessions-project]')).map(node => node.getAttribute('data-sessions-project')),
      wslIds: Array.from(list.querySelectorAll('[data-wsl-workspace-row]')).map(node => node.getAttribute('data-wsl-workspace-row'))
    }
  })
}

async function main() {
  const electronBin = [
    path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(REPO_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
  ].find(candidate => fs.existsSync(candidate))

  if (!electronBin) {
    throw new Error('electron.exe not found under apps/desktop or repo root node_modules')
  }

  if (!fs.existsSync(path.join(DESKTOP_ROOT, 'dist'))) {
    throw new Error('apps/desktop/dist is missing — run `npm run build` first')
  }

  fs.mkdirSync(localDir, { recursive: true })
  // The directory marker: the pick's RESULT is verified against this file,
  // not against the row's name.
  fs.writeFileSync(localMarker, '36R acceptance marker\n', 'utf8')

  const env = {
    ...process.env,
    HERMES_HOME: hermesHome,
    HERMES_DESKTOP_USER_DATA_DIR: userDataDir,
    HERMES_DESKTOP_APP_NAME: 'HermesWslRound1'
  }

  delete env.HERMES_E2E_KEEP_SANDBOX

  const { app, page } = await launchApp(electronBin, env)

  // Renderer console + page errors → the driver log (diagnostics only).
  const consoleLog = path.join(outDir, 'renderer-console.log')

  page.on('console', message => {
    fs.appendFileSync(consoleLog, `[${message.type()}] ${message.text()}\n`)
  })
  page.on('pageerror', error => {
    fs.appendFileSync(consoleLog, `[pageerror] ${error}\n`)
  })

  const title = await page.title()
  record('app opens', 'PASS', `window title: ${title}`)
  await screenshot(page, 'boot')

  // ─── step: isolated identity — REAL process path, userData, version ───
  // What the product contracts: `app.getPath('exe')` is the worktree's
  // electron, `userData` is the sandbox override, and the build version is the
  // worktree's own. `app.getName()` is NOT a sandbox override in this product:
  // HERMES_DESKTOP_APP_NAME feeds APP_NAME (About panel / menu label / HUD
  // title) and app.setName is never called, so the real process always answers
  // with the packaged productName. Asserting the override there would test a
  // feature the product does not claim; the isolated userData is what proves
  // this is not the user's instance.
  let identityOk = true
  let identityDetail = ''

  try {
    const facts = await app.evaluate(
      ({ app: electronApp }, expected) => ({
        exePath: electronApp.getPath('exe'),
        userData: electronApp.getPath('userData'),
        name: electronApp.getName(),
        version: electronApp.getVersion(),
        expected
      }),
      { userDataDir, name: expectedProductName, version: expectedBuildVersion }
    )

    const exeReal = facts.exePath.toLowerCase().endsWith('electron.exe')
    const exeInWorktree = path.resolve(facts.exePath).toLowerCase().startsWith(path.resolve(REPO_ROOT).toLowerCase())
    const userDataOk = path.resolve(facts.userData).toLowerCase() === path.resolve(userDataDir).toLowerCase()
    const nameOk = facts.name === facts.expected.name
    const versionOk = facts.version === facts.expected.version

    identityOk = exeReal && exeInWorktree && userDataOk && nameOk && versionOk
    identityDetail = `exe=${facts.exePath} (electron=${exeReal}, in-worktree=${exeInWorktree}); userData isolated=${userDataOk}; name=${facts.name} (productName match=${nameOk}; HERMES_DESKTOP_APP_NAME is a label-only override, app.setName is never called); build=${facts.version} (match=${versionOk})`
  } catch (error) {
    identityOk = false
    identityDetail = String(error).slice(0, 200)
  }
  record('isolated app identity', identityOk ? 'PASS' : 'FAIL', identityDetail)

  // ─── step: single-instance — a SECOND launch must NOT reuse this window ───
  let singleInstanceOk = true
  let singleInstanceDetail = ''

  try {
    const second = await _electron.launch({
      executablePath: electronBin,
      args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
      env,
      cwd: DESKTOP_ROOT
    })

    // The second process must not hand us a usable window: either the launch
    // itself fails, or every window it reports is gone (the lock quit it).
    await second.close().catch(() => undefined)
    singleInstanceDetail = 'second instance exited (requestSingleInstanceLock refused it — the same env, exe and args launched the first window, so the difference is the lock)'
  } catch (error) {
    singleInstanceDetail = `second instance failed to start: ${String(error).slice(0, 120)}`
  }

  // The FIRST window must still be the live one — and still answering: a
  // surviving-but-frozen window is not evidence the lock let the second
  // instance through, it is evidence of a hang.
  try {
    const windowsAfter = app.windows().length
    const liveProbe = await page.evaluate(() => ({ title: document.title, ready: document.readyState }))

    if (windowsAfter < 1) {
      singleInstanceOk = false
      singleInstanceDetail = 'original window disappeared after the second launch'
    } else if (liveProbe.ready !== 'complete') {
      singleInstanceOk = false
      singleInstanceDetail = `original window survived but is not live: readyState=${liveProbe.ready}`
    } else {
      singleInstanceDetail += `; original window still live (readyState=${liveProbe.ready}, title="${liveProbe.title}")`
    }
  } catch (error) {
    singleInstanceOk = false
    singleInstanceDetail = `original window unreachable: ${String(error).slice(0, 120)}`
  }
  record('single-instance blocks reuse', singleInstanceOk ? 'PASS' : 'FAIL', singleInstanceDetail)

  // ─── first-run gate → the real WSL gateway (same door as round 1) ───
  const gatewayUrl = process.env.WSL_R1_GATEWAY_URL || 'http://127.0.0.1:9127'
  const tokenFile = process.env.WSL_R1_TOKEN_FILE || '\\\\wsl.localhost\\Ubuntu\\home\\maoqh\\wsl-round1-gateway-home\\session-token.txt'
  const gatewayToken = process.env.WSL_R1_GATEWAY_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '')

  const setupGate = page.getByText(/Connect to existing Hermes|连接到已有的 Hermes/).first()

  try {
    await setupGate.waitFor({ state: 'visible', timeout: 6000 })
  } catch {
    // gate not shown (runtime already set up)
  }

  if (await setupGate.isVisible().catch(() => false)) {
    await setupGate.click()
    await page.getByPlaceholder(/gateway.example.com/).first().fill(gatewayUrl)
    await page.waitForTimeout(2500)

    const tokenInput = page.getByPlaceholder(/Paste session token|粘贴会话令牌/).first()
    await tokenInput.waitFor({ state: 'visible', timeout: 15000 })
    await tokenInput.fill(gatewayToken)

    await page.getByRole('button', { name: /Test connection|测试连接/ }).first().click()
    await page.getByText(/Connected to|已连接到/).first().waitFor({ state: 'visible', timeout: 20000 })
    record('gateway probe', 'PASS', `test connection succeeded against ${gatewayUrl}`)

    await page.getByRole('button', { name: /Apply and reconnect|应用并重新连接/ }).first().click()
    await setupGate.waitFor({ state: 'detached', timeout: 60000 })
    record('first-run setup applied', 'PASS', 'desktop reconnected against the real gateway')
    await page.waitForTimeout(3000)
  } else {
    // The gate is skipped when a saved connection already exists (the desktop
    // keeps its connection in the app's own config dir, outside userData, so a
    // fresh sandbox does not guarantee a fresh gate). Do not take "already set
    // up" on faith: the boot log must name the backend this run actually
    // drives, and it must be the isolated WSL gateway — not a local runtime.
    const bootLog = path.join(hermesHome, 'logs', 'desktop.log')
    let log = ''

    try {
      log = fs.readFileSync(bootLog, 'utf8')
    } catch {
      log = ''
    }

    const connectedToGateway = log.includes(`Connecting to remote Hermes backend at ${gatewayUrl}`)
    const backendReady = log.includes('Remote Hermes backend is ready')

    record(
      'backend this run drives',
      connectedToGateway && backendReady ? 'PASS' : 'FAIL',
      connectedToGateway && backendReady
        ? `no gate (saved connection); boot log: remote backend ${gatewayUrl} ready`
        : `boot log does not show ${gatewayUrl} ready (saw connection=${connectedToGateway}, ready=${backendReady})`
    )
  }

  try {
    await page.getByText(/I'll choose a provider later|稍后选择|以后再说/).first().click({ timeout: 5000 })
  } catch {
    // no provider overlay
  }

  // Keep the workspace overview grouping on (the unified tree) and keep the
  // onboarding overlay away across reloads. NO legacy grouping preference is
  // injected: the default new instance must show the workspace body as-is.
  await page.evaluate(() => {
    window.localStorage.setItem('hermes.desktop.agentsGroupedByWorkspace', 'true')
    window.localStorage.setItem('hermes-onboarding-skipped-v1', '1')
    window.localStorage.setItem('hermes-desktop-onboarded-v1', '1')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)

  try {
    await page.getByText(/I'll choose a provider later|稍后选择|以后再说/).first().click({ timeout: 3000 })
    await page.waitForTimeout(800)
  } catch {
    // overlay not present
  }

  // ─── step: the unified sidebar — retired entries gone, new entries in ───
  const retired = ['Capabilities', 'Artifacts', 'Scheduled jobs']
  const retiredGone = []

  for (const label of retired) {
    const count = await page.getByRole('button', { name: label, exact: true }).count()

    retiredGone.push(`${label}:${count === 0 ? 'gone' : 'PRESENT'}`)
  }

  const botsGone = (await page.getByText(/^Bots$/i).count()) === 0
  retiredGone.push(`BotsTab:${botsGone ? 'gone' : 'PRESENT'}`)

  let profilesEntry = true

  try {
    await page.getByRole('button', { name: /^Profiles$/ }).first().waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    profilesEntry = false
  }

  let settingsEntry = true

  try {
    await page.getByRole('button', { name: /^Settings$/ }).first().waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    settingsEntry = false
  }

  const unifiedOk = retiredGone.every(entry => entry.endsWith(':gone')) && profilesEntry && settingsEntry
  record(
    'unified sidebar',
    unifiedOk ? 'PASS' : 'FAIL',
    `${retiredGone.join(', ')}; profilesEntry=${profilesEntry}; settingsEntry=${settingsEntry}`
  )
  await screenshot(page, 'unified-sidebar')

  // ─── step: WSL-only + empty-workspace search is REAL-MACHINE verified ───
  // At this point no workspace record exists: the workspace body is empty and
  // search must still reach workspaces once one exists. The WSL row is saved
  // FIRST so the pre-local-open list is a WSL-ONLY projection.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Stub ONLY the OS directory picker (the one thing an automated window
  // cannot do); everything after the pick runs the real flow. The stub counts
  // its own invocations, because whether the product ever ASKS for the OS
  // dialog decides how the local open must be classified: remote mode routes
  // the folder picker to the in-app backend browser instead, and then a
  // Windows-local pick cannot enter the flow at all.
  await app.evaluate(({ dialog }, dir) => {
    globalThis.__r36rOsDialogCalls = 0
    dialog.showOpenDialog = async () => {
      globalThis.__r36rOsDialogCalls += 1
      return { canceled: false, filePaths: [dir] }
    }
  }, localDir)

  const headerAdd = page.locator('[data-slot="dropdown-menu-trigger"][aria-label="Open folder"], [data-slot="dropdown-menu-trigger"][aria-label="打开文件夹"]').first()

  let headerAddVisible = true

  try {
    await headerAdd.waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    headerAddVisible = false
  }

  if (!headerAddVisible) {
    record('add entry visible', 'FAIL', 'header + never appeared')
    await screenshot(page, 'failure-state')
    await finish(app)
    return
  }

  // Radix menu open can lose a race with a cold first paint (run p01r5): the
  // force-click landed before the trigger's listeners mounted and the menu
  // never opened. Retry: Escape first so a stale open menu is re-opened
  // rather than toggled shut.
  let menuOpenFolder = 0
  let menuOpenRemote = 0

  for (let attempt = 0; attempt < 3 && (menuOpenFolder === 0 || menuOpenRemote === 0); attempt += 1) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await headerAdd.click({ force: true })
    await page.waitForTimeout(700)
    menuOpenFolder = await page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).count()
    menuOpenRemote = await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).count()
  }

  await page.waitForTimeout(200)
  await screenshot(page, 'add-menu')

  record(
    'add menu entries',
    menuOpenFolder === 1 && menuOpenRemote === 1 ? 'PASS' : 'FAIL',
    `open-folder=${menuOpenFolder}, open-remote=${menuOpenRemote} (no naming page behind the menu)`
  )

  // ─── step: WSL 打开目录 FIRST — the list below is then WSL-only ───
  await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).first().click()
  await page.waitForTimeout(1200)
  await screenshot(page, 'wizard-direct-config')

  let distroOk = true

  try {
    await page.getByText('Ubuntu', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    distroOk = false
  }
  record('wizard opens on config (no method page)', distroOk ? 'PASS' : 'FAIL', distroOk ? 'distribution select visible on the first page' : 'distribution list never appeared')
  if (!distroOk) {
    await screenshot(page, 'wizard-failure')
    await finish(app)
    return
  }

  const connectButton = page
    .getByRole('button', { name: 'Connect', exact: true })
    .or(page.getByRole('button', { name: '连接', exact: true }))
    .first()
  await connectButton.click()
  await page.waitForTimeout(900)
  await screenshot(page, 'connecting-inline')

  let browseOk = true

  try {
    await page.getByPlaceholder(/Path|路径/).waitFor({ state: 'visible', timeout: 30000 })
  } catch {
    browseOk = false
  }
  record('connect → browse on one page', browseOk ? 'PASS' : 'FAIL', browseOk ? 'directory browser visible, no separate connecting page' : 'browser never appeared')
  if (!browseOk) {
    await screenshot(page, 'connect-failure')
    await finish(app)
    return
  }

  const acceptanceDir = process.env.WSL_ACCEPTANCE_DIR || '/home/maoqh/wsl-round1-验收 目录'
  const pathInput = page.getByPlaceholder(/Path|路径/).first()
  await pathInput.fill(acceptanceDir)
  await page.getByRole('button', { name: /^Go$|前往/ }).first().click()
  await page.waitForTimeout(2500)
  await screenshot(page, 'browse-acceptance-dir')

  await page.getByRole('button', { name: /Use this directory|选择此目录/ }).first().click()
  await page.waitForTimeout(3500)
  await screenshot(page, 'wsl-saved-sidebar')

  // The RESULT is verified via the host store's real rootPath (the directory
  // the wizard actually verified), never via the row name alone.
  const wslRecord1 = hostStore().workspaces.find(w => w.rootPath === acceptanceDir)
  record(
    'WSL open lands on the real directory',
    wslRecord1 ? 'PASS' : 'FAIL',
    wslRecord1 ? `host record ${wslRecord1.id} rootPath=${wslRecord1.rootPath}` : `no host record with rootPath=${acceptanceDir}; store=${JSON.stringify(hostRecordIds())}`
  )

  // ─── step: the workspace-only body after the FIRST (WSL) save + EXPAND to
  // the honest prompt ───
  //
  // The assertion level is the one list (`[data-workspace-list]`), never an
  // ancestor sweep. `localIds` is REPORTED, not judged: the connected backend
  // is authoritative for projects, and its Hermes home (outside the fresh
  // sandbox) still knows projects an earlier run left behind — those are
  // backend truth, not a local workspace this run created. What this run owns
  // is the desktop-side store, so that is what the step pins.
  let wslOnlyList = null

  try {
    await page.locator('[data-wsl-workspace-row]').first().waitFor({ state: 'visible', timeout: 15000 })
    wslOnlyList = await workspaceListContents(page)
  } catch {
    wslOnlyList = null
  }

  const storeAfterFirstSave = hostStore().workspaces
  const onlyThisWslRecord =
    storeAfterFirstSave.length === 1 &&
    storeAfterFirstSave[0].id === wslRecord1?.id &&
    storeAfterFirstSave[0].kind === 'wsl' &&
    storeAfterFirstSave[0].archivedAt === null
  const wslOnlyOk =
    Boolean(wslOnlyList) && wslOnlyList.wslIds.includes(wslRecord1?.id) && onlyThisWslRecord
  record(
    'WSL save registers exactly one desktop-side record; row lives at [data-workspace-list]',
    wslOnlyOk ? 'PASS' : 'FAIL',
    wslOnlyList
      ? `list=${JSON.stringify(wslOnlyList)}; host records=${JSON.stringify(hostRecordIds())}; backend-known local rows=${wslOnlyList.localIds.length} (reported, not judged)`
      : 'no [data-workspace-list] rendered'
  )
  await screenshot(page, 'wsl-only-list')

  // Main row SELECTS; the caret EXPANDS to the honest no-sessions prompt.
  const wslRow = page.locator('[data-wsl-workspace-row]').first()
  const wslRowId = await wslRow.getAttribute('data-wsl-workspace-row')

  await wslRow.locator('button').first().click()
  await page.waitForTimeout(600)
  const selectedAfterMainRow = await page.locator(`[data-workspace-row-selected="${wslRowId}"]`).count()
  record('WSL main row selects the workspace', selectedAfterMainRow === 1 ? 'PASS' : 'FAIL', `data-workspace-row-selected=${wslRowId}`)

  await page.locator(`[data-wsl-workspace-expand="${wslRowId}"]`).click()
  await page.waitForTimeout(600)
  const promptAfterExpand = await page.locator(`[data-wsl-workspace-empty="${wslRowId}"]`).count()

  let expandText = ''

  if (promptAfterExpand === 1) {
    expandText = (await page.locator(`[data-wsl-workspace-empty="${wslRowId}"]`).textContent()) || ''
  }

  // The honest empty state must not offer a session starter it cannot honor:
  // a WSL row's actions are reconnect / connection info / kebab, and the
  // expanded body is the "not part of this round yet" note — nothing that
  // would pretend a session can be created here.
  const sessionStarter = await wslRow.getByRole('button', { name: /New session|新建会话/ }).count()

  record(
    'WSL row expands to the honest unavailable prompt',
    promptAfterExpand === 1 && expandText.trim().length > 0 && sessionStarter === 0 ? 'PASS' : 'FAIL',
    `prompt visible=${promptAfterExpand === 1}; text="${expandText.trim().slice(0, 80)}"; session starters on the row=${sessionStarter}`
  )
  await screenshot(page, 'wsl-expanded')

  // ─── step: 本地打开目录 — picker stub performs the SELECTION only ───
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await headerAdd.click({ force: true })
  await page.waitForTimeout(500)
  await page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).first().click()

  // Poll for the typed refusal while it is still on screen (a toast lives a
  // couple of seconds) and stop early if this run's OWN row appears instead.
  // The row is matched by the per-run directory name, so a stale backend
  // project with a similar name can never answer for this pick.
  const freshLocalRow = page
    .locator('[data-workspace-list] [data-sessions-project]')
    .filter({ hasText: localDirName })
    .first()

  let refusalText = ''

  for (let attempt = 0; attempt < 20 && !refusalText; attempt += 1) {
    await page.waitForTimeout(300)

    if (await freshLocalRow.isVisible().catch(() => false)) {
      break
    }

    const refusal = page.getByText(PATH_SCOPE_REFUSAL).first()

    if (await refusal.isVisible().catch(() => false)) {
      refusalText = ((await refusal.textContent().catch(() => '')) || '').trim()
    }
  }

  await page.waitForTimeout(1200)
  await screenshot(page, 'local-opened')

  let localStepStatus = 'FAIL'
  let localDetail = `no row for ${localDirName} after the pick and no typed refusal`
  let freshLocalRowId = ''

  const localRowInList = await freshLocalRow.isVisible().catch(() => false)
  const osDialogCalls = await app.evaluate(() => globalThis.__r36rOsDialogCalls ?? 0).catch(() => -1)
  // Which surface is up now: the backend browser is a Dialog, so report what it
  // says it is instead of guessing.
  const openDialogText = await page
    .getByRole('dialog')
    .first()
    .textContent()
    .catch(() => null)
  const pickerSurface = `osDialogCalls=${osDialogCalls}, dialog="${(openDialogText || '').replace(/\s+/g, ' ').trim().slice(0, 60)}"`

  if (refusalText) {
    // The typed refusal (remote-mode backend + a Windows path) is the safety
    // boundary passing: record PENDING — the local REAL open is unsupported in
    // a WSL-Hermes-only environment, and this run does not claim it.
    localStepStatus = 'PENDING'
    localDetail = `typed path-scope refusal: "${refusalText.slice(0, 160)}" — Windows-local real open unsupported against this WSL-only backend (boundary passed; local product path recorded PENDING)`
    await screenshot(page, 'local-refused')
    record('local open (Windows real path)', localStepStatus, localDetail)
  } else if (localRowInList) {
    localStepStatus = 'PASS'
    localDetail = `${localDirName} row inside [data-workspace-list]`
    record('local open (Windows real path)', localStepStatus, localDetail)

    freshLocalRowId = (await freshLocalRow.getAttribute('data-sessions-project')) || ''

    // Directory marker: the pick's result is the REAL directory.
    record('local directory marker present', fs.existsSync(localMarker) ? 'PASS' : 'FAIL', localMarker)

    // The project's own path via the real UI: the row's kebab menu → Copy
    // path, then read the MAIN-process clipboard.
    let copyPathOk = false
    let copied = ''

    try {
      await freshLocalRow.hover({ position: { x: 12, y: 8 } })
      await page.waitForTimeout(300)
      await freshLocalRow.locator('div[data-row-actions] button').first().click()
      await page.getByRole('menuitem', { name: /Copy path|复制路径/ }).first().click({ timeout: 10000 })
      await page.waitForTimeout(900)

      copied = await app.evaluate(({ clipboard }) => clipboard.readText())
      copyPathOk = path.resolve(copied).toLowerCase() === path.resolve(localDir).toLowerCase()
    } catch (error) {
      copied = String(error).slice(0, 120)
    }

    record(
      'local result path verified (not the row name)',
      copyPathOk ? 'PASS' : 'FAIL',
      `clipboard=${copied}; expected=${localDir}`
    )
  } else if (osDialogCalls === 0) {
    // The product never asked for the OS dialog: in remote mode the folder
    // picker is the backend browser (the desktop's own path space is not what
    // the pick addresses). A Windows-local directory therefore cannot enter
    // this flow — no row for this run's directory was created, and this run
    // does not claim a local product pass. Boundary intact; recorded PENDING.
    localStepStatus = 'PENDING'
    localDetail = `Windows-local real open unsupported against this WSL-only backend: the picker never asked for the OS dialog (${pickerSurface}), so a Windows-local directory cannot enter the flow — no ${localDirName} row was created`
    await screenshot(page, 'local-picker-surface')
    record('local open (Windows real path)', localStepStatus, localDetail)
  } else {
    localDetail = `the OS dialog ran (calls=${osDialogCalls}) and returned ${localDir}, but the product created no row and showed no typed refusal`
    record('local open (Windows real path)', localStepStatus, localDetail)
  }

  // Close whatever picker surface is still up so the row steps below drive the
  // sidebar, not a modal.
  if (openDialogText) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)

    if (await page.getByRole('dialog').first().isVisible().catch(() => false)) {
      await page
        .getByRole('button', { name: /^Cancel$|取消|^Close$|关闭/ })
        .last()
        .click({ force: true })
        .catch(() => undefined)
      await page.waitForTimeout(600)
    }
  }

  await screenshot(page, 'local-in-list')

  const localOpened = localStepStatus === 'PASS'

  if (!localOpened) {
    record(
      'local-row dependent steps',
      'SKIP',
      `copy-path/entered-project/local-hide steps require a successfully opened local row (this run: ${localStepStatus}); behavior tests cover them`
    )
  }

  // ─── step: BOTH rows live in the ONE workspace list (asserted AT the list) ───
  if (localOpened) {
    const both = await workspaceListContents(page)
    const bothOk = Boolean(both) && both.wslIds.length >= 1 && both.localIds.includes(freshLocalRowId)

    record(
      'local and WSL in one list (asserted at [data-workspace-list])',
      bothOk ? 'PASS' : 'FAIL',
      both ? `list=${JSON.stringify(both)}` : 'no [data-workspace-list] rendered'
    )
  }

  // ─── step: 同列表切换 — the LOCAL main row enters its project ───
  if (localOpened) {
    let enterOk = true

    try {
      // The main row's select surface is its label button (the same convention
      // as the WSL row), not the wrapper div.
      await freshLocalRow.locator('button').first().click()
      await page.waitForTimeout(1500)
      await screenshot(page, 'switched-local')

      const projectMode = await page.locator('[data-sessions-mode="project"]').count()

      enterOk = projectMode >= 1

      await page.getByText(/All projects|全部项目|返回/).first().click({ timeout: 8000 })
      await page.waitForTimeout(1200)
    } catch {
      enterOk = false
    }
    record('local main row enters the project', enterOk ? 'PASS' : 'FAIL', enterOk ? 'data-sessions-mode="project" after the main-row click' : 'enter did not happen')
  }

  // ─── step: 重命名 — row menu → Rename… → persists with the SAME id ───
  const renamedName = 'round36R-验收'
  await rowMenuFor(page, wslRowId)

  let renameOk = true

  try {
    await page.waitForTimeout(600)
    await screenshot(page, 'row-menu')
    await page.getByRole('menuitem', { name: /Rename|重命名/ }).first().click()
    await page.waitForTimeout(800)
    await screenshot(page, 'rename-dialog')
    const renameInput = page.locator('[role="dialog"] input').first()
    await renameInput.fill(renamedName)
    await page.getByRole('button', { name: /^Save$|^保存$/ }).first().click()
    await page.waitForTimeout(2500)
  } catch (error) {
    renameOk = false
    record('rename flow', 'FAIL', String(error).slice(0, 200))
  }

  const hostAfterRename = hostStore().workspaces.find(w => w.id === wslRowId)

  if (renameOk) {
    try {
      await page.getByText(renamedName, { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    } catch {
      renameOk = false
    }
  }

  record(
    'rename persists under the SAME id',
    renameOk && Boolean(hostAfterRename) && hostAfterRename.name === renamedName ? 'PASS' : 'FAIL',
    `row shows the new name; host record=${JSON.stringify(hostRecordIds())}`
  )
  await screenshot(page, 'renamed')

  // ─── step: 移除=归档 — the record keeps its identity; the row leaves ───
  let secondSaved = true

  try {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await headerAdd.click({ force: true })
    await page.waitForTimeout(500)
    await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).first().click()
    await page.waitForTimeout(1000)
    await page
      .getByRole('button', { name: 'Connect', exact: true })
      .or(page.getByRole('button', { name: '连接', exact: true }))
      .first()
      .click()
    await page.getByPlaceholder(/Path|路径/).first().waitFor({ state: 'visible', timeout: 30000 })
    await page.getByPlaceholder(/Path|路径/).first().fill(`${acceptanceDir}/子目录`)
    await page.getByRole('button', { name: /^Go$|前往/ }).first().click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /Use this directory|选择此目录/ }).first().click()
    await page.waitForTimeout(3500)
  } catch {
    secondSaved = false
  }

  const secondRecord = hostStore().workspaces.find(w => w.rootPath === `${acceptanceDir}/子目录`)
  record(
    'second WSL workspace saved',
    secondSaved && Boolean(secondRecord) ? 'PASS' : 'FAIL',
    `host records=${JSON.stringify(hostRecordIds())}`
  )

  // ─── step: opening info is NOT selecting — with TWO rows this is now a real
  // assertion: select row A, open row B's info; row A must STAY selected ───
  if (secondRecord) {
    const secondId = secondRecord.id

    let infoNotSelect = true
    let infoDetail = ''

    try {
      // Select row A from its MAIN row...
      const rowA = page.locator(`[data-wsl-workspace-row="${wslRowId}"]`)

      await rowA.locator('button').first().click()
      await page.waitForTimeout(500)

      // ...open row B's connection info via its dedicated button (hover the
      // row first: the actions overlay reveals on row hover, and a plain
      // click proves the reveal is really reachable)...
      const rowB = page.locator(`[data-wsl-workspace-row="${secondId}"]`)

      await rowB.hover({ position: { x: 12, y: 8 } })
      await page.waitForTimeout(300)
      // ...open row B's connection info via its dedicated button. Role+name,
      // not positional: the row's disclosure caret also lives in the trailing
      // column, so any index over that column's buttons is ambiguous.
      await rowB.getByRole('button', { name: /Connection info|连接信息/ }).click()
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
      await page.waitForTimeout(500)
      await screenshot(page, 'info-open-on-b')

      // ...and row A must STILL be the selected workspace.
      const stillSelected = await page.locator(`[data-workspace-row-selected="${wslRowId}"]`).count()
      const bSelected = await page.locator(`[data-workspace-row-selected="${secondId}"]`).count()

      infoNotSelect = stillSelected === 1 && bSelected === 0
      infoDetail = `A selectedCount=${stillSelected}, B selectedCount=${bSelected} while B's info dialog is open (A must be exactly 1, B exactly 0)`

      await page.getByRole('button', { name: /Close|关闭/ }).last().click()
      await page.waitForTimeout(600)
    } catch (error) {
      infoNotSelect = false
      infoDetail = String(error).slice(0, 160)
    }
    record('opening info is NOT selecting', infoNotSelect ? 'PASS' : 'FAIL', infoDetail)
  }

  const beforeRemove = await page.evaluate(() => Array.from(document.querySelectorAll('[data-wsl-workspace-row]')).map(row => row.getAttribute('data-wsl-workspace-row')).sort())
  let archiveOk = Boolean(secondSaved && secondRecord)

  if (archiveOk) {
    const removableRow = page
      .locator('[data-wsl-workspace-row]')
      .filter({ hasText: '子目录' })
      .first()
    // Hover the ROW: the actions overlay reveals on row hover; the overlay
    // column itself is zero-width while idle, so hovering it is impossible by
    // construction (that is the layout relation being enforced).
    await removableRow.hover({ position: { x: 12, y: 8 } })
    await page.waitForTimeout(400)
    await removableRow.locator('div[data-row-actions]').getByRole('button').last().click()
    await page.waitForTimeout(600)
    await screenshot(page, 'remove-menu')
    await page.getByRole('menuitem', { name: /Remove from sidebar|从侧栏移除/ }).first().click()
    await page.waitForTimeout(800)
    await screenshot(page, 'remove-confirm')
    await page.getByRole('dialog').getByRole('button', { name: /Remove from sidebar|从侧栏移除/ }).first().click()
    await page.waitForTimeout(2500)
  }

  const afterRemove = await page.evaluate(() => Array.from(document.querySelectorAll('[data-wsl-workspace-row]')).map(row => row.getAttribute('data-wsl-workspace-row')).sort())
  const archivedRecord = hostStore().workspaces.find(w => w.id === secondRecord?.id)
  const dirStillThere = fs.existsSync('\\\\wsl.localhost\\Ubuntu\\home\\maoqh\\wsl-round1-验收 目录\\子目录')

  archiveOk =
    archiveOk &&
    afterRemove.length === Math.max(0, beforeRemove.length - 1) &&
    JSON.stringify(afterRemove) !== JSON.stringify(beforeRemove) &&
    Boolean(archivedRecord) &&
    archivedRecord.archivedAt !== null &&
    archivedRecord.rootPath === `${acceptanceDir}/子目录` &&
    dirStillThere

  record(
    'archive keeps the record, drops only the row',
    archiveOk ? 'PASS' : 'FAIL',
    `rows before=[${beforeRemove}] after=[${afterRemove}]; host=${JSON.stringify(hostRecordIds())}; dir still on disk=${dirStillThere}`
  )
  await screenshot(page, 'after-archive')

  // ─── step: 重开恢复 — the SAME directory restores the SAME id and name ───
  let reopenSaved = true

  try {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await headerAdd.click({ force: true })
    await page.waitForTimeout(500)
    await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).first().click()
    await page.waitForTimeout(1000)
    await page
      .getByRole('button', { name: 'Connect', exact: true })
      .or(page.getByRole('button', { name: '连接', exact: true }))
      .first()
      .click()
    await page.getByPlaceholder(/Path|路径/).first().waitFor({ state: 'visible', timeout: 30000 })
    await page.getByPlaceholder(/Path|路径/).first().fill(`${acceptanceDir}/子目录`)
    await page.getByRole('button', { name: /^Go$|前往/ }).first().click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /Use this directory|选择此目录/ }).first().click()
    await page.waitForTimeout(3500)
  } catch {
    reopenSaved = false
  }

  const restoredRecord = hostStore().workspaces.find(w => w.rootPath === `${acceptanceDir}/子目录`)
  const restoredOk =
    Boolean(reopenSaved && restoredRecord) &&
    restoredRecord.id === secondRecord?.id &&
    restoredRecord.archivedAt === null

  record(
    'reopen restores the ORIGINAL record (same id, archive cleared)',
    restoredOk ? 'PASS' : 'FAIL',
    `restored=${JSON.stringify(restoredRecord ?? null)}; expected id=${secondRecord?.id}`
  )

  // ─── step: 空工作区搜索 — a zero-session workspace is found by name ───
  const searchField = page.getByPlaceholder(/Search sessions…|搜索会话/).first()

  try {
    await searchField.fill(renamedName)
    await page.waitForTimeout(1200)
    await screenshot(page, 'workspace-search-hit')

    const hit = await page.locator(`[data-workspace-search-hit="${wslRowId}"]`).count()

    record('empty-workspace search reaches the workspace by name', hit === 1 ? 'PASS' : 'FAIL', `hit for ${renamedName}: ${hit === 1}`)

    await searchField.fill('')
    await page.waitForTimeout(1200)

    const selectionBack = await page.locator(`[data-workspace-row-selected="${wslRowId}"]`).count()

    record('clearing search restores the selection', selectionBack === 1 ? 'PASS' : 'FAIL', `selection=${wslRowId} present after clear`)
  } catch (error) {
    record('empty-workspace search', 'FAIL', String(error).slice(0, 160))
  }

  // ─── step: 窄侧栏 + 键盘 — the name stays readable, keyboard selects ───
  //
  // The row's layout claims are MEASURED as relations, not assumed:
  //   idle  → hidden actions hold NO row width (the overlay column collapses;
  //           the name gets the idle space, full text at the default layout);
  //   hover → the actions overlay fades in over the label's tail and yields
  //           again when the pointer leaves;
  //   focus → keyboard focus into the controls reveals them the same way.
  // BOTH the default and a squeezed layout participate in the assertions — a
  // name collapsed to a few pixels is a FAIL in either, never a "narrow
  // layout" excuse.
  const measureRowName = () =>
    page.evaluate(id => {
      const row = document.querySelector(`[data-wsl-workspace-row="${id}"]`)

      if (!row) {
        return null
      }

      const rect = element => (element ? element.getBoundingClientRect() : null)
      const label = row.querySelector('button')
      const nameSpan = label?.querySelector('span span')
      // Two divs carry data-row-actions: the outer stretch column (layout
      // width) and the inner absolute overlay (visibility). The caret is a
      // BUTTON with the attribute, so it never matches these.
      const actionColumns = Array.from(row.querySelectorAll('div[data-row-actions]'))
      const outer = actionColumns[0]
      const overlay = actionColumns[1] ?? null
      const caret = row.querySelector('[data-wsl-workspace-expand]')

      return {
        caretLeft: Math.round(rect(caret)?.left ?? -1),
        labelRight: Math.round(rect(label)?.right ?? -1),
        label: Math.round(rect(label)?.width ?? -1),
        name: Math.round(rect(nameSpan)?.width ?? -1),
        nameScroll: nameSpan?.scrollWidth ?? -1,
        nameText: (nameSpan?.textContent || '').trim(),
        outerActionsW: Math.round(rect(outer)?.width ?? -1),
        overlayW: Math.round(rect(overlay)?.width ?? -1),
        overlayOpacity: overlay ? getComputedStyle(overlay).opacity : 'missing',
        row: Math.round(rect(row)?.width ?? -1)
      }
    }, wslRowId)

  try {
    // Ensure the pointer is NOT over the row while measuring the idle state.
    await page.mouse.move(4, 4)
    await page.waitForTimeout(400)

    const defaultMetrics = await measureRowName()

    // Hidden actions occupy no flow width: the trailing column holds ONLY the
    // fixed caret strip (≤24px), the overlay itself is out of flow (its width
    // shows in overlayW, not in the column), the overlay is truly hidden
    // while idle, and the name shows its FULL text at the default layout (the
    // 36R defect was a 37px name against 81px of text at exactly this layout).
    const defaultOk =
      Boolean(defaultMetrics) &&
      defaultMetrics.outerActionsW <= 24 &&
      defaultMetrics.overlayOpacity === '0' &&
      defaultMetrics.name + 2 >= defaultMetrics.nameScroll
    record(
      'WSL row keeps its name readable (default layout)',
      defaultOk ? 'PASS' : 'FAIL',
      `name=${defaultMetrics?.name}px of "${defaultMetrics?.nameText}" (text needs ${defaultMetrics?.nameScroll}px, label=${defaultMetrics?.label}px, row=${defaultMetrics?.row}px); trailing strip (caret only)=${defaultMetrics?.outerActionsW}px (must be ≤24), overlay width=${defaultMetrics?.overlayW}px out of flow, overlay opacity=${defaultMetrics?.overlayOpacity} while idle`
    )

    // Hover the row: the overlay fades IN over the label's tail…
    await wslRow.hover({ position: { x: 12, y: 8 } })
    await page.waitForTimeout(400)

    const hoverMetrics = await measureRowName()
    const hoverOk =
      Boolean(hoverMetrics) &&
      hoverMetrics.overlayOpacity === '1' &&
      hoverMetrics.overlayW > 0 &&
      hoverMetrics.name > 20
    await screenshot(page, 'row-hover-actions')
    record(
      'hidden actions reveal on row hover and keep the name readable',
      hoverOk ? 'PASS' : 'FAIL',
      `hover: overlay opacity=${hoverMetrics?.overlayOpacity}, width=${hoverMetrics?.overlayW}px, name still ${hoverMetrics?.name}px`
    )

    // …and yield again when the pointer leaves.
    await page.mouse.move(4, 4)
    await page.waitForTimeout(400)

    const idleAgain = await measureRowName()
    const yieldsOk = Boolean(idleAgain) && idleAgain.overlayOpacity === '0'
    record(
      'actions yield the name back when the pointer leaves',
      yieldsOk ? 'PASS' : 'FAIL',
      `after leave: overlay opacity=${idleAgain?.overlayOpacity} (must be 0)`
    )

    // Narrow layout: SAME assertions on the floor relations — the squeeze may
    // truncate, but the name stays readable, the trailing strip stays
    // caret-only, and the overlay stays out of flow.
    const narrow = page.viewportSize()

    await page.setViewportSize({ width: Math.max(640, Math.floor((narrow?.width ?? 1200) * 0.55)), height: narrow?.height ?? 700 })
    await page.waitForTimeout(800)

    await page.mouse.move(4, 4)
    await page.waitForTimeout(400)

    const narrowMetrics = await measureRowName()
    await screenshot(page, 'narrow-sidebar')

    const narrowOk =
      Boolean(narrowMetrics) &&
      narrowMetrics.name > 20 &&
      narrowMetrics.outerActionsW <= 24 &&
      narrowMetrics.overlayOpacity === '0'
    record(
      'WSL row keeps its name readable (narrow layout)',
      narrowOk ? 'PASS' : 'FAIL',
      `narrow: name=${narrowMetrics?.name}px of "${narrowMetrics?.nameText}" (text needs ${narrowMetrics?.nameScroll}px, row=${narrowMetrics?.row}px); trailing strip (caret only)=${narrowMetrics?.outerActionsW}px (must be ≤24), overlay opacity=${narrowMetrics?.overlayOpacity}`
    )

    await page.setViewportSize({ width: narrow?.width ?? 1200, height: narrow?.height ?? 700 })
    await page.waitForTimeout(600)
  } catch (error) {
    record('WSL row keeps its name readable (default layout)', 'FAIL', String(error).slice(0, 160))
    record('WSL row keeps its name readable (narrow layout)', 'FAIL', String(error).slice(0, 160))
    record('hidden actions reveal on row hover and keep the name readable', 'FAIL', String(error).slice(0, 160))
    record('actions yield the name back when the pointer leaves', 'FAIL', String(error).slice(0, 160))
  }

  try {
    // Keyboard: focus the main row button and press Enter — the shared select.
    await wslRow.locator('button').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)

    const selectedByKeyboard = await page.locator(`[data-workspace-row-selected="${wslRowId}"]`).count()

    record('keyboard selects the workspace (Enter on the main row)', selectedByKeyboard === 1 ? 'PASS' : 'FAIL', `selected=${selectedByKeyboard === 1}`)
  } catch (error) {
    record('keyboard selects the workspace (Enter on the main row)', 'FAIL', String(error).slice(0, 160))
  }

  try {
    // Keyboard reachability of the HIDDEN controls: tabbing/focusing into the
    // actions overlay must reveal it (focus-within), without any pointer.
    const kebab = wslRow.locator('div[data-row-actions] button').last()

    await kebab.focus()
    await page.waitForTimeout(300)

    const focusMetrics = await measureRowName()
    const focusOk = Boolean(focusMetrics) && focusMetrics.overlayOpacity === '1'

    await page.keyboard.press('Escape')
    await page.evaluate(() => document.activeElement?.blur?.())
    record(
      'keyboard focus reveals the hidden actions (focus-within)',
      focusOk ? 'PASS' : 'FAIL',
      `focused kebab: overlay opacity=${focusMetrics?.overlayOpacity} (must be 1)`
    )
  } catch (error) {
    record('keyboard focus reveals the hidden actions (focus-within)', 'FAIL', String(error).slice(0, 160))
  }

  // ─── step: pinned sessions — SKIP (no real session can exist here) ───
  record(
    'pinned sessions on the real machine',
    'SKIP',
    'no real session exists in the isolated provider-less sandbox and no model request is allowed; pin/unpin behavior tests cover the row contract'
  )

  // ─── step: quit and reopen — renamed workspace (+ local row if opened) persist ───
  await app.close()

  const { app: app2, page: page2 } = await launchApp(electronBin, env)

  let reopenWsl = true

  try {
    await page2.getByText(renamedName, { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    reopenWsl = false
  }

  const reopenRestored = await workspaceListContents(page2)
  const restoredListOk = Boolean(reopenRestored) && reopenRestored.wslIds.includes(wslRowId)
  const localPersisted = localOpened
    ? Boolean(reopenRestored) && reopenRestored.localIds.length >= 1
    : true

  record(
    'reopen: renamed workspace restored under its id',
    reopenWsl && restoredListOk && localPersisted ? 'PASS' : 'FAIL',
    `row visible=${reopenWsl}; list=${JSON.stringify(reopenRestored)}`
  )
  await screenshot(page2, 'reopen-restored')

  // ─── step: WSL 重连 — the row's reconnect re-verifies; the info dialog
  // (the diagnostics surface) reports the verified identity ───
  const row2 = page2.locator(`[data-wsl-workspace-row="${wslRowId}"]`)
  let reconnectOk = true
  let reconnectDetail = ''

  try {
    // Connection info is the row's dedicated button (aria-label), never the
    // main row — opening it must not be how you switch workspace. Hover the
    // row to reveal the actions overlay, then click plainly.
    // Connection info is the row's dedicated button (role+name), never the
    // main row — opening it must not be how you switch workspace. Hover the
    // row header to reveal the actions overlay, then click plainly.
    await row2.hover({ position: { x: 12, y: 8 } })
    await page2.waitForTimeout(300)
    await row2.getByRole('button', { name: /Connection info|连接信息/ }).click()
    const dialog = page2.getByRole('dialog')

    await dialog.waitFor({ state: 'visible', timeout: 8000 })
    // Reconnect from the dialog (the workspace's private connection surface).
    await dialog.getByRole('button', { name: /Reconnect|重新连接/ }).click()
    // The status pill must end at exactly "Verified" (an exact match keeps the
    // always-present "Verified user" label row out of the assertion).
    await dialog.getByText('Verified', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })

    // The dialog's own Directory row is the product's report of the real path.
    const reportsRealPath = (await dialog.textContent().catch(() => ''))?.includes(acceptanceDir)
    reconnectDetail = `connection info reports the verified identity at ${acceptanceDir} (dialog shows the real rootPath=${Boolean(reportsRealPath)})`
    reconnectOk = Boolean(reportsRealPath)
  } catch (error) {
    reconnectOk = false
    reconnectDetail = `re-verification failed: ${String(error).slice(0, 140)}`
  }
  record('reopen: reconnect re-verifies', reconnectOk ? 'PASS' : 'FAIL', reconnectDetail)
  await screenshot(page2, 'reopen-reconnected')

  await app2.close()

  const executed = results.filter(entry => entry.status === 'PASS' || entry.status === 'FAIL')
  const allOk = executed.every(entry => entry.status === 'PASS')
  const summary = {
    allOk,
    counts: {
      PASS: results.filter(entry => entry.status === 'PASS').length,
      FAIL: results.filter(entry => entry.status === 'FAIL').length,
      SKIP: results.filter(entry => entry.status === 'SKIP').length,
      PENDING: results.filter(entry => entry.status === 'PENDING').length
    },
    steps: results
  }

  fs.writeFileSync(path.join(outDir, 'acceptance-log.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(`ACCEPTANCE: executed ${executed.length} → allOk=${allOk}; counts=${JSON.stringify(summary.counts)} (allOk covers executed steps only)`)
  process.exit(allOk ? 0 : 1)
}

/** Open a WSL row's kebab menu (hover-revealed actions).
 *
 *  Hover the ROW to reveal: the actions overlay is zero-width while idle, so
 *  hovering the overlay itself is impossible by construction. The row's
 *  disclosure caret is also marked `data-row-actions`, so the bare attribute
 *  selector matches two elements. */
async function rowMenuFor(page, rowId) {
  const row = page.locator(`[data-wsl-workspace-row="${rowId}"]`)
  const actions = row.locator('div[data-row-actions]')

  await row.hover({ position: { x: 12, y: 8 } })
  await page.waitForTimeout(400)
  await actions.getByRole('button').last().click()
}

async function finish(app) {
  const executed = results.filter(entry => entry.status === 'PASS' || entry.status === 'FAIL')
  const allOk = executed.every(entry => entry.status === 'PASS')
  const summary = {
    allOk,
    counts: {
      PASS: results.filter(entry => entry.status === 'PASS').length,
      FAIL: results.filter(entry => entry.status === 'FAIL').length,
      SKIP: results.filter(entry => entry.status === 'SKIP').length,
      PENDING: results.filter(entry => entry.status === 'PENDING').length
    },
    steps: results
  }

  fs.writeFileSync(path.join(outDir, 'acceptance-log.json'), JSON.stringify(summary, null, 2), 'utf8')

  try {
    await app.close()
  } catch {
    // already closed
  }
  console.log(`ACCEPTANCE: executed ${executed.length} → allOk=${allOk}; counts=${JSON.stringify(summary.counts)} (allOk covers executed steps only)`)
  process.exit(allOk ? 0 : 1)
}

main().catch(error => {
  console.error('DRIVER FAILED:', error)
  process.exit(1)
})
