import type { PluginContext, ResourceScope } from '@ordessa/extension-api'
import { CommandsToken, type Commands, type Command } from '@extensions/ordessa.contracts/contract.js'
import { registry } from '../shared/registry'
export function createCommands(lifetime: ResourceScope): Commands {
  const commands = registry<Command>(lifetime)
  return {
    getSnapshot: commands.getSnapshot, subscribe: commands.subscribe,
    forScope: scope => ({ add: command => commands.add(scope, command) }),
    async execute(id) {
      const command = commands.getSnapshot().find(c => c.id === id)
      if (!command || lifetime.isDisposed) return { ok: false, error: `Command unavailable: ${id}` }
      try { return { ok: true, value: await command.execute() } }
      catch (error) { return { ok: false, error: String(error) } }
    },
  }
}
export default function createPlugin() {
  return { id: 'ordessa.commands', provides: CommandsToken, activate: (context: PluginContext) => createCommands(context.resources) }
}
