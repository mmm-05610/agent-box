import type { ResourceScope } from '@ordessa/extension-api'
import type { Workbench, View, UIContribution, Region } from '@extensions/ordessa.contracts/contract.js'
import { registry } from '../../shared/registry'
export function createWorkbench(lifetime: ResourceScope) {
  const views = registry<View>(lifetime), ui = registry<UIContribution>(lifetime)
  type Selection = Partial<Record<Region | 'full-page', string>>
  let selected: Selection = {}
  const listeners = new Set<() => void>()
  const publish = () => listeners.forEach(f => f())
  const unsubscribe = views.subscribe(() => {
    const ids = new Set(views.getSnapshot().map(v => v.id))
    selected = Object.fromEntries(Object.entries(selected).filter(([, id]) => ids.has(id!)))
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
      selected = { ...selected, [view.presentation === 'full-page' ? 'full-page' : view.region]: id }
      publish()
    },
    close(id) { selected = Object.fromEntries(Object.entries(selected).filter(([, value]) => value !== id)); publish() },
  }
  return { service, views, ui, getSelection: () => selected, subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } } }
}
export type WorkbenchModel = ReturnType<typeof createWorkbench>
