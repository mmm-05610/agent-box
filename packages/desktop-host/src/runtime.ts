import { PluginRegistry } from '@lumino/coreutils'
import { Contributions, type Host, type Page, type Plugin } from '@ordessa/extension-api'
export { scoped, OwnedResources } from '@ordessa/extension-api'
export type { Host, Page, Plugin } from '@ordessa/extension-api'
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
  const failures: { id: string; error: string }[] = [];
  for (const plugin of plugins) {
    try { registry.registerPlugin(plugin); }
    catch (error) { failures.push({ id: plugin.id, error: String(error) }); }
  }
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
