import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.dirname(fileURLToPath(import.meta.url))
for (const [folder, id, entries] of [
  ['hello-extension', 'example.hello', { entry: 'entry.tsx' }],
  ['service-provider', 'example.provider', { entry: 'entry.ts', contract: 'contract.ts' }],
  ['service-consumer', 'example.consumer', { entry: 'entry.tsx' }],
]) {
  const output = path.join(root, 'dist', id)
  await mkdir(output, { recursive: true })
  await build({
    entryPoints: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, path.join(root, folder, 'src', file)])),
    outdir: output, bundle: true, splitting: true, format: 'esm', platform: 'browser', jsx: 'automatic',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@ordessa/extension-api', '@extensions/*'],
  })
  await copyFile(path.join(root, folder, 'manifest.json'), path.join(output, 'manifest.json'))
}
console.log('Built standalone examples into examples/dist; host was not rebuilt.')
