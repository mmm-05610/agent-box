/**
 * workcore/lifecycle.ts
 *
 * The Work Core lifecycle contract.
 *
 * ## What this is
 *
 * A Work Core is the future local backend the Desktop supervises *as
 * infrastructure*. These six verbs are the whole of what the Desktop is allowed
 * to know about it:
 *
 * | Verb | Meaning |
 * |---|---|
 * | `resolve` | find the artifact to run, or report that none is installed |
 * | `launch` | start the infrastructure process |
 * | `readiness` | wait until it accepts work, and hand back a connection handle |
 * | `connectionHandle` | the handle for an already-ready process |
 * | `restart` | replace a process that failed, bounded by a restart policy |
 * | `shutdown` | stop it gracefully, then forcibly |
 *
 * ## What this deliberately does not know
 *
 * - **No harness.** There is no `harness_type`, no `provider_id`, no model, no
 *   tool, and no execution verb. Which harness runs a unit of work, and how, is
 *   the Work Core's business — an interface that named a harness here would make
 *   every harness a Desktop change.
 * - **No Session and no Execution.** The contract can say "the Work Core is
 *   reachable"; it cannot say "a turn is running". Session and Execution truth
 *   belongs to the Work Core, and the renderer learns it over the Work Core's own
 *   protocol — not through an Electron type.
 * - **No credential policy.** A handle may carry whatever the Work Core needs to
 *   be reached, because Electron relays it rather than minting it.
 *
 * ## Process ownership, stated once
 *
 * **Electron owns the Work Core *infrastructure* process.** The Work Core owns
 * every Execution/Harness child it spawns: those are not Electron's to
 * supervise, restart, or reap. That is why this interface's `launch` takes an
 * artifact and returns a handle for *one* process, and why nothing here can
 * enumerate or signal a child of that process. Invariant 5 of the refactor:
 * Harness/Execution process management does not move into Electron.
 *
 * ## Status
 *
 * This round establishes the contract, the composition slot, and a fixture that
 * drives a real process through it. **No Work Core is implemented in this
 * repository and none is wired into boot.** There is no fallback here on purpose:
 * a `resolve` that returns null means "no Work Core", and the caller decides —
 * never "pretend one exists".
 */

import type { FailureStreakBudgetOptions } from '../process/budget'

/** The thing to run. An artifact is data, so a caller never edits a command line. */
export interface WorkCoreArtifact {
  args: string[]
  command: string
  cwd?: string
  env?: Record<string, string | undefined>
  /** For diagnostics only; never parsed. */
  label: string
}

/** The two ends of a launched process: the OS fact, and the caller's token for it. */
export interface WorkCoreProcess {
  /** Stable per-launch identity, so a stale result can be recognized and dropped. */
  id: string
  /** Null until the OS has assigned one, or after exit. */
  pid: null | number
}

/** How to start and recognize a Work Core process. */
export interface WorkCoreLaunchPlan {
  artifact: WorkCoreArtifact
  /**
   * How readiness is recognized on the child's stdout. Supplied by the caller
   * (who is describing a Work Core it knows about), not assumed here.
   */
  readinessLinePattern: RegExp
  /** Deadline for readiness, measured from SPAWN — not from the listener. */
  readinessTimeoutMs: number
}

/**
 * What the caller receives once the Work Core is reachable.
 *
 * Deliberately three fields. The Work Core defines what its endpoint means and
 * what protocol it speaks; Electron relays both. `details` is an escape hatch for
 * the Work Core's own versioning, and Electron must not interpret it.
 */
export interface WorkCoreConnectionHandle {
  details?: Record<string, unknown>
  endpoint: string
  /** e.g. `http`, `ws`, `stdio`. Opaque to Electron beyond transport selection. */
  transport: string
}

/**
 * A bounded restart budget. The numbers come from the caller; the arithmetic is
 * the generic `process/budget.ts` failure-streak budget, so a crash-looping Work
 * Core stops the same way a crash-looping renderer does.
 */
export type WorkCoreRestartPolicy = FailureStreakBudgetOptions

export interface WorkCoreReadinessOptions {
  describeOutputTail?: () => string
  timeoutMs?: number
}

/**
 * The six verbs. One implementation per Work Core; nothing about a specific one
 * appears in the types.
 */
export interface WorkCoreLifecycle {
  /** The handle for an already-ready process, or null if there is none. */
  connectionHandle(): null | WorkCoreConnectionHandle
  launch(plan: WorkCoreLaunchPlan): Promise<WorkCoreProcess>
  readiness(process: WorkCoreProcess, options?: WorkCoreReadinessOptions): Promise<WorkCoreConnectionHandle>
  /** Find the artifact to run, or null when none is installed. Never a fallback. */
  resolve(): Promise<null | WorkCoreArtifact>
  restart(process: WorkCoreProcess, policy: WorkCoreRestartPolicy): Promise<WorkCoreProcess>
  shutdown(process: WorkCoreProcess): Promise<void>
}

export const WORKCORE_LIFECYCLE_VERBS = [
  'resolve',
  'launch',
  'readiness',
  'connectionHandle',
  'restart',
  'shutdown'
] as const

export type WorkCoreLifecycleVerb = (typeof WORKCORE_LIFECYCLE_VERBS)[number]
