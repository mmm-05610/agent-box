import { parseRemoteProfileListing } from '../connection-registry'
import { SUPPORTED_REMOTE_OS, expandRemotePath, shq, validateRemotePath } from './ownership'

/** Locate and validate the remote Hermes install: login-shell probe,
 *  platform gate, Hermes home, update-marker gate, profile listing. */

export async function locateHermes(ssh, remoteHermesPath) {
  const resolveLauncher = async (candidate: string) => {
    // Return the candidate path directly. The hermes binary or wrapper script
    // is executable and handles argument forwarding (e.g. `exec <python> <script> "$@"`)
    // correctly on its own. Previously, this function followed `exec` wrappers and
    // returned only the python interpreter, which broke:
    //   - version checking: `<python> --version` printed "Python x.y.z" instead of
    //     the Hermes version, and
    //   - capability probing: `<python> serve --help` failed entirely.
    // See https://github.com/NousResearch/hermes-agent/issues/74411
    return candidate
  }

  const isExecutable = async (candidate: string) => {
    try {
      validateRemotePath(candidate)
      const ok = (await ssh.exec(`[ -x ${expandRemotePath(candidate)} ] && echo OK || true`)).trim()

      return ok === 'OK'
    } catch {
      return false
    }
  }

  if (remoteHermesPath) {
    if (await isExecutable(remoteHermesPath)) {
      return resolveLauncher(remoteHermesPath)
    }

    const err: any = new Error(
      `The Hermes path you set is not an executable on the remote host: "${remoteHermesPath}". ` +
        'Check the path (it must be the full path to the `hermes` binary on the remote, e.g. ' +
        '~/hermes-agent/.venv/bin/hermes), or clear it to auto-detect.'
    )

    err.kind = 'hermes-not-found'
    throw err
  }

  const candidates: string[] = []

  try {
    const found = (await ssh.exec(`bash -lc ${shq('command -v hermes')}`)).trim()

    if (found) {
      candidates.push(found.split('\n').pop().trim())
    }
  } catch {
    // ignore
  }

  // Fallback candidates when the login-shell probe misses: the installer's
  // command locations (scripts/install.sh) — per-user, root/FHS, legacy venv.
  candidates.push('~/.local/bin/hermes')
  candidates.push('/usr/local/bin/hermes')
  candidates.push('~/.hermes/hermes-agent/venv/bin/hermes')

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    if (await isExecutable(candidate)) {
      return resolveLauncher(candidate)
    }
  }

  const err: any = new Error(
    'Hermes is not installed on the remote host (could not find a `hermes` executable). ' +
      'Install it on the remote with:  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | sh  ' +
      '— or set the Hermes path explicitly in the SSH connection settings.'
  )

  err.kind = 'hermes-not-found'
  throw err
}

// Probe the resolved binary's version string (first line of `<hermes> --version`,
// e.g. "Hermes Agent v0.18.2 ..."), or '' on failure. Surfaces WHICH hermes a
// connection uses, so a stale/unexpected install is visible.
export async function probeHermesVersion(ssh, hermesPath) {
  try {
    const out = (await ssh.exec(`${expandRemotePath(hermesPath)} --version 2>&1`)).trim()

    return (out.split('\n')[0] || '').trim()
  } catch {
    return ''
  }
}

export async function probeRemotePlatform(ssh) {
  const out = (await ssh.exec('uname -s; uname -m')).trim().split('\n')
  const osName = (out[0] || '').trim()
  const arch = (out[1] || '').trim()

  if (!SUPPORTED_REMOTE_OS.has(osName)) {
    const err: any = new Error(
      `Unsupported remote platform "${osName || 'unknown'}". Hermes Desktop SSH mode supports Linux, macOS, and Windows remote hosts.`
    )

    err.kind = 'unsupported-platform'
    throw err
  }

  return { os: osName, arch }
}

// The HERMES_HOME the remote dashboard will use (explicit env wins, else
// ~/.hermes). Recorded in the lockfile so a future reuse can tell it's the same
// state store; best-effort.
export async function probeRemoteHermesHome(ssh) {
  try {
    const out = (await ssh.exec('echo "${HERMES_HOME:-$HOME/.hermes}"')).trim().split('\n').pop()

    return out || '~/.hermes'
  } catch (cause) {
    const error: any = new Error('Could not resolve the remote Hermes home.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }
}

export const REMOTE_UPDATE_MARKER_PROBE = String.raw`
import errno,os,re,sys
from pathlib import Path

home=Path(os.path.expanduser(sys.argv[1]))
if home.parent.name=='profiles':home=home.parent.parent
marker=home/'.hermes-update-in-progress'
try:
    with marker.open('rb') as stream:raw=stream.read(257)
except FileNotFoundError:
    print('CLEAR');raise SystemExit
except OSError:
    print('UNCERTAIN');raise SystemExit
if len(raw)>256:
    print('UNCERTAIN');raise SystemExit
match=re.fullmatch(rb'([1-9][0-9]*)\r?\n([0-9]+)(?:\r?\n)?',raw)
if not match:
    print('UNCERTAIN');raise SystemExit
try:
    owner=int(match.group(1));lease=int(match.group(2))
    if owner<1 or owner>4294967295 or lease>9007199254740991:raise ValueError()
except ValueError:
    print('UNCERTAIN');raise SystemExit
try:
    os.kill(owner,0)
except ProcessLookupError:
    print('CLEAR')
except PermissionError:
    print('LIVE:'+str(owner))
except OSError as error:
    if error.errno==errno.ESRCH:print('CLEAR')
    elif error.errno==errno.EPERM:print('LIVE:'+str(owner))
    else:print('UNCERTAIN')
else:
    print('LIVE:'+str(owner))
`

/**
 * Refuse normal SSH reuse/spawn while the remote install is being mutated.
 *
 * This probe intentionally uses only the host's system Python and raw marker
 * bytes; it never imports or executes code from the changing Hermes checkout.
 * Absence or a well-formed, confirmed-dead owner is clear. Every parse, read,
 * probe, or transport uncertainty fails closed so a Desktop relaunch cannot
 * start `serve` beside an updater that survived the old app process.
 */
export async function assertRemoteInstallUpdateClear(ssh, hermesHome) {
  const home = assertSafeRemoteHome(hermesHome)
  let observation = ''

  try {
    observation =
      String(await ssh.exec(`python3 -c ${shq(REMOTE_UPDATE_MARKER_PROBE)} ${expandRemotePath(home)}`))
        .trim()
        .split(/\r?\n/)
        .pop() || ''
  } catch (cause) {
    const error: any = new Error('Could not prove that the remote Hermes install is clear for SSH startup.')
    error.kind = 'update-in-progress'
    error.cause = cause
    throw error
  }

  if (observation === 'CLEAR') {
    return
  }

  const live = /^LIVE:([1-9][0-9]*)$/.exec(observation)

  const error: any = new Error(
    live
      ? `Remote Hermes update process ${live[1]} is still running; SSH startup is paused.`
      : 'The remote Hermes update marker is unreadable or malformed; refusing SSH startup.'
  )

  error.kind = 'update-in-progress'
  throw error
}

export async function listRemoteHermesProfiles(ssh) {
  const home = assertSafeRemoteHome(await probeRemoteHermesHome(ssh))
  const dir = expandRemotePath(`${home}/profiles`)
  let listing = ''

  try {
    listing = await ssh.exec(`if [ -d ${dir} ]; then ls -1 ${dir}; fi`)
  } catch (cause) {
    const error: any = new Error('Could not list remote Hermes profiles.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }

  return parseRemoteProfileListing(listing)
}

export function assertSafeRemoteHome(home) {
  const value = String(home || '').trim()

  if (!/^(\/|~\/)[A-Za-z0-9._/+-]+$/.test(value) || value.includes('..')) {
    const error: any = new Error('Unsafe remote Hermes home.')
    error.kind = 'unsafe-path'
    throw error
  }

  return value.replace(/\/+$/, '')
}

export function remoteInstallRoot(home) {
  const value = assertSafeRemoteHome(home)
  const profile = value.match(/^(.*)\/profiles\/[^/]+$/)

  return profile ? profile[1] : value
}


