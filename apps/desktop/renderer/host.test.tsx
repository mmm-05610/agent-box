// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { Token } from '@lumino/coreutils'
import { runtime, scoped, OwnedResources, type Plugin } from '@ordessa/extension-host'
import { App } from './app'

describe('Lumino desktop host', () => {
  it('owns raw plugin contributions and rejects late writes without exposing the registry', async () => {
    let context: Parameters<Plugin['activate']>[0]
    const page = { id: 'raw', component: () => null }
    const app = runtime([
      { id: 'raw', activate(host) { context = host; host.root.mount(page) } },
      { id: 'other', activate(host) { host.root.mount({ ...page, id: 'other' }) } },
    ])
    await app.activate('raw'); await expect(app.activate('other')).rejects.toThrow('Root view already mounted')
    expect(app.host.roots.getSnapshot().map(p => p.id)).toEqual(['raw'])
    expect(Object.keys(context!.root)).toEqual(['mount'])
    expect(Object.keys(context!.resources)).toEqual(['isDisposed', 'add'])
    await app.deactivate('raw')
    expect(app.host.roots.getSnapshot().map(p => p.id)).toEqual([])
    expect(() => context!.root.mount(page)).toThrow('closed')
    expect(app.host.roots.getSnapshot().map(p => p.id)).toEqual([])
  })
  it('rolls back raw plugins without requiring scoped()', async () => {
    const app = runtime([{ id: 'raw', activate(host) {
      host.root.mount({ id: 'orphan', component: () => null })
      throw Error('failed')
    } }])
    await expect(app.activate('raw')).rejects.toThrow('failed')
    expect(app.host.roots.getSnapshot()).toEqual([])
  })
  it('immediately releases resources arriving after scope closure', () => {
    const owned = new OwnedResources()
    let released = false
    owned.dispose()
    expect(() => owned.add({ isDisposed: false, dispose() { released = true } })).toThrow('closed')
    expect(released).toBe(true)
  })
  it('starts healthy plugins while an unrelated activation is pending', async () => {
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const app = runtime([
      { id: 'slow', autoStart: true, activate: () => pending },
      { id: 'healthy', autoStart: true, activate: () => undefined },
    ])
    const completion = app.start()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(app.getSnapshot()).toEqual(expect.arrayContaining([
      { id: 'slow', phase: 'starting' }, { id: 'healthy', phase: 'active' },
    ]))
    finish(); await completion
    expect(app.getSnapshot().every(p => p.phase === 'active')).toBe(true)
  })
  it('starts without business plugins or public raw registry', async () => {
    const app = runtime([])
    await app.start()
    expect(app.host.roots.getSnapshot()).toEqual([])
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
        owned.add(host.root.mount({ id: 'ok', component: () => <p>Registered page</p> }))
      } }),
    ])
    await app.start()
    expect(app.failures.map(f => f.id)).toEqual(['broken'])
    expect(app.host.roots.getSnapshot().map(p => p.id)).toEqual(['ok'])
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
      owned.add(host.root.mount({ id: 'bad', component: () => null }))
      owned.add({ isDisposed: false, dispose() { throw Error('cleanup') } })
      throw Error('activation')
    } })])
    await expect(app.activate('bad')).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'activation' }), expect.any(AggregateError)],
    })
    expect(app.host.roots.getSnapshot()).toEqual([])
  })
  it('registers and removes a root without editing App', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const app = runtime([scoped({ id: 'example', activate(host, owned) {
      owned.add(host.root.mount({ id: 'example', component: () => <p>Example content</p> }))
    } })])
    const mount = document.createElement('div'), root = createRoot(mount)
    document.body.append(mount)
    try {
      await act(async () => root.render(<App host={app.host} />))
      expect(mount.querySelector('[data-testid="empty"]')).not.toBeNull()
      await act(async () => { await app.activate('example') })
      expect(mount.textContent).toContain('Example content')
      await act(async () => { await app.deactivate('example') })
      expect(mount.querySelectorAll('nav button')).toHaveLength(0)
      expect(mount.querySelector('[data-testid="empty"]')).not.toBeNull()
    } finally { await act(async () => root.unmount()); mount.remove() }
  })
  it('shows a diagnostic for a broken root instead of a blank window', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const app = runtime([{ id: 'broken-root', activate(context) {
      context.root.mount({ id: 'broken', component: () => { throw Error('broken render') } })
    } }])
    await app.activate('broken-root')
    const container = document.createElement('div'), root = createRoot(container)
    try {
      await act(async () => root.render(<App host={app.host} />))
      expect(container.querySelector('[role=alert]')?.textContent).toContain('根界面加载失败')
    } finally { await act(async () => root.unmount()); log.mockRestore() }
  })
})
