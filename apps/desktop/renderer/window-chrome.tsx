import { useEffect, useState } from 'react'

// Host-owned frameless window chrome. The preload only exposes desktopWindow on
// Windows/Linux, so on macOS and in jsdom this renders nothing and the document
// keeps its native title bar / no drag regions.
if (typeof window !== 'undefined' && window.desktopWindow) {
  document.documentElement.dataset.frameless = ''
  document.documentElement.style.setProperty('--wb-window-controls', '138px')
}

export function WindowChrome() {
  const api = window.desktopWindow
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    if (!api) return
    let alive = true
    void api.isMaximized().then(value => { if (alive) setMaximized(value) })
    const off = api.onChromeState(value => setMaximized(value))
    return () => { alive = false; off() }
  }, [api])
  if (!api) return null
  return <div className="window-controls" role="group" aria-label="窗口控制">
    <button aria-label="最小化" title="最小化" onClick={() => void api.minimize()}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5h8" stroke="currentColor" /></svg></button>
    <button aria-label={maximized ? '向下还原' : '最大化'} title={maximized ? '向下还原' : '最大化'} onClick={() => void api.toggleMaximize()}>
      {maximized
        ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1" y="3" width="6" height="6" /><path d="M3 3V1h6v6h-2" /></svg>
        : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>}</button>
    <button className="wc-close" aria-label="关闭" title="关闭" onClick={() => void api.close()}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" /></svg></button>
  </div>
}
