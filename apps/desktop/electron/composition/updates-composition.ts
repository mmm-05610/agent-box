// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'

import {
  app
} from 'electron'

import {
  buildPosixCleanupScript,
  buildWindowsCleanupScript,
  modeRemovesAgent,
  modeRemovesUserData,
  resolveRemovableAppPath,
  shouldRemoveAppBundle,
  uninstallArgsForMode
} from '../desktop-uninstall'
import { clearStaleGitLocks } from '../host-capabilities/git/gitlock'
import {
  compareApiUrl,
  parseCompareBehindCount,
  resolveBehindCount,
  resolveCommitLogSelection,
  shouldCountCommits
} from '../update-count'
import { isOfficialSshRemote, OFFICIAL_REPO_HTTPS_URL } from '../update-remote'
import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'

import {
  ACTIVE_HERMES_ROOT,
  directoryExists,
  fileExists,
  findSystemPython,
  getOriginUrl,
  getVenvPython,
  HERMES_HOME,
  IS_PACKAGED,
  IS_WINDOWS,
  isHermesSourceRoot,
  readDesktopUpdateConfig,
  releaseBackendLock,
  resolveHealedBranch,
  resolveUpdateRoot,
  runGit,
  setIsQuittingForHandoff,
  VENV_ROOT,
} from './bootstrap-env-composition'
import {
  rememberLog
} from './log-buffer'

export const firstLine = text => (text || '').split('\n').find(Boolean) || ''

export async function checkUpdates() {
  const updateRoot = resolveUpdateRoot()
  let { branch } = readDesktopUpdateConfig()
  const gitDir = path.join(updateRoot, '.git')

  if (!directoryExists(gitDir)) {
    return {
      supported: false,
      reason: 'not-a-git-checkout',
      message: `${updateRoot} isn't a git checkout — desktop self-update only runs against a source install.`,
      hermesRoot: updateRoot,
      branch
    }
  }

  branch = await resolveHealedBranch(updateRoot, branch)
  const originUrl = await getOriginUrl(updateRoot)

  if (isOfficialSshRemote(originUrl)) {
    const git = args => runGit(args, { cwd: updateRoot }).then(r => r.stdout.trim())

    const [currentSha, target, dirtyStr, currentBranch] = await Promise.all([
      git(['rev-parse', 'HEAD']),
      runGit(['ls-remote', OFFICIAL_REPO_HTTPS_URL, `refs/heads/${branch}`], { cwd: updateRoot }),
      git(['status', '--porcelain']),
      git(['rev-parse', '--abbrev-ref', 'HEAD'])
    ])

    const targetSha = firstLine(target.stdout).split(/\s+/)[0] || ''

    if (target.code !== 0 || !targetSha) {
      return {
        supported: true,
        branch,
        error: 'fetch-failed',
        message: firstLine(target.stderr) || 'git ls-remote failed.',
        hermesRoot: updateRoot,
        fetchedAt: Date.now()
      }
    }

    // Passive SSH-official checks only know tip SHAs (ls-remote) — never
    // fabricate a "1 commit behind". Recover the exact count via the GitHub
    // compare API when possible; otherwise behind stays null ("update
    // available, count unknown") and updateAvailable carries the signal.
    // ahead_by === 0 with differing tips means the remote tip is reachable
    // from our HEAD — a local carried commit sitting AHEAD, not behind:
    // flagging that as an update nudges the user into wiping their work.
    const tipsEqual = Boolean(currentSha && currentSha === targetSha)

    const sshBehind = tipsEqual
      ? 0
      : await fetchCompareBehindCount({ currentSha, originUrl: OFFICIAL_REPO_HTTPS_URL, targetSha })

    const upToDate = tipsEqual || sshBehind === 0

    return {
      supported: true,
      branch,
      currentBranch,
      behind: upToDate ? 0 : sshBehind,
      updateAvailable: !upToDate,
      currentSha,
      targetSha,
      commits: [],
      dirty: dirtyStr.length > 0,
      hermesRoot: updateRoot,
      fetchedAt: Date.now()
    }
  }

  // Self-heal abandoned git lock files before fetching. A stale
  // .git/shallow.lock from a crashed/interrupted fetch otherwise fails every
  // later fetch ("Unable to create '.git/shallow.lock': File exists") and this
  // check reports 'fetch-failed' forever — git never removes these itself.
  await clearStaleGitLocks(updateRoot)

  const fetched = await runGit(['fetch', '--quiet', 'origin', branch], { cwd: updateRoot })

  if (fetched.code !== 0) {
    return {
      supported: true,
      branch,
      error: 'fetch-failed',
      message: firstLine(fetched.stderr) || 'git fetch failed.',
      hermesRoot: updateRoot,
      fetchedAt: Date.now()
    }
  }

  const git = args => runGit(args, { cwd: updateRoot }).then(r => r.stdout.trim())

  const [currentSha, targetSha, dirtyStr, currentBranch, shallowStr] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['rev-parse', `origin/${branch}`]),
    git(['status', '--porcelain']),
    git(['rev-parse', '--abbrev-ref', 'HEAD']),
    git(['rev-parse', '--is-shallow-repository'])
  ])

  const isShallow = shallowStr === 'true'

  // A shallow graph cannot provide a trustworthy exact count, even when it has
  // a visible merge-base. Skip the ancestry walk and use the SHA fallback.
  const countStr = shouldCountCommits({ isShallow }) ? await git(['rev-list', `HEAD..origin/${branch}`, '--count']) : ''

  // A positive directional ancestry result remains trustworthy in a shallow
  // graph and prevents a local commit on top of origin from looking outdated.
  const targetIsAncestorOfHead =
    isShallow &&
    currentSha !== targetSha &&
    (await runGit(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD'], { cwd: updateRoot })).code === 0

  let behind = resolveBehindCount({
    countStr,
    currentSha,
    targetSha,
    isShallow,
    targetIsAncestorOfHead
  })

  // Recover the exact count a shallow clone can't compute: the GitHub compare
  // API knows the full graph regardless of local clone depth. Best-effort —
  // offline, rate-limited, or non-GitHub origins keep the honest null
  // ("update available", no fabricated number).
  if (behind === null) {
    behind = await fetchCompareBehindCount({ currentSha, originUrl, targetSha })
  }

  // behind === null means "update available, exact count unknown" (shallow
  // clone): still list what origin offers — resolveCommitLogSelection keeps
  // the shallow log to the fetched tip so the range walk can't enumerate the
  // contaminated ancestry — so "See what's new" stays useful and honest.
  const commits = behind !== 0 ? await readCommitLog(updateRoot, branch, isShallow) : []

  return {
    supported: true,
    branch,
    currentBranch,
    behind,
    updateAvailable: behind === null || behind > 0,
    currentSha,
    targetSha,
    commits,
    dirty: dirtyStr.length > 0,
    hermesRoot: updateRoot,
    fetchedAt: Date.now()
  }
}

export async function fetchCompareBehindCount({ currentSha, originUrl, targetSha }) {
  const url = compareApiUrl({ currentSha, originUrl, targetSha })

  if (!url) {
    return null
  }

  try {
    const payload = await new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            // GitHub requires a UA on api.github.com; requests without one 403.
            'User-Agent': 'hermes-desktop-update-check'
          },
          timeout: 10_000
        },
        res => {
          const chunks = []
          res.on('error', reject)
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => {
            if ((res.statusCode || 500) >= 400) {
              reject(new Error(`compare API ${res.statusCode}`))

              return
            }

            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch (error) {
              reject(error)
            }
          })
        }
      )

      req.on('timeout', () => req.destroy(new Error('compare API timeout')))
      req.on('error', reject)
    })

    return parseCompareBehindCount(payload)
  } catch {
    return null
  }
}

export async function readCommitLog(cwd, branch, isShallow) {
  const SEP = '\x1f'
  const REC = '\x1e'
  const { limit, revision } = resolveCommitLogSelection({ branch, isShallow })

  const { stdout } = await runGit(
    ['log', revision, `--pretty=format:%H${SEP}%s${SEP}%an${SEP}%at${REC}`, '-n', String(limit)],
    { cwd }
  )

  return stdout
    .split(REC)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [sha, summary, author, at] = line.split(SEP)

      return { sha, summary, author, at: Number.parseInt(at, 10) * 1000 }
    })
}

export function uninstallVenvPython() {
  return getVenvPython(VENV_ROOT)
}

export async function getUninstallSummary() {
  const py = uninstallVenvPython()
  const agentRoot = ACTIVE_HERMES_ROOT

  // Fast JS-side fallback used when the agent venv is gone (lite client) or the
  // probe fails — the renderer still needs *something* to render options from.
  const fallback = () => ({
    hermes_home: HERMES_HOME,
    agent_installed: isHermesSourceRoot(agentRoot) && fileExists(py),
    gui_installed: true,
    source_built_artifacts: [],
    packaged_app_paths: [],
    userdata_dir: app.getPath('userData'),
    userdata_exists: true,
    platform: process.platform,
    probe: 'fallback'
  })

  if (!fileExists(py)) {
    return fallback()
  }

  return new Promise(resolve => {
    let stdout = ''
    let settled = false

    const done = value => {
      if (settled) {
        return
      }

      settled = true
      resolve(value)
    }

    try {
      const child = spawn(
        py,
        ['-m', 'hermes_cli.main', 'uninstall', '--gui-summary'],
        hiddenWindowsChildOptions({
          cwd: agentRoot,
          env: { ...process.env, HERMES_HOME, NO_COLOR: '1' },
          stdio: ['ignore', 'pipe', 'ignore']
        })
      )

      child.stdout.on('data', chunk => {
        stdout += chunk.toString()
      })
      child.on('error', () => done(fallback()))
      child.on('exit', code => {
        if (code !== 0) {
          return done(fallback())
        }

        try {
          const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}'
          const parsed = JSON.parse(line)
          // The app bundle the renderer would be removing on *this* machine,
          // resolved from the running exe (the Python probe only knows the
          // standard locations, not where THIS build actually runs from).
          parsed.running_app_path = resolveRemovableAppPath(process.execPath, process.platform, process.env)
          done(parsed)
        } catch {
          done(fallback())
        }
      })
      setTimeout(() => done(fallback()), 8000)
    } catch {
      done(fallback())
    }
  })
}

export async function runDesktopUninstall(mode) {
  let uninstallArgs

  try {
    uninstallArgs = uninstallArgsForMode(mode)
  } catch (error) {
    return { ok: false, error: 'invalid-mode', message: error.message }
  }

  const venvPy = uninstallVenvPython()

  if (!fileExists(venvPy)) {
    return {
      ok: false,
      error: 'agent-missing',
      message: `Can't run the uninstaller: no Hermes agent venv at ${VENV_ROOT}.`
    }
  }

  // Interpreter choice (Finding 3): lite/full rmtree the venv that holds the
  // running python.exe. On Windows a running .exe is mandatory-locked, so the
  // rmtree must NOT be driven by the venv's own interpreter — use a system
  // Python with PYTHONPATH=<agentRoot> so `import hermes_cli` resolves from
  // source while the venv is torn down. gui-only doesn't touch the venv, so the
  // venv python is fine there. If no system Python exists (the Windows edge
  // case), fall back to the venv python — gui-only is unaffected; lite/full may
  // leave venv remnants the user can delete, which we log.
  let py = venvPy
  let pythonPath = null

  if (modeRemovesAgent(mode)) {
    const sysPy = findSystemPython()

    if (sysPy) {
      py = sysPy
      pythonPath = ACTIVE_HERMES_ROOT
    } else if (IS_WINDOWS) {
      rememberLog(
        '[uninstall] no system Python found for lite/full on Windows; falling back ' +
          'to the venv python — venv files locked by the running interpreter may ' +
          'remain and need manual deletion.'
      )
    }
  }

  const appPath = resolveRemovableAppPath(process.execPath, process.platform, process.env)
  const removeBundle = shouldRemoveAppBundle(IS_PACKAGED, appPath) ? appPath : null

  // CRITICAL (Windows): tear down every backend the desktop owns and wait for
  // the venv shim to unlock BEFORE the cleanup script runs. lite/full delete
  // the venv, and even gui-only removes the install tree's GUI artifacts — a
  // live backend grandchild (gateway / pty / REPL) holding a mandatory file
  // lock would make the script's rmdir half-fail (#37532 for the update path).
  // Reuses the incident-hardened update teardown; no-op on macOS/Linux.
  try {
    await releaseBackendLock(ACTIVE_HERMES_ROOT, 'uninstall')
  } catch (error) {
    rememberLog(`[uninstall] backend teardown errored (continuing): ${error.message}`)
  }

  const scriptArgs = {
    desktopPid: process.pid,
    pythonExe: py,
    pythonPath,
    agentRoot: ACTIVE_HERMES_ROOT,
    uninstallArgs,
    appPath: removeBundle,
    hermesHome: HERMES_HOME
  }

  let scriptPath
  let runner
  let runnerArgs

  try {
    if (IS_WINDOWS) {
      scriptPath = path.join(app.getPath('temp'), `hermes-uninstall-${Date.now()}.cmd`)
      fs.writeFileSync(scriptPath, buildWindowsCleanupScript(scriptArgs))
      runner = process.env.ComSpec || 'cmd.exe'
      runnerArgs = ['/c', scriptPath]
    } else {
      scriptPath = path.join(app.getPath('temp'), `hermes-uninstall-${Date.now()}.sh`)
      fs.writeFileSync(scriptPath, buildPosixCleanupScript(scriptArgs), { mode: 0o755 })
      runner = '/bin/bash'
      runnerArgs = [scriptPath]
    }
  } catch (error) {
    return { ok: false, error: 'script-write-failed', message: error.message }
  }

  try {
    const child = spawn(runner, runnerArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })

    child.unref()
  } catch (error) {
    return { ok: false, error: 'spawn-failed', message: error.message }
  }

  rememberLog(
    `[uninstall] launched detached cleanup (${mode}): ${scriptPath} ` +
      `(removesAgent=${modeRemovesAgent(mode)} removesUserData=${modeRemovesUserData(mode)} bundle=${removeBundle || 'none'})`
  )

  // Give the renderer a beat to show its "uninstalling…" state, then quit so
  // the venv python shim + app bundle unlock and the cleanup script can run.
  setIsQuittingForHandoff(true)
  setTimeout(() => app.quit(), 800)

  return { ok: true, mode, willRemoveAppBundle: Boolean(removeBundle), scriptPath }
}
