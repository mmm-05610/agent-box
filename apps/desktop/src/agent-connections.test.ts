import { expect, it } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { createAgentConnections } from '../../../plugins/connections/service/src/entry'

it('lets independent adapters register and releases each with its own scope', async () => {
  const serviceScope = new OwnedResources()
  const a = new OwnedResources(), b = new OwnedResources()
  const service = createAgentConnections(serviceScope)
  let changes = 0
  const unsubscribe = service.subscribe(() => { changes++ })
  service.forScope(a).add({ id: 'codex', title: 'Codex', connect: async () => { throw Error('offline') } })
  service.forScope(b).add({ id: 'pi', title: 'Pi', connect: async () => { throw Error('offline') } })
  expect(service.getSnapshot().map(item => item.id)).toEqual(['codex', 'pi'])
  expect(service.getSnapshot()).toBe(service.getSnapshot())
  a.dispose()
  expect(service.getSnapshot().map(item => item.id)).toEqual(['pi'])
  await expect(service.connect('codex')).rejects.toThrow('unavailable')
  expect(changes).toBe(3)
  unsubscribe()
  b.dispose()
  serviceScope.dispose()
  expect(service.getSnapshot()).toEqual([])
  expect(() => service.forScope(b).add({ id: 'late', title: 'Late', connect: async () => { throw Error() } })).toThrow('closed')
})
