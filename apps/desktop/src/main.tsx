import { createRoot } from 'react-dom/client'
import { runtime } from '@modular/desktop-host'
import { App } from './app'
import { extensions } from './extensions'
import './host.css'
const desktop = runtime(extensions)
void desktop.start().then(() => {
  createRoot(document.getElementById('root')!).render(<>
    {desktop.failures.map(failure => <p role="alert" key={failure.id}>{failure.id}: {failure.error}</p>)}
    <App host={desktop.host} />
  </>)
})
