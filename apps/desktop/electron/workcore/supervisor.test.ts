import assert from 'node:assert/strict'

import { describe, expect, test } from 'vitest'

import type {
  WorkCoreArtifact,
  WorkCoreConnectionHandle,
  WorkCoreLaunchPlan,
  WorkCoreLifecycle,
  WorkCoreProcess
} from './lifecycle'
import { createWorkCoreSupervisor } from './supervisor'

const artifact: WorkCoreArtifact = { args: [], command: 'injected', label: 'test artifact' }
const plan: WorkCoreLaunchPlan = { artifact, readinessLinePattern: /^ready$/, readinessTimeoutMs: 100 }
const handle: WorkCoreConnectionHandle = { endpoint: 'opaque-endpoint', transport: 'opaque' }

function lifecycle(overrides: Partial<WorkCoreLifecycle> = {}): WorkCoreLifecycle {
  const process_: WorkCoreProcess = { id: 'process-1', pid: 42 }

  return {
    connectionHandle: () => null,
    launch: async () => process_,
    readiness: async () => handle,
    resolve: async () => artifact,
    restart: async () => process_,
    shutdown: async () => undefined,
    ...overrides
  }
}

describe('WorkCore supervisor', () => {
  test('single-flights start and returns the same handle once ready', async () => {
    let resolveReadiness: (value: WorkCoreConnectionHandle) => void = () => undefined

    const readiness = new Promise<WorkCoreConnectionHandle>(resolve => {
      resolveReadiness = resolve
    })

    let resolves = 0
    let launches = 0

    const instance = lifecycle({
      resolve: async () => {
        resolves += 1

        return artifact
      },
      launch: async () => {
        launches += 1

        return { id: 'p', pid: 1 }
      },
      readiness: async () => readiness
    })

    const supervisor = createWorkCoreSupervisor({ lifecycle: instance, planForArtifact: () => plan })

    const first = supervisor.start()
    const second = supervisor.start()
    resolveReadiness(handle)

    const [a, b] = await Promise.all([first, second])
    assert.deepEqual(a, { outcome: 'ready', handle })
    assert.deepEqual(b, a)
    assert.equal(resolves, 1)
    assert.equal(launches, 1)
    assert.deepEqual(await supervisor.start(), a)
    assert.equal(supervisor.current().status, 'ready')
  })

  test('null resolution is unavailable and never launches', async () => {
    let launches = 0

    const supervisor = createWorkCoreSupervisor({
      lifecycle: lifecycle({
        resolve: async () => null,
        launch: async () => {
          launches += 1

          return { id: 'unexpected', pid: 1 }
        }
      }),
      planForArtifact: () => plan
    })

    expect(await supervisor.start()).toEqual({ outcome: 'unavailable' })
    assert.equal(launches, 0)
    assert.equal(supervisor.current().status, 'unavailable')
  })

  test('readiness failures latch a diagnostic failed state without retrying', async () => {
    const failure = new Error('readiness refused')
    let launches = 0
    let shutdowns = 0

    const supervisor = createWorkCoreSupervisor({
      lifecycle: lifecycle({
        launch: async () => {
          launches += 1

          return { id: `p-${launches}`, pid: launches }
        },
        readiness: async () => {
          throw failure
        },
        shutdown: async () => {
          shutdowns += 1
        }
      }),
      planForArtifact: () => plan
    })

    expect(await supervisor.start()).toEqual({ outcome: 'unavailable' })
    assert.equal(supervisor.current().status, 'failed')
    assert.equal(supervisor.current().error, failure)
    assert.equal(shutdowns, 1)
    expect(await supervisor.start()).toEqual({ outcome: 'unavailable' })
    assert.equal(launches, 1)
  })

  test('launch failures also latch a diagnostic failed state', async () => {
    const failure = new Error('launch refused')

    const supervisor = createWorkCoreSupervisor({
      lifecycle: lifecycle({
        launch: async () => {
          throw failure
        }
      }),
      planForArtifact: () => plan
    })

    expect(await supervisor.start()).toEqual({ outcome: 'unavailable' })
    assert.equal(supervisor.current().status, 'failed')
    assert.equal(supervisor.current().error, failure)
  })

  test('shutdown is idempotent and shuts down an active process once', async () => {
    let shutdowns = 0

    const supervisor = createWorkCoreSupervisor({
      lifecycle: lifecycle({
        shutdown: async () => {
          shutdowns += 1
        }
      }),
      planForArtifact: () => plan
    })

    await supervisor.start()
    await Promise.all([supervisor.shutdown(), supervisor.shutdown()])
    assert.equal(shutdowns, 1)
    assert.equal(supervisor.current().status, 'stopped')
  })

  test('shutdown during launch prevents ready and cleans up the late process', async () => {
    let resolveLaunch: (value: WorkCoreProcess) => void = () => undefined
    let markLaunchStarted: () => void = () => undefined

    const launchStarted = new Promise<void>(resolve => {
      markLaunchStarted = resolve
    })

    const launch = new Promise<WorkCoreProcess>(resolve => {
      resolveLaunch = resolve
    })

    let shutdowns = 0

    const supervisor = createWorkCoreSupervisor({
      lifecycle: lifecycle({
        launch: async () => {
          markLaunchStarted()

          return launch
        },
        shutdown: async () => {
          shutdowns += 1
        }
      }),
      planForArtifact: () => plan
    })

    const starting = supervisor.start()
    await launchStarted
    await supervisor.shutdown()
    resolveLaunch({ id: 'late', pid: 99 })

    assert.deepEqual(await starting, { outcome: 'unavailable' })
    assert.equal(shutdowns, 1)
    assert.equal(supervisor.current().status, 'stopped')
  })
})
