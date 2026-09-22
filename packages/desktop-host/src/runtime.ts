import { PluginRegistry, type IPlugin } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';

export class OwnedResources {
  private items: IDisposable[] = [];
  add<T extends IDisposable>(item: T): T { this.items.push(item); return item; }
  dispose() {
    const errors: unknown[] = [];
    for (const item of this.items.splice(0).reverse()) {
      try { item.dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Extension cleanup failed');
  }
}
import type { ComponentType } from 'react';
import { Contributions } from './contributions';

export interface Page { id: string; title: string; component: ComponentType }
export interface Host { pages: Contributions<Page> }
export type Plugin<T = unknown> = IPlugin<Host, T>;

/** Lifetime for local registrations; returned object remains a standard Lumino plugin. */
export function scoped<T>(definition: Omit<Plugin<T>, 'activate' | 'deactivate'> & {
  activate: (host: Host, owned: OwnedResources, ...services: any[]) => T | Promise<T>;
}): Plugin<T> {
  let owned: OwnedResources | undefined;
  return {
    ...definition,
    async activate(host, ...services) {
      const resources = new OwnedResources();
      try {
        const result = await definition.activate(host, resources, ...services);
        owned = resources;
        return result;
      } catch (error) {
        try { resources.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Activation and cleanup failed'); }
        throw error;
      }
    },
    deactivate() { const resources = owned; owned = undefined; resources?.dispose(); }
  };
}

export function runtime(plugins: Plugin<any>[]) {
  // Lumino permits service replacement. Our explicit manifest rejects accidental replacement.
  const providers = new Set();
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) throw new Error(`Duplicate plugin: ${plugin.id}`);
    ids.add(plugin.id);
    if (plugin.provides && providers.has(plugin.provides)) throw new Error(`Duplicate provider: ${plugin.provides.name}`);
    if (plugin.provides) providers.add(plugin.provides);
  }
  const host: Host = { pages: new Contributions<Page>() };
  const registry = new PluginRegistry<Host>();
  registry.application = host;
  registry.registerPlugins(plugins);
  const failures: { id: string; error: string }[] = [];
  return {
    host, failures,
    activate: (id: string) => registry.activatePlugin(id),
    deactivate: (id: string) => registry.deactivatePlugin(id),
    async start() {
      for (const plugin of plugins.filter(p => p.autoStart === true)) {
        try { await registry.activatePlugin(plugin.id); }
        catch (error) { failures.push({ id: plugin.id, error: String(error) }); }
      }
    }
  };
}
