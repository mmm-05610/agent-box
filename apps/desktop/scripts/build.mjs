import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(path.join(root, 'dist/renderer'), { recursive: true })
await build({ entryPoints: [path.join(root, 'src/main.tsx')], outfile: path.join(root, 'dist/renderer/main.js'), bundle: true, platform: 'browser', format: 'esm', target: 'chrome132', jsx: 'automatic', loader: { '.css': 'css' } })
await writeFile(path.join(root, 'dist/renderer/index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./main.css"><title>Ordessa Desktop</title></head><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>')
await build({ entryPoints: [path.join(root, 'electron/main.ts')], outfile: path.join(root, 'dist/electron-main.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] })
