import { useState } from 'react'
import type * as API from '@ordessa/extension-api'
function Hello() {
  const [count, setCount] = useState(0)
  return <section><h1>独立加载的扩展</h1><button data-testid="increment" onClick={() => setCount(c => c + 1)}>Count: {count}</button></section>
}
export default function createPlugin(api: typeof API) {
  return api.scoped({ id: 'example.hello', autoStart: true, activate(host, owned) {
    owned.add(host.pages.add({ id: 'example.hello.page', title: 'Hello', component: Hello }))
  } })
}
