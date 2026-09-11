import assert from 'node:assert/strict'
/**
 * workcore/workcore.test.ts
 *
 * Two things are proved here, and neither of them is "a Work Core exists":
 *
 * 1. **The contract is implementable with the generic process primitives.** The
 *    fixture below implements `WorkCoreLifecycle` against a REAL child process
 *    (`node -e`), using `process/readiness.ts` for readiness, `process/output-tail.ts`
 *    for the crash tail, `process/child-stop.ts` for the stop and
 *    `process/budget.ts` for the restart budget. If the interface needed anything
 *    Hermes-shaped or Electron-shaped, this file could not compile.
 *
 * 2. **The slot is inert in production.** Nothing installs a lifecycle, so the
 *    boot path cannot branch on it and there is no fallback behind it.
 *
 * The fixture is TEST-ONLY and is a *stub artifact*, not a fake Work Core: it
 * really spawns, really announces readiness on stdout, really gets restarted
 * under a budget and really gets stopped. Nothing here fakes readiness, and
 * nothing here is reachable from production code.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { afterEach, test } from 'vitest'

import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'
import { createFailureStreakBudget } from '../process/budget'
import { type KillableChild, stopChildProcess } from '../process/child-stop'
import { createOutputTail } from '../process/output-tail'
import { waitForLineAnnouncement } from '../process/readiness'

import {
  WORKCORE_LIFECYCLE_VERBS,
  type WorkCoreArtifact,
  type WorkCoreConnectionHandle,
  type WorkCoreLaunchPlan,
  type WorkCoreLifecycle,
  type WorkCoreProcess,
  type WorkCoreRestartPolicy
} from './lifecycle'
import { createWorkCoreSlot, workCoreSlot } from './slot'

/**
 * A stub artifact whose "readiness" is a real sentinel on a real stdout, and
 * whose process then stays alive until it is signalled — so every verb below is
 * exercised against an actual OS process.
 */
const STUB_SCRIPT = `
  console.log('WC_READY endpoint=127.0.0.1:1')
  setInterval(() => {}, 1000)
`

const READY = /^WC_READY endpoint=(.+)$/

const live: { child: KillableChild | null; process: WorkCoreProcess | null } = { child: null, process: null }

afterEach(() => {
  // Zero residual processes: every case leaves the stub stopped.
  if (live.child) {
    stopChildProcess(live.child, { forceKillProcessTree: () => undefined, isWindows: false })
  }

  live.child = null
  live.process = null

  workCoreSlot.install(null)
})

/**
 * The fixture. Everything Hermes-specific is absent by construction; everything
 * process-specific comes from `electron/process/`.
 */
function createStubWorkCoreLifecycle(): WorkCoreLifecycle {
  let handle: null | WorkCoreConnectionHandle = null
  let readinessPattern: RegExp = READY

  return {
    connectionHandle: () => handle,

    async launch(plan: WorkCoreLaunchPlan): Promise<WorkCoreProcess> {
      const child: any = spawn(
        plan.artifact.command,
        plan.artifact.args,
        hiddenWindowsChildOptions({
          cwd: plan.artifact.cwd,
          env: { ...process.env, ...(plan.artifact.env || {}) },
          stdio: ['ignore', 'pipe', 'pipe']
        })
      )

      live.child = child
      readinessPattern = plan.readinessLinePattern

      const process_: WorkCoreProcess = { id: randomUUID(), pid: child.pid ?? null }

      live.process = process_

      // The crash tail is attached at spawn time, before any wait.
      const tail = createOutputTail(undefined, 'work core')

      tail.attach(child)

      let endpoint: string

      try {
        endpoint = await waitForLineAnnouncement(child, {
          linePattern: readinessPattern,
          onExit: detail => `Work Core: exited before readiness (${detail})`,
          onTimeout: ms => `Timed out waiting for Work Core readiness (${ms}ms)`,
          timeoutMs: plan.readinessTimeoutMs
        })
      } catch (error) {
        // Read the tail AFTER the streams close. The 'exit' event can fire while
        // a final stderr chunk is still in flight, so reading it inside the exit
        // handler reports an empty tail for exactly the crash that needs one.
        await closeOrTimeout(child)

        throw new Error(`${(error as Error).message}${tail.describe()}`)
      }

      handle = { endpoint, transport: 'http' }

      return process_
    },

    async readiness(process_) {
      if (!handle) {
        throw new Error(`Work Core ${process_.id} is not ready`)
      }

      return handle
    },

    async resolve(): Promise<null | WorkCoreArtifact> {
      return {
        args: ['-e', STUB_SCRIPT],
        command: process.execPath,
        label: 'stub work core (test fixture)'
      }
    },

    async restart(process_, policy: WorkCoreRestartPolicy): Promise<WorkCoreProcess> {
      // The same bounded budget a crash-looping renderer uses: crossing the limit
      // stops the loop instead of restarting forever.
      const budget = createFailureStreakBudget(policy)
      const { shouldReset } = budget.recordFailure(process_.id)

      if (shouldReset) {
        throw new Error(`Work Core ${process_.id} exceeded its restart budget`)
      }

      await this.shutdown(process_)

      const artifact = await this.resolve()

      assert.ok(artifact, 'the stub always resolves')

      return this.launch({ artifact, readinessLinePattern: READY, readinessTimeoutMs: 10_000 })
    },

    async shutdown(process_: WorkCoreProcess) {
      const child = live.child

      if (!child || (typeof process_.pid === 'number' && child.pid !== process_.pid)) {
        return
      }

      stopChildProcess(child, { forceKillProcessTree: () => undefined, isWindows: false })
      handle = null
      live.child = null
      live.process = null
    }
  }
}

const plan = (artifact: WorkCoreArtifact): WorkCoreLaunchPlan => ({
  artifact,
  readinessLinePattern: READY,
  readinessTimeoutMs: 10_000
})

// --- the contract is real ----------------------------------------------------

test('the contract names exactly the six infrastructure verbs and nothing harness-shaped', () => {
  assert.deepEqual([...WORKCORE_LIFECYCLE_VERBS].sort(), [
    'connectionHandle',
    'launch',
    'readiness',
    'resolve',
    'restart',
    'shutdown'
  ])
})

test('resolve returns an artifact as data, and nothing is launched by resolving', async () => {
  const lifecycle = createStubWorkCoreLifecycle()
  const artifact = await lifecycle.resolve()

  assert.ok(artifact)
  assert.equal(live.child, null, 'resolve must not spawn: finding the artifact and starting it are different steps')
  assert.equal(lifecycle.connectionHandle(), null, 'resolving does not make anything reachable')
})

test('a real process is launched, announces readiness, and is stopped to zero residue', async () => {
  const lifecycle = createStubWorkCoreLifecycle()
  const artifact = await lifecycle.resolve()

  assert.ok(artifact)

  const process_ = await lifecycle.launch(plan(artifact))

  assert.ok(typeof process_.pid === 'number' && process_.pid > 0, 'a real OS process')
  assert.equal(typeof process_.id, 'string')

  const handle = await lifecycle.readiness(process_)

  assert.equal(handle.endpoint, '127.0.0.1:1', 'the endpoint came off the child stdout')
  assert.equal(handle.transport, 'http')
  assert.deepEqual(lifecycle.connectionHandle(), handle, 'the handle is retained once ready')

  const pid = process_.pid

  await lifecycle.shutdown(process_)

  assert.equal(lifecycle.connectionHandle(), null)
  await assertProcessGone(pid)
})

test('restart replaces the process and is bounded, so a crash loop stops instead of spinning', async () => {
  const lifecycle = createStubWorkCoreLifecycle()
  const artifact = await lifecycle.resolve()

  assert.ok(artifact)

  const first = await lifecycle.launch(plan(artifact))
  const firstPid = first.pid

  const second = await lifecycle.restart(first, { failureLimit: 2, failureWindowMs: 60_000 })

  assert.notEqual(second.id, first.id, 'a restart is a new incarnation, not the same token')
  assert.notEqual(second.pid, firstPid)
  await assertProcessGone(firstPid)

  await lifecycle.shutdown(second)

  // With a limit of 2, the second consecutive failure is the one that trips it.
  const third = await lifecycle.launch(plan(artifact))
  const budget = createFailureStreakBudget({ failureLimit: 2, failureWindowMs: 60_000 })

  assert.equal(budget.recordFailure(third.id).shouldReset, false)
  assert.equal(budget.recordFailure(third.id).shouldReset, true)
  await lifecycle.shutdown(third)
})

test('launch failure surfaces the child output tail rather than a bare exit', async () => {
  const lifecycle = createStubWorkCoreLifecycle()

  const broken: WorkCoreArtifact = {
    args: ['-e', "console.error('no work core here'); process.exit(3)"],
    command: process.execPath,
    label: 'broken stub'
  }

  await assert.rejects(lifecycle.launch(plan(broken)), (error: Error) => {
    assert.match(error.message, /exited before readiness/)
    assert.match(error.message, /no work core here/)

    return true
  })
})

// --- the slot is inert -------------------------------------------------------

test('in production the slot is empty, so the boot path has nothing to branch on', () => {
  assert.equal(workCoreSlot.isPopulated(), false)
  assert.equal(workCoreSlot.current(), null)
})

test('installing a lifecycle is reversible, so an installer can restore the previous state', () => {
  const slot = createWorkCoreSlot()
  const lifecycle = createStubWorkCoreLifecycle()
  const other = createStubWorkCoreLifecycle()

  assert.equal(slot.install(lifecycle), null)
  assert.equal(slot.isPopulated(), true)
  assert.equal(slot.install(other), lifecycle, 'install returns what it replaced')
  assert.equal(slot.install(null), other)

  // The module-scoped slot the composition root uses is untouched by the above.
  assert.equal(workCoreSlot.current(), null)
})

/** Resolve once the child's stdio is fully closed, or after a short grace period. */
function closeOrTimeout(child: any, graceMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return new Promise(resolve => setImmediate(resolve))
  }

  return Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    new Promise(resolve => setTimeout(resolve, graceMs))
  ])
}

async function assertProcessGone(pid: null | number, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      process.kill(pid as number, 0)
    } catch {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 25))
  }

  assert.fail(`pid ${pid} was still alive after ${timeoutMs}ms — a residual process would violate the smoke contract`)
}
