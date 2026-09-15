/**
 * workcore/agentbox-credentials.test.ts
 *
 * The credential records are a *reference* list: what matters is that the
 * renderer can never be handed a secret through them, and that a record the
 * Desktop cannot vouch for is dropped rather than repaired.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, test } from 'vitest'

import {
  agentBoxCredentialIds,
  listAgentBoxCredentials,
  parseAgentBoxCredentials
} from './agentbox-credentials'

const FIXTURE_ID = 'credential_0123456789abcdef0123456789abcdef'
const created: string[] = []

function recordsFile(content: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-credentials-test-'))

  created.push(root)

  const file = path.join(root, 'credentials.json')

  fs.writeFileSync(file, content)

  return file
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop() as string, { force: true, recursive: true })
  }
})

test('a well-formed document yields id, label and kind - and nothing else', () => {
  const records = parseAgentBoxCredentials(
    JSON.stringify({ credentials: [{ credentialId: FIXTURE_ID, kind: 'api-key', label: 'DeepSeek official' }] })
  )

  assert.deepEqual(records, [{ credentialId: FIXTURE_ID, kind: 'api-key', label: 'DeepSeek official' }])
  // The record shape is the whole surface: a document carrying anything else -
  // a secret, a path - must not reach the caller through it.
  assert.deepEqual(Object.keys(records[0]), ['credentialId', 'kind', 'label'])
})

test('bad entries are dropped, not repaired', () => {
  const records = parseAgentBoxCredentials(
    JSON.stringify({
      credentials: [
        { credentialId: 'cred-1', kind: 'api-key' },
        { credentialId: FIXTURE_ID, kind: '' },
        { credentialId: FIXTURE_ID.toUpperCase(), kind: 'api-key' },
        { label: 'no id' },
        { credentialId: FIXTURE_ID, kind: 'api-key', label: 'x'.repeat(65) },
        { credentialId: FIXTURE_ID, kind: 'api-key', label: 'kept' }
      ]
    })
  )

  assert.deepEqual(records, [{ credentialId: FIXTURE_ID, kind: 'api-key', label: 'kept' }])
})

test('a document that is not a document is no credentials at all', () => {
  assert.deepEqual(parseAgentBoxCredentials('not json'), [])
  assert.deepEqual(parseAgentBoxCredentials('{}'), [])
  assert.deepEqual(parseAgentBoxCredentials('{"credentials": {}}'), [])
})

test('one id is never listed twice', () => {
  const entry = { credentialId: FIXTURE_ID, kind: 'api-key', label: 'first' }
  const records = parseAgentBoxCredentials(
    JSON.stringify({ credentials: [entry, { ...entry, label: 'second' }] })
  )

  assert.deepEqual(records.map(record => record.label), ['first'])
})

test('an unset, missing or unreadable file is an empty list, never an error', () => {
  assert.deepEqual(listAgentBoxCredentials({}), [])
  assert.deepEqual(listAgentBoxCredentials({ AGENTBOX_CREDENTIALS: '' }), [])
  assert.deepEqual(
    listAgentBoxCredentials({ AGENTBOX_CREDENTIALS: path.join(os.tmpdir(), 'agentbox-absent.json') }),
    []
  )
  assert.deepEqual(
    listAgentBoxCredentials({}, { readFile: () => { throw new Error('EACCES') } }),
    []
  )
})

test('the file the Desktop owns is the source, and its ids are the attachable set', () => {
  const file = recordsFile(JSON.stringify({ credentials: [{ credentialId: FIXTURE_ID, kind: 'api-key' }] }))
  const records = listAgentBoxCredentials({ AGENTBOX_CREDENTIALS: file })

  assert.equal(records.length, 1)
  assert.deepEqual([...agentBoxCredentialIds(records)], [FIXTURE_ID])
  assert.equal(agentBoxCredentialIds(records).has('credential_' + 'f'.repeat(32)), false)
})
