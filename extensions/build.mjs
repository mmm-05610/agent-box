import { build } from 'esbuild'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'extensions/dist')
await mkdir(output, { recursive: true })
// Native entries run in Electron main; the Pi package stays external so the
// installed @earendil-works/pi-coding-agent resolves from root node_modules.
const natives = {
  'ordessa.agent-codex': [],
  'ordessa.agent-pi': ['@earendil-works/pi-coding-agent'],
}
for (const [id, folder, files] of [
  ['ordessa.contracts', 'contracts/foundation', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['ordessa.agent-contracts', 'contracts/agent-ui', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['ordessa.commands', 'plugins/commands', { entry: 'entry.ts' }],
  ['ordessa.agent-connections', 'plugins/connections/service', { entry: 'entry.ts' }],
  ['ordessa.agent-sessions', 'plugins/agent/sessions', { entry: 'entry.ts' }],
  ['ordessa.agent-codex', 'plugins/connectors/codex', { entry: 'entry.ts' }],
  ['ordessa.agent-pi', 'plugins/connectors/pi', { entry: 'entry.ts' }],
  ['ordessa.agent-conversation', 'plugins/agent/conversation', { entry: 'entry.tsx' }],
  ['ordessa.agent-interactions', 'plugins/agent/interactions', { entry: 'entry.tsx' }],
  ['ordessa.workbench', 'plugins/workbench', { entry: 'entry.tsx' }],
  ['ordessa.settings', 'plugins/settings', { entry: 'entry.tsx' }],
]) {
  const target = path.join(output, 'extensions', id)
  await mkdir(target, { recursive: true })
  await build({ entryPoints: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, path.join(root, folder, 'src', file)])),
    outdir: target, bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@ordessa/extension-api', '@extensions/*'],
  })
  if (natives[id]) await build({
    entryPoints: [path.join(root, folder, 'src/native.ts')], outfile: path.join(target, 'native.js'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', external: natives[id],
  })
  await writeFile(path.join(target, 'manifest.json'), JSON.stringify({ id, version: '0.1.0', hostApi: '2', entry: 'entry.js',
    ...(natives[id] ? { native: 'native.js' } : {}) }))
  if (id === 'ordessa.workbench') await copyFile(path.join(root, 'node_modules/react-resizable-panels/LICENSE.md'), path.join(target, 'react-resizable-panels-LICENSE.md'))
  if (id === 'ordessa.agent-conversation') await copyFile(path.join(root, 'node_modules/@assistant-ui/react/LICENSE'), path.join(target, 'assistant-ui-LICENSE'))
}
await copyFile(path.join(root, 'extensions/product.json'), path.join(output, 'extensions.json'))
