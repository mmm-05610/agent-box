import { Token, type IPlugin } from '@lumino/coreutils'
import type { IDisposable } from '@lumino/disposable'
import type { ComponentType } from 'react'
import { Contributions } from './contributions'

export class OwnedResources {
  private items: IDisposable[] = []
  isDisposed = false
  add<T extends IDisposable>(item: T): T {
    if (this.isDisposed) {
      item.dispose()
      throw Error('Resource scope is closed')
    }
    this.items.push(item)
    return item
  }
  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    const errors: unknown[] = []
    for (const item of this.items.splice(0).reverse()) {
      try { item.dispose() } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new AggregateError(errors, 'Extension cleanup failed')
  }
}
export interface Page { id: string; title: string; component: ComponentType }
// Host is private to product composition; plugins receive the narrower context.
export interface Host { pages: Contributions<Page> }
export interface PluginContext {
  readonly pages: { add(page: Page): IDisposable }
  readonly resources: { add<T extends IDisposable>(item: T): T }
}
export type Plugin<T = unknown> = IPlugin<PluginContext, T>
/** Convenience only: ownership/rollback is enforced by the runtime for ALL plugins. */
export function scoped<T>(definition: Omit<Plugin<T>, 'activate'> & {
  activate: (host: PluginContext, owned: PluginContext['resources'], ...services: any[]) => T | Promise<T>
}): Plugin<T> {
  return { ...definition, activate: (host, ...services) => definition.activate(host, host.resources, ...services) }
}
export { Token, Contributions }
export const HOST_API_VERSION = '1'
