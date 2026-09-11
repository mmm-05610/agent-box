import crypto from 'node:crypto'

import { READY_IN_MERGED_OUTPUT_RE } from '../backend-ready'


/** Dashboard ownership: tokens, lockfiles, pid liveness, stale cleanup,
 *  and the managed-update termination commands. */


export const LOCKFILE_SCHEMA_VERSION = 2
// Bumped when the desktop<->dashboard reuse contract changes in a way that makes
// an old running dashboard unsafe to reattach to (token handling, readiness/spawn
// args, served-token reconciliation). A mismatch forces a clean respawn.
export const PROTOCOL_VERSION = 1
export const READY_RE = READY_IN_MERGED_OUTPUT_RE // the remote log is `>> log 2>&1`: merged, not line-accurate
export const REMOTE_LOCK_DIR = '~/.hermes/desktop-ssh'
export const SUPPORTED_REMOTE_OS = new Set(['Linux', 'Darwin'])
export const DEFAULT_READY_TIMEOUT_MS = 45_000
export const READY_POLL_INTERVAL_MS = 750
// macOS sshd starts non-interactive shells with a 256-FD soft limit even when
// the hard limit is unlimited. A Desktop backend can legitimately exceed that
// while serving several profiles/tools, so raise only the child process limit.
// Keep startup portable: restricted hosts retain their existing limit.
export const REMOTE_NOFILE_SOFT_LIMIT = 65_536

export function classifySshReuseProof(proof, spawnNonce) {
  return proof?.ok === true &&
    proof.sshOwnerNonce === spawnNonce &&
    proof.protocolVersion === PROTOCOL_VERSION &&
    proof.runtimeIntact !== false
    ? 'authenticated-ok'
    : 'authenticated-stale'
}

export function mintToken() {
  return crypto.randomBytes(32).toString('hex')
}

// Fingerprint a token for the lockfile — never store the raw secret on the
// remote. SHA256, truncated.
export function fingerprintToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''))
    .digest('hex')
    .slice(0, 32)
}

export function validateOwnershipId(ownershipId) {
  const value = String(ownershipId || '')

  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new Error('SSH ownership ID is invalid.')
  }

  return value
}

export function validateSpawnNonce(spawnNonce) {
  const value = String(spawnNonce || '')

  if (!/^[0-9a-f]{16}$/.test(value)) {
    throw new Error('SSH spawn nonce is invalid.')
  }

  return value
}

export function ownershipDirectory(ownershipId) {
  return `${REMOTE_LOCK_DIR}/${validateOwnershipId(ownershipId)}`
}

export function lockfilePath(ownershipId) {
  return `${ownershipDirectory(ownershipId)}/backend.lock.json`
}

// #95532 fail-closed skew sentinel. A backend.lock.json that EXISTS but does
// not match what this build writes (unknown schemaVersion, missing/foreign
// ownershipId, truncated JSON, malformed shape) is "skew" — most likely a
// different desktop build (fork) owns this remote, or the file is corrupt.
// Skew must never be conflated with "no lockfile": every reap/cleanup path
// (#78872 ownership guard) must SKIP on skew, because killing or overwriting
// on unparseable/foreign state is exactly the wrong-way failure — it murders
// a live tunnel some other build is depending on.
export function lockfileSkew(reason) {
  return { skew: true, reason: String(reason) }
}

export function isLockfileSkew(lock) {
  return Boolean(lock) && (lock as any).skew === true
}

export function connectReservationPath(ownershipId) {
  return `${ownershipDirectory(ownershipId)}/.connect.lock`
}

export function spawnLogPath(ownershipId, spawnNonce) {
  return `${ownershipDirectory(ownershipId)}/${validateSpawnNonce(spawnNonce)}.log`
}

export function spawnTokenPath(ownershipId, spawnNonce) {
  return `${ownershipDirectory(ownershipId)}/${validateSpawnNonce(spawnNonce)}.token`
}

// shell-single-quote a value for safe interpolation into a remote command.
export function shq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function validateRemotePath(p) {
  const s = String(p || '')

  if (!s) {
    throw new Error('Remote path must not be empty.')
  }

  // eslint-disable-next-line no-control-regex -- deliberately reject NUL in remote paths
  if (/[\x00\n\r]/.test(s)) {
    throw new Error('Unsafe remote path: contains NUL or newline.')
  }

  if (s === '~' || s.startsWith('~/') || s.startsWith('/')) {
    return
  }

  throw new Error(`Remote path must be absolute or start with ~/: "${s}"`)
}

export function expandRemotePath(p) {
  validateRemotePath(p)

  if (p === '~') {
    return '"$HOME"'
  }

  if (p.startsWith('~/')) {
    return '"$HOME"' + shq(p.slice(1))
  }

  return shq(p)
}

// Resolve the remote hermes executable. An EXPLICIT path is honored strictly
// (throws a path-naming error if not executable — never silently falls back to a
// different install). A BLANK path auto-detects: login-shell `command -v` (a

export async function readLockfile(ssh, ownershipId) {
  const lpath = lockfilePath(ownershipId)
  let raw

  try {
    raw = await ssh.exec(`if [ ! -e ${expandRemotePath(lpath)} ]; then exit 0; fi; cat ${expandRemotePath(lpath)}`)
  } catch (cause) {
    const error: any = new Error('Could not read the SSH backend ownership record.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }

  const text = String(raw || '').trim()

  if (!text) {
    return null
  }

  let parsed

  try {
    parsed = JSON.parse(text)
  } catch {
    // Exists but doesn't parse: truncated write or a foreign format. NOT the
    // same as "no lockfile" — see lockfileSkew().
    return lockfileSkew('unparseable-json')
  }

  if (!parsed || typeof parsed !== 'object') {
    return lockfileSkew('non-object')
  }

  if (parsed.schemaVersion !== LOCKFILE_SCHEMA_VERSION) {
    return lockfileSkew(`schema-version ${JSON.stringify(parsed.schemaVersion ?? null)}`)
  }

  const pid = parsed.pid
  const port = parsed.port

  if (!Number.isInteger(pid) || pid <= 0 || pid > 4194304) {
    return lockfileSkew('malformed-pid')
  }

  // port 0 = spawn-in-progress record (written before readiness); valid
  // ownership proof for cleanup, but never reusable.
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return lockfileSkew('malformed-port')
  }

  if (parsed.ownershipId !== ownershipId || !/^[0-9a-f]{16}$/.test(parsed.spawnNonce || '')) {
    return lockfileSkew('ownership-mismatch')
  }

  if (!/^[0-9a-f]{32}$/.test(parsed.tokenFingerprint || '')) {
    return lockfileSkew('malformed-token-fingerprint')
  }

  if (parsed.protocolVersion !== PROTOCOL_VERSION) {
    // Fully validated ownership (our schema, our ownershipId, our shape) from
    // a protocol-incompatible build of OUR OWN lineage: the record is not
    // reusable and readLockfile keeps its historical contract of hiding it,
    // which routes connect() to a fresh spawn.
    return null
  }

  if (parsed.logPath !== spawnLogPath(ownershipId, parsed.spawnNonce)) {
    return lockfileSkew('log-path-mismatch')
  }

  for (const field of ['profile', 'hermesPath', 'hermesHome', 'logPath', 'startedAt']) {
    if (typeof parsed[field] !== 'string' || parsed[field].length > 1024) {
      return lockfileSkew(`malformed-field ${field}`)
    }
  }

  if (
    parsed.creationTime !== undefined &&
    (typeof parsed.creationTime !== 'string' || !/^(?:linux:[0-9]+|darwin:[A-Za-z0-9 :+-]+)$/.test(parsed.creationTime))
  ) {
    return null
  }

  return parsed
}

export async function writeLockfile(ssh, ownershipId, lock) {
  const directory = ownershipDirectory(ownershipId)
  const lpath = lockfilePath(ownershipId)
  const temporaryPath = `${directory}/.${crypto.randomBytes(8).toString('hex')}.lock.tmp`
  const json = JSON.stringify({ ...lock, schemaVersion: LOCKFILE_SCHEMA_VERSION })
  await ssh.exec(
    `umask 077 && mkdir -p ${expandRemotePath(directory)} && ` +
      `printf '%s' ${shq(json)} > ${expandRemotePath(temporaryPath)} && ` +
      `mv -f ${expandRemotePath(temporaryPath)} ${expandRemotePath(lpath)}`
  )
}

export async function removeLockfile(ssh, ownershipId) {
  const lpath = lockfilePath(ownershipId)

  try {
    await ssh.exec(`rm -f ${expandRemotePath(lpath)}`)
  } catch {
    // best effort
  }
}

export async function remotePidAlive(ssh, pid) {
  if (!pid || !Number.isInteger(Number(pid))) {
    return false
  }

  try {
    const out = (await ssh.exec(`kill -0 ${Number(pid)} 2>/dev/null && echo ALIVE || echo DEAD`)).trim()

    return out === 'ALIVE'
  } catch (cause) {
    const error: any = new Error('Could not verify the SSH backend process.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }
}

// Stable kernel process-start identity used to fence a later managed-update
// termination against PID recycling. Linux exposes boot-relative start ticks;
// Darwin's `ps lstart` is only second-resolution, so the signal boundary also
// re-reads the complete argv and random ownership nonce in the same remote
// command. A same-second PID reuse with a forged/repeated nonce remains a
// residual limitation. Failure is represented as an empty string so SSH mode
// remains compatible on unusual POSIX hosts, but a managed update then refuses
// to kill that unproved serve.
export async function remoteProcessCreationTime(ssh, pid) {
  if (!pid || !Number.isInteger(Number(pid))) {
    return ''
  }

  const script =
    'import subprocess,sys\n' +
    `pid=${Number(pid)}\n` +
    'value=""\n' +
    'if sys.platform.startswith("linux"):\n' +
    ' try:\n' +
    '  raw=open(f"/proc/{pid}/stat","r",encoding="ascii").read()\n' +
    '  fields=raw[raw.rfind(")")+2:].split()\n' +
    '  value="linux:"+fields[19]\n' +
    ' except (OSError,IndexError,UnicodeError):pass\n' +
    'elif sys.platform=="darwin":\n' +
    ' try:\n' +
    '  started=subprocess.check_output(["ps","-o","lstart=","-p",str(pid)],text=True).strip()\n' +
    '  if started:value="darwin:"+started\n' +
    ' except (OSError,subprocess.CalledProcessError):pass\n' +
    'print(value)'

  try {
    const value = String(await ssh.exec(`python3 -c ${shq(script)}`)).trim()

    return /^(?:linux:[0-9]+|darwin:[A-Za-z0-9 :+-]+)$/.test(value) ? value : ''
  } catch {
    return ''
  }
}

// A pid is "provably ours" only if its remote cmdline carries our dashboard
// args — never kill a pid we can't positively identify as our dashboard.
export async function pidIsOurDashboard(
  ssh,
  pid,
  spawnNonce,
  hermesPath = '',
  hermesHome = '',
  ownershipId = '',
  profile = ''
) {
  if (!pid || !/^[0-9a-f]{16}$/.test(String(spawnNonce || '')) || !hermesPath) {
    return false
  }

  try {
    const script =
      'import os,shlex,subprocess,sys\n' +
      `pid=${Number(pid)}\n` +
      `expected=os.path.expanduser(${shq(hermesPath)})\n` +
      // The installer-facing launcher is intentionally preserved for invocation
      // (#74411), but it may `exec python <install-dir>/hermes`, leaving neither
      // launcher nor HERMES_HOME-derived entrypoint in argv. The ownership-scoped
      // token path + random nonce + exact profile below are the alternative proof.
      `hermes_home=os.path.expanduser(${shq(hermesHome)}) if ${shq(hermesHome)} else ""\n` +
      'expected_entries={expected}\n' +
      'if hermes_home:\n' +
      ' expected_entries.add(os.path.join(hermes_home,"hermes-agent","venv","bin","hermes"))\n' +
      `expected_token=os.path.expanduser(${shq(ownershipId ? spawnTokenPath(ownershipId, spawnNonce) : '')})\n` +
      `expected_profile=${shq(profile)}\n` +
      `nonce=${shq(spawnNonce)}\n` +
      'try:\n' +
      ' raw=open(f"/proc/{pid}/cmdline","rb").read()\n' +
      ' args=[x.decode("utf-8","surrogateescape") for x in raw.split(b"\\0") if x]\n' +
      'except OSError:\n' +
      ' try:\n' +
      '  line=subprocess.check_output(["ps","-ww","-o","command=","-p",str(pid)],text=True).strip()\n' +
      ' except subprocess.CalledProcessError:\n' +
      '  # pid already gone — a dead process is FOREIGN, not a transport error\n' +
      '  print("FOREIGN");sys.exit(0)\n' +
      ' args=shlex.split(line)\n' +
      'ok=False\n' +
      'try:\n' +
      ' serve=args.index("serve")\n' +
      ' owner=args.index("--ssh-owner-nonce",serve+1)\n' +
      ' token=args.index("--ssh-session-token-file",serve+1) if expected_token else -1\n' +
      ' isolated=args.index("--isolated",serve+1)\n' +
      ' profile_arg=args.index("--profile") if expected_profile else -1\n' +
      ' serve_count=args.count("serve")\n' +
      ' owner_count=args.count("--ssh-owner-nonce")\n' +
      ' token_count=args.count("--ssh-session-token-file")\n' +
      ' isolated_count=args.count("--isolated")\n' +
      ' profile_count=args.count("--profile")\n' +
      ' direct=args[0] in expected_entries\n' +
      ' python_entry=len(args)>1 and args[1] in expected_entries and os.path.basename(args[0]).startswith("python")\n' +
      ' token_ok=not expected_token or args[token+1]==expected_token\n' +
      ' isolated_ok=isolated_count==1 and isolated>serve\n' +
      ' profile_ok=(profile_count==1 and profile_arg<serve and args[profile_arg+1]==expected_profile) if expected_profile else profile_count==0\n' +
      ' spawn_proof=bool(expected_token) and owner_count==1 and token_count==1 and token_ok and profile_ok\n' +
      ' ok=(direct or python_entry or spawn_proof) and serve_count==1 and isolated_ok and owner_count==1 and args[owner+1]==nonce and token_ok and profile_ok\n' +
      'except (ValueError,IndexError):pass\n' +
      'print("OWNED" if ok else "FOREIGN")'

    const out = await ssh.exec(`python3 -c ${shq(script)}`)

    return String(out || '').trim() === 'OWNED'
  } catch (cause) {
    const error: any = new Error('Could not verify SSH backend process ownership.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }
}

// Kill the stale dashboard ONLY if provably ours, then drop the lockfile.
export async function cleanupStale(ssh, ownershipId, lock, pidAlive = true) {
  // Defense in depth (#95532): a skew sentinel is foreign/corrupt state, not
  // an ownership record — never reap or remove anything based on it.
  if (isLockfileSkew(lock)) {
    return
  }

  if (
    pidAlive &&
    lock &&
    (await pidIsOurDashboard(
      ssh,
      lock.pid,
      lock.spawnNonce,
      lock.hermesPath,
      lock.hermesHome,
      ownershipId,
      lock.profile
    ))
  ) {
    try {
      const result = (
        await ssh.exec(
          `kill ${Number(lock.pid)} && ` +
            `i=0; while kill -0 ${Number(lock.pid)} 2>/dev/null; do ` +
            `i=$((i+1)); [ "$i" -ge 50 ] && exit 1; sleep 0.1; done`
        )
      ).trim()

      void result
    } catch {
      // A backend mid-turn (in-flight LLM call, live MCP children) can ride
      // out SIGTERM past the 5s graceful wait — and before-quit races this
      // whole teardown against 6s before closing SSH, so giving up here
      // reparents the still-running serve to pid 1: the #91668 leak, now on
      // the quit-during-active-turn path. Escalate to SIGKILL and require a
      // confirmed exit before treating the record as reclaimed.
      try {
        await ssh.exec(
          `kill -9 ${Number(lock.pid)} 2>/dev/null; ` +
            `i=0; while kill -0 ${Number(lock.pid)} 2>/dev/null; do ` +
            `i=$((i+1)); [ "$i" -ge 20 ] && exit 1; sleep 0.1; done`
        )
      } catch (cause) {
        // Even SIGKILL could not confirm death (D-state, permissions). Keep
        // the lockfile so the next connect's reap pass retries.
        const error: any = new Error('Could not terminate the stale SSH backend.')
        error.kind = 'transient-transport-error'
        error.cause = cause
        throw error
      }
    }
  }

  const expectedLogPath = lock?.spawnNonce ? spawnLogPath(ownershipId, lock.spawnNonce) : ''

  if (lock?.logPath === expectedLogPath) {
    try {
      await ssh.exec(`rm -f ${expandRemotePath(lock.logPath)}`)
    } catch {
      void 0
    }
  }

  await removeLockfile(ssh, ownershipId)
}

// Normal disconnect (quit, connection switch): reuse cleanupStale so we
// kill only a provably-owned serve --isolated and drop our lockfile.
// Closing the SSH transport first is not enough — spawn detaches with
// setsid/nohup, so the backend reparents to pid 1 and keeps state.db
// open (#91668).
export async function disconnect(ssh, ownershipId) {
  if (!ssh || !ownershipId) {
    return
  }

  const lock = await readLockfile(ssh, ownershipId)

  if (!lock || isLockfileSkew(lock)) {
    // Skew (#95532): fail closed — this is not our record, so there is
    // nothing we may safely reap or remove here.
    return
  }

  const pidAlive = await remotePidAlive(ssh, lock.pid)
  await cleanupStale(ssh, ownershipId, lock, pidAlive)
}

export function buildOwnedStaleTerminationCommand(lock, ownershipId) {
  const pid = Number(lock.pid)
  // expandRemotePath() output is already a shell-quoted fragment; embed it
  // raw so $HOME expands at assignment. Double-quoting stores the quote
  // characters in the variable and every identity match below REFUSEs.
  const expectedPath = expandRemotePath(lock.hermesPath)
  const expectedHome = lock.hermesHome ? expandRemotePath(lock.hermesHome) : "''"
  const expectedToken = expandRemotePath(spawnTokenPath(ownershipId, lock.spawnNonce))
  const nonce = shq(lock.spawnNonce)
  const profile = shq(lock.profile || '')
  const command = `$(ps -ww -o command= -p ${pid} 2>/dev/null || true)`

  const executableMatch = lock.hermesHome
    ? `case "$cmd" in *"$path"*|*"$home"*) ;; *) printf REFUSED; exit 0;; esac; `
    : `case "$cmd" in *"$path"*) ;; *) printf REFUSED; exit 0;; esac; `

  const identity =
    `cmd=${command}; ` +
    `path=${expectedPath}; home=${expectedHome}; token=${expectedToken}; nonce=${nonce}; profile=${profile}; ` +
    executableMatch +
    `case "$cmd" in *" serve"*|*" serve "*) ;; *) printf REFUSED; exit 0;; esac; ` +
    `case "$cmd" in *"--ssh-owner-nonce $nonce"*) ;; *) printf REFUSED; exit 0;; esac; ` +
    `case "$cmd" in *"--ssh-session-token-file $token"*) ;; *) printf REFUSED; exit 0;; esac; ` +
    `[ -n "$profile" ] && case "$cmd" in *"--profile $profile"*) ;; *) printf REFUSED; exit 0;; esac; `

  // Legacy records do not have creationTime. Re-read argv immediately before
  // signaling in this same shell command; never use the earlier probe's PID
  // verdict as authority for the kill.
  return (
    `${identity} kill ${pid} && ` +
    `i=0; while kill -0 ${pid} 2>/dev/null; do ` +
    `i=$((i+1)); [ "$i" -ge 50 ] && printf TIMEOUT && exit 0; sleep 0.1; done; printf TERMINATED`
  )
}

export function lockMatchesManagedUpdateScope(lock, expected) {
  return Boolean(
    lock &&
    expected &&
    lock.ownershipId === expected.ownershipId &&
    lock.pid === expected.pid &&
    lock.spawnNonce === expected.spawnNonce &&
    lock.startedAt === expected.startedAt &&
    lock.creationTime === expected.creationTime &&
    lock.profile === expected.profile &&
    lock.hermesPath === expected.hermesPath &&
    lock.hermesHome === expected.hermesHome
  )
}

export function buildOwnedTerminationCommand(lock, ownershipId) {
  const pid = Number(lock.pid)
  const py = value => JSON.stringify(String(value || ''))
  const expectedToken = spawnTokenPath(ownershipId, lock.spawnNonce)

  const script = `
import os,select,shlex,signal,subprocess,sys,time
pid=${pid}
expected_creation=${py(lock.creationTime)}
expected_path=os.path.expanduser(${py(lock.hermesPath)})
hermes_home=os.path.expanduser(${py(lock.hermesHome)})
expected_entries={expected_path,os.path.join(hermes_home,"hermes-agent","venv","bin","hermes")}
expected_token=os.path.expanduser(${py(expectedToken)})
expected_profile=${py(lock.profile)}
nonce=${py(lock.spawnNonce)}

def creation():
 if sys.platform.startswith("linux"):
  try:
   raw=open(f"/proc/{pid}/stat","r",encoding="ascii").read()
   return "linux:"+raw[raw.rfind(")")+2:].split()[19]
  except (OSError,IndexError,UnicodeError):return ""
 if sys.platform=="darwin":
  try:
   value=subprocess.check_output(["ps","-o","lstart=","-p",str(pid)],text=True).strip()
   return "darwin:"+value if value else ""
  except (OSError,subprocess.CalledProcessError):return ""
 return ""

def argv():
 try:
  raw=open(f"/proc/{pid}/cmdline","rb").read()
  return [part.decode("utf-8","surrogateescape") for part in raw.split(b"\\0") if part]
 except OSError:
  try:return shlex.split(subprocess.check_output(["ps","-ww","-o","command=","-p",str(pid)],text=True).strip())
  except (OSError,subprocess.CalledProcessError,ValueError):return []

def identity_before_signal():
 # Darwin's lstart has one-second resolution. Read the start time and the
 # complete argv in one ps call immediately before signalling; the random
 # ownership nonce is the discriminator for a same-second PID reuse. A
 # same-second reuse with a forged/repeated nonce remains a residual limitation.
 if sys.platform=="darwin":
  try:
   line=subprocess.check_output(["ps","-ww","-p",str(pid),"-o","lstart=","-o","command="],text=True).strip()
   prefix=expected_creation.removeprefix("darwin:")
   if not prefix or not line.startswith(prefix):return "",[]
   return "darwin:"+prefix,shlex.split(line[len(prefix):].strip())
  except (OSError,subprocess.CalledProcessError,ValueError):return "",[]
 return creation(),argv()

def owned(args):
 try:
  serve=args.index("serve")
  owner=args.index("--ssh-owner-nonce",serve+1)
  token=args.index("--ssh-session-token-file",serve+1)
  isolated=args.index("--isolated",serve+1)
  profile_arg=args.index("--profile") if expected_profile else -1
  direct=args[0] in expected_entries
  python_entry=len(args)>1 and args[1] in expected_entries and os.path.basename(args[0]).startswith("python")
  profile_ok=(args.count("--profile")==1 and profile_arg<serve and args[profile_arg+1]==expected_profile) if expected_profile else args.count("--profile")==0
  return ((direct or python_entry or (args[token+1]==expected_token and profile_ok)) and
          args.count("serve")==1 and args.count("--ssh-owner-nonce")==1 and
          args.count("--ssh-session-token-file")==1 and args.count("--isolated")==1 and
          isolated>serve and args[owner+1]==nonce and args[token+1]==expected_token and profile_ok)
 except (ValueError,IndexError):return False

pidfd=None
if sys.platform.startswith("linux"):
 if not hasattr(os,"pidfd_open") or not hasattr(signal,"pidfd_send_signal"):
  print("UNAVAILABLE");sys.exit(2)
 try:pidfd=os.pidfd_open(pid,0)
 except ProcessLookupError:print("ALREADY_STOPPED");sys.exit(0)
 except (OSError,PermissionError):print("UNAVAILABLE");sys.exit(2)

try:
 live_creation,live_args=identity_before_signal()
 if live_creation!=expected_creation or not owned(live_args):
  print("REFUSED");sys.exit(3)
 if (sys.platform=="darwin"):
  # Darwin has no pidfd-style signal binding. Refuse instead of accepting the
  # residual PID-reuse window between ps and os.kill; reconnect will surface
  # the still-running remote owner for an explicit retry.
  print("DARWIN_UNAVAILABLE");sys.exit(2)
 try:
  if pidfd is not None:signal.pidfd_send_signal(pidfd,signal.SIGTERM)
  else:os.kill(pid,signal.SIGTERM)
 except ProcessLookupError:print("ALREADY_STOPPED");sys.exit(0)
 if pidfd is not None:
  poller=select.poll();poller.register(pidfd,select.POLLIN)
  if not poller.poll(10000):print("TIMEOUT");sys.exit(4)
 else:
  deadline=time.monotonic()+10
  while time.monotonic()<deadline:
   try:os.kill(pid,0)
   except ProcessLookupError:break
   except PermissionError:print("UNAVAILABLE");sys.exit(2)
   time.sleep(.1)
  else:print("TIMEOUT");sys.exit(4)
 print("TERMINATED")
finally:
 if pidfd is not None:os.close(pidfd)
`.trim()

  return `python3 -c ${shq(script)}`
}

// The updater's Python _MarkerMutex uses the marker's .mutex sidecar and an
// advisory flock. Keep that same descriptor locked while the remote shell does
// the marker check, spawns the backend, and publishes its initial lockfile.
// Python keeps the descriptor close-on-exec by default and passes it explicitly
// only to the intended outer shell; each detached child closes it before
// execing Hermes. mutexPath is expandRemotePath() output — a complete shell
// word ("$HOME"'/…' or '/abs/…') embedded raw so $HOME expands remotely; a
// second shq() would hand python the quote characters as part of the path.
export function withRemoteUpdateMutex(command, mutexPath) {
  const script = `
import fcntl,os,subprocess,sys
mutex_path=sys.argv[1]
payload=sys.argv[2]
parent=os.path.dirname(mutex_path)
if parent:os.makedirs(parent,exist_ok=True)
fd=os.open(mutex_path,os.O_RDWR|os.O_CREAT|os.O_CLOEXEC,0o600)
fcntl.flock(fd,fcntl.LOCK_EX)
result=None
try:
 result=subprocess.run(["sh","-c",payload,"hermes-update-mutex",str(fd)],pass_fds=(fd,),check=False)
finally:
 os.close(fd)
sys.exit(result.returncode if result is not None else 1)
`.trim()

  return `python3 -c ${shq(script)} ${mutexPath} ${shq(command)}`
}

/**
 * Stop one Desktop-owned POSIX serve before an install update.
 *
 * This is deliberately stricter than stale cleanup. The in-memory scope is a
 * snapshot of the ownership record that established the forward; immediately
 * before signalling we re-read that record, compare its PID + kernel creation
 * identity and random argv nonce, and prove the live argv is the exact
 * isolated serve Desktop launched. Any absence, parse failure, replacement,
 * or transport uncertainty refuses the kill. The lock is intentionally left
 * behind: the post-update reconnect reclaims the now-dead exact record, while
 * an old cleanup can never unlink a replacement owner.
 */
export async function terminateOwnedDashboardForUpdate(ssh, expected) {
  const ownershipId = validateOwnershipId(expected?.ownershipId)

  if (!expected?.creationTime) {
    const error: any = new Error('The remote POSIX serve has no process creation-time proof.')
    error.kind = 'ownership-changed'
    throw error
  }

  let lock = await readLockfile(ssh, ownershipId)

  if (!lock || !lockMatchesManagedUpdateScope(lock, expected)) {
    const error: any = new Error('The remote POSIX ownership record changed before the managed update.')
    error.kind = 'ownership-changed'
    throw error
  }

  if (!(await remotePidAlive(ssh, lock.pid))) {
    return { pid: lock.pid, terminated: false, alreadyStopped: true }
  }

  if ((await remoteProcessCreationTime(ssh, lock.pid)) !== lock.creationTime) {
    const error: any = new Error('The remote POSIX PID creation time no longer matches its ownership record.')
    error.kind = 'ownership-changed'
    throw error
  }

  if (
    !(await pidIsOurDashboard(
      ssh,
      lock.pid,
      lock.spawnNonce,
      lock.hermesPath,
      lock.hermesHome,
      ownershipId,
      lock.profile
    ))
  ) {
    const error: any = new Error('Refusing to terminate a remote process whose Desktop ownership is unproven.')
    error.kind = 'foreign-backend'
    throw error
  }

  // Re-read after the argv proof. A concurrent/replacement writer cannot turn
  // proof of the old record into authority over its new PID.
  lock = await readLockfile(ssh, ownershipId)

  if (!lock || !lockMatchesManagedUpdateScope(lock, expected)) {
    const error: any = new Error('The remote POSIX ownership record changed during process verification.')
    error.kind = 'ownership-changed'
    throw error
  }

  if (
    (await remoteProcessCreationTime(ssh, lock.pid)) !== lock.creationTime ||
    !(await pidIsOurDashboard(
      ssh,
      lock.pid,
      lock.spawnNonce,
      lock.hermesPath,
      lock.hermesHome,
      ownershipId,
      lock.profile
    ))
  ) {
    const error: any = new Error('The remote POSIX process identity changed during managed update drain.')
    error.kind = 'ownership-changed'
    throw error
  }

  try {
    const result = String(await ssh.exec(buildOwnedTerminationCommand(lock, ownershipId))).trim()

    if (result === 'ALREADY_STOPPED') {
      return { pid: lock.pid, terminated: false, alreadyStopped: true }
    }

    if (result !== 'TERMINATED') {
      const error: any = new Error(
        result === 'REFUSED'
          ? 'The remote POSIX process identity changed at the signal boundary.'
          : result === 'DARWIN_UNAVAILABLE'
            ? 'Darwin cannot atomically bind a signal to the verified PID; refusing termination.'
            : 'The remote POSIX signal boundary was unavailable.'
      )

      error.kind =
        result === 'REFUSED' || result === 'DARWIN_UNAVAILABLE' ? 'ownership-changed' : 'transient-transport-error'
      throw error
    }
  } catch (cause: any) {
    if (cause?.kind === 'ownership-changed') {
      throw cause
    }

    const error: any = new Error('Could not terminate the Desktop-owned remote serve for update.')
    error.kind = 'transient-transport-error'
    error.cause = cause
    throw error
  }

  return { pid: lock.pid, terminated: true, alreadyStopped: false }
}

// Detach so the backend survives the SSH channel closing: setsid (Linux)
// starts a new session; macOS has no setsid, so fall back to nohup (HUP-immune;
