/**
 * The credential entry path, end to end through the main process.
 *
 * These cases use a fake `fetch` and a temp records file, so no Server, no
 * socket and no real secret is involved. What they pin is the behaviour the
 * interface depends on: the Server's id is what gets recorded, the source file
 * does not survive the call (success or failure), a refusal is reported with the
 * Server's own code, and nothing else is fetchable through this route.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, test, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: unknown) => {
      handlers.set(channel, handler as never)
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel)
    }
  }
}))

import { registerAgentBoxCredentialsIpc } from './agentbox-credentials-ipc'

const handlers = new Map<string, (event: unknown, request?: unknown) => Promise<unknown>>()
const created: string[] = []

function recordsPath(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-cred-ipc-'))

  created.push(root)

  return path.join(root, 'credentials.json')
}

function connection(endpoint = 'http://127.0.0.1:8732') {
  return { endpoint, sessionToken: 'fixture-session-token-not-a-credential' }
}

afterEach(() => {
  handlers.clear()

  while (created.length > 0) {
    fs.rmSync(created.pop() as string, { force: true, recursive: true })
  }
})

test('a successful add records the Server id, the label and the kind', async () => {
  const file = recordsPath()
  const bodies: unknown[] = []

  const fetchImpl = (async (url: string, init: { body: string }) => {
    bodies.push({ init, url })

    return {
      json: async () => ({ credentialId: 'credential_' + 'a'.repeat(32), kind: 'api-key' }),
      ok: true,
      status: 201
    }
  }) as unknown as typeof fetch

  registerAgentBoxCredentialsIpc({ connection, fetchImpl, recordsPath: file })

  const outcome = await handlers.get('agentbox:credentials:add')?.(null, {
    kind: 'api-key',
    label: 'DeepSeek official',
    secret: 'the-secret-the-user-typed'
  })

  assert.deepEqual(outcome, {
    ok: true,
    record: { credentialId: 'credential_' + 'a'.repeat(32), kind: 'api-key', label: 'DeepSeek official' }
  })

  // The body carried a path, never the secret.
  const sent = JSON.parse((bodies[0] as { init: { body: string } }).init.body) as Record<string, unknown>
  assert.equal(typeof sent.source_path, 'string')
  assert.equal(sent.source_path, sent.confirm_source_path)
  assert.equal(JSON.stringify(sent).includes('the-secret-the-user-typed'), false)

  // The source file is gone, and the record is what persists.
  assert.equal(fs.existsSync(sent.source_path as string), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).credentials, [
    { credentialId: 'credential_' + 'a'.repeat(32), kind: 'api-key', label: 'DeepSeek official' }
  ])
})

test('the records file is what the listing reads, and adding twice keeps both', async () => {
  const file = recordsPath()
  let counter = 0

  const fetchImpl = (async () => ({
    json: async () => ({ credentialId: `credential_${String(counter++).padStart(32, '0')}` }),
    ok: true,
    status: 201
  })) as unknown as typeof fetch

  registerAgentBoxCredentialsIpc({ connection, fetchImpl, recordsPath: file })
  const add = handlers.get('agentbox:credentials:add')

  await add?.(null, { kind: 'api-key', label: 'first', secret: 'one' })
  await add?.(null, { kind: 'api-key', label: 'second', secret: 'two' })

  const listed = await handlers.get('agentbox:credentials:list')?.(null)

  assert.deepEqual(
    (listed as { label: string }[]).map(record => record.label),
    ['first', 'second']
  )
})

test('a refusal is reported with the Server code and leaves no record', async () => {
  const file = recordsPath()

  const fetchImpl = (async () => ({
    json: async () => ({ error: { code: 'CREDENTIAL_SOURCE_UNREADABLE', message: 'nope' } }),
    ok: false,
    status: 422
  })) as unknown as typeof fetch

  registerAgentBoxCredentialsIpc({ connection, fetchImpl, recordsPath: file })

  const outcome = await handlers.get('agentbox:credentials:add')?.(null, {
    kind: 'api-key',
    label: 'refused',
    secret: 'value'
  })

  assert.deepEqual(outcome, { ok: false, code: 'CREDENTIAL_SOURCE_UNREADABLE', message: 'nope' })
  assert.equal(fs.existsSync(file), false)
})

test('the source file is removed even when the request throws', async () => {
  const file = recordsPath()
  const seen: string[] = []

  const fetchImpl = (async (_url: string, init: { body: string }) => {
    seen.push(JSON.parse(init.body).source_path as string)
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch

  registerAgentBoxCredentialsIpc({ connection, fetchImpl, recordsPath: file })

  const outcome = await handlers.get('agentbox:credentials:add')?.(null, {
    kind: 'api-key',
    label: 'offline',
    secret: 'value'
  })

  assert.deepEqual(outcome, {
    ok: false,
    code: 'CREDENTIAL_IMPORT_FAILED',
    message: 'the credential could not be imported'
  })
  assert.equal(seen.length, 1)
  assert.equal(fs.existsSync(seen[0]), false)
})

test('a malformed request or an unusable endpoint never writes and never fetches', async () => {
  const file = recordsPath()
  let fetches = 0

  const fetchImpl = (async () => {
    fetches += 1

    return { json: async () => ({}), ok: true, status: 201 }
  }) as unknown as typeof fetch

  registerAgentBoxCredentialsIpc({ connection, fetchImpl, recordsPath: file })
  const add = handlers.get('agentbox:credentials:add')

  assert.deepEqual(await add?.(null, { kind: 'api-key', label: '', secret: 'x' }), {
    ok: false,
    code: 'CREDENTIAL_REQUEST_INVALID',
    message: 'the credential request is malformed'
  })
  assert.equal(fetches, 0)

  registerAgentBoxCredentialsIpc({ connection: () => null, fetchImpl, recordsPath: file })

  assert.deepEqual(await handlers.get('agentbox:credentials:add')?.(null, {
    kind: 'api-key', label: 'no service', secret: 'x'
  }), { ok: false, code: 'UNAVAILABLE', message: 'AgentBox service is unavailable' })
  assert.equal(fetches, 0)

  // A non-loopback endpoint is refused by the same policy the wire uses.
  registerAgentBoxCredentialsIpc({
    connection: () => connection('http://10.0.0.5:8732'), fetchImpl, recordsPath: file
  })

  assert.deepEqual(await handlers.get('agentbox:credentials:add')?.(null, {
    kind: 'api-key', label: 'remote', secret: 'x'
  }), { ok: false, code: 'CREDENTIAL_ENDPOINT_REJECTED', message: 'the service endpoint is not usable' })
  assert.equal(fetches, 0)
})
