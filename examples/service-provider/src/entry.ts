import type * as API from '@ordessa/extension-api'
import { GreetingToken } from './contract'
export default function createPlugin(api: typeof API) {
  return api.scoped({ id: 'example.provider', provides: GreetingToken, activate() { return { message: 'Shared token connected' } } })
}
