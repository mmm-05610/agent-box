/**
 * process/connection-state.ts
 *
 * Generation-token ownership state for "one child process plus the connection
 * attempt that produced it". Three things go wrong without it, and all three are
 * races the caller cannot see:
 *
 *  - a stale async result overwrites newer intent (the generation check rejects
 *    it);
 *  - a process that has already been replaced is torn down by its predecessor's
 *    exit handler (`clearForCurrentProcess` refuses when the owner moved on);
 *  - an attempt that was superseded still publishes its promise
 *    (`setPromise` refuses when the generation moved on).
 *
 * Pure bookkeeping over an opaque process handle and an opaque connection type.
 * It knows neither what the process is nor what the connection means.
 */

export type ConnectionAttempt<TConnection> = {
  generation: number
  promise: Promise<TConnection> | null
}

export type ProcessOwner<TProcess> = {
  generation: number
  process: TProcess
}

export function createConnectionState<TProcess, TConnection>() {
  let generation = 0
  let process: TProcess | null = null
  let promise: Promise<TConnection> | null = null

  return {
    startAttempt(): ConnectionAttempt<TConnection> {
      return { generation, promise: null }
    },

    setPromise(attempt: ConnectionAttempt<TConnection>, nextPromise: Promise<TConnection>): boolean {
      if (attempt.generation !== generation) {
        return false
      }

      attempt.promise = nextPromise
      promise = nextPromise

      return true
    },

    isCurrentAttempt(attempt: ConnectionAttempt<TConnection>): boolean {
      return attempt.generation === generation
    },

    attachProcess(attempt: ConnectionAttempt<TConnection>, nextProcess: TProcess): ProcessOwner<TProcess> | null {
      if (attempt.generation !== generation) {
        return null
      }

      process = nextProcess

      return { generation, process: nextProcess }
    },

    clearForCurrentProcess(owner: ProcessOwner<TProcess>): boolean {
      if (owner.generation !== generation || owner.process !== process) {
        return false
      }

      process = null
      promise = null

      return true
    },

    clearPromiseForAttempt(attempt: ConnectionAttempt<TConnection>): boolean {
      if (attempt.generation !== generation || (promise !== null && attempt.promise !== promise)) {
        return false
      }

      promise = null

      return true
    },

    getProcess(): TProcess | null {
      return process
    },

    getPromise(): Promise<TConnection> | null {
      return promise
    },

    invalidate(): TProcess | null {
      const currentProcess = process

      generation += 1
      process = null
      promise = null

      return currentProcess
    }
  }
}
