import type { PluginContext } from '@ordessa/extension-api'

/** The request cards moved into the conversation surface (FC-0028), so this plugin registers no view at all:
 *  a right-region pane would show requests from another session or duplicate answers to the same request. */
export default function createPlugin() {
  return { id: 'ordessa.agent-interactions', autoStart: true, requires: [], activate(_context: PluginContext) {} }
}
