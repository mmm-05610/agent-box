import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { discover, confinedFile } from '../electron/extensions'
import { protocolHandler } from '../electron/extension-protocol'
import { parseManifest } from '@ordessa/extension-loader/manifest'
import { loadExtensions } from '@ordessa/extension-loader'
import { scoped, Token } from '@ordessa/extension-api'
import { runtime } from '@modular/desktop-host'
const dirs: string[] = []
const manifest = { id: 'test.one', version: '0.1.0', hostApi: '1', entry: 'entry.js' }
it('bounds a stalled factory, preserves healthy modules, and ignores late results', async () => {
  let finish!: (value: unknown) => void
  const pending = new Promise(resolve => { finish = resolve })
  const result = await loadExtensions({ failures: [], extensions: [
    { manifest, url: 'slow' },
    { manifest: { ...manifest, id: 'test.healthy' }, url: 'healthy' },
  ] }, async url => ({ default: () => url === 'slow' ? pending : { id: 'test.healthy', activate() {} } }), 10)
  expect(result.plugins.map(p => p.id)).toEqual(['test.healthy'])
  expect(result.failures[0].error).toContain('timed out')
  finish({ id: 'test.one', activate() {} })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(result.plugins.map(p => p.id)).toEqual(['test.healthy'])
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordessa-loader-test-')); dirs.push(root)
  await mkdir(path.join(root, 'extensions', 'one'), { recursive: true })
  await writeFile(path.join(root, 'extensions', 'one', 'manifest.json'), JSON.stringify(manifest))
  await writeFile(path.join(root, 'extensions', 'one', 'entry.js'), 'export default () => ({})')
  return root
}
async function enable(root: string, enabled = ['test.one']) { await writeFile(path.join(root, 'extensions.json'), JSON.stringify({ enabled })) }
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
describe('extension discovery and confinement', () => {
  it('does not enable discovered code without explicit approval', async () => {
    const root = await fixture()
    expect((await discover(root)).catalog.extensions).toEqual([])
    await enable(root, [])
    expect((await discover(root)).installed.size).toBe(0)
    await enable(root)
    expect((await discover(root)).catalog.extensions).toHaveLength(1)
  })
  it('fails closed for malformed approval', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'extensions.json'), '{"enabled":"all"}')
    const result = await discover(root)
    expect(result.installed.size).toBe(0)
    expect(result.catalog.failures[0].id).toBe('configuration')
  })
  it.each(['../entry.js', '/tmp/entry.js', 'file:///tmp/a.js', 'dist\\a.js', 'dist/%2e%2e/a.js'])('rejects invalid entry %s', entry => {
    expect(() => parseManifest({ ...manifest, entry })).toThrow()
  })
  it('rejects incompatible versions', () => {
    expect(() => parseManifest({ ...manifest, hostApi: '2' })).toThrow('Incompatible')
  })
  it('rejects duplicate identities without a directory-order winner', async () => {
    const root = await fixture(); await enable(root)
    await mkdir(path.join(root, 'extensions', 'two'))
    await writeFile(path.join(root, 'extensions', 'two', 'manifest.json'), JSON.stringify(manifest))
    const result = await discover(root)
    expect(result.installed.size).toBe(0)
    expect(result.catalog.failures.some(f => f.error === 'Duplicate extension id')).toBe(true)
  })
  it('rejects file symlinks escaping the installed package', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'outside.js'), 'outside')
    await symlink(path.join(root, 'outside.js'), path.join(root, 'extensions', 'one', 'escape.js'))
    await expect(confinedFile(path.join(root, 'extensions', 'one'), 'escape.js')).rejects.toThrow('escapes')
  })
  it('does not discover a symlinked package directory', async () => {
    const root = await fixture(); await enable(root)
    await symlink(path.join(root, 'extensions', 'one'), path.join(root, 'extensions', 'alias'))
    expect((await discover(root)).catalog.extensions).toHaveLength(1)
  })
  it('protocol rejects disabled packages, foreign hosts and unsupported files', async () => {
    const root = await fixture()
    const denied = protocolHandler(root, await discover(root))
    expect((await denied({ url: 'ordessa://desktop/extensions/test.one/entry.js', method: 'GET' })).status).toBe(403)
    await enable(root)
    const handler = protocolHandler(root, await discover(root))
    expect((await handler({ url: 'ordessa://other/main.js', method: 'GET' })).status).toBe(403)
    expect((await handler({ url: 'ordessa://desktop/extensions/test.one/entry.js', method: 'POST' })).status).toBe(403)
    expect((await handler({ url: 'ordessa://desktop/extensions/test.one/%2e%2e%2foutside.js', method: 'GET' })).status).toBe(404)
    expect((await handler({ url: 'ordessa://desktop/extensions/test.one/entry.js', method: 'GET' })).status).toBe(200)
    expect((await handler({ url: 'ordessa://desktop/extensions/test.one/private.txt', method: 'GET' })).status).toBe(415)
  })
})
describe('module validation', () => {
  const descriptor = { manifest, url: 'ordessa://desktop/extensions/test.one/entry.js' }
  it('isolates rejected imports and factory identity failures', async () => {
    const bad = { manifest: { ...manifest, id: 'test.bad' }, url: 'bad' }
    const result = await loadExtensions({ extensions: [bad, descriptor], failures: [] }, async url => {
      if (url === 'bad') throw Error('invalid code')
      return { default: () => scoped({ id: 'test.one', activate() {} }) }
    })
    expect(result.plugins).toHaveLength(1); expect(result.failures).toHaveLength(1)
    const mismatch = await loadExtensions({ extensions: [descriptor], failures: [] }, async () => ({ default: () => ({ id: 'wrong', activate() {} }) }))
    expect(mismatch.plugins).toEqual([])
    expect(mismatch.failures).toHaveLength(1)
  })
  it('rejects all duplicate providers but keeps unrelated plugins', async () => {
    const token = new Token<number>('test')
    const result = await loadExtensions({ extensions: ['test.a', 'test.b', 'test.ok'].map(id => ({ manifest: { ...manifest, id }, url: id })), failures: [] },
      async id => ({ default: () => scoped({ id, ...(id === 'test.ok' ? {} : { provides: token }), activate: () => 1 }) }))
    expect(result.plugins.map(p => p.id)).toEqual(['test.ok'])
    expect(result.failures).toHaveLength(2)
  })
  it('missing service does not prevent an unrelated loaded plugin starting', async () => {
    let healthy = false
    const app = runtime([
      scoped({ id: 'bad', autoStart: true, requires: [new Token('absent')], activate() {} }),
      scoped({ id: 'healthy', autoStart: true, activate() { healthy = true } }),
    ])
    await app.start()
    expect(healthy).toBe(true); expect(app.failures.map(f => f.id)).toEqual(['bad'])
  })
  it('a dependency cycle is diagnosed without aborting unrelated startup', async () => {
    const a = new Token<number>('a'), b = new Token<number>('b')
    let healthy = false
    const app = runtime([
      scoped({ id: 'a', autoStart: true, provides: a, requires: [b], activate: () => 1 }),
      scoped({ id: 'b', autoStart: true, provides: b, requires: [a], activate: () => 2 }),
      scoped({ id: 'healthy', autoStart: true, activate() { healthy = true } }),
    ])
    await app.start()
    expect(healthy).toBe(true)
    expect(app.failures.length).toBeGreaterThan(0)
    expect(app.failures.some(f => f.id === 'healthy')).toBe(false)
  })
})
