import assert from 'node:assert/strict'

import { test } from 'vitest'

import { stopChildProcess, stopProcessTreesForUpdate } from './child-stop'

function makeChild(overrides: Partial<{ pid: number | null; killed: boolean }> = {}) {
  const calls: string[] = []

  return {
    calls,
    child: {
      kill: (signal: string) => {
        calls.push(signal)
      },
      killed: overrides.killed ?? false,
      pid: 'pid' in overrides ? overrides.pid : 1234
    }
  }
}

test('stopChildProcess tree-kills on Windows when the child has a pid', () => {
  const { child, calls } = makeChild({ pid: 4242 })
  const treeKillCalls: number[] = []

  stopChildProcess(child, {
    forceKillProcessTree: (pid: number) => treeKillCalls.push(pid),
    isWindows: true
  })

  assert.deepEqual(treeKillCalls, [4242])
  assert.deepEqual(calls, [], 'SIGTERM must not be sent when the Windows tree-kill path is taken')
})

test('stopChildProcess group-SIGTERMs on POSIX (negative pgid) when the child has a pid', () => {
  const { child, calls } = makeChild({ pid: 4242 })
  const treeKillCalls: number[] = []
  const groupKills: Array<[number, string]> = []

  stopChildProcess(child, {
    forceKillProcessTree: (pid: number) => treeKillCalls.push(pid),
    isWindows: false,
    killGroup: (pgid, signal) => groupKills.push([pgid, signal])
  })

  assert.deepEqual(groupKills, [[-4242, 'SIGTERM']], 'must signal the whole process group')
  assert.deepEqual(calls, [], 'direct child.kill must not run when the group send succeeds')
  assert.deepEqual(treeKillCalls, [], 'tree-kill must not run off Windows')
})

test('stopChildProcess falls back to direct SIGTERM on POSIX when the group send throws', () => {
  const { child, calls } = makeChild({ pid: 4242 })

  stopChildProcess(child, {
    forceKillProcessTree: () => {},
    isWindows: false,
    killGroup: () => {
      throw new Error('ESRCH: no such process group')
    }
  })

  assert.deepEqual(calls, ['SIGTERM'], 'must fall back to signalling the direct child')
})

test('stopChildProcess falls back to SIGTERM on Windows when the pid is not an integer', () => {
  const { child, calls } = makeChild({ pid: null })
  const treeKillCalls: number[] = []

  stopChildProcess(child, {
    forceKillProcessTree: (pid: number) => treeKillCalls.push(pid),
    isWindows: true
  })

  assert.deepEqual(calls, ['SIGTERM'])
  assert.deepEqual(treeKillCalls, [])
})

test('stopChildProcess is a no-op for an already-killed child', () => {
  const { child, calls } = makeChild({ killed: true })
  const treeKillCalls: number[] = []

  stopChildProcess(child, {
    forceKillProcessTree: (pid: number) => treeKillCalls.push(pid),
    isWindows: true
  })

  assert.deepEqual(calls, [])
  assert.deepEqual(treeKillCalls, [])
})

test('stopChildProcess is a no-op for a null/undefined child', () => {
  const treeKillCalls: number[] = []

  assert.doesNotThrow(() => {
    stopChildProcess(null, { forceKillProcessTree: (pid: number) => treeKillCalls.push(pid), isWindows: true })
    stopChildProcess(undefined, { forceKillProcessTree: (pid: number) => treeKillCalls.push(pid), isWindows: true })
  })
  assert.deepEqual(treeKillCalls, [])
})

test('stopChildProcess swallows errors thrown by the kill strategy', () => {
  const child = {
    kill: () => {
      throw new Error('ESRCH: no such process')
    },
    killed: false,
    pid: 99
  }

  assert.doesNotThrow(() => {
    stopChildProcess(child, {
      forceKillProcessTree: () => {},
      isWindows: false
    })
  })
})

test('Windows update tree-kills captured roots without pre-signalling the primary backend', () => {
  const primary = makeChild({ pid: 101 })
  const pooled = makeChild({ pid: 202 })
  const events: string[] = []

  stopProcessTreesForUpdate(primary.child, {
    forceKillProcessTree: pid => events.push(`tree:${pid}`),
    stopAllPooledChildren: () => {
      events.push('pool-stop')
      // Production stopAllPooledChildren() already tree-kills every pool root.
      events.push(`tree:${pooled.child.pid}`)
    }
  })

  assert.deepEqual(events, ['tree:101', 'pool-stop', 'tree:202'])
  assert.deepEqual(primary.calls, [], 'the primary root must not be signalled before taskkill /T sees it')
  assert.deepEqual(pooled.calls, [])
})
