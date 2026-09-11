/**
 * process/child-stop.ts
 *
 * Graceful/forced stop and process-tree cleanup for a spawned child.
 *
 * Node's `child.kill()` only signals the direct child. On Windows a child that
 * spawned its own grandchildren (a REPL, a pty session, a daemon) survives a
 * plain SIGTERM and keeps files locked, so Windows needs a tree-kill. On POSIX,
 * when the child was spawned into its own session/process-group, `child.kill()`
 * would reach only the child and orphan its grandchildren — the whole group is
 * signalled instead, falling back to the direct child if the group send fails.
 *
 * Dependency-free (no electron import) so the tree-kill / group-kill branching
 * is assertable directly with a fake child object and a spy kill function.
 * Knows about processes and process groups, not about what they run.
 */

export interface StopChildDeps {
  /** Windows tree-kill implementation (real: taskkill /T /F via execFileSync). */
  forceKillProcessTree: (pid: number) => void
  /** Defaults to the real platform check; injectable for tests. */
  isWindows?: boolean
  /**
   * POSIX group-signal implementation. Real: process.kill(-pgid, signal).
   * Injectable so the negative-pid group send is asserted in tests without a
   * live process group. Defaults to process.kill.
   */
  killGroup?: (pgid: number, signal: string) => void
}

export interface StopProcessTreesDeps {
  /** Synchronous Windows taskkill /T /F implementation. */
  forceKillProcessTree: (pid: number) => void
  /** Clears and stops every pooled child the caller owns. */
  stopAllPooledChildren: () => void
}

export interface ProcessRoot {
  pid?: null | number
}

export interface KillableChild extends ProcessRoot {
  kill: (signal: string) => void
  killed?: boolean
}

/**
 * Stop a managed child process, choosing the right strategy for the platform.
 * No-ops silently if `child` is falsy, already killed, or the kill attempt
 * throws (the process may already be gone) — best-effort by design.
 */
export function stopChildProcess(child: KillableChild | null | undefined, deps: StopChildDeps) {
  if (!child || child.killed) {
    return
  }

  const isWindows = deps.isWindows ?? process.platform === 'win32'
  const killGroup = deps.killGroup ?? ((pgid: number, signal: string) => process.kill(pgid, signal))

  try {
    if (isWindows && Number.isInteger(child.pid)) {
      deps.forceKillProcessTree(child.pid as number)
    } else if (Number.isInteger(child.pid)) {
      // POSIX: pgid == pid (start_new_session). Signal the whole group so
      // grandchildren die too; fall back to the direct child on failure.
      try {
        killGroup(-(child.pid as number), 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    } else {
      child.kill('SIGTERM')
    }
  } catch {
    // Already gone.
  }
}

/**
 * Stop every process tree the caller owns during an update hand-off.
 *
 * Tree-kill the primary root while its PID is still live, then delegate pool
 * teardown to the routine that tree-kills each pooled root exactly once before
 * mutating its registry. In particular, do not signal the primary first: if that
 * root exits before the tree-kill runs, Windows can no longer enumerate its
 * grandchildren and they survive with the install tree locked.
 */
export function stopProcessTreesForUpdate(primary: ProcessRoot | null | undefined, deps: StopProcessTreesDeps): void {
  if (primary && Number.isInteger(primary.pid)) {
    deps.forceKillProcessTree(primary.pid as number)
  }

  deps.stopAllPooledChildren()
}
