import { createRoot } from 'react-dom/client'
import { runtime } from '@modular/desktop-host'
import { App } from './app'
import { installedExtensions } from './extensions'
import './host.css'
const root = createRoot(document.getElementById('root')!)
async function start() {
  const loaded = await installedExtensions()
  const desktop = runtime(loaded.plugins)
  await desktop.start()
  root.render(<>
    {[...loaded.failures, ...desktop.failures].map((failure, index) => <p role="alert" key={index}>{failure.id}: {failure.error}</p>)}
    <App host={desktop.host} />
  </>)
  document.documentElement.dataset.ready = 'true'
}
void start().catch(error => root.render(<p role="alert">Startup failed: {String(error)}</p>))
