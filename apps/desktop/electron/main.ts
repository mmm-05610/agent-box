import { app, BrowserWindow } from 'electron'
import path from 'node:path'

app.setName('Ordessa Desktop')
if (process.env.MODULAR_USER_DATA) app.setPath('userData', process.env.MODULAR_USER_DATA)
if (process.env.MODULAR_SMOKE === '1') app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1220, height: 800, minWidth: 760, minHeight: 520,
    show: process.env.MODULAR_SMOKE !== '1',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  await win.loadFile(path.join(__dirname, 'renderer/index.html'))
  if (process.env.MODULAR_SMOKE === '1') {
    const result = await win.webContents.executeJavaScript(`({
      empty: !!document.querySelector('[data-testid="empty"]'),
      pages: document.querySelectorAll('nav button').length,
      nodeAbsent: typeof require === 'undefined' && typeof process === 'undefined',
      bridgeAbsent: typeof window.modularDesktop === 'undefined'
    })`)
    console.log('MODULAR_EMPTY_READY', JSON.stringify({
      ...result, contextIsolationConfigured: true,
    }))
    app.exit(result.empty && result.pages === 0 && result.nodeAbsent && result.bridgeAbsent ? 0 : 1)
  }
}).catch(error => { console.error(error); app.exit(1) })
app.on('window-all-closed', () => app.quit())
