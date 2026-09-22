import type * as API from '@ordessa/extension-api'
import { GreetingToken, type Greeting } from '@extensions/example.provider/contract.js'
export default function createPlugin(api: typeof API) {
  return api.scoped({ id: 'example.consumer', autoStart: true, requires: [GreetingToken], activate(host, owned, greeting: Greeting) {
    owned.add(host.pages.add({ id: 'example.consumer.page', title: 'Service', component: () => <p>{greeting.message}</p> }))
  } })
}
