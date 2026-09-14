import type {
  WorkCoreArtifact,
  WorkCoreConnectionHandle,
  WorkCoreLaunchPlan,
  WorkCoreLifecycle,
  WorkCoreProcess
} from './lifecycle'

export type WorkCoreSupervisorStatus =
  'idle' | 'resolving' | 'launching' | 'ready' | 'unavailable' | 'failed' | 'shutting-down' | 'stopped'

export interface WorkCoreSupervisorState {
  readonly error?: Error
  readonly status: WorkCoreSupervisorStatus
}

export interface WorkCoreSupervisorReadyResult {
  outcome: 'ready'
  handle: WorkCoreConnectionHandle
}

export interface WorkCoreSupervisorUnavailableResult {
  outcome: 'unavailable'
}

export type WorkCoreSupervisorStartResult = WorkCoreSupervisorReadyResult | WorkCoreSupervisorUnavailableResult

export interface WorkCoreSupervisorOptions {
  lifecycle: WorkCoreLifecycle
  planForArtifact: (artifact: WorkCoreArtifact) => WorkCoreLaunchPlan
}

export interface WorkCoreSupervisor {
  current(): WorkCoreSupervisorState
  shutdown(): Promise<void>
  start(): Promise<WorkCoreSupervisorStartResult>
}

/**
 * Coordinates the infrastructure lifecycle without knowing what artifact is
 * being run or how its readiness is described. The composition root supplies
 * those product-specific details through planForArtifact.
 */
export function createWorkCoreSupervisor({
  lifecycle,
  planForArtifact
}: WorkCoreSupervisorOptions): WorkCoreSupervisor {
  let state: WorkCoreSupervisorState = { status: 'idle' }
  let handle: WorkCoreConnectionHandle | undefined
  let process_: WorkCoreProcess | undefined
  let startTask: Promise<WorkCoreSupervisorStartResult> | undefined
  let stopTask: Promise<void> | undefined
  let generation = 0
  let closed = false

  const setState = (next: WorkCoreSupervisorState) => {
    state = next
  }

  const isCurrent = (workGeneration: number) => !closed && workGeneration === generation

  const stopProcess = (processToStop: WorkCoreProcess) => {
    if (stopTask) {
      return stopTask
    }

    stopTask = lifecycle.shutdown(processToStop).finally(() => {
      if (process_?.id === processToStop.id) {
        process_ = undefined
      }

      if (handle) {
        handle = undefined
      }
    })

    return stopTask
  }

  const runStart = async (workGeneration: number): Promise<WorkCoreSupervisorStartResult> => {
    try {
      const existing = lifecycle.connectionHandle()

      if (existing && isCurrent(workGeneration)) {
        handle = existing
        setState({ status: 'ready' })

        return { outcome: 'ready', handle: existing }
      }

      setState({ status: 'resolving' })
      const artifact = await lifecycle.resolve()

      if (!isCurrent(workGeneration)) {
        return { outcome: 'unavailable' }
      }

      if (!artifact) {
        setState({ status: 'unavailable' })

        return { outcome: 'unavailable' }
      }

      setState({ status: 'launching' })
      const launched = await lifecycle.launch(planForArtifact(artifact))
      process_ = launched

      if (!isCurrent(workGeneration)) {
        await stopProcess(launched)

        return { outcome: 'unavailable' }
      }

      const ready = await lifecycle.readiness(launched)

      if (!isCurrent(workGeneration)) {
        await stopProcess(launched)

        return { outcome: 'unavailable' }
      }

      handle = ready
      setState({ status: 'ready' })

      return { outcome: 'ready', handle: ready }
    } catch (error) {
      if (!isCurrent(workGeneration)) {
        if (process_) {
          await stopProcess(process_)
        }

        return { outcome: 'unavailable' }
      }

      if (process_) {
        await stopProcess(process_).catch(() => undefined)
      }

      const diagnostic = error instanceof Error ? error : new Error(String(error))
      setState({ status: 'failed', error: diagnostic })

      return { outcome: 'unavailable' }
    }
  }

  return {
    current: () => ({ ...state }),

    async start() {
      if (closed || state.status === 'stopped' || state.status === 'shutting-down') {
        return { outcome: 'unavailable' }
      }

      if (state.status === 'ready' && handle) {
        return { outcome: 'ready', handle }
      }

      if (state.status === 'unavailable' || state.status === 'failed') {
        return { outcome: 'unavailable' }
      }

      if (!startTask) {
        const workGeneration = generation
        startTask = runStart(workGeneration).finally(() => {
          startTask = undefined
        })
      }

      return startTask
    },

    async shutdown() {
      if (closed) {
        return
      }

      closed = true
      generation += 1
      setState({ status: 'shutting-down' })

      if (process_) {
        await stopProcess(process_)
      }

      handle = undefined
      setState({ status: 'stopped' })
    }
  }
}
