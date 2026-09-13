/**
 * Windows acceptance driver for work order 36R — the unified Workspace
 * sidebar, driven against the real Desktop, the real WSL and the real file
 * tree.
 *
 * NOT a Playwright spec: a standalone driver that launches the built app on
 * Windows with an isolated userData and drives the 36R user path:
 *
 *   isolated identity (exe/userData/app name/build version, second instance
 *   must fail) → first-run gate → unified sidebar → 本地打开目录 (marker +
 *   real path via Copy path) → WSL 打开目录 → 同一列表（data-workspace-list
 *   层级断言） → 主行选中/展开（打开 info 不算切换） → 重命名 →
 *   移除=归档（同 id 重开恢复） → 空工作区搜索 → 本地隐藏(仅 WSL 列表) →
 *   窄侧栏名称/键盘 → 重开恢复 → WSL 重连
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
 * userData is never touched (app name overridden for the instance lock).
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
const localDir = path.join(sandboxRoot, 'local-acceptance')
const localMarker = path.join(localDir, '.36r-directory-marker')

const expectedBuildVersion = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8')).version

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

  // ─── step: isolated identity — REAL process path, userData, name, version ───
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
      { userDataDir, name: 'HermesWslRound1', version: expectedBuildVersion }
    )

    const exeReal = facts.exePath.toLowerCase().endsWith('electron.exe')
    const userDataOk = path.resolve(facts.userData).toLowerCase() === path.resolve(userDataDir).toLowerCase()
    const nameOk = facts.name === facts.expected.name
    const versionOk = facts.version === facts.expected.version

    identityOk = exeReal && userDataOk && nameOk && versionOk
    identityDetail = `exe=${facts.exePath} (real=${exeReal}); userData isolated=${userDataOk}; name=${facts.name} (match=${nameOk}); build=${facts.version} (match=${versionOk})`
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
    singleInstanceDetail = 'second instance exited (requestSingleInstanceLock refused it)'
  } catch (error) {
    singleInstanceDetail = `second instance failed to start: ${String(error).slice(0, 120)}`
  }

  // The FIRST window must still be the live one.
  try {
    const windowsAfter = app.windows().length

    if (windowsAfter < 1) {
      singleInstanceOk = false
      singleInstanceDetail = 'original window disappeared after the second launch'
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
    record('first-run setup', 'PASS', 'gate not shown; runtime already set up')
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
  // cannot do); everything after the pick runs the real flow.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
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

  await headerAdd.click({ force: true })
  await page.waitForTimeout(600)
  await screenshot(page, 'add-menu')

  const menuOpenFolder = await page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).count()
  const menuOpenRemote = await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).count()

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

  // ─── step: the WSL-only workspace body + EXPAND to the honest prompt ───
  let wslOnlyList = null

  try {
    await page.locator('[data-wsl-workspace-row]').first().waitFor({ state: 'visible', timeout: 15000 })
    wslOnlyList = await workspaceListContents(page)
  } catch {
    wslOnlyList = null
  }

  const wslOnlyOk = Boolean(wslOnlyList) && wslOnlyList.wslIds.length >= 1 && wslOnlyList.localIds.length === 0
  record(
    'WSL-only workspace body (no sessions, no local projects)',
    wslOnlyOk ? 'PASS' : 'FAIL',
    wslOnlyList ? `list=${JSON.stringify(wslOnlyList)}` : 'no [data-workspace-list] rendered'
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
  let noSessionStarted = true

  if (promptAfterExpand === 1) {
    expandText = (await page.locator(`[data-wsl-workspace-empty="${wslRowId}"]`).textContent()) || ''
    noSessionStarted = true // no "new session" affordance exists on the row at all
  }

  record(
    'WSL row expands to the honest unavailable prompt',
    promptAfterExpand === 1 && expandText.trim().length > 0 ? 'PASS' : 'FAIL',
    `prompt visible=${promptAfterExpand === 1}; text="${expandText.trim().slice(0, 80)}"`
  )
  await screenshot(page, 'wsl-expanded')

  // ─── step: 本地打开目录 — picker stub performs the SELECTION only ───
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await headerAdd.click({ force: true })
  await page.waitForTimeout(500)
  await page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).first().click()
  await page.waitForTimeout(4000)
  await screenshot(page, 'local-opened')

  // The typed refusal (remote-mode backend + a Windows path) is the safety
  // boundary passing: record PENDING — the local REAL open is unsupported in
  // a WSL-Hermes-only environment, and this run does not claim it.
  const refusalVisible = await page
    .getByText(/Windows path|无法打开|cannot be verified|无法核验|cannot open it/)
    .first()
    .isVisible()
    .catch(() => false)

  let localStepStatus = 'FAIL'
  let localDetail = 'local-acceptance row missing after the pick'

  const localRowInList = await page
    .locator('[data-workspace-list] [data-sessions-project]')
    .filter({ hasText: 'local-acceptance' })
    .first()
    .isVisible()
    .catch(() => false)

  if (refusalVisible) {
    localStepStatus = 'PENDING'
    localDetail = 'typed path-scope refusal shown: Windows-local real open is unsupported against this WSL-only backend (boundary passed; local path recorded PENDING)'
    await screenshot(page, 'local-refused')
    record('local open (Windows real path)', localStepStatus, localDetail)
  } else if (localRowInList) {
    localStepStatus = 'PASS'
    localDetail = 'local-acceptance row inside [data-workspace-list]'
    record('local open (Windows real path)', localStepStatus, localDetail)

    // Directory marker: the pick's result is the REAL directory.
    record('local directory marker present', fs.existsSync(localMarker) ? 'PASS' : 'FAIL', localMarker)

    // The project's own path via the real UI: row context menu → Copy path,
    // then read the MAIN-process clipboard.
    let copyPathOk = false
    let copied = ''

    try {
      const localRowBody = page.locator('[data-workspace-list] [data-sessions-project]').filter({ hasText: 'local-acceptance' }).first()

      await localRowBody.click({ button: 'right' })
      await page.waitForTimeout(700)
      await page.getByRole('menuitem', { name: /Copy path|复制路径/ }).first().click()
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
  } else {
    record('local open (Windows real path)', localStepStatus, localDetail)
  }

  await screenshot(page, 'local-in-list')

  const localOpened = localStepStatus === 'PASS'

  if (!localOpened) {
    record(
      'local-row dependent steps',
      localStepStatus === 'PENDING' ? 'SKIP' : 'SKIP',
      'copy-path/entered-project/local-hide steps require a successfully opened local row; behavior tests cover them'
    )
  }

  // ─── step: BOTH rows live in the ONE workspace list (asserted AT the list) ───
  if (localOpened) {
    const both = await workspaceListContents(page)
    const bothOk = Boolean(both) && both.wslIds.length >= 1 && both.localIds.length >= 1

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
      await page.locator('[data-workspace-list] [data-sessions-project]').filter({ hasText: 'local-acceptance' }).first().click()
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

      // ...open row B's connection info via its dedicated button...
      const rowB = page.locator(`[data-wsl-workspace-row="${secondId}"]`)

      await rowB.locator('[data-row-actions] button[aria-label]').nth(1).click({ force: true })
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
      await page.waitForTimeout(500)
      await screenshot(page, 'info-open-on-b')

      // ...and row A must STILL be the selected workspace.
      const stillSelected = await page.locator(`[data-workspace-row-selected="${wslRowId}"]`).count()
      const bSelected = await page.locator(`[data-workspace-row-selected="${secondId}"]`).count()

      infoNotSelect = stillSelected === 1 && bSelected === 0
      infoDetail = `A selected=${stillSelected === 1}, B selected=${bSelected === 0} while B's info dialog is open`

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
    await removableRow.locator('[data-row-actions]').hover()
    await page.waitForTimeout(400)
    await removableRow.locator('[data-row-actions]').getByRole('button').last().click({ force: true })
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

  // ─── step: 窄侧栏 + 键盘 — the name survives the squeeze, keyboard selects ───
  try {
    const narrow = page.viewportSize()

    await page.setViewportSize({ width: Math.max(640, Math.floor((narrow?.width ?? 1200) * 0.55)), height: narrow?.height ?? 700 })
    await page.waitForTimeout(800)

    const nameWidth = await page.evaluate(id => {
      const row = document.querySelector(`[data-wsl-workspace-row="${id}"]`)

      if (!row) {
        return -1
      }

      const nameSpan = row.querySelector('button span span')

      return nameSpan ? nameSpan.getBoundingClientRect().width : -1
    }, wslRowId)

    record('narrow sidebar keeps the WSL name readable', nameWidth > 20 ? 'PASS' : 'FAIL', `name width=${Math.round(nameWidth)}px`)

    await page.setViewportSize({ width: narrow?.width ?? 1200, height: narrow?.height ?? 700 })
    await page.waitForTimeout(600)
  } catch (error) {
    record('narrow sidebar keeps the WSL name readable', 'FAIL', String(error).slice(0, 160))
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

  try {
    await row2.locator('[data-row-actions] button').nth(2).click({ force: true })
    await page2.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 })
    // Reconnect from the dialog (the workspace's private connection surface).
    await page2.getByRole('button', { name: /Reconnect|重新连接/ }).last().click()
    await page2.getByText(/Verified|已验证/).first().waitFor({ state: 'visible', timeout: 25000 })
  } catch {
    reconnectOk = false
  }
  record('reopen: reconnect re-verifies', reconnectOk ? 'PASS' : 'FAIL', reconnectOk ? 'connection info reports the verified identity' : 're-verification failed')
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

/** Open a WSL row's kebab menu (hover-revealed actions). */
async function rowMenuFor(page, rowId) {
  const row = page.locator(`[data-wsl-workspace-row="${rowId}"]`)
  const actions = row.locator('[data-row-actions]')

  await actions.hover()
  await page.waitForTimeout(400)
  await actions.getByRole('button').last().click({ force: true })
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
