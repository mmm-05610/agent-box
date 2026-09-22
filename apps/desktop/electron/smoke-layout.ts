import type { BrowserWindow } from 'electron'

/** Test-only: real Chromium input, not synthetic DOM geometry or a mocked splitter. */
export async function verifyLayout(win: BrowserWindow) {
  win.showInactive()
  win.focus()
  win.webContents.focus()
  const pause = () => new Promise(resolve => setTimeout(resolve, 100))
  const evaluate = (code: string) => win.webContents.executeJavaScript(code)
  const point = (selector: string) => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  const width = () => evaluate(`document.querySelector('#wb-left').getBoundingClientRect().width`)
  const click = async (selector: string) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause() }
  await pause()
  const initialWidth = await width(), p = await point('#resize-left')
  win.webContents.sendInputEvent({ type: 'mouseMove', ...p })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...p })
  for (let dx = 10; dx <= 80; dx += 10) { win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x + dx, y: p.y, button: 'left', modifiers: ['leftbuttondown'] }); await pause() }
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: p.x + 80, y: p.y })
  await pause()
  const draggedWidth = await width()
  await evaluate(`document.querySelector('#resize-left').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await pause()
  const keyedWidth = await width()
  await click('.wb-layout-actions [aria-label="收起左侧栏"]')
  const collapsedWidth = await width()
  await click('.wb-layout-actions [aria-label="展开左侧栏"]')
  const restoredWidth = await width()
  const bottomHeight = () => evaluate(`document.querySelector('#wb-bottom').getBoundingClientRect().height`)
  const initialHeight = await bottomHeight(), vertical = await point('#resize-bottom')
  win.webContents.sendInputEvent({ type: 'mouseMove', ...vertical })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...vertical })
  for (let dy = 10; dy <= 50; dy += 10) { win.webContents.sendInputEvent({ type: 'mouseMove', x: vertical.x, y: vertical.y - dy, button: 'left', modifiers: ['leftbuttondown'] }); await pause() }
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: vertical.x, y: vertical.y - 50 })
  await pause()
  const resizedHeight = await bottomHeight()
  await evaluate(`(()=>{const select=document.querySelector('[aria-label="移动 main 到"]');select.value='right';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await pause()
  const moved = await evaluate(`document.querySelector('[data-region=right] [data-testid=demo-counter]')?.textContent === '计数 1'`)
  await click('[aria-label="重置布局"]')
  const source = await point('[data-region=main] button[draggable]')
  // Intercept the OS drag loop in Xvfb; Chromium still builds the real DataTransfer.
  win.webContents.debugger.attach('1.3')
  let dragData: unknown
  const intercept = (_event: unknown, method: string, params: { data?: unknown }) => { if (method === 'Input.dragIntercepted') dragData = params.data }
  win.webContents.debugger.on('message', intercept)
  await win.webContents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true })
  win.webContents.sendInputEvent({ type: 'mouseMove', ...source })
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...source })
  win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', modifiers: ['leftbuttondown'], x: source.x + 25, y: source.y + 20 })
  await pause()
  const dropVisible = await evaluate(`!!document.querySelector('[data-drop-region=left]')`)
  if (dropVisible && dragData) {
    const target = await point('[data-drop-region=left]')
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await win.webContents.debugger.sendCommand('Input.dispatchDragEvent', { type, ...target, data: dragData }); await pause()
    }
  } else win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...source })
  win.webContents.debugger.off('message', intercept)
  win.webContents.debugger.detach()
  await pause()
  const dropped = await evaluate(`document.querySelector('[data-region=left] [data-testid=demo-counter]')?.textContent === '计数 1'`)
  await click('[aria-label="重置布局"]')
  const reset = await evaluate(`document.querySelector('[data-region=main] [data-testid=demo-counter]')?.textContent === '计数 1'`)
  return {
    checks: { mouseResize: draggedWidth > initialWidth + 40, verticalResize: resizedHeight > initialHeight + 30, keyboardResize: keyedWidth > draggedWidth,
      collapse: collapsedWidth < 2, restoreSize: Math.abs(restoredWidth - keyedWidth) < 3,
      movePreservesState: moved, nativeDragDrop: dropVisible && dropped, resetPreservesState: reset },
    measurements: { initialWidth, draggedWidth, keyedWidth, collapsedWidth, restoredWidth, initialHeight, resizedHeight, dropVisible, dropped },
  }
}
