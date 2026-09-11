/**
 * Guards the bug class the megafile decomposition left behind: a function moved
 * out of `main.ts` while a same-named local stub was left in its place, so the
 * caller silently calls itself.
 *
 * The concrete instance this was written for: `main.ts` declared
 *
 *     function getBootstrapState() { return getBootstrapState() }
 *
 * while `composition/bootstrap-env-composition.ts` exported the real one. The
 * `hermes:bootstrap:get` IPC handler was handed the local function, so the
 * renderer's bootstrap-state recovery — the thing that lets a devtools reload
 * pick up the current snapshot instead of a blank state — died on a stack
 * overflow, and nothing in the suite noticed, because every test tests the real
 * implementation and nothing exercised the wiring.
 *
 * Why a source scan, against the repository rule that tests must not read source:
 * the defect is *wiring*, and `main.ts` cannot be imported without booting
 * Electron. The rule's remedy — extract the logic into a pure function and call
 * it — is exactly what is unavailable here, because the pure functions already
 * exist and are already tested; the untested part is which one is wired. The scan
 * is deliberately general (any shadowing self-call in any main-process module)
 * rather than a regex for one function name, and it is a static invariant with no
 * data snapshot in it. Replacing it with behavioural coverage requires an
 * Electron-harness test for IPC wiring, which is the honest follow-up.
 */
import assert from 'node:assert/strict'

import { test } from 'vitest'

import { mainProcessFiles } from './test-main-process-sources'

const DECL = /^(?:async )?function ([A-Za-z0-9_]+)\s*\(/gm
const EXPORT_DECL = /^export (?:async )?(?:function|const|let|class) ([A-Za-z0-9_]+)\b/gm

/** Every name any main-process module exports, and where. */
function exportedNames() {
  const owners = new Map<string, string[]>()

  for (const { name, text } of mainProcessFiles()) {
    for (const match of text.matchAll(EXPORT_DECL)) {
      owners.set(match[1], [...(owners.get(match[1]) || []), name])
    }
  }

  return owners
}

/** The body of each top-level `function NAME(...)` declaration in a module. */
function declaredFunctions(text: string) {
  const out: { body: string; name: string }[] = []

  for (const match of text.matchAll(DECL)) {
    const start = match.index + match[0].length
    const open = text.indexOf('{', start)

    if (open === -1) {
      continue
    }

    let depth = 0
    let i = open

    for (; i < text.length; i += 1) {
      if (text[i] === '{') {
        depth += 1
      } else if (text[i] === '}') {
        depth -= 1

        if (depth === 0) {
          break
        }
      }
    }

    out.push({ body: text.slice(open + 1, i), name: match[1] })
  }

  return out
}

test('no main-process module shadows an exported name with a self-recursive stub', () => {
  const owners = exportedNames()
  const offenders: string[] = []

  for (const { name: file, text } of mainProcessFiles()) {
    for (const declared of declaredFunctions(text)) {
      // Only names that another module also exports are shadowing hazards: a
      // private helper calling itself is a bug, not this bug.
      if (!owners.has(declared.name)) {
        continue
      }

      const normalized = declared.body.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim()
      const selfCall = /^return [A-Za-z0-9_]+\(\);?$/.exec(normalized)

      if (selfCall) {
        offenders.push(`${file}: ${declared.name}() returns ${selfCall[0]} (also exported by ${owners.get(declared.name)})`)
      }
    }
  }

  assert.deepEqual(offenders, [], `shadowing self-recursive stubs found:\n${offenders.join('\n')}`)
})

test('the bootstrap-state IPC handler reaches a real implementation, not a stub', () => {
  // The handler lives in an IPC registrar; the value it hands over must come
  // from a module that actually holds bootstrap state.
  const files = mainProcessFiles()
  const registrar = files.find(f => f.text.includes("ipcMain.handle('hermes:bootstrap:get'"))

  assert.ok(registrar, 'the bootstrap-state handler must exist')

  const holders = files.filter(f => /bootstrapState\s*=/.test(f.text) && f.name !== registrar.name)

  assert.ok(holders.length > 0, 'some module must own the bootstrap state the handler returns')
})
