/**
 * process/pid.ts
 *
 * Host-process liveness. The one fact every ownership decision needs before it
 * probes anything more expensive: is there a process with this PID right now.
 *
 * Harness-neutral by construction: this module knows about PIDs and signals and
 * nothing about what the process is running. It has no dependency on the
 * desktop's update machinery, which is where it used to live — a process
 * primitive that has to import a Desktop-update module to ask "is this PID
 * alive" is a primitive in the wrong place.
 */

/**
 * True only if a host process with this pid is currently alive.
 *
 * Signal 0 does not deliver a signal — it probes existence/permission.
 * `ESRCH` means dead; `EPERM` means alive but owned by another user, which is
 * still "alive" for every ownership decision made here. Injectable `kill` keeps
 * it unit-testable.
 */
export function isPidAlive(pid: number, kill: typeof process.kill = process.kill.bind(process)): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    kill(pid, 0)

    return true
  } catch (err: any) {
    return Boolean(err && err.code === 'EPERM')
  }
}
