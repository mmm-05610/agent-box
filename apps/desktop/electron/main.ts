import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { discover } from './extensions'
import { protocolHandler } from './extension-protocol'
import { verifyLayout } from './smoke-layout'
import { verifyAgentUI } from './smoke-agent'
import { installNativeBridge } from './native-bridge'

app.setName('Ordessa Desktop')
if (process.env.MODULAR_USER_DATA) app.setPath('userData', process.env.MODULAR_USER_DATA)
const smoke = process.env.MODULAR_SMOKE === '1'
if (smoke) app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'ordessa', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
app.whenReady().then(async () => {
  const bundled = process.env.ORDESSA_EMPTY_HOST === '1' ? undefined : path.resolve(__dirname, '../../../extensions/dist')
  const discovery = await discover(process.env.ORDESSA_EXTENSION_HOME ?? app.getPath('userData'), bundled)
  protocol.handle('ordessa', protocolHandler(path.join(__dirname, 'renderer'), discovery))
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  const win = new BrowserWindow({
    width: 1220, height: 800, minWidth: 760, minHeight: 520, show: !smoke,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)
  installNativeBridge(win, discovery)
  ipcMain.handle('extensions:catalog', event => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
        event.senderFrame.url !== 'ordessa://desktop/index.html') throw Error('Untrusted catalog caller')
    return discovery.catalog // No file paths, credentials, write API, or raw IPC.
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (smoke) win.webContents.on('console-message', details => console.error('RENDERER', details.message))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  await win.loadURL('ordessa://desktop/index.html')
  if (smoke) {
    const result = await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100 && !document.documentElement.dataset.ready; i++) await new Promise(r => setTimeout(r, 50));
      for (let i = 0; i < 20 && !document.documentElement.dataset.settled; i++) await new Promise(r => setTimeout(r, 50));
      const pages = [...document.querySelectorAll('[data-region] header [role="group"] button')].map(b => b.textContent);
      const views = [];
      for (const button of document.querySelectorAll('[data-region] header [role="group"] button')) {
        button.click(); await new Promise(r => setTimeout(r, 30));
        const increment = document.querySelector('[data-testid="increment"]');
        if (increment) { increment.click(); await new Promise(r => setTimeout(r, 30)); }
        views.push(document.querySelector('[data-region="main"]').textContent);
      }
      return {
        ready: document.documentElement.dataset.ready === 'true', pages, views,
        rootMounted: !!document.querySelector('[data-testid="workspace"]'),
        settingsEntry: [...document.querySelectorAll('nav button')].some(b => b.getAttribute('aria-label') === '设置'),
        emptyHost: !!document.querySelector('[data-testid="empty"]'),
        errors: [...document.querySelectorAll('[role="alert"]')].map(p => p.textContent),
        starting: [...document.querySelectorAll('[role="status"]')].map(p => p.textContent),
        nodeAbsent: typeof require === 'undefined' && typeof process === 'undefined',
        bridgeKeys: Object.keys(window.extensionCatalog ?? {}),
      };
    })()`)
    if (process.env.MODULAR_FOUNDATION_SMOKE === '1') {
      Object.assign(result, await win.webContents.executeJavaScript(`(async () => {
        const wait = () => new Promise(r => setTimeout(r, 60));
        const click = async selector => { const el = document.querySelector(selector); if (!el) throw Error('Missing '+selector); el.focus(); el.click(); await wait(); };
        await click('[data-testid="demo-counter"]');
        const entry = [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === '设置');
        entry.focus(); entry.click(); await wait();
        const inert = document.querySelector('[data-testid="workspace"]').inert;
        const focusOnReturn = document.activeElement.textContent === '← 返回工作区';
        const field = document.querySelector('[data-setting="demo.text"] input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '桌面输入');
        field.dispatchEvent(new Event('input', {bubbles:true})); await wait();
        await click('[data-setting="demo.text"] button');
        const saved = field.value === '桌面输入' && document.querySelector('[data-setting="demo.text"]').textContent.includes('已保存并重新读取');
        await click('[data-testid="external-update"]');
        const externalUpdate = field.value === '外部更新';
        await click('[data-setting="demo.fail"] button');
        const failureVisible = document.querySelector('[data-setting="demo.fail"] [role="alert"]').textContent.includes('演示保存失败');
        await click('[data-testid="full-page"] header button');
        const preserved = document.querySelector('[data-testid="demo-counter"]').textContent === '计数 1';
        const focusRestored = document.activeElement === entry;
        return { foundation: { inert, focusOnReturn, saved, externalUpdate, failureVisible, preserved, focusRestored } };
      })()`))
      if (process.env.MODULAR_LAYOUT_SMOKE === '1') Object.assign(result, { layout: await verifyLayout(win) })
      if (process.env.MODULAR_SCREENSHOT) {
        win.showInactive() // Test-only Xvfb window: force a painted frame before capture.
        await new Promise(resolve => setTimeout(resolve, 150))
        await writeFile(process.env.MODULAR_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
        await win.webContents.executeJavaScript(`(async()=>{ [...document.querySelectorAll('nav button')].find(b=>b.getAttribute('aria-label')==='设置').click(); await new Promise(r=>setTimeout(r,100)); })()`)
        await writeFile(process.env.MODULAR_SCREENSHOT + '.settings.png', (await win.webContents.capturePage()).toPNG())
      }
    }
    if (process.env.MODULAR_AGENT_SMOKE === '1') {
      Object.assign(result, { agent: await verifyAgentUI(win) })
      if (process.env.MODULAR_SCREENSHOT) {
        win.showInactive()
        await new Promise(resolve => setTimeout(resolve, 150))
        await writeFile(process.env.MODULAR_SCREENSHOT, (await win.webContents.capturePage()).toPNG())
      }
    }
    if (process.env.MODULAR_AGENT_SHELL_SMOKE === '1') {
      Object.assign(result, { agentShell: await win.webContents.executeJavaScript(`(async () => {
        const entry = [...document.querySelectorAll('nav button')].find(button => button.getAttribute('aria-label') === 'Agents');
        entry?.click(); await new Promise(resolve => setTimeout(resolve, 100));
        return {
          navigation: !!entry,
          codexVisible: !![...document.querySelectorAll('.agent-connections button')].find(button => button.textContent.includes('Codex')),
          emptyConversation: !!document.querySelector('.agent-placeholder')?.textContent.includes('Choose a connection'),
          requestsView: [...document.querySelectorAll('[data-region="right"] [role="group"] button')].some(button => button.textContent === 'Requests'),
        };
      })()`) })
    }
    console.log('MODULAR_LOADER_READY', JSON.stringify(result))
    app.exit(result.ready && result.nodeAbsent ? 0 : 1)
  }
}).catch(error => { console.error(error); app.exit(1) })
app.on('window-all-closed', () => app.quit())
