import type { ResourceScope } from '@ordessa/extension-api'
import type { Workbench, View, UIContribution, Region } from '@extensions/ordessa.contracts/contract.js'
import { registry } from '../../shared/registry'
export function createWorkbench(lifetime: ResourceScope) {
  const views = registry<View>(lifetime), ui = registry<UIContribution>(lifetime)
  type Selection = Partial<Record<Region | 'full-page', string>>
  let selected: Selection = {}
  let layout: { placements: Record<string, Region>; collapsed: Partial<Record<Region, boolean>> } = { placements: {}, collapsed: {} }
  const regionOf = (view: View) => view.presentation === 'region' ? layout.placements[view.id] ?? view.region : undefined
  const listeners = new Set<() => void>()
  const publish = () => listeners.forEach(f => f())
  const unsubscribe = views.subscribe(() => {
    const ids = new Set(views.getSnapshot().map(v => v.id))
    selected = Object.fromEntries(Object.entries(selected).filter(([, id]) => ids.has(id!)))
    layout = { ...layout, placements: Object.fromEntries(Object.entries(layout.placements).filter(([id]) => ids.has(id))) }
    publish()
  })
  lifetime.add({ isDisposed: false, dispose() { unsubscribe(); listeners.clear() } })
  const service: Workbench = {
    forScope: scope => ({
      addView: view => {
        if (view.presentation !== 'full-page' && (view.presentation !== 'region' || !['left', 'right', 'bottom', 'main', 'top'].includes(view.region))) throw Error('Invalid view placement')
        return views.add(scope, view)
      },
      addUI: item => {
        if (!['navigation', 'toolbar', 'statusbar'].includes(item.slot) || !['component', 'command'].includes(item.kind) || (item.kind === 'component' && item.slot !== 'statusbar')) throw Error('Invalid UI contribution')
        return ui.add(scope, item)
      },
    }),
    open(id) {
      if (lifetime.isDisposed) throw Error('Workbench is closed')
      const view = views.getSnapshot().find(v => v.id === id)
      if (!view) throw Error(`View unavailable: ${id}`)
      const target = view.presentation === 'full-page' ? 'full-page' : regionOf(view)!
      selected = { ...selected, [target]: id }
      if (target !== 'full-page') layout = { ...layout, collapsed: { ...layout.collapsed, [target]: false } }
      publish()
    },
    close(id) { selected = Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== id)); publish() },
  }
  return { service, views, ui, regionOf, getSelection: () => selected, getLayout: () => layout,
    collapse(region: Region, collapsed: boolean) {
      if (lifetime.isDisposed || region === 'main' || layout.collapsed[region] === collapsed) return
      layout = { ...layout, collapsed: { ...layout.collapsed, [region]: collapsed } }; publish()
    },
    move(id: string, region: Region) {
      if (lifetime.isDisposed) throw Error('Workbench is closed')
      const view = views.getSnapshot().find(v => v.id === id)
      if (!view || view.presentation !== 'region' || !['left', 'right', 'bottom', 'main', 'top'].includes(region)) throw Error('Invalid view move')
      const from = regionOf(view)!
      if (from === region) { service.open(id); return }
      selected = Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== id))
      layout = { placements: { ...layout.placements, [id]: region }, collapsed: { ...layout.collapsed, [region]: false } }
      const replacement = views.getSnapshot().find(v => v.id !== id && regionOf(v) === from)
      if (!selected[from] && replacement) selected[from] = replacement.id
      selected = { ...selected, [region]: id }; publish()
    },
    resetLayout() {
      if (lifetime.isDisposed) return
      layout = { placements: {}, collapsed: {} }
      selected = Object.fromEntries(Object.entries(selected).filter(([key]) => key === 'full-page'))
      for (const view of views.getSnapshot()) if (view.presentation === 'region' && !selected[view.region]) selected[view.region] = view.id
      publish()
    },
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } },
  }
}
export type WorkbenchModel = ReturnType<typeof createWorkbench>
