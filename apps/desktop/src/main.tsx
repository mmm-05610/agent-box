import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { runtime } from '@ordessa/extension-host'
import { App } from './app'
import { installedExtensions } from './extensions'
import './host.css'
const root = createRoot(document.getElementById('root')!)
const empty = runtime([])
root.render(<App host={empty.host} />)
function Desktop({ desktop, failures }: { desktop: ReturnType<typeof runtime>; failures: {id: string; error: string}[] }) {
  const states = useSyncExternalStore(desktop.subscribe, desktop.getSnapshot)
  return <>
    {failures.map((failure, index) => <p role="alert" key={index}>{failure.id}: {failure.error}</p>)}
    {states.filter(s => s.phase === 'failed').map(s => <p role="alert" key={s.id}>{s.id}: {s.error}</p>)}
    {states.filter(s => s.phase === 'starting').map(s => <p role="status" key={s.id}>{s.id}: 启动中</p>)}
    <App host={desktop.host} />
  </>
}
async function start() {
  const loaded = await installedExtensions()
  const desktop = runtime(loaded.plugins)
  root.render(<Desktop desktop={desktop} failures={loaded.failures} />)
  document.documentElement.dataset.ready = 'true'
  void desktop.start().then(() => { document.documentElement.dataset.settled = 'true' })
}
void start().catch(error => root.render(<><p role="alert">Startup failed: {String(error)}</p><App host={empty.host} /></>))
