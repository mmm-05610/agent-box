import { Token, type IPlugin } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import type { ComponentType } from 'react';
import { Contributions } from './contributions';

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
export { Token, Contributions };
export const HOST_API_VERSION = '1';
