/**
 * application/workspace/path-scope.ts — the workspace path-space boundary
 * (work order 36R).
 *
 * A LOCAL directory pick may only become a project record or a session cwd
 * when it lives in the backend's path space. Picking a folder on the desktop
 * machine does NOT mean the backend that will run the session can open it —
 * and the client must never "help" by guessing a mapping (no /mnt/c, no
 * silent remote rewrite, no faked open).
 *
 * Pure judgment only: callers supply the desktop-fs mode and the outcome of
 * the existing verified backend-FS probe (desktopDefaultCwd). No feature or
 * store imports.
 */

export type WorkspacePathScopeCode = 'WORKSPACE_PATH_SCOPE_MISMATCH'

export type WorkspacePathScopeRefusal = {
  code: WorkspacePathScopeCode
  ok: false
  /** Why the path was refused — the UI's localization key discriminant. */
  reason: 'backend-unverified' | 'windows-path'
}

export type WorkspacePathScopeDecision = { ok: true; scope: 'backend' } | WorkspacePathScopeRefusal

/** Windows drive (`C:\…`, `C:/…`) or UNC (`\\server\…`) paths. */
export function looksLikeWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\/.test(path)
}

/**
 * Decide whether `pickedPath` may be handed to the backend at all.
 *
 * - desktop-fs LOCAL mode: the backend runs where the app runs, so the local
 *   dialog's space IS the backend's space.
 * - desktop-fs REMOTE mode: paths must come from the backend's own browser.
 *   The backend FS must actually have answered (verified), and a Windows path
 *   is refused outright — it could only have arrived from a local dialog or a
 *   stale argument, and the only "translations" would be guesses.
 *
 * A refusal means ZERO creation and ZERO launch: no projects.create, no
 * session, no workspace write. In an environment that can only reach a
 * WSL/remote Hermes, a Windows-local real open is therefore correctly
 * unsupported (PENDING) — the refusal is the safety boundary passing.
 */
export function judgeWorkspacePathScope(input: {
  backendFsVerified: boolean
  fsMode: 'local' | 'remote'
  pickedPath: string
}): WorkspacePathScopeDecision {
  if (input.fsMode === 'local') {
    return { ok: true, scope: 'backend' }
  }

  if (looksLikeWindowsPath(input.pickedPath)) {
    return { code: 'WORKSPACE_PATH_SCOPE_MISMATCH', ok: false, reason: 'windows-path' }
  }

  if (!input.backendFsVerified) {
    return { code: 'WORKSPACE_PATH_SCOPE_MISMATCH', ok: false, reason: 'backend-unverified' }
  }

  return { ok: true, scope: 'backend' }
}
