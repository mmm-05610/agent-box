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
  ['ordessa.contracts', 'packages/foundation-contracts', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['ordessa.agent-contracts', 'packages/agent-ui-contracts', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['ordessa.commands', 'extensions/commands', { entry: 'entry.ts' }],
  ['ordessa.agent-connections', 'extensions/agent-connections', { entry: 'entry.ts' }],
  ['ordessa.agent-sessions', 'extensions/agent-sessions', { entry: 'entry.ts' }],
  ['ordessa.agent-codex', 'extensions/agent-codex', { entry: 'entry.ts' }],
  ['ordessa.agent-pi', 'extensions/agent-pi', { entry: 'entry.ts' }],
  ['ordessa.agent-conversation', 'extensions/agent-conversation', { entry: 'entry.tsx' }],
  ['ordessa.agent-interactions', 'extensions/agent-interactions', { entry: 'entry.tsx' }],
  ['ordessa.workbench', 'extensions/workbench', { entry: 'entry.tsx' }],
  ['ordessa.settings', 'extensions/settings', { entry: 'entry.tsx' }],
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
