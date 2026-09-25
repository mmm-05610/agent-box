// Scoped Node customization hooks: in vitest's jsdom (vite "client") environment a computed
// `import(fileUrl)` is rewritten to the vite dev-server URL (http://localhost:…/…entry.ts) and
// then handed to the native loader. These hooks map ONLY such requests back to the real files —
// (1) http URLs whose path ends in .ts under the product tree → the same file on disk,
// (2) extensionless relative imports inside the connector/contract chain → .ts,
// (3) the same `@extensions/...` contract aliases the product's vite configs use, and
// (4) .ts sources of that chain transpiled with esbuild. Everything else passes through
// untouched. The seam still executes the production module against the production contracts;
// nothing is re-implemented or stubbed.
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { transformSync } from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SRC_DIR = path.join(ROOT, 'plugins/connectors/acp/src/')
// Exactly the aliases declared in apps/desktop/vitest.config.ts and tests/acp-connector/vitest.config.ts.
const ALIASES = new Map([
  ['@extensions/ordessa.contracts/contract.js', path.join(ROOT, 'contracts/foundation/src/contract.ts')],
  ['@extensions/ordessa.agent-contracts/contract.js', path.join(ROOT, 'contracts/agent-ui/src/contract.ts')],
])
// The TypeScript roots the native loader may meet inside the connector chain (production sources only).
const TS_DIRS = [SRC_DIR, path.join(ROOT, 'contracts/'), path.join(ROOT, 'platform/extension-api/')]
const tsTree = file => TS_DIRS.some(dir => file.startsWith(dir))

export async function resolve(specifier, context, nextResolve) {
  if (/^https?:/.test(specifier)) {
    const pathname = new URL(specifier).pathname.replace(/^\/@fs(?=\/)/, '')
    const file = fileURLToPath(`file://${pathname}`)
    if (file.endsWith('.ts') && existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true }
    return nextResolve(specifier, context)
  }
  if (specifier.endsWith('.ts') && path.isAbsolute(specifier))
    return { url: pathToFileURL(specifier).href, shortCircuit: true }
  const alias = ALIASES.get(specifier)
  if (alias) return { url: pathToFileURL(alias).href, shortCircuit: true }
  const parentFile = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : undefined
  if (specifier.startsWith('.') && parentFile && tsTree(parentFile)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL))
    if (!existsSync(base) && existsSync(`${base}.ts`))
      return { url: pathToFileURL(`${base}.ts`).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts') && tsTree(fileURLToPath(url)))
    return { format: 'module', shortCircuit: true, source: transformSync(await readFile(fileURLToPath(url), 'utf8'), { loader: 'ts', format: 'esm' }).code }
  return nextLoad(url, context)
}
