// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnedResources } from '@ordessa/extension-api'
import { runtime } from '@modular/desktop-host'
import type { Commands, Workbench, Settings, Region } from '@extensions/ordessa.contracts/contract.js'
import { CommandsToken, WorkbenchToken, SettingsToken } from '@extensions/ordessa.contracts/contract.js'
import commandsPlugin, { createCommands } from '../../../extensions/commands/src/entry'
import workbenchPlugin from '../../../extensions/workbench/src/entry'
import settingsPlugin from '../../../extensions/settings/src/entry'
import { createWorkbench } from '../../../extensions/workbench/src/model'
import { WorkbenchShell } from '../../../extensions/workbench/src/shell'
import { createSettings } from '../../../extensions/settings/src/model'
import { SettingsPage } from '../../../extensions/settings/src/page'
import { SettingField, validateValue, type Field } from '../../../extensions/settings/src/field'
import { App } from './app'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.restoreAllMocks() })
async function mount(element: React.ReactNode) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  cleanup.push(async () => { await act(async () => root.unmount()); container.remove() })
  await act(async () => root.render(element))
  return container
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button, text).toBeTruthy()
  await act(async () => { button!.focus(); button!.click() })
  return button!
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

describe('foundation service boundaries', () => {
  it('rejects duplicate views/settings and refuses late writes across all service surfaces', () => {
    const scope = new OwnedResources(), owner = new OwnedResources(), wb = createWorkbench(scope), settings = createSettings(scope)
    const view = { id: 'v', title: 'V', presentation: 'full-page' as const, component: () => null }
    wb.service.forScope(owner).addView(view)
    expect(() => wb.service.forScope(scope).addView(view)).toThrow('Duplicate')
    settings.service.forScope(owner).addGroup({ id: 'g', title: 'G' })
    expect(() => settings.service.forScope(scope).addGroup({ id: 'g', title: 'other' })).toThrow('Duplicate')
    owner.dispose()
    expect(() => wb.service.forScope(owner).addView(view)).toThrow('closed')
    expect(() => wb.service.forScope(owner).addUI({ id: 'u', kind: 'command', slot: 'toolbar', command: 'missing' })).toThrow('closed')
    expect(() => settings.service.forScope(owner).addGroup({ id: 'g', title: 'G' })).toThrow('closed')
    expect(() => settings.service.forScope(owner).addItem({ id: 'i', title: 'I', group: 'g', kind: 'custom', component: () => null })).toThrow('closed')
    scope.dispose()
  })
  it('owns registrations across services; rejects duplicates and late additions', async () => {
    const lifetime = new OwnedResources(), a = new OwnedResources(), b = new OwnedResources()
    const commands = createCommands(lifetime), wb = createWorkbench(lifetime), settings = createSettings(lifetime)
    commands.forScope(a).add({ id: 'a', title: 'A', execute: () => 7 })
    commands.forScope(b).add({ id: 'b', title: 'B', execute: () => { throw Error('explicit failure') } })
    expect(() => commands.forScope(b).add({ id: 'a', title: 'duplicate', execute() {} })).toThrow('Duplicate')
    expect(await commands.execute('a')).toEqual({ ok: true, value: 7 })
    expect(await commands.execute('b')).toMatchObject({ ok: false, error: expect.stringContaining('explicit failure') })
    wb.service.forScope(a).addView({ id: 'a', title: 'A', presentation: 'full-page', component: () => null })
    wb.service.forScope(a).addUI({ id: 'a', kind: 'command', slot: 'toolbar', command: 'a' })
    wb.service.open('a')
    settings.service.forScope(a).addGroup({ id: 'a', title: 'A' })
    settings.service.forScope(a).addItem({ id: 'a', group: 'a', title: 'A', kind: 'text', binding: { read: () => 'x' } })
    a.dispose()
    expect(commands.getSnapshot().map(c => c.id)).toEqual(['b'])
    expect(await commands.execute('a')).toMatchObject({ ok: false })
    expect(wb.views.getSnapshot()).toEqual([]); expect(wb.ui.getSnapshot()).toEqual([]); expect(wb.getSelection()).toEqual({})
    expect(settings.groups.getSnapshot()).toEqual([]); expect(settings.items.getSnapshot()).toEqual([])
    expect(() => commands.forScope(a).add({ id: 'late', title: 'late', execute() {} })).toThrow('closed')
    lifetime.dispose()
    expect(() => commands.forScope(b).add({ id: 'later', title: 'later', execute() {} })).toThrow('closed')
    b.dispose()
  })
  it('rolls back a consumer across foundation registries on activation failure', async () => {
    let commands!: Commands, wb!: Workbench, settings!: Settings
    const app = runtime([commandsPlugin(), workbenchPlugin(), settingsPlugin(), {
      id: 'bad', requires: [CommandsToken, WorkbenchToken, SettingsToken],
      activate(ctx, c: Commands, w: Workbench, s: Settings) {
        commands = c; wb = w; settings = s
        c.forScope(ctx.resources).add({ id: 'bad', title: 'bad', execute() {} })
        w.forScope(ctx.resources).addView({ id: 'bad', title: 'bad', presentation: 'full-page', component: () => null })
        s.forScope(ctx.resources).addGroup({ id: 'bad', title: 'bad' })
        throw Error('broken consumer')
      },
    }])
    await expect(app.activate('bad')).rejects.toThrow('broken consumer')
    expect(await commands.execute('bad')).toMatchObject({ ok: false })
    expect(() => wb.open('bad')).toThrow('unavailable')
    const scope = new OwnedResources()
    expect(() => settings.forScope(scope).addGroup({ id: 'bad', title: 'now free' })).not.toThrow()
    scope.dispose()
    await app.deactivate('ordessa.workbench')
    expect(app.host.roots.getSnapshot()).toEqual([])
  })
})

describe('workbench UI', () => {
  it('covers all five regions, preserves background state/focus across full-page, cleans removed pages', async () => {
    const lifetime = new OwnedResources(), fullOwner = new OwnedResources()
    const commands = createCommands(lifetime), model = createWorkbench(lifetime)
    function Counter() { const [n, set] = useState(0); return <button onClick={() => set(n + 1)}>count {n}</button> }
    for (const region of ['left', 'right', 'bottom', 'main', 'top'] as Region[]) {
      model.service.forScope(lifetime).addView({ id: region, title: region, presentation: 'region', region, component: region === 'main' ? Counter : () => <p>{region} content</p> })
      model.service.open(region)
    }
    model.service.forScope(fullOwner).addView({ id: 'full', title: 'Full', presentation: 'full-page', component: () => <p>Full content</p> })
    commands.forScope(lifetime).add({ id: 'open', title: 'Open full', execute: () => model.service.open('full') })
    model.service.forScope(lifetime).addUI({ id: 'open', kind: 'command', slot: 'navigation', command: 'open' })
    const container = await mount(<WorkbenchShell model={model} commands={commands} />)
    expect(container.querySelectorAll('[data-region]')).toHaveLength(5)
    await click(container, 'count 0')
    const entry = await click(container, 'Open full')
    expect(container.querySelector('[data-testid=workspace]')?.hasAttribute('inert')).toBe(true)
    expect(document.activeElement?.textContent).toBe('← 返回工作区')
    await click(container, '← 返回工作区')
    expect(container.textContent).toContain('count 1')
    expect(document.activeElement).toBe(entry)
    await click(container, 'Open full')
    await act(async () => fullOwner.dispose())
    expect(container.querySelector('[data-testid=full-page]')).toBeNull()
    expect(container.textContent).toContain('count 1')
  })
  it('isolates broken full-page rendering and missing commands; order is deterministic', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const scope = new OwnedResources(), commands = createCommands(scope), model = createWorkbench(scope)
    model.service.forScope(scope).addView({ id: 'bad', title: 'Bad', presentation: 'full-page', component: () => { throw Error('render') } })
    model.service.forScope(scope).addUI({ id: 'b', order: 2, kind: 'command', slot: 'toolbar', command: 'missing' })
    model.service.forScope(scope).addUI({ id: 'a', order: 1, kind: 'command', slot: 'toolbar', command: 'also-missing' })
    const container = await mount(<WorkbenchShell model={model} commands={commands} />)
    expect([...container.querySelectorAll('.wb-actions button')].map(b => b.textContent)).toEqual(['also-missing（不可用）', 'missing（不可用）'])
    expect(container.querySelectorAll('button:disabled')).toHaveLength(2)
    await act(async () => model.service.open('bad'))
    expect(container.querySelector('[role=alert]')).not.toBeNull()
    await click(container, '← 返回工作区')
    expect(container.querySelector('[data-testid=full-page]')).toBeNull()
  })
  it('assembles settings through services and returns to an empty host on provider shutdown', async () => {
    const app = runtime([settingsPlugin(), workbenchPlugin(), commandsPlugin()])
    await app.start()
    const container = await mount(<App host={app.host} />)
    await click(container, '设置')
    expect(container.textContent).toContain('尚无设置项')
    await act(async () => { await app.deactivate('ordessa.settings') })
    expect(container.querySelector('[data-testid=full-page]')).toBeNull()
    await act(async () => { await app.deactivate('ordessa.workbench') })
    expect(container.querySelector('[data-testid=empty]')).not.toBeNull()
  })
})

describe('settings binding', () => {
  it('validates finite numbers, enum membership and provider rules', () => {
    const base = { id: 'x', title: 'X', group: 'g', binding: { read: () => 0 } }
    expect(validateValue({ ...base, kind: 'number' }, NaN)).toBeTruthy()
    expect(validateValue({ ...base, kind: 'number' }, Infinity)).toBeTruthy()
    expect(validateValue({ ...base, kind: 'enum', options: [{ value: 'yes', label: 'Yes' }] }, 'no')).toBeTruthy()
    expect(validateValue({ ...base, kind: 'text', binding: { read: () => '', validate: value => value === 'bad' ? 'Denied' : undefined } }, 'bad')).toBe('Denied')
  })
  it('does not lose external invalidation arriving during save confirmation', async () => {
    const confirming = deferred<string>()
    let notify!: () => void
    const read = vi.fn().mockResolvedValueOnce('initial').mockReturnValueOnce(confirming.promise).mockResolvedValueOnce('external-new')
    const field: Field = { id: 'x', group: 'g', title: 'X', kind: 'text', binding: {
      read, write: async () => {}, subscribe: f => { notify = f; return () => {} },
    } }
    const container = await mount(<SettingField field={field} />)
    await click(container, '保存')
    expect(container.textContent).toContain('保存中')
    await act(async () => { notify(); confirming.resolve('stale-confirmation') })
    expect(container.querySelector('input')?.value).toBe('external-new')
    expect(read).toHaveBeenCalledTimes(3)
  })
  it('ignores stale reads and unsubscribes on removal', async () => {
    const first = deferred<string>(), second = deferred<string>()
    let notify!: () => void
    const unsubscribe = vi.fn(), read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const field: Field = { id: 'x', group: 'g', title: 'X', kind: 'text', binding: { read, subscribe: f => { notify = f; return unsubscribe } } }
    const container = await mount(<SettingField field={field} />)
    expect(container.textContent).toContain('读取中')
    await act(async () => { notify(); second.resolve('new') })
    expect(container.querySelector('input')?.value).toBe('new')
    await act(async () => { first.resolve('old') })
    expect(container.querySelector('input')?.value).toBe('new')
    await cleanup.pop()!()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
  it('saves with authoritative read-back, shows failure, and does not auto-retry', async () => {
    const write = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('offline'))
    const read = vi.fn().mockResolvedValueOnce('initial').mockResolvedValueOnce('normalized')
    const field: Field = { id: 'x', group: 'g', title: 'X', kind: 'text', binding: { read, write } }
    const container = await mount(<SettingField field={field} />)
    await click(container, '保存')
    expect(container.querySelector('input')?.value).toBe('normalized')
    expect(container.textContent).toContain('已保存并重新读取')
    await click(container, '保存')
    expect(container.textContent).toContain('offline')
    expect(container.textContent).not.toContain('已保存并重新读取')
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('renders typed controls/custom sections, reports orphan groups and removes items', async () => {
    const scope = new OwnedResources(), owner = new OwnedResources(), model = createSettings(scope)
    const reg = model.service.forScope(owner)
    reg.addGroup({ id: 'g', title: 'General' })
    reg.addItem({ id: 'bool', group: 'g', title: 'Bool', kind: 'boolean', binding: { read: () => true } })
    reg.addItem({ id: 'number', group: 'g', title: 'Number', kind: 'number', binding: { read: () => 3 } })
    reg.addItem({ id: 'enum', group: 'g', title: 'Enum', kind: 'enum', options: [{ value: 'a', label: 'A' }], binding: { read: () => 'a' } })
    reg.addItem({ id: 'custom', group: 'g', title: 'Custom', kind: 'custom', component: () => <p>Custom block</p> })
    reg.addItem({ id: 'orphan', group: 'missing', title: 'Orphan', kind: 'text', binding: { read: () => '' } })
    const container = await mount(<SettingsPage model={model} />)
    expect(container.querySelector('input[type=checkbox]')).not.toBeNull()
    expect(container.querySelector('input[type=number]')).not.toBeNull()
    expect(container.querySelector('select')).not.toBeNull()
    expect(container.textContent).toContain('Custom block')
    expect(container.textContent).toContain('设置分组未注册')
    expect(container.querySelector('input:disabled')).not.toBeNull()
    await act(async () => owner.dispose())
    expect(container.textContent).toContain('尚无设置项')
  })
  it('rejects invalid provider values instead of silently displaying a false value', async () => {
    const field: Field = { id: 'x', group: 'g', title: 'X', kind: 'boolean', binding: { read: () => 'not boolean' } }
    const container = await mount(<SettingField field={field} />)
    expect(container.querySelector('[role=alert]')?.textContent).toContain('需要开关值')
  })
})
