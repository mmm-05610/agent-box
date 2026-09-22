import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'
import path from 'node:path'
import { discover } from './extensions'
import { protocolHandler } from './extension-protocol'

app.setName('Ordessa Desktop')
if (process.env.MODULAR_USER_DATA) app.setPath('userData', process.env.MODULAR_USER_DATA)
const smoke = process.env.MODULAR_SMOKE === '1'
if (smoke) app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'ordessa', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
app.whenReady().then(async () => {
  const discovery = await discover(process.env.ORDESSA_EXTENSION_HOME ?? app.getPath('userData'))
  protocol.handle('ordessa', protocolHandler(path.join(__dirname, 'renderer'), discovery))
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  const win = new BrowserWindow({
    width: 1220, height: 800, minWidth: 760, minHeight: 520, show: !smoke,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
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
      const pages = [...document.querySelectorAll('nav button')].map(b => b.textContent);
      const views = [];
      for (const button of document.querySelectorAll('nav button')) {
        button.click(); await new Promise(r => setTimeout(r, 30));
        const increment = document.querySelector('[data-testid="increment"]');
        if (increment) { increment.click(); await new Promise(r => setTimeout(r, 30)); }
        views.push(document.querySelector('main').textContent);
      }
      return {
        ready: document.documentElement.dataset.ready === 'true', pages, views,
        errors: [...document.querySelectorAll('[role="alert"]')].map(p => p.textContent),
        starting: [...document.querySelectorAll('[role="status"]')].map(p => p.textContent),
        nodeAbsent: typeof require === 'undefined' && typeof process === 'undefined',
        bridgeKeys: Object.keys(window.extensionCatalog ?? {}),
      };
    })()`)
    console.log('MODULAR_LOADER_READY', JSON.stringify(result))
    app.exit(result.ready && result.nodeAbsent ? 0 : 1)
  }
}).catch(error => { console.error(error); app.exit(1) })
app.on('window-all-closed', () => app.quit())
