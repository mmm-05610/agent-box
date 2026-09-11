/**
 * legacy-hermes/venv.ts
 *
 * The Python environment a Hermes install owns: which interpreter to use, where
 * its site-packages live, and how to invoke a Windows `hermes.cmd` shim so the
 * right interpreter sees the right site-packages.
 *
 * Hermes-proprietary, not generic. Two details are load-bearing:
 *
 *  - a checkout can legitimately hold BOTH `.venv` (dev tooling, Python 3.12) and
 *    `venv` (the CLI install, which owns the real dependencies, 3.11). Pairing
 *    the wrong interpreter with the wrong site-packages dies on the first native
 *    wheel import (`No module named 'pydantic_core._pydantic_core'`), which is
 *    why `venvRootForPython` derives the root FROM the interpreter instead of
 *    hardcoding `venv`;
 *  - on Windows, PATH-based Python detection has to dodge the Microsoft Store
 *    stub and refuse 3.14, so the enumeration below is explicit and
 *    version-pinned rather than "whatever `python` resolves to".
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { rememberLog } from '../app/log-buffer'
import { directoryExists, fileExists } from '../host-capabilities/filesystem/fs-probe'
import { findOnPath } from '../host-capabilities/platform/executables'
import { IS_WINDOWS } from '../host-capabilities/platform/platform-facts'
import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'

import { buildDesktopBackendEnv } from './backend-env'
import { canImportHermesCli, PROBE_TIMEOUT_MS } from './backend-probes'
import { HERMES_HOME } from './home'
import { getVenvSitePackagesEntries, resolveVenvHermesCommand } from './windows-hermes-path'

/** The interpreter inside a venv root, per platform. */
export function getVenvPython(venvRoot: string): string {
  return path.join(venvRoot, IS_WINDOWS ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'))
}

/**
 * The venv a given interpreter belongs to, restricted to `root` so an unrelated
 * system Python cannot be mistaken for the install's own.
 *
 * Returns null when the interpreter is not inside `<root>/<something>/{bin,Scripts}`.
 */
export function venvRootForPython(python: string, root: string): null | string {
  const parent = path.dirname(python)
  const binName = path.basename(parent).toLowerCase()

  if (binName !== 'bin' && binName !== 'scripts') {
    return null
  }

  const candidate = path.dirname(parent)
  const relative = path.relative(root, candidate)

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  return candidate
}

/** True iff this command string is a Windows command script (`.cmd`/`.bat`). */
export function isCommandScript(command: string): boolean {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(command || '')
}

/**
 * Pick the Python interpreter for a Hermes checkout.
 *
 * `HERMES_DESKTOP_PYTHON` wins (an explicit operator choice), then the checkout's
 * own `.venv` before `venv` (see the module header), then the system Python.
 * Existence is not proof: the caller still validates the choice with the import
 * probe, and `unwrapWindowsVenvHermesCommand` does exactly that.
 */
export function findPythonForRoot(root: string): null | string {
  const override = process.env.HERMES_DESKTOP_PYTHON

  if (override && fileExists(override)) {
    return override
  }

  const relativePaths = IS_WINDOWS
    ? [path.join('.venv', 'Scripts', 'python.exe'), path.join('venv', 'Scripts', 'python.exe')]
    : [path.join('.venv', 'bin', 'python'), path.join('venv', 'bin', 'python')]

  for (const relativePath of relativePaths) {
    const candidate = path.join(root, relativePath)

    if (fileExists(candidate)) {
      return candidate
    }
  }

  return findSystemPython()
}

/**
 * The system Python for this host, version-pinned where the host makes that
 * necessary. Moved verbatim from the composition root: the probe order, the
 * registry query shape and the 3.11–3.13 window are behaviour, not style.
 */
export function findSystemPython(): null | string {
  if (!IS_WINDOWS) {
    // POSIX systems: PATH lookup is safe.
    for (const command of ['python3', 'python']) {
      const candidate = findOnPath(command)

      if (candidate) {
        return candidate
      }
    }

    return null
  }

  // Windows: PATH-based detection has TWO landmines we have to dodge.
  //
  //  (1) The Microsoft Store "Python stub" lives at
  //      %LOCALAPPDATA%\Microsoft\WindowsApps\python.exe and is on PATH
  //      by default on modern Windows. It's a redirector that opens the
  //      Store window if no Store Python is installed. Running it for
  //      `-m venv` would either succeed (real Store install — fine) or
  //      pop the Store dialog (bad UX during boot).
  //  (2) `py.exe` (Python launcher) is missing from per-user installs
  //      that didn't check the launcher option, so PATH-only checks
  //      miss real Python 3.13 installs (user-reported case).
  //
  // We also restrict ourselves to Python 3.11–3.13. 3.14 is the latest
  // CPython but several Hermes deps (notably pywinpty's Rust-built
  // windows_x86_64_msvc crate) don't yet publish 3.14 wheels, and
  // `pip install -e .` falls back to source-build, which fails without
  // a Rust toolchain. install.ps1 sidesteps this by pinning to 3.11
  // via uv; until we add the same uv-managed Python pathway here, the
  // simplest fix is to refuse 3.14 detection and let the NSIS prereq
  // page offer to install 3.11 alongside.
  //
  // Strategy: probe in three passes, in order from most-precise to
  // least-precise, and ONLY use PATH lookup as a last resort after
  // confirming the candidate isn't the WindowsApps redirector.
  //
  //  Pass 1: PEP 514 registry — every standards-compliant Python
  //          installer registers itself at SOFTWARE\Python\PythonCore.
  //          The MS Store stub does NOT register here, so a hit means
  //          a real Python install. Versions are explicit so we
  //          inherently filter 3.14 out.
  //  Pass 2: Filesystem probe of standard install locations
  //          (Program Files, LocalAppData\Programs\Python). Same
  //          version filtering by directory name.
  //  Pass 3: PATH lookup of `py.exe` (the launcher itself never
  //          triggers the Store) — but call it with a version flag so
  //          we resolve to a SPECIFIC supported version, not whatever
  //          py.exe's default is (which on a 3.14-only box would be
  //          3.14).

  const SUPPORTED_VERSIONS = ['3.11', '3.12', '3.13']
  const SUPPORTED_VERSIONS_NO_DOT = ['311', '312', '313']

  // Pass 1: registry. Use `reg query` since main process doesn't have
  // a reliable in-process registry API across all electron versions.
  for (const hive of ['HKLM', 'HKCU']) {
    for (const version of SUPPORTED_VERSIONS) {
      try {
        const out = execFileSync(
          'reg',
          ['query', `${hive}\\SOFTWARE\\Python\\PythonCore\\${version}\\InstallPath`, '/ve', '/reg:64'],
          // Registry reads are near-instant; the bound only exists so a
          // pathologically wedged reg.exe can't hang the synchronous boot
          // resolver forever (this ran unbounded before).
          hiddenWindowsChildOptions({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 })
        )

        // Output format: "    (Default)    REG_SZ    C:\Path\To\Python\"
        const match = out.match(/REG_SZ\s+(.+?)\s*$/m)

        if (match) {
          const installPath = match[1].trim()
          const pythonExe = path.join(installPath, 'python.exe')

          if (fileExists(pythonExe)) {
            return pythonExe
          }
        }
      } catch {
        // Key not present — try next.
      }
    }
  }

  // Pass 2: filesystem probe of standard locations.
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const localAppData = process.env.LOCALAPPDATA || ''

  for (const versionDir of SUPPORTED_VERSIONS_NO_DOT) {
    const systemWide = path.join(programFiles, `Python${versionDir}`, 'python.exe')

    if (fileExists(systemWide)) {
      return systemWide
    }

    if (localAppData) {
      const perUser = path.join(localAppData, 'Programs', 'Python', `Python${versionDir}`, 'python.exe')

      if (fileExists(perUser)) {
        return perUser
      }
    }
  }

  // Pass 3: py.exe with explicit version flag. The launcher itself is
  // safe to invoke (no Store popup) and `py -3.13 -c "import sys;
  // print(sys.executable)"` resolves to the actual python.exe path of
  // the requested version. We try in version-priority order so the
  // first hit wins.
  const pyExe = findOnPath('py.exe')

  if (pyExe) {
    for (const version of SUPPORTED_VERSIONS) {
      try {
        const out = execFileSync(
          pyExe,
          [`-${version}`, '-c', 'import sys; print(sys.executable)'],
          hiddenWindowsChildOptions({
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            // Bare interpreter startup — much lighter than the hermes-import
            // probes, but still python.exe under cold cache / AV scan, so
            // share the probe budget rather than running unbounded (this
            // synchronous exec previously had no timeout at all).
            timeout: PROBE_TIMEOUT_MS
          })
        )

        const candidate = out.trim()

        if (candidate && fileExists(candidate)) {
          return candidate
        }
      } catch {
        // py couldn't find that version — try next.
      }
    }
  }

  // We deliberately do NOT fall back to plain `python.exe` on PATH.
  // Without a way to verify the version safely (running `python -V`
  // risks the Microsoft Store popup), accepting whatever's there
  // could land us on 3.14 and trigger the Rust-build-from-source
  // failure. Better to return null and let the NSIS prereq page
  // offer to install a known-good 3.11 via winget.
  return null
}

/**
 * Wrap a resolved Windows `hermes` command so a `.cmd`/`.bat` shim is invoked
 * with the right interpreter and the install venv's site-packages on PYTHONPATH.
 * The decision table itself is `resolveVenvHermesCommand`; this only supplies the
 * host deps.
 */
export function unwrapWindowsVenvHermesCommand(command: string, backendArgs: string[]) {
  return resolveVenvHermesCommand(command, backendArgs, {
    isWindows: IS_WINDOWS,
    isCommandScript,
    fileExists,
    directoryExists,
    canImportHermesCli,
    getVenvPython,
    getVenvSitePackagesEntries,
    buildDesktopBackendEnv,
    hermesHome: HERMES_HOME,
    resolvePath: (...segments: string[]) => path.resolve(...segments),
    dirname: (p: string) => path.dirname(p),
    basename: (p: string) => path.basename(p),
    rememberLog
  })
}
