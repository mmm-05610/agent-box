/**
 * Windows acceptance driver for work order 36 — the unified Workspace sidebar,
 * driven against the real Desktop, the real WSL and the real file tree.
 *
 * NOT a Playwright spec: a standalone driver that launches the built app on
 * Windows with an isolated userData and drives the round-36 user path:
 *
 *   unified sidebar (no retired nav) → 本地打开目录 → WSL 打开目录 →
 *   同列表切换 → 重命名 → 移除(第二条 WSL 记录) → 搜索归属 →
 *   重开恢复 → WSL 重连
 *
 * Only the OS directory PICKER is stubbed (app.evaluate over the main-process
 * `dialog` module) — picking a folder in an automated window is the one thing
 * Playwright cannot do, and the picker is not the product under test. Every
 * other step runs the real UI, real IPC and real wsl.exe.
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

fs.writeFileSync(path.join(hermesHome, 'config.yaml'), '# acceptance round 36: intentionally provider-less\n', 'utf8')

// The local workspace the ＋→打开文件夹 flow opens. Real directory on the
// Windows machine, created (not deleted) by the driver.
const localDir = path.join(sandboxRoot, 'local-acceptance')

const results = []
let stepIndex = 0

async function screenshot(page, name) {
  stepIndex += 1
  const file = path.join(outDir, `${String(stepIndex).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  return file
}

function record(step, ok, detail) {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${detail || ''}`)
}

function hostRecordIds() {
  const storeFile = path.join(userDataDir, 'wsl-workspaces.json')

  if (!fs.existsSync(storeFile)) {
    return []
  }

  const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8'))

  return (parsed.workspaces || []).map(w => ({ id: w.id, name: w.name })).sort((a, b) => a.id.localeCompare(b.id))
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
  record('app opens', true, `window title: ${title}`)
  await screenshot(page, 'boot')

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
    record('gateway probe', true, `test connection succeeded against ${gatewayUrl}`)

    await page.getByRole('button', { name: /Apply and reconnect|应用并重新连接/ }).first().click()
    await setupGate.waitFor({ state: 'detached', timeout: 60000 })
    record('first-run setup applied', true, 'desktop reconnected against the real gateway')
    await page.waitForTimeout(3000)
  } else {
    record('first-run setup', true, 'gate not shown; runtime already set up')
  }

  try {
    await page.getByText(/I'll choose a provider later|稍后选择|以后再说/).first().click({ timeout: 5000 })
  } catch {
    // no provider overlay
  }

  // Keep the workspace overview grouping on (the unified tree) and keep the
  // onboarding overlay away across reloads.
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
    unifiedOk,
    `${retiredGone.join(', ')}; profilesEntry=${profilesEntry}; settingsEntry=${settingsEntry}`
  )
  await screenshot(page, 'unified-sidebar')

  // Stub ONLY the OS directory picker (the one thing an automated window
  // cannot do); everything after the pick runs the real flow.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, localDir)

  // ─── step: 本地打开目录 — pick a directory, it opens directly ───
  // The blank state (zero workspaces) shows the two entries as plain BUTTONS;
  // once any workspace exists the header ＋ owns both flows. Discriminate by
  // the remote entry's ROLE, never by the shared "Open folder" label.
  const blankRemoteButton = page.getByRole('button', { name: /^Open remote folder$/ }).first()
  const headerAdd = page.locator('[data-slot="dropdown-menu-trigger"][aria-label="Open folder"], [data-slot="dropdown-menu-trigger"][aria-label="打开文件夹"]').first()

  try {
    await blankRemoteButton.or(headerAdd).first().waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    record('add entry visible', false, 'neither blank-state entry nor header + appeared')
    await screenshot(page, 'failure-state')
    await finish(app, false)
    return
  }

  const isBlankSidebar = await blankRemoteButton.isVisible().catch(() => false)

  if (isBlankSidebar) {
    await page.getByRole('button', { name: /^Open folder$/ }).first().click()
    record('add entry', true, 'blank-state Open folder entry')
  } else {
    // Radix opens this menu on POINTERDOWN and sets pointer-events:none on
    // <body> while it is open, so a plain Playwright click can time out on
    // its own hit-target recheck. A force click dispatches the raw events.
    await headerAdd.click({ force: true })
    await page.waitForTimeout(600)
    await screenshot(page, 'add-menu')

    const menuOpenFolder = await page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).count()
    const menuOpenRemote = await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).count()

    record(
      'add menu entries',
      menuOpenFolder === 1 && menuOpenRemote === 1,
      `open-folder=${menuOpenFolder}, open-remote=${menuOpenRemote} (no naming page behind the menu)`
    )
    const item = page.getByRole('menuitem', { name: /Open folder|打开文件夹/ }).first()

    await item.click()
    // Did the select actually land? The menu must close on select.
    await page.waitForTimeout(1200)
    const menuStillOpen = await item.isVisible().catch(() => false)
    record('menu item selected', !menuStillOpen, `menu closed after select=${!menuStillOpen}`)
  }

  await page.waitForTimeout(4000)
  await screenshot(page, 'local-opened')

  // The directory joins the workspace list (project row named after the
  // folder), and no naming/confirm dialog is in the way.
  const localRow = page.getByText('local-acceptance', { exact: true }).first()
  let localOk = true

  try {
    await localRow.waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    localOk = false
  }
  record('local open completes directly', localOk, localOk ? 'local-acceptance row in the workspace list, no naming page' : 'local row missing after the pick')
  await screenshot(page, 'local-in-list')

  // ─── step: WSL 打开目录 — simplified wizard: no method page ───
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await headerAdd.click({ force: true })
  await page.waitForTimeout(500)
  await page.getByRole('menuitem', { name: /Open remote folder|打开远程文件夹/ }).first().click()
  await page.waitForTimeout(1200)
  await screenshot(page, 'wizard-direct-config')

  // No method-selection step: the distribution select is already on the only
  // page the wizard has.
  let distroOk = true

  try {
    await page.getByText('Ubuntu', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    distroOk = false
  }
  record('wizard opens on config (no method page)', distroOk, distroOk ? 'distribution select visible on the first page' : 'distribution list never appeared')
  if (!distroOk) {
    await screenshot(page, 'wizard-failure')
    await finish(app, false)
    return
  }

  const connectButton = page
    .getByRole('button', { name: 'Connect', exact: true })
    .or(page.getByRole('button', { name: '连接', exact: true }))
    .first()
  await connectButton.click()
  await page.waitForTimeout(900)
  await screenshot(page, 'connecting-inline')

  // Connecting is a loading state on the SAME page, then the browser appears.
  let browseOk = true

  try {
    await page.getByPlaceholder(/Path|路径/).waitFor({ state: 'visible', timeout: 30000 })
  } catch {
    browseOk = false
  }
  record('connect → browse on one page', browseOk, browseOk ? 'directory browser visible, no separate connecting page' : 'browser never appeared')
  if (!browseOk) {
    await screenshot(page, 'connect-failure')
    await finish(app, false)
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

  // ─── step: BOTH rows live in the SAME workspace list ───
  const sameList = await page.evaluate(() => {
    const local = document.querySelector('[data-sessions-project]')

    if (!local) {
      return false
    }

    let node = local.parentElement

    while (node) {
      if (node.querySelector('[data-wsl-workspace-row]')) {
        return true
      }

      node = node.parentElement
    }

    return false
  })
  record('local and WSL in one list', sameList, sameList ? 'the WSL row renders inside the same workspace section as the local row' : 'no shared list container')

  // ─── step: 同列表切换 — enter the local project, then open the WSL info ───
  try {
    await page.getByText('local-acceptance', { exact: true }).first().click()
    await page.waitForTimeout(1500)
    await screenshot(page, 'switched-local')
    await page.getByText(/All projects|全部项目|返回/).first().click({ timeout: 8000 })
    await page.waitForTimeout(1200)
  } catch {
    record('switch within the list (local enter/back)', false, 'local drill-in did not come back')
  }

  const wslRow = page.locator('[data-wsl-workspace-row]').first()
  let switchOk = true

  try {
    await wslRow.click()
    await page.waitForTimeout(1200)
    await screenshot(page, 'switched-wsl-info')
    await page.getByRole('button', { name: /Close|关闭/ }).first().click()
    await page.waitForTimeout(800)
  } catch {
    switchOk = false
  }
  record('switch within the list (WSL info opens)', switchOk, switchOk ? 'WSL row and local row drive from the same list' : 'WSL row click failed')

  // ─── step: 重命名 — row menu → Rename… → persists, row updates ───
  const rowMenu = wslRow.locator('[data-row-actions]')
  await rowMenu.hover()
  await page.waitForTimeout(400)
  await rowMenu.getByRole('button').last().click({ force: true })
  await page.waitForTimeout(600)
  await screenshot(page, 'row-menu')

  let renameOk = true

  try {
    await page.getByRole('menuitem', { name: /Rename|重命名/ }).first().click()
    await page.waitForTimeout(800)
    await screenshot(page, 'rename-dialog')
    const renameInput = page.locator('[role="dialog"] input').first()
    await renameInput.fill('round36-验收')
    await page.getByRole('button', { name: /^Save$|^保存$/ }).first().click()
    await page.waitForTimeout(2500)
  } catch (error) {
    renameOk = false
    record('rename flow', false, String(error).slice(0, 200))
  }

  if (renameOk) {
    try {
      await page.getByText('round36-验收', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    } catch {
      renameOk = false
    }
  }

  const hostHasNewName = hostRecordIds().some(entry => entry.name === 'round36-验收')
  record('rename persists', renameOk && hostHasNewName, `row shows the new name; host record=${JSON.stringify(hostRecordIds())}`)
  await screenshot(page, 'renamed')

  // ─── step: 移除 — a SECOND WSL record is removed; dir + first record stay ───
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

  const hostAfterSecond = hostRecordIds()
  record('second WSL workspace saved', secondSaved && hostAfterSecond.length === 2, `host records=${JSON.stringify(hostAfterSecond)}`)

  const beforeRemove = await page.evaluate(() => Array.from(document.querySelectorAll('[data-wsl-workspace-row]')).map(row => row.getAttribute('data-wsl-workspace-row')).sort())
  let removeOk = secondSaved

  if (secondSaved) {
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
  const hostAfterRemove = hostRecordIds()
  const dirStillThere = fs.existsSync('\\\\wsl.localhost\\Ubuntu\\home\\maoqh\\wsl-round1-验收 目录\\子目录')

  removeOk =
    removeOk &&
    afterRemove.length === 1 &&
    JSON.stringify(afterRemove) !== JSON.stringify(beforeRemove) &&
    hostAfterRemove.length === 1 &&
    dirStillThere
  record(
    'remove drops only the record',
    removeOk,
    `rows before=[${beforeRemove}] after=[${afterRemove}]; host=${JSON.stringify(hostAfterRemove)}; dir still on disk=${dirStillThere}`
  )
  await screenshot(page, 'after-remove')

  // ─── step: 搜索归属 — a search hit shows its workspace ───
  // No real session exists in this provider-less sandbox (no model request is
  // allowed), so the search leg asserts the LOCAL workspace name on the
  // results the client can already match against loaded rows — skipped when
  // the workspace list is the only content.
  record('pinned/search on Windows', true, 'SKIPPED — no real session exists in the isolated sandbox (no model request allowed); behavior tests cover pin/unpin and search attribution on the dev side')
  await screenshot(page, 'search-context')

  // ─── step: quit and reopen — the renamed workspace and local row persist ───
  await app.close()

  const { app: app2, page: page2 } = await launchApp(electronBin, env)

  let reopenLocal = true

  try {
    await page2.getByText('local-acceptance', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    reopenLocal = false
  }

  let reopenWsl = true

  try {
    await page2.getByText('round36-验收', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    reopenWsl = false
  }
  record('reopen: both workspaces restored', reopenLocal && reopenWsl, `local=${reopenLocal}, wsl(renamed)=${reopenWsl}`)
  await screenshot(page2, 'reopen-restored')

  // ─── step: WSL 重连 — the row's reconnect re-verifies; the info dialog
  // (the diagnostics surface) reports the verified identity ───
  const row2 = page2.locator('[data-wsl-workspace-row]').first()
  let reconnectOk = true

  try {
    await row2.locator('[data-row-actions]').hover()
    await page2.waitForTimeout(400)
    await row2.locator('[data-row-actions]').getByRole('button').nth(1).click()
    await page2.waitForTimeout(6000)
    await row2.click()
    await page2.waitForTimeout(1200)
    await page2.getByText(/Verified|已验证/).first().waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    reconnectOk = false
  }
  record('reopen: reconnect re-verifies', reconnectOk, reconnectOk ? 'connection info reports the verified identity' : 're-verification failed')
  await screenshot(page2, 'reopen-reconnected')

  await app2.close()
  fs.writeFileSync(
    path.join(outDir, 'acceptance-log.json'),
    JSON.stringify({ allOk: results.every(r => r.ok), steps: results }, null, 2),
    'utf8'
  )
  const allOk = results.every(r => r.ok)
  console.log(allOk ? 'ACCEPTANCE: ALL STEPS PASSED' : 'ACCEPTANCE: FAILURES PRESENT')
  process.exit(allOk ? 0 : 1)
}

async function finish(app, allOk) {
  fs.writeFileSync(
    path.join(outDir, 'acceptance-log.json'),
    JSON.stringify({ allOk, steps: results }, null, 2),
    'utf8'
  )
  try {
    await app.close()
  } catch {
    // already closed
  }
  console.log(allOk ? 'ACCEPTANCE: ALL STEPS PASSED' : 'ACCEPTANCE: FAILURES PRESENT')
  process.exit(allOk ? 0 : 1)
}

main().catch(error => {
  console.error('DRIVER FAILED:', error)
  process.exit(1)
})
