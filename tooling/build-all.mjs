import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { outputRoot } from './build-extension.mjs'
const repoRoot = path.resolve(import.meta.dirname, '..')
const run = promisify(execFile)

const packageDirs = []
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'dist' || entry.name === 'node_modules') continue
    const child = path.join(dir, entry.name)
    try {
      const { ordessa } = JSON.parse(await readFile(path.join(child, 'package.json'), 'utf8'))
      if (ordessa?.id) packageDirs.push(child)
    } catch {}
    await scan(child)
  }
}
for (const root of ['contracts', 'plugins']) await scan(path.join(repoRoot, root))
packageDirs.sort()
for (const dir of packageDirs) await run(process.execPath, [path.join(dir, 'build.mjs')], { cwd: repoRoot, stdio: 'inherit' })

await cp(path.join(repoRoot, 'products/agent-desktop/extensions.json'), path.join(outputRoot, 'extensions.json'))

// Delivery-reconciliation lock: not read at runtime; the only enabled list stays extensions.json.
const { stdout: baseOut } = await run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
const files = {}
async function digest(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { await digest(path.join(dir, entry.name)); continue }
    const file = path.join(dir, entry.name)
    const hash = createHash('sha256').update(await readFile(file)).digest('hex')
    files[path.relative(outputRoot, file).split(path.sep).join('/')] = hash
  }
}
await digest(path.join(outputRoot, 'extensions'))
const lock = { base: baseOut.trim(), files }
await mkdir(path.dirname(path.join(repoRoot, 'products/agent-desktop/extensions.lock.json')), { recursive: true })
await writeFile(path.join(repoRoot, 'products/agent-desktop/extensions.lock.json'), JSON.stringify(lock, null, 2) + '\n')
console.log('Built ' + packageDirs.length + ' extensions into products/agent-desktop/dist; host was not rebuilt.')
