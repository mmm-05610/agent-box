import { build } from 'esbuild'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'extensions/dist')
await mkdir(output, { recursive: true })
for (const [id, folder, files] of [
  ['ordessa.contracts', 'packages/foundation-contracts', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['ordessa.commands', 'extensions/commands', { entry: 'entry.ts' }],
  ['ordessa.workbench', 'extensions/workbench', { entry: 'entry.tsx' }],
  ['ordessa.settings', 'extensions/settings', { entry: 'entry.tsx' }],
]) {
  const target = path.join(output, 'extensions', id)
  await mkdir(target, { recursive: true })
  await build({ entryPoints: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, path.join(root, folder, 'src', file)])),
    outdir: target, bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@ordessa/extension-api', '@extensions/*'],
  })
  await writeFile(path.join(target, 'manifest.json'), JSON.stringify({ id, version: '0.1.0', hostApi: '2', entry: 'entry.js' }))
}
await copyFile(path.join(root, 'extensions/product.json'), path.join(output, 'extensions.json'))
