import * as api from '@ordessa/extension-api'
import type { Catalog, Diagnostic } from './manifest'
export type { Catalog, Diagnostic, ExtensionDescriptor, Manifest } from './manifest'
type Module = { default?: unknown }
export async function loadExtensions(catalog: Catalog, importModule: (url: string) => Promise<Module> = url => import(/* @vite-ignore */ url)) {
  const plugins: api.Plugin<any>[] = []
  const failures: Diagnostic[] = [...catalog.failures]
  for (const extension of catalog.extensions) {
    const id = extension.manifest.id
    try {
      const module = await importModule(extension.url)
      if (typeof module.default !== 'function') throw Error('Entry must export a default plugin factory')
      const plugin = await module.default(api)
      if (!plugin || plugin.id !== id || typeof plugin.activate !== 'function') throw Error('Plugin identity or activate is invalid')
      plugins.push(plugin)
    } catch (error) { failures.push({ id, error: String(error) }) }
  }
  // Refuse all conflicting providers, rather than let directory order choose a winner.
  const ids = new Map<string, number>(), providers = new Map<object, number>()
  for (const p of plugins) {
    ids.set(p.id, (ids.get(p.id) ?? 0) + 1)
    if (p.provides) providers.set(p.provides, (providers.get(p.provides) ?? 0) + 1)
  }
  return {
    failures,
    plugins: plugins.filter(p => {
      if (ids.get(p.id)! > 1 || (p.provides && providers.get(p.provides)! > 1)) {
        failures.push({ id: p.id, error: 'Duplicate plugin or service provider' })
        return false
      }
      return true
    }),
  }
}
