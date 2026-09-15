/**
 * workcore/agentbox-server-connection.test.ts
 *
 * The lifecycle connection is the only thing that can turn the AgentBox
 * Desktop's wire from "no service" into a live one, so what matters here is
 * everything it *refuses* to do:
 *
 * - it does not invent a connection when no root is configured;
 * - it does not create a data root the Server has not created;
 * - it does not accept a token the Server did not mint (missing, empty, short);
 * - it does not accept a port that is not a port;
 * - and it never installs anything the transports' loopback policy would then
 *   reject.
 *
 * The token is a fixture value, never a real credential: these tests read a
 * temp-file pair, not a data root.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, test } from 'vitest'

import {
  type AgentBoxServerConnection,
  agentBoxServerEndpoint,
  DEFAULT_AGENTBOX_SERVER_PORT,
  installAgentBoxServerConnection,
  readAgentBoxServerToken,
  resolveAgentBoxServerPort,
  resolveAgentBoxServerRoot
} from './agentbox-server-connection'

const FIXTURE_TOKEN = 'fixture-token-not-a-credential-0123456789abcdef'

const created: string[] = []

function dataRootWithToken(token: null | string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-workcore-test-'))
  created.push(root)

  if (token !== null) {
    fs.mkdirSync(path.join(root, 'secrets'))
    fs.writeFileSync(path.join(root, 'secrets', 'http-token'), `${token}\n`)
  }

  return root
}

function recordingSlot() {
  const installed: AgentBoxServerConnection[] = []

  return {
    installed,
    slot: {
      install(next: AgentBoxServerConnection | null) {
        const previous = installed.length === 0 ? null : installed[installed.length - 1]

        if (next) {
          installed.push(next)
        }

        return previous
      }
    }
  }
}

afterEach(() => {
  while (created.length > 0) {
    fs.rmSync(created.pop() as string, { force: true, recursive: true })
  }
})

test('an unset root is no service, not an empty one', () => {
  const { installed, slot } = recordingSlot()
  const result = installAgentBoxServerConnection({ env: {}, root: null, slot })

  assert.deepEqual(result, { endpoint: null, reason: 'root_unset' })
  assert.deepEqual(installed, [])
  assert.equal(resolveAgentBoxServerRoot({}), null)
})

test('a configured root is only resolved, never created', () => {
  const missing = path.join(os.tmpdir(), 'agentbox-workcore-absent-root')

  assert.equal(fs.existsSync(missing), false)
  assert.equal(resolveAgentBoxServerRoot({ AGENTBOX_SERVER_ROOT: missing }), missing)
  assert.equal(fs.existsSync(missing), false, 'resolution must not have side effects')
})

test('the token has to be the Server-s own, long enough to be one', () => {
  const good = dataRootWithToken(FIXTURE_TOKEN)
  const short = dataRootWithToken('too-short')
  const empty = dataRootWithToken('')

  assert.equal(readAgentBoxServerToken(good), FIXTURE_TOKEN)
  assert.equal(readAgentBoxServerToken(short), null)
  assert.equal(readAgentBoxServerToken(empty), null)
  assert.equal(readAgentBoxServerToken(dataRootWithToken(null)), null)
})

test('a port that is not a port is refused, including by default', () => {
  assert.equal(resolveAgentBoxServerPort({}), DEFAULT_AGENTBOX_SERVER_PORT)
  assert.equal(resolveAgentBoxServerPort({ AGENTBOX_SERVER_PORT: '18747' }), 18747)
  assert.equal(resolveAgentBoxServerPort({ AGENTBOX_SERVER_PORT: '0' }), null)
  assert.equal(resolveAgentBoxServerPort({ AGENTBOX_SERVER_PORT: '65536' }), null)
  assert.equal(resolveAgentBoxServerPort({ AGENTBOX_SERVER_PORT: 'eight' }), null)
  assert.equal(resolveAgentBoxServerPort({ AGENTBOX_SERVER_PORT: '12.5' }), null)
  assert.equal(agentBoxServerEndpoint(0), null)
  assert.equal(agentBoxServerEndpoint(8732), 'http://127.0.0.1:8732')
})

test('a complete pair installs exactly one loopback connection', () => {
  const root = dataRootWithToken(FIXTURE_TOKEN)
  const { installed, slot } = recordingSlot()

  const result = installAgentBoxServerConnection({
    env: { AGENTBOX_SERVER_PORT: '18747', AGENTBOX_SERVER_ROOT: root },
    slot
  })

  assert.deepEqual(result, { endpoint: 'http://127.0.0.1:18747', reason: null })
  assert.equal(installed.length, 1)
  assert.equal(installed[0].endpoint, 'http://127.0.0.1:18747')
  assert.equal(installed[0].sessionToken, FIXTURE_TOKEN)
})

test('an unreadable token leaves the slot empty and says so', () => {
  const { installed, slot } = recordingSlot()

  const result = installAgentBoxServerConnection({
    env: { AGENTBOX_SERVER_ROOT: dataRootWithToken(null) },
    slot
  })

  assert.deepEqual(result, { endpoint: null, reason: 'token_unavailable' })
  assert.deepEqual(installed, [])
})
