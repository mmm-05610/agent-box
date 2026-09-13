/**
 * Windows acceptance driver for work order 35 — real Desktop, real WSL.
 *
 * NOT a Playwright spec (no test framework assumptions): a standalone driver
 * that launches the built dev app on Windows with an isolated userData, drives
 * the WSL workspace wizard through the real UI (real IPC, real wsl.exe), and
 * saves screenshots + a machine-readable acceptance log.
 *
 * Prerequisites (run on Windows, from apps/desktop):
 *   1. npm install at the repo root (workspaces)
 *   2. npm run build            — dist/ must exist (assertDistBuilt rules)
 *
 * Usage:
 *   node e2e/wsl-workspace-round1-driver.mjs <sandboxRoot> <outDir>
 *
 *   <sandboxRoot>  a persistent dir; the driver uses <root>/hermes-home and
 *                  <root>/user-data and does NOT delete them, so a human can
 *                  re-open the same isolated instance afterwards.
 *   <outDir>       screenshots (numbered PNGs) + acceptance-log.json
 *
 * The driver never reads credentials, never sends a model request, and never
 * touches the user's real userData — the app name is overridden so the
 * single-instance lock of a real install is not contended.
 */

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
  console.error('usage: node e2e/wsl-workspace-round1-driver.mjs <sandboxRoot> <outDir>')
  process.exit(2)
}

const hermesHome = path.join(sandboxRoot, 'hermes-home')
const userDataDir = path.join(sandboxRoot, 'user-data')

fs.mkdirSync(hermesHome, { recursive: true })
fs.mkdirSync(userDataDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

// Empty config: no provider is configured this round (no model calls). The app
// boots into its normal "no provider" state; the WSL wizard is Electron-IPC
// only and does not depend on the backend.
fs.writeFileSync(path.join(hermesHome, 'config.yaml'), '# acceptance round 1: intentionally provider-less\n', 'utf8')

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

async function main() {
  // npm hoists electron to the root only when nothing conflicts; both layouts
  // are ordinary. Nearest package first — mirrors e2e/electron-binary.ts.
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

  const env = {
    ...process.env,
    HERMES_HOME: hermesHome,
    HERMES_DESKTOP_USER_DATA_DIR: userDataDir,
    HERMES_DESKTOP_APP_NAME: 'HermesWslRound1'
  }

  delete env.HERMES_E2E_KEEP_SANDBOX

  const app = await _electron.launch({
    executablePath: electronBin,
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    env,
    cwd: DESKTOP_ROOT
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)

  // ─── step: app opens in the isolated instance ───
  const title = await page.title()
  record('app opens', true, `window title: ${title}`)
  await screenshot(page, 'boot')

  // Dismiss the onboarding overlay if it blocks the UI (no provider is
  // configured this round — the overlay is expected).
  try {
    await page.getByText(/Choose later|Skip for now|稍后|以后再说/).first().click({ timeout: 3000 })
    record('onboarding dismissed', true, 'clicked a skip/later control')
  } catch {
    record('onboarding dismissed', true, 'no skip control found; overlay may not cover the sidebar')
  }
  await page.waitForTimeout(800)

  // ─── step: switch the sidebar to project-overview grouping ───
  // The persisted grouping atom reads this localStorage key. Set it through
  // the page's own localStorage (the same value the filter menu writes) and
  // reload, then verify the projects header is present.
  await page.evaluate(() => {
    window.localStorage.setItem('hermes.desktop.agentsGroupedByWorkspace', 'true')
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)
  await screenshot(page, 'projects-overview')

  const addButton = page.getByRole('button', { name: /New project|新建项目/ }).first()

  try {
    await addButton.waitFor({ state: 'visible', timeout: 15000 })
    record('project overview sidebar', true, 'add-project button visible')
  } catch {
    record('project overview sidebar', false, 'add-project button never appeared')
    await screenshot(page, 'failure-state')
    await finish(app, false)
    return
  }

  // ─── step: add-project menu shows the remote-connection entry ───
  await addButton.click()
  await page.waitForTimeout(600)
  await screenshot(page, 'add-project-menu')

  const remoteItem = page.getByText(/Remote connection|远程连接/).first()
  let remoteMenuOk = true

  try {
    await remoteItem.waitFor({ state: 'visible', timeout: 5000 })
  } catch {
    remoteMenuOk = false
  }

  record('add-project menu', remoteMenuOk, remoteMenuOk ? 'remote connection entry visible' : 'remote connection entry missing')
  if (!remoteMenuOk) {
    await finish(app, false)
    return
  }

  await remoteItem.click()
  await page.waitForTimeout(800)
  await screenshot(page, 'wizard-method')

  // ─── step: choose WSL ───
  await page.getByText(/Browse Linux directories|浏览本机 WSL/).first().click()
  await page.waitForTimeout(500)

  // ─── step: discovery lists the real distribution ───
  // Discovery runs the real `wsl.exe -l -v` on this machine.
  let distroOk = true
  try {
    await page.getByText('Ubuntu', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    distroOk = false
  }
  record('wsl discovery', distroOk, distroOk ? 'Ubuntu offered by the real discovery' : 'distribution list never appeared')
  await screenshot(page, 'wizard-config')
  if (!distroOk) {
    await finish(app, false)
    return
  }

  // Keep the default distribution; leave the user field empty (distribution
  // default user), then connect.
  await page.getByRole('button', { name: /Connect|连接/ }).first().click()
  await page.waitForTimeout(800)
  await screenshot(page, 'connecting')

  // ─── step: connected → directory browser shows the real Linux tree ───
  let browseOk = true
  try {
    await page.getByPlaceholder(/Path|路径/).waitFor({ state: 'visible', timeout: 30000 })
  } catch {
    browseOk = false
  }
  record('connect + browse step', browseOk, browseOk ? 'directory browser visible' : 'browser never appeared')
  if (!browseOk) {
    await screenshot(page, 'connect-failure')
    await finish(app, false)
    return
  }

  await page.waitForTimeout(2500)
  await screenshot(page, 'browse-home')

  // Navigate to the acceptance directory (contains spaces + CJK), then into
  // its CJK subdirectory, then back up one level.
  const acceptanceDir = process.env.WSL_ACCEPTANCE_DIR || '/home/maoqh/wsl-round1-验收 目录'
  const pathInput = page.getByPlaceholder(/Path|路径/).first()
  await pathInput.fill(acceptanceDir)
  await page.getByRole('button', { name: /^Go$|前往/ }).first().click()
  await page.waitForTimeout(2500)
  await screenshot(page, 'browse-acceptance-dir')

  const subEntry = page.getByText('子目录', { exact: true }).first()
  let cjkOk = true
  try {
    await subEntry.waitFor({ state: 'visible', timeout: 10000 })
    await subEntry.click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /Up one level|上级/ }).first().click()
    await page.waitForTimeout(2500)
  } catch {
    cjkOk = false
  }
  record('browse CJK + spaces + up-level', cjkOk, cjkOk ? 'sub-directory navigation worked' : 'sub-directory not listed')
  await screenshot(page, 'browse-after-navigation')

  // ─── step: save the workspace ───
  await page.getByRole('button', { name: /Use this directory|选择此目录/ }).first().click()
  await page.waitForTimeout(3500)
  await screenshot(page, 'saved-sidebar')

  const remoteRow = page.getByText('wsl-round1-验收 目录', { exact: false }).first()
  let savedOk = true
  try {
    await remoteRow.waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    savedOk = false
  }
  record('workspace saved as sidebar entry', savedOk, savedOk ? 'remote row visible in the sidebar' : 'remote row missing after save')

  // ─── step: connection info + reconnect re-verifies ───
  let infoOk = true
  try {
    await remoteRow.click()
    await page.waitForTimeout(800)
    await screenshot(page, 'connection-info')
    await page.getByRole('button', { name: /Reconnect|重新连接/ }).first().click()
    await page.waitForTimeout(6000)
    await screenshot(page, 'reconnected')
    await page.getByText(/Verified|已验证/).first().waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    infoOk = false
  }
  record('connection info + reconnect', infoOk, infoOk ? 'reconnect re-verified the saved workspace' : 'reconnect flow failed')

  // Close the info dialog.
  try {
    await page.getByRole('button', { name: /Close|关闭/ }).first().click()
    await page.waitForTimeout(600)
  } catch {
    // fall through
  }

  // ─── step: unknown path fails with a typed error, cancel saves nothing ───
  const beforeCount = await page.evaluate(() => {
    return new Promise(resolve => {
      // Count remote rows via the section DOM marker.
      const section = document.querySelector('[data-wsl-workspace-section]')
      resolve(section ? section.querySelectorAll('button').length : 0)
    })
  })

  let unknownOk = true
  try {
    await addButton.click()
    await page.waitForTimeout(500)
    await page.getByText(/Remote connection|远程连接/).first().click()
    await page.waitForTimeout(600)
    await page.getByText(/Browse Linux directories|浏览本机 WSL/).first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /Connect|连接/ }).first().click()
    await page.getByPlaceholder(/Path|路径/).first().waitFor({ state: 'visible', timeout: 30000 })
    await page.getByPlaceholder(/Path|路径/).first().fill('/definitely/not/here-9137')
    await page.getByRole('button', { name: /^Go$|前往/ }).first().click()
    await page.waitForTimeout(3000)
    await screenshot(page, 'unknown-path-error')
    await page.getByText(/does not exist|该目录不存在/).first().waitFor({ state: 'visible', timeout: 10000 })
  } catch {
    unknownOk = false
  }
  record('unknown path typed error', unknownOk, unknownOk ? 'error surfaced, nothing saved' : 'typed error missing')

  // Cancel this second wizard run.
  try {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
  } catch {
    // fall through
  }

  const afterCount = await page.evaluate(() => {
    const section = document.querySelector('[data-wsl-workspace-section]')
    return section ? section.querySelectorAll('button').length : 0
  })
  record('cancel saves nothing', afterCount === beforeCount, `remote rows before=${beforeCount} after=${afterCount}`)
  await screenshot(page, 'after-cancel')

  // ─── step: quit and reopen — the saved workspace persists, unverified ───
  const storeFile = path.join(userDataDir, 'wsl-workspaces.json')
  const storeOnDisk = fs.existsSync(storeFile) ? JSON.parse(fs.readFileSync(storeFile, 'utf8')) : null
  record(
    'host store written',
    Boolean(storeOnDisk && storeOnDisk.workspaces && storeOnDisk.workspaces.length === 1),
    storeOnDisk ? JSON.stringify(storeOnDisk.workspaces.map(w => ({ id: w.id, root: w.rootPath, user: w.actualUser }))) : 'store file missing'
  )

  await app.close()

  // Reopen the same isolated instance.
  const app2 = await _electron.launch({
    executablePath: electronBin,
    args: [DESKTOP_ROOT, '--disable-gpu', '--no-sandbox'],
    env,
    cwd: DESKTOP_ROOT
  })
  const page2 = await app2.firstWindow()
  await page2.waitForLoadState('domcontentloaded')
  await page2.waitForTimeout(4000)

  // grouping choice persisted with the userData
  const row2 = page2.getByText('wsl-round1-验收 目录', { exact: false }).first()
  let reopenOk = true
  try {
    await row2.waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    reopenOk = false
  }
  record('reopen: workspace persisted', reopenOk, reopenOk ? 'remote row visible after restart' : 'row missing after restart')
  await screenshot(page2, 'reopen-unverified')

  let verifyOk = true
  try {
    await row2.click()
    await page2.waitForTimeout(800)
    await page2.getByRole('button', { name: /Reconnect|重新连接/ }).first().click()
    await page2.getByText(/Verified|已验证/).first().waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    verifyOk = false
  }
  record('reopen: re-verification works', verifyOk, verifyOk ? 'saved record re-verified against the real distribution' : 're-verification failed')
  await screenshot(page2, 'reopen-verified')

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
