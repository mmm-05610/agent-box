// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { Token } from '@lumino/coreutils'
import { runtime, scoped, OwnedResources, type Plugin } from '@modular/desktop-host'
import { App } from './app'

describe('Lumino desktop host', () => {
  it('starts without business plugins or public raw registry', async () => {
    const app = runtime([])
    await app.start()
    expect(app.host.pages.getSnapshot()).toEqual([])
    expect(app.failures).toEqual([])
    expect('registry' in app).toBe(false)
  })
  it('rejects duplicate providers and plugin ids', () => {
    const token = new Token<number>('test')
    const a: Plugin<number> = { id: 'a', provides: token, activate: () => 1 }
    expect(() => runtime([a, { ...a }])).toThrow('Duplicate plugin')
    expect(() => runtime([a, { ...a, id: 'b' }])).toThrow('Duplicate provider')
  })
  it('starts unrelated plugins when a required service is missing', async () => {
    const token = new Token<number>('missing')
    const app = runtime([
      scoped({ id: 'broken', autoStart: true, requires: [token], activate: () => null }),
      scoped({ id: 'ok', autoStart: true, activate: (host, owned) => {
        owned.add(host.pages.add({ id: 'ok', title: 'OK', component: () => <p>Registered page</p> }))
      } }),
    ])
    await app.start()
    expect(app.failures.map(f => f.id)).toEqual(['broken'])
    expect(app.host.pages.getSnapshot().map(p => p.id)).toEqual(['ok'])
  })
  it('cleans all resources in reverse order despite throwing cleanup', () => {
    const owned = new OwnedResources(), calls: number[] = []
    owned.add({ isDisposed: false, dispose() { calls.push(1) } })
    owned.add({ isDisposed: false, dispose() { calls.push(2); throw Error('cleanup') } })
    expect(() => owned.dispose()).toThrow(AggregateError)
    expect(calls).toEqual([2, 1])
    owned.dispose()
    expect(calls).toEqual([2, 1])
  })
  it('rolls back activation and retains both failure causes', async () => {
    const app = runtime([scoped({ id: 'bad', activate(host, owned) {
      owned.add(host.pages.add({ id: 'bad', title: 'Bad', component: () => null }))
      owned.add({ isDisposed: false, dispose() { throw Error('cleanup') } })
      throw Error('activation')
    } })])
    await expect(app.activate('bad')).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'activation' }), expect.any(AggregateError)],
    })
    expect(app.host.pages.getSnapshot()).toEqual([])
  })
  it('registers and removes pages without editing App', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const app = runtime([scoped({ id: 'example', activate(host, owned) {
      owned.add(host.pages.add({ id: 'example', title: 'Example', component: () => <p>Example content</p> }))
    } })])
    const mount = document.createElement('div'), root = createRoot(mount)
    document.body.append(mount)
    try {
      await act(async () => root.render(<App host={app.host} />))
      expect(mount.querySelector('[data-testid="empty"]')).not.toBeNull()
      await act(async () => { await app.activate('example') })
      await act(async () => { mount.querySelector<HTMLButtonElement>('nav button')!.click() })
      expect(mount.textContent).toContain('Example content')
      await act(async () => { await app.deactivate('example') })
      expect(mount.querySelectorAll('nav button')).toHaveLength(0)
      expect(mount.querySelector('[data-testid="empty"]')).not.toBeNull()
    } finally { await act(async () => root.unmount()); mount.remove() }
  })
})
