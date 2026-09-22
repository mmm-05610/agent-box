import { PluginRegistry } from '@lumino/coreutils'
import { Contributions, OwnedResources, type Host, type Page, type Plugin, type PluginContext } from '@ordessa/extension-api'
export { scoped, OwnedResources } from '@ordessa/extension-api'
export type { Host, Page, Plugin } from '@ordessa/extension-api'
export interface PluginState { id: string; phase: 'registered' | 'starting' | 'active' | 'stopped' | 'failed'; error?: string }
export function runtime(plugins: Plugin<any>[]) {
  const providers = new Set(), ids = new Set<string>()
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) throw Error('Duplicate plugin: ' + plugin.id)
    ids.add(plugin.id)
    if (plugin.provides && providers.has(plugin.provides)) throw Error('Duplicate provider: ' + plugin.provides.name)
    if (plugin.provides) providers.add(plugin.provides)
  }
  const host: Host = { pages: new Contributions<Page>() }
  const registry = new PluginRegistry<Host>()
  registry.application = host
  const failures: { id: string; error: string }[] = []
  const states = new Map<string, PluginState>(), listeners = new Set<() => void>()
  let snapshot: PluginState[] = []
  function update(id: string, phase: PluginState['phase'], error?: string) {
    states.set(id, { id, phase, ...(error ? { error } : {}) })
    snapshot = [...states.values()]
    listeners.forEach(listener => listener())
  }
  function failed(id: string, error: unknown) {
    const message = String(error)
    if (!failures.some(f => f.id === id && f.error === message)) failures.push({ id, error: message })
    update(id, 'failed', message)
  }
  for (const plugin of plugins) {
    let owned: OwnedResources | undefined
    let active: { context: PluginContext; services: any[] } | undefined
    const close = () => { const resources = owned; owned = undefined; resources?.dispose() }
    try {
      registry.registerPlugin({
        ...plugin,
        async activate(_host, ...services) {
          update(plugin.id, 'starting')
          const resources = new OwnedResources()
          owned = resources
          const context: PluginContext = Object.freeze({
            pages: Object.freeze({ add(page: Page) {
              if (resources.isDisposed) throw Error('Plugin scope is closed')
              return resources.add(host.pages.add(page))
            } }),
            resources: Object.freeze({ add: resources.add.bind(resources) }),
          })
          active = { context, services }
          try {
            const result = await plugin.activate(context, ...services)
            update(plugin.id, 'active')
            return result
          } catch (error) {
            let cause = error
            try { close() } catch (cleanup) { cause = new AggregateError([error, cleanup], 'Activation and cleanup failed') }
            failed(plugin.id, cause)
            active = undefined
            throw cause
          }
        },
        async deactivate() {
          const errors: unknown[] = []
          const previous = active
          active = undefined
          // Close first: even callbacks during async cleanup cannot register again.
          try { close() } catch (error) { errors.push(error) }
          try { if (previous) await plugin.deactivate?.(previous.context, ...previous.services) } catch (error) { errors.push(error) }
          if (errors.length) {
            const error = new AggregateError(errors, 'Deactivation cleanup failed')
            failed(plugin.id, error)
            throw error
          }
          update(plugin.id, 'stopped')
        },
      })
      update(plugin.id, 'registered')
    } catch (error) { failed(plugin.id, error) }
  }
  async function activate(id: string) {
    if (states.get(id)?.phase !== 'active') update(id, 'starting')
    try { return await registry.activatePlugin(id) }
    catch (error) { failed(id, error); throw error }
  }
  return {
    host, failures, activate,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    deactivate: (id: string) => registry.deactivatePlugin(id),
    async start() {
      // Lumino still resolves real dependencies. Unrelated autoStart plugins start concurrently.
      await Promise.allSettled(plugins.filter(p => p.autoStart === true).map(p => activate(p.id)))
    },
  }
}
