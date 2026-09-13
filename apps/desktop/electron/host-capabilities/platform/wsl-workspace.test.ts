import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  buildConnectArgv,
  buildListArgv,
  classifyWslProbeFailure,
  createWslWorkspaceHost,
  joinLinuxPath,
  normalizeLinuxDirectoryPath,
  parentOfLinuxPath,
  parseConnectProbe,
  parseDirectoryListing,
  parseWslListVerbose,
  resolveWslExecutable,
  stripWslOutputNuls,
  type WslWorkspaceRecord
} from './wsl-workspace'
import { normalizeWorkspaceStoreFile } from './wsl-workspace-store'

function isListArgv(argv: string[]): boolean {
  return argv.includes('/bin/sh') && String(argv[argv.indexOf('-c') + 1] || '').startsWith('LC_ALL=C exec ls')
}

// --- pure helpers -----------------------------------------------------------

test('stripWslOutputNuls removes UTF-16LE NUL padding', () => {
  assert.equal(stripWslOutputNuls('U\0b\0u\0n\0t\0u\0'), 'Ubuntu')
})

test('parseWslListVerbose reads the real -l -v table shape', () => {
  const raw = [
    '  NAME            STATE           VERSION',
    '* Ubuntu          Running         2',
    '  docker-desktop  Stopped         2',
    ''
  ].join('\r\n')

  const parsed = parseWslListVerbose(raw)

  assert.deepEqual(parsed, [
    { name: 'Ubuntu', state: 'Running', version: '2', isDefault: true },
    { name: 'docker-desktop', state: 'Stopped', version: '2', isDefault: false }
  ])
})

test('parseWslListVerbose survives NUL padding, a missing VERSION column, and a localized header', () => {
  const nulParsed = parseWslListVerbose('  NAME            STATE\n*\0 \0D\0e\0b\0i\0a\0n\0 \0 \0R\0u\0n\0n\0i\0n\0g\0\n')

  assert.deepEqual(nulParsed, [{ name: 'Debian', state: 'Running', version: null, isDefault: true }])

  const zhParsed = parseWslListVerbose('  名称              状态            版本\n* Ubuntu          Running         2\n')

  assert.deepEqual(zhParsed, [{ name: 'Ubuntu', state: 'Running', version: '2', isDefault: true }])

  const headerless = parseWslListVerbose('* Debian          Running         2\n')

  assert.deepEqual(headerless, [{ name: 'Debian', state: 'Running', version: '2', isDefault: true }])
})

test('parseWslListVerbose keeps distro names with single internal spaces', () => {
  const parsed = parseWslListVerbose('  NAME            STATE           VERSION\n  Arch Linux      Stopped         2\n')

  assert.deepEqual(parsed, [{ name: 'Arch Linux', state: 'Stopped', version: '2', isDefault: false }])
})

test('parseConnectProbe requires a user and an absolute home', () => {
  assert.deepEqual(parseConnectProbe('user=maoqh\nhome=/home/maoqh\n'), { user: 'maoqh', home: '/home/maoqh' })
  assert.equal(parseConnectProbe('user=\nhome=/home/maoqh\n'), null)
  assert.equal(parseConnectProbe('user=maoqh\nhome=home\n'), null)
})

test('parseDirectoryListing keeps only directories and their names', () => {
  const raw = ['agent-box-desktop-next', 'my project/', '数据 目录/', 'README.md', 'link-dir/'].join('\n')

  assert.deepEqual(parseDirectoryListing(raw), ['my project', '数据 目录', 'link-dir'])
})

test('path helpers navigate real Linux trees', () => {
  assert.equal(parentOfLinuxPath('/home/maoqh/projects'), '/home/maoqh')
  assert.equal(parentOfLinuxPath('/home'), '/')
  assert.equal(parentOfLinuxPath('/'), '/')
  assert.equal(joinLinuxPath('/home/maoqh', 'my project'), '/home/maoqh/my project')
})

test('normalizeLinuxDirectoryPath accepts spaces and CJK, resolves . and .., rejects the rest', () => {
  assert.equal(normalizeLinuxDirectoryPath('/home/maoqh/我的 项目/'), '/home/maoqh/我的 项目')
  assert.equal(normalizeLinuxDirectoryPath('/home/maoqh/../maoqh/./proj'), '/home/maoqh/proj')
  assert.equal(normalizeLinuxDirectoryPath('/'), '/')
  assert.equal(normalizeLinuxDirectoryPath('relative/path'), null)
  assert.equal(normalizeLinuxDirectoryPath('/with\0nul'), null)
  assert.equal(normalizeLinuxDirectoryPath(42), null)
})

test('probe failures map onto typed, retryable outcomes', () => {
  assert.equal(classifyWslProbeFailure('There is no distribution with the supplied name.', 'connect').code, 'WSL_UNKNOWN_DISTRIBUTION')
  assert.equal(classifyWslProbeFailure('wsl_e_user_not_found', 'connect').retryable, false)
  assert.equal(classifyWslProbeFailure('The Windows Subsystem for Linux is not installed.', 'discover').code, 'WSL_UNAVAILABLE')
  assert.equal(classifyWslProbeFailure('ls: cannot access ...: No such file or directory', 'list').code, 'WSL_DIRECTORY_NOT_FOUND')
  assert.equal(classifyWslProbeFailure('ls: cannot open ...: Permission denied', 'list').code, 'WSL_DIRECTORY_NO_PERMISSION')
  assert.equal(classifyWslProbeFailure('mystery failure', 'connect').code, 'WSL_CONNECT_FAILED')
  assert.equal(classifyWslProbeFailure('mystery failure', 'list').code, 'WSL_LIST_FAILED')
})

test('resolveWslExecutable is decided by the host facts, not by where tests run', () => {
  assert.equal(resolveWslExecutable({ platform: 'win32', isWsl: false, exists: () => false }), 'wsl.exe')
  assert.equal(resolveWslExecutable({ platform: 'linux', isWsl: true, exists: p => p === '/mnt/c/Windows/System32/wsl.exe' }), '/mnt/c/Windows/System32/wsl.exe')
  assert.equal(resolveWslExecutable({ platform: 'linux', isWsl: true, exists: () => false }), null)
  assert.equal(resolveWslExecutable({ platform: 'darwin', isWsl: false, exists: () => false }), null)
})

test('argv builders keep user input as whole argv elements and never build shell strings', () => {
  assert.deepEqual(buildConnectArgv('Ubuntu', null), ['-d', 'Ubuntu', '--exec', '/bin/sh', '-c', 'printf "user=%s\\nhome=%s\\n" "$(id -un)" "$HOME"'])
  assert.deepEqual(buildConnectArgv('my distro', 'my user'), ['-d', 'my distro', '-u', 'my user', '--exec', '/bin/sh', '-c', 'printf "user=%s\\nhome=%s\\n" "$(id -un)" "$HOME"'])

  const listArgv = buildListArgv('Ubuntu', 'maoqh', '/home/my dir', true)
  const scriptIndex = listArgv.indexOf('-c') + 1

  // The path is the shell's positional parameter — an argv element, never
  // part of the script text.
  assert.equal(listArgv[listArgv.length - 1], '/home/my dir')
  assert.match(listArgv[scriptIndex], /^LC_ALL=C exec ls -1Ap -- "\$1"$/)
  assert.equal(listArgv[scriptIndex + 1], 'ls')

  const plainArgv = buildListArgv('Ubuntu', null, '/opt', false)

  assert.equal(plainArgv[plainArgv.length - 1], '/opt')
  assert.match(plainArgv[plainArgv.indexOf('-c') + 1], /^LC_ALL=C exec ls -1p -- "\$1"$/)
})

// --- service behaviour ------------------------------------------------------

interface StoreState {
  file: { version: number; workspaces: WslWorkspaceRecord[]; savedRequests: Record<string, { workspaceId: string; at: number }> }
  persistCalls: number
}

function createStore(state?: Partial<StoreState>) {
  const store: StoreState = state ?? { file: normalizeWorkspaceStoreFile(null), persistCalls: 0 }

  return {
    state: store,
    load: () => store.file,
    persist: (file: StoreState['file']) => {
      store.file = file
      store.persistCalls += 1
    }
  }
}

interface ExecCall {
  argv: string[]
  options: { timeoutMs: number; maxBuffer: number; signal?: AbortSignal }
}

type ExecScript = (call: ExecCall, index: number) => Promise<{ stdout: string; stderr: string }>

function createHost(options?: {
  exec?: ExecScript
  store?: ReturnType<typeof createStore>
  now?: () => number
}) {
  const calls: ExecCall[] = []
  const store = options?.store ?? createStore()
  let clock = 1_000_000

  const execWsl: ExecScript =
    options?.exec ??
    (async call => {
      const script = call.argv[call.argv.indexOf('-c') + 1]

      if (call.argv.includes('-l')) {
        return { stdout: '* Ubuntu          Running         2\n  Debian          Stopped         2\n', stderr: '' }
      }

      if (script) {
        return { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' }
      }

      if (isListArgv(call.argv)) {
        return { stdout: 'proj/\nmy data/\n', stderr: '' }
      }

      return { stdout: '', stderr: '' }
    })

  const host = createWslWorkspaceHost(
    {
      execWsl: async (argv, opts) => {
        calls.push({ argv, options: opts })

        return await execWsl({ argv, options: opts }, calls.length - 1)
      },
      now: options?.now ?? (() => clock),
      connectionTtlMs: 30 * 60 * 1000
    },
    store
  )

  return { host, calls, store, setClock: (value: number) => (clock = value) }
}

function abortError() {
  const error = new Error('This operation was aborted')
  ;(error as { code?: string }).code = 'ABORT_ERR'

  return error
}

test('discover reports the real distribution list with the default marked', async () => {
  const { host } = createHost()
  const result = await host.discover()

  assert.equal(result.ok, true)

  if (result.ok && result.available) {
    assert.deepEqual(result.distributions.map(d => d.name), ['Ubuntu', 'Debian'])
    assert.equal(result.defaultDistribution, 'Ubuntu')
  }
})

test('connect probes the real user via argv-only wsl invocation', async () => {
  const { host, calls } = createHost({
    exec: async call => {
      assert.ok(call.argv.includes('-d'))
      assert.ok(call.argv.includes('Ubuntu'))

      return { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' }
    }
  })

  const result = await host.connect({ distribution: 'Ubuntu', user: '' })

  assert.equal(result.ok, true)

  if (result.ok) {
    assert.equal(result.userIsDefault, true)
    assert.equal(result.home, '/home/maoqh')
    assert.ok(result.connectionId.startsWith('wsl_conn_'))
  }

  const probeCall = calls.find(call => call.argv.includes('-c'))

  assert.ok(probeCall)
  assert.ok(probeCall.options.timeoutMs > 0)
  assert.ok(probeCall.options.maxBuffer > 0)
})

test('an explicit user is passed as its own argv element', async () => {
  const { host, calls } = createHost({
    exec: async () => ({ stdout: 'user=deploy\nhome=/home/deploy\n', stderr: '' })
  })

  const result = await host.connect({ distribution: 'Ubuntu', user: 'deploy' })

  assert.equal(result.ok, true)

  if (result.ok) {
    assert.equal(result.userIsDefault, false)
  }

  const probeCall = calls.find(call => call.argv.includes('-c'))!

  assert.deepEqual(probeCall.argv.slice(0, 4), ['-d', 'Ubuntu', '-u', 'deploy'])
})

test('a cancelled connect resolves to WSL_CANCELLED', async () => {
  const { host } = createHost({
    exec: async call => {
      await new Promise(resolve => {
        call.options.signal?.addEventListener('abort', () => resolve(null))
      })

      throw abortError()
    }
  })

  const pending = host.connect({ distribution: 'Ubuntu', operationId: 'op-1' })
  const cancelled = await host.cancelOperation({ operationId: 'op-1' })
  const result = await pending

  assert.equal(cancelled.ok, true)

  if (cancelled.ok) {
    assert.equal(cancelled.cancelled, true)
  }

  assert.equal(result.ok, false)

  if (!result.ok) {
    assert.equal(result.code, 'WSL_CANCELLED')
  }
})

test('expired temporary connections refuse to list or save', async () => {
  const { host, setClock } = createHost()

  const connected = await host.connect({ distribution: 'Ubuntu' })

  assert.ok(connected.ok)

  setClock(1_000_000 + 31 * 60 * 1000)

  const listed = await host.listDirectories({ connectionId: connected.ok ? connected.connectionId : '', path: '/home/maoqh' })

  assert.equal(listed.ok, false)

  if (!listed.ok) {
    assert.equal(listed.code, 'WSL_CONNECTION_EXPIRED')
  }

  const saved = await host.saveWorkspace({ connectionId: connected.ok ? connected.connectionId : '', path: '/srv/a', requestId: 'r1' })

  assert.equal(saved.ok, false)

  if (!saved.ok) {
    assert.equal(saved.code, 'WSL_CONNECTION_EXPIRED')
  }
})

test('listDirectories browses the real tree and computes the parent', async () => {
  const { host, calls } = createHost({
    exec: async call => {
      if (isListArgv(call.argv)) {
        assert.equal(call.argv[call.argv.length - 1], '/home/maoqh/my dir')

        return { stdout: 'inner/\n数据/\nfile.txt\n', stderr: '' }
      }

      return { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' }
    }
  })

  const connected = await host.connect({ distribution: 'Ubuntu' })

  assert.ok(connected.ok)

  const listed = await host.listDirectories({
    connectionId: connected.ok ? connected.connectionId : '',
    path: '/home/maoqh/my dir/'
  })

  assert.equal(listed.ok, true)

  if (listed.ok) {
    assert.equal(listed.path, '/home/maoqh/my dir')
    assert.equal(listed.parent, '/home/maoqh')
    assert.deepEqual(listed.entries.map(e => e.name), ['inner', '数据'])
    assert.deepEqual(listed.entries.map(e => e.path), ['/home/maoqh/my dir/inner', '/home/maoqh/my dir/数据'])
  }

  assert.ok(calls.some(call => isListArgv(call.argv)))
})

test('showHidden switches the ls flag', async () => {
  const { host, calls } = createHost({
    exec: async call => (isListArgv(call.argv) ? { stdout: '.hidden/\nvisible/\n', stderr: '' } : { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' })
  })

  const connected = await host.connect({ distribution: 'Ubuntu' })

  assert.ok(connected.ok)

  await host.listDirectories({ connectionId: connected.ok ? connected.connectionId : '', path: '/home', showHidden: true })

  assert.ok(calls.some(call => call.argv.some(a => String(a).includes('-1Ap'))))
})

test('an invalid path is rejected before any process spawns', async () => {
  const { host, calls } = createHost()

  const listed = await host.listDirectories({ connectionId: 'nope', path: 'etc/passwd' })

  assert.equal(listed.ok, false)

  if (!listed.ok) {
    assert.equal(listed.code, 'WSL_INVALID_PATH')
  }

  assert.equal(calls.length, 0)
})

test('saveWorkspace re-verifies the directory, persists once, and is idempotent by request id', async () => {
  const { host, calls, store } = createHost({
    exec: async call => (isListArgv(call.argv) ? { stdout: 'inner/\n', stderr: '' } : { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' })
  })

  const connected = await host.connect({ distribution: 'Ubuntu', user: 'maoqh' })

  assert.ok(connected.ok)

  const connectionId = connected.ok ? connected.connectionId : ''
  const first = await host.saveWorkspace({ connectionId, path: '/home/maoqh/proj', name: 'Proj', requestId: 'req-1' })

  assert.equal(first.ok, true)
  assert.equal(store.state.persistCalls, 1)

  const replay = await host.saveWorkspace({ connectionId, path: '/home/maoqh/proj', name: 'Proj', requestId: 'req-1' })

  assert.equal(replay.ok, true)

  if (replay.ok) {
    assert.equal(replay.requestIdReplay, true)
    assert.equal(replay.workspace.id, first.ok ? first.workspace.id : '')
  }

  assert.equal(store.state.persistCalls, 1, 'a replayed request must not write again')
  assert.equal(store.state.file.workspaces.length, 1)

  const record = store.state.file.workspaces[0]

  assert.equal(record.kind, 'wsl')
  assert.equal(record.distribution, 'Ubuntu')
  assert.equal(record.configuredUser, 'maoqh')
  assert.equal(record.actualUser, 'maoqh')
  assert.equal(record.rootPath, '/home/maoqh/proj')
  assert.ok(calls.filter(call => isListArgv(call.argv)).length >= 1, 'the host verified the directory itself')
})

test('saving the same location again reuses the record instead of duplicating it', async () => {
  const { host, store } = createHost()

  const connected = await host.connect({ distribution: 'Ubuntu' })
  assert.ok(connected.ok)

  const connectionId = connected.ok ? connected.connectionId : ''
  const first = await host.saveWorkspace({ connectionId, path: '/home/maoqh/proj', requestId: 'req-a' })
  const second = await host.saveWorkspace({ connectionId, path: '/home/maoqh/proj', name: 'Renamed', requestId: 'req-b' })

  assert.equal(first.ok && second.ok, true)
  assert.equal(store.state.file.workspaces.length, 1)
  assert.equal(store.state.file.workspaces[0].name, 'Renamed')
})

test('a different user or distribution produces a separate workspace record', async () => {
  const { host, store } = createHost({
    exec: async call => {
      if (call.argv.includes('Debian')) {
        return { stdout: 'user=root\nhome=/root\n', stderr: '' }
      }

      return { stdout: 'user=maoqh\nhome=/home/maoqh\n', stderr: '' }
    }
  })

  const onUbuntu = await host.connect({ distribution: 'Ubuntu' })
  const onDebian = await host.connect({ distribution: 'Debian' })

  assert.ok(onUbuntu.ok && onDebian.ok)

  await host.saveWorkspace({ connectionId: onUbuntu.ok ? onUbuntu.connectionId : '', path: '/srv/a', requestId: 'r1' })
  await host.saveWorkspace({ connectionId: onDebian.ok ? onDebian.connectionId : '', path: '/srv/a', requestId: 'r2' })

  assert.equal(store.state.file.workspaces.length, 2)
})

test('store failure surfaces as a retryable WSL_SAVE_FAILED with nothing half-written', async () => {
  // The fake store mimics a disk file: every load re-reads what was persisted.
  const disk = { written: 0, data: null as string | null }
  const failingStore = {
    state: { file: normalizeWorkspaceStoreFile(null), persistCalls: 0 },
    load: () => normalizeWorkspaceStoreFile(disk.data === null ? null : JSON.parse(disk.data)),
    persist: (file: StoreState['file']) => {
      disk.written += 1
      throw new Error('disk on fire')
    }
  }

  const { host } = createHost({ store: failingStore })

  const connected = await host.connect({ distribution: 'Ubuntu' })
  assert.ok(connected.ok)

  const saved = await host.saveWorkspace({ connectionId: connected.ok ? connected.connectionId : '', path: '/srv/a', requestId: 'r1' })

  assert.equal(saved.ok, false)

  if (!saved.ok) {
    assert.equal(saved.code, 'WSL_SAVE_FAILED')
    assert.equal(saved.retryable, true)
  }

  assert.equal(failingStore.load().workspaces.length, 0)
})

test('reconnectWorkspace reports a default-user change instead of silently rebinding', async () => {
  const { host, store } = createHost({
    exec: async call => {
      // Later probes answer with a different default identity.
      if (call.argv.includes('-c')) {
        return { stdout: 'user=other-user\nhome=/home/other-user\n', stderr: '' }
      }

      if (isListArgv(call.argv)) {
        return { stdout: 'inner/\n', stderr: '' }
      }

      return { stdout: '* Ubuntu          Running         2\n', stderr: '' }
    }
  })

  const connected = await host.connect({ distribution: 'Ubuntu' })
  assert.ok(connected.ok)

  // Save while the record keeps the identity the probe originally reported —
  // rewrite it to a stale user to simulate "the distribution's default changed".
  const saved = await host.saveWorkspace({ connectionId: connected.ok ? connected.connectionId : '', path: '/srv/proj', requestId: 'r1' })
  assert.ok(saved.ok)

  const record = store.state.file.workspaces[0]

  record.configuredUser = null
  record.actualUser = 'maoqh'

  const reconnected = await host.reconnectWorkspace({ workspaceId: record.id })

  assert.equal(reconnected.ok, true)

  if (reconnected.ok && reconnected.status === 'connected') {
    assert.equal(reconnected.userChanged, true)
    assert.equal(reconnected.actualUser, 'other-user')
    assert.equal(reconnected.workspace.actualUser, 'maoqh', 'the stored identity is not silently overwritten')
  }
})

test('reconnectWorkspace reports a failed revalidation with its typed code', async () => {
  const { host, store } = createHost({
    exec: async () => {
      const error = new Error('There is no distribution with the supplied name.')

      ;(error as { stderr?: string }).stderr = 'There is no distribution with the supplied name.'

      throw error
    }
  })

  store.state.file.workspaces.push({
    id: 'wsl_ws_x',
    name: 'x',
    kind: 'wsl',
    distribution: 'Vanished',
    configuredUser: null,
    actualUser: 'maoqh',
    rootPath: '/srv/x',
    createdAt: 1,
    updatedAt: 1
  })

  const reconnected = await host.reconnectWorkspace({ workspaceId: 'wsl_ws_x' })

  assert.equal(reconnected.ok, true)

  if (reconnected.ok) {
    assert.equal(reconnected.status, 'failed')
    assert.equal(reconnected.code, 'WSL_UNKNOWN_DISTRIBUTION')
  }
})

test('listWorkspaces is a projection without any online status', async () => {
  const { host, store } = createHost()

  store.state.file.workspaces.push({
    id: 'wsl_ws_x',
    name: 'x',
    kind: 'wsl',
    distribution: 'Ubuntu',
    configuredUser: null,
    actualUser: 'maoqh',
    rootPath: '/srv/x',
    createdAt: 1,
    updatedAt: 1
  })

  const listed = host.listWorkspaces()

  assert.equal(listed.ok, true)

  if (listed.ok) {
    assert.equal(listed.workspaces.length, 1)
    assert.ok(!('online' in listed.workspaces[0]))
    assert.ok(!('status' in listed.workspaces[0]))
  }
})

test('normalizeWorkspaceStoreFile repairs shape damage and rejects future versions', () => {
  const repaired = normalizeWorkspaceStoreFile({
    version: 1,
    workspaces: [
      { id: 'wsl_ws_x', name: 'x', distribution: 'Ubuntu', configuredUser: 'u', actualUser: 'u', rootPath: '/srv/x', createdAt: 1, updatedAt: 1 },
      { garbage: true },
      null,
      { id: 'no-root-path', distribution: 'Ubuntu' }
    ],
    savedRequests: { r1: { workspaceId: 'wsl_ws_x' }, bad: { workspaceId: 42 } }
  })

  assert.equal(repaired.workspaces.length, 1)
  assert.equal(repaired.savedRequests.r1.workspaceId, 'wsl_ws_x')
  assert.equal('bad' in repaired.savedRequests, false)

  const future = normalizeWorkspaceStoreFile({ version: 99, workspaces: [{ id: 'x', distribution: 'd', rootPath: '/x' }] })

  assert.deepEqual(future, { version: 1, workspaces: [], savedRequests: {} })
})
