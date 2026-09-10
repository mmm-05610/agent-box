import { $activeSessionId, $connection, getRememberedWorkspaceCwd, setCurrentCwdTransient } from './atoms'

/** The configured default project dir and the boot-time workspace seeding
 *  built on it. */
let configuredDefaultProjectDir = ''

export const getConfiguredDefaultProjectDir = (): string => configuredDefaultProjectDir

export async function syncConfiguredDefaultProjectDir(shouldPublish: () => boolean = () => true): Promise<string> {
  const settings = window.hermesDesktop?.settings?.getDefaultProjectDir

  if (!settings) {
    if (shouldPublish()) {
      configuredDefaultProjectDir = ''
    }

    return configuredDefaultProjectDir
  }

  const { dir } = await settings()

  if (shouldPublish()) {
    configuredDefaultProjectDir = dir?.trim() || ''
  }

  return configuredDefaultProjectDir
}

/** Align the renderer workspace with the main-process default (home dir when
 *  packaged, optional Settings override). Clears stale install-dir paths that
 *  PR #37586's localStorage stickiness can preserve across the #37536 fix. */
export async function ensureDefaultWorkspaceCwd(shouldPublish: () => boolean = () => true): Promise<void> {
  const sanitize = window.hermesDesktop?.sanitizeWorkspaceCwd

  if (!sanitize || !shouldPublish()) {
    return
  }

  await syncConfiguredDefaultProjectDir(shouldPublish)

  if (!shouldPublish()) {
    return
  }

  const configured = getConfiguredDefaultProjectDir()

  // Transient: each source below is already remembered or comes from config, so
  // persisting would only promote a configured default into the per-backend
  // memory of what the user picked.
  const seedLiveCwd = (cwd: string) => {
    if (shouldPublish() && cwd && !$activeSessionId.get()) {
      setCurrentCwdTransient(cwd)
    }
  }

  const remembered = getRememberedWorkspaceCwd()

  if ($connection.get()?.mode === 'remote') {
    seedLiveCwd(remembered)

    return
  }

  if (configured) {
    const { cwd } = await sanitize(configured)
    seedLiveCwd(cwd)

    return
  }

  if (remembered) {
    const { cwd } = await sanitize(remembered)
    seedLiveCwd(cwd)
  }
}

export function applyConfiguredDefaultProjectDir(dir: null | string | undefined): void {
  configuredDefaultProjectDir = dir?.trim() || ''
}

export const workspaceCwdForNewSession = (): string => {
  // A bare new chat starts DETACHED — no inherited cwd, so the composer's coding
  // rail (which keys off $currentCwd) shows no branch and the first message runs
  // in the gateway's default rather than silently in the last repo you touched.
  // Only an explicit default-project-dir setting pre-attaches. Entering a
  // project/worktree attaches its cwd directly (startSessionInWorkspace), so the
  // "remember where I was when I'm in a project" case is unaffected.
  //
  // This must behave identically in local and remote mode: the remembered CWD
  // under the remote-keyed workspaceCwdKey() can be from a *different* project
  // than the one the user is currently scoped into, and bare-new-session in
  // the wrong workspace was the #57911 symptom. Resume/restore still reads
  // the remembered cwd via ensureDefaultWorkspaceCwd (where it remains
  // remote-keyed and intentionally sticky).
  return getConfiguredDefaultProjectDir()
}
