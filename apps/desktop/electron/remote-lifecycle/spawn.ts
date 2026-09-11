import crypto from 'node:crypto'

import { assertBootstrapNotSuperseded } from '../ssh-connection'

import { connectReservationPath, DEFAULT_READY_TIMEOUT_MS, expandRemotePath, fingerprintToken, LOCKFILE_SCHEMA_VERSION, lockfilePath, PROTOCOL_VERSION, readLockfile, READY_POLL_INTERVAL_MS, READY_RE, REMOTE_NOFILE_SOFT_LIMIT, remotePidAlive, shq, spawnLogPath, spawnTokenPath, validateSpawnNonce, withRemoteUpdateMutex } from './ownership'
import { remoteInstallRoot } from './resolve'

/** Spawn the remote dashboard, scrape its readiness port, forward the
 *  tunnel, and adopt the served token. */

export function buildSpawnCommand(hermesPath, profile, opts: any = {}) {
  const hermes = expandRemotePath(hermesPath)
  const profileArgs = profile ? `--profile ${shq(profile)} ` : ''
  const logPath = expandRemotePath(opts.logPath)
  const tokenFilePath = opts.tokenFilePath
  const tokenArg = tokenFilePath ? ` --ssh-session-token-file ${expandRemotePath(tokenFilePath)}` : ''
  const ownerArg = opts.spawnNonce ? ` --ssh-owner-nonce ${validateSpawnNonce(opts.spawnNonce)}` : ''
  const subCmd = `serve --isolated --host 127.0.0.1 --port 0${tokenArg}${ownerArg}`
  const marker = expandRemotePath(`${remoteInstallRoot(opts.hermesHome || '~/.hermes')}/.hermes-update-in-progress`)

  const updateMutex = expandRemotePath(
    `${remoteInstallRoot(opts.hermesHome || '~/.hermes')}/.hermes-update-in-progress.mutex`
  )

  // The marker probe, ownership reservation, process creation, and initial
  // lockfile publication must be one remote command. A second Desktop process
  // can therefore never observe an empty lock and spawn before this one records
  // its PID. The reservation is an atomic mkdir and is reclaimed only when its
  // owning remote shell is dead.
  const markerClear =
    `marker_clear() { if [ ! -e ${marker} ]; then return 0; fi; ` +
    `if [ ! -r ${marker} ]; then return 1; fi; ` +
    `owner=$(IFS= read -r owner < ${marker} && printf '%s' "$owner"); ` +
    `case "$owner" in ''|*[!0-9]*) return 1;; esac; if kill -0 "$owner" 2>/dev/null; then return 1; fi; return 0; }`

  const dashCmd =
    `ulimit -n ${REMOTE_NOFILE_SOFT_LIMIT} 2>/dev/null || true; ` +
    `exec env HERMES_DESKTOP=1 ${hermes} ${profileArgs}${subCmd}`

  const detachedShell = `eval "exec $1>&-"; ${dashCmd} </dev/null >> ${logPath} 2>&1 & echo $!`
  const detachedSpawn = `child=$("$(command -v setsid || echo nohup)" sh -c ${shq(detachedShell)} hermes-update-child "$1" & echo $!)`

  if (!opts.ownershipId || !opts.lockMetadata) {
    return withRemoteUpdateMutex(
      `${markerClear}; marker_clear || exit 75; ` +
        `mkdir -p "$(dirname ${logPath})" && ` +
        `${detachedSpawn}; ` +
        `marker_clear || { kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; exit 75; }; echo "$child"`,
      updateMutex
    )
  }

  const reservation = expandRemotePath(connectReservationPath(opts.ownershipId))
  const lockPath = expandRemotePath(lockfilePath(opts.ownershipId))
  const tokenPath = tokenFilePath ? expandRemotePath(tokenFilePath) : ''
  const ownerPath = `${reservation}/owner`
  const metadata = JSON.stringify({ schemaVersion: LOCKFILE_SCHEMA_VERSION, ...opts.lockMetadata, pid: '__PID__' })
  const reservationNonce = validateSpawnNonce(opts.reservationNonce || crypto.randomBytes(8).toString('hex'))

  return withRemoteUpdateMutex(
    `umask 077 && mkdir -p "$(dirname ${reservation})"; ` +
      // reservation/lockPath/ownerPath are expandRemotePath() output — already
      // shell-quoted fragments ("$HOME"'/…'). Embed raw so the assignment
      // expands $HOME; shq() here would store the quote characters literally
      // and every mkdir/cat against the variable fails forever.
      `reservation=${reservation}; lock=${lockPath}; owner_file=${ownerPath}; ` +
      `reservation_nonce=${shq(reservationNonce)}; ` +
      `i=0; while ! mkdir "$reservation" 2>/dev/null; do ` +
      `owner_data=$(cat "$owner_file" 2>/dev/null || true); owner_pid=${'${owner_data%%:*}'}; ` +
      `case "$owner_pid" in ''|*[!0-9]*) ;; *) kill -0 "$owner_pid" 2>/dev/null || { rm -rf "$reservation"; continue; };; esac; ` +
      `i=$((i+1)); [ "$i" -ge 600 ] && exit 75; sleep 0.05; done; ` +
      `printf '%s:%s' "$$" "$reservation_nonce" > "$owner_file"; ` +
      `trap 'rm -rf "$reservation"' EXIT; ` +
      `if [ -f "$lock" ]; then ` +
      `existing_pid=$(sed -n 's/.*"pid":\\([0-9][0-9]*\\).*/\\1/p' "$lock" | head -n 1); ` +
      `case "$existing_pid" in ''|*[!0-9]*) rm -f "$lock";; *) ` +
      `if kill -0 "$existing_pid" 2>/dev/null; then ${tokenPath ? `rm -f ${tokenPath}; ` : ''}printf EXISTING; exit 0; fi; rm -f "$lock";; esac; fi; ` +
      `${markerClear}; marker_clear || exit 75; mkdir -p "$(dirname ${logPath})" && ` +
      `${detachedSpawn}; ` +
      `marker_clear || { kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; exit 75; }; ` +
      // ${var//pat/rep} is a bashism — this payload runs under plain sh (dash
      // on Ubuntu), which aborts the whole script on it with "Bad
      // substitution" AFTER the child was spawned, orphaning the backend and
      // skipping the lockfile publication. Substitute with sed instead.
      `lock_json=$(printf '%s' ${shq(metadata)} | sed "s/__PID__/\${child}/"); ` +
      `temporary_lock="\${lock}.${reservationNonce}.tmp"; ` +
      `printf '%s' "$lock_json" > "$temporary_lock" && mv -f "$temporary_lock" "$lock" || { kill "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; exit 76; }; ` +
      `echo "$child"`,
    updateMutex
  )
}

export async function remoteSupportsSshOwnership(ssh, hermesPath) {
  const hermes = expandRemotePath(hermesPath)

  const out = await ssh.exec(
    `help="$(${hermes} serve --help 2>&1)"; ` +
      `printf '%s' "$help" | grep -q ssh-session-token-file && ` +
      `printf '%s' "$help" | grep -q ssh-owner-nonce && echo YES || echo NO`
  )

  return String(out || '')
    .trim()
    .endsWith('YES')
}

export async function scrapeReadyPort(ssh, logPath, { timeoutMs = DEFAULT_READY_TIMEOUT_MS, isAlive, signal }: any = {}) {
  const deadline = Date.now() + timeoutMs
  const remoteLog = expandRemotePath(logPath)

  while (Date.now() < deadline) {
    assertBootstrapNotSuperseded(signal)

    if (isAlive && !(await isAlive())) {
      const err: any = new Error('Remote dashboard process exited before announcing its port.')
      err.kind = 'spawn-failed'
      throw err
    }

    let tail

    try {
      tail = await ssh.exec(`cat ${remoteLog} 2>/dev/null || true`)
    } catch {
      tail = ''
    }

    const m = READY_RE.exec(String(tail || ''))

    if (m) {
      return parseInt(m[1], 10)
    }

    await new Promise(r => setTimeout(r, READY_POLL_INTERVAL_MS))
  }

  const err: any = new Error(`Timed out waiting for the remote dashboard to announce its port (${timeoutMs}ms).`)
  err.kind = 'ready-timeout'
  throw err
}

export async function spawnRemoteDashboard(
  ssh,
  { hermesPath, profile, token, ownershipId, hermesHome = '~/.hermes', assertInstallClear = async () => {} }
) {
  if (!(await remoteSupportsSshOwnership(ssh, hermesPath))) {
    const err: any = new Error(
      'The remote Hermes install does not support --ssh-session-token-file and --ssh-owner-nonce. ' +
        'Update Hermes on the remote host to continue using Desktop SSH mode.'
    )

    err.kind = 'update-required'
    throw err
  }

  const spawnNonce = crypto.randomBytes(8).toString('hex')
  const tokenFilePath = spawnTokenPath(ownershipId, spawnNonce)
  const logPath = spawnLogPath(ownershipId, spawnNonce)

  const tokenUploadPy =
    'import os,sys,stat\n' +
    `p=os.path.expanduser(${shq(tokenFilePath)})\n` +
    'd=os.path.dirname(p)\n' +
    'n=os.path.basename(p)\n' +
    'os.makedirs(d,mode=0o700,exist_ok=True)\n' +
    'df=os.O_RDONLY|getattr(os,"O_DIRECTORY",0)|getattr(os,"O_NOFOLLOW",0)\n' +
    'dd=os.open(d,df)\n' +
    'try:\n' +
    ' s=os.fstat(dd)\n' +
    ' if not stat.S_ISDIR(s.st_mode):raise SystemExit("unsafe token directory")\n' +
    ' if hasattr(os,"getuid") and s.st_uid!=os.getuid():raise SystemExit("token directory owner mismatch")\n' +
    ' if (s.st_mode&0o777)!=0o700:os.fchmod(dd,0o700)\n' +
    ' fl=os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0)\n' +
    ' now=__import__("time").time()\n' +
    ' for stale in os.listdir(dd):\n' +
    '  if stale.endswith(".token") and len(stale)==22:\n' +
    '   try:\n' +
    '    ss=os.stat(stale,dir_fd=dd,follow_symlinks=False)\n' +
    '    if stat.S_ISREG(ss.st_mode) and now-ss.st_mtime>3600:os.unlink(stale,dir_fd=dd)\n' +
    '   except OSError:pass\n' +
    ' fd=os.open(n,fl,0o600,dir_fd=dd)\n' +
    ' try:os.write(fd,sys.stdin.buffer.read())\n' +
    ' except BaseException:\n' +
    '  try:os.unlink(n,dir_fd=dd)\n' +
    '  except OSError:pass\n' +
    '  raise\n' +
    ' finally:os.close(fd)\n' +
    'finally:os.close(dd)'

  try {
    await ssh.exec(`python3 -c ${shq(tokenUploadPy)}`, { stdinData: token })
  } catch (error) {
    try {
      await ssh.exec(`rm -f ${expandRemotePath(tokenFilePath)}`)
    } catch {
      void 0
    }

    throw error
  }

  let out

  try {
    // Close the marker race after the token-file write and immediately before
    // process creation. The caller's probe imports no changing checkout code.
    await assertInstallClear()
    out = await ssh.exec(
      buildSpawnCommand(hermesPath, profile, {
        spawnNonce,
        tokenFilePath,
        logPath,
        hermesHome,
        ownershipId,
        reservationNonce: spawnNonce,
        lockMetadata: {
          ownershipId,
          spawnNonce,
          port: 0,
          profile,
          hermesPath,
          hermesHome,
          logPath,
          tokenFingerprint: fingerprintToken(token),
          protocolVersion: PROTOCOL_VERSION,
          startedAt: new Date().toISOString()
        }
      })
    )
  } catch (error) {
    try {
      await ssh.exec(`rm -f ${expandRemotePath(tokenFilePath)}`)
    } catch {
      void 0
    }

    throw error
  }

  const outputLines = String(out || '')
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (outputLines.at(-1) === 'EXISTING') {
    return { existing: true }
  }

  const pid = parseInt(outputLines.at(-1) || '', 10)

  if (!Number.isInteger(pid) || pid <= 0) {
    try {
      await ssh.exec(`rm -f ${expandRemotePath(tokenFilePath)}`)
    } catch {
      void 0
    }

    const err: any = new Error('Failed to launch the remote dashboard (no pid returned).')
    err.kind = 'spawn-failed'
    throw err
  }

  return { pid, spawnNonce, logPath, tokenFilePath }
}

// Best-effort forward teardown when a reuse attempt fails mid-flight, so we
// don't leak a forward before respawning. `deps.cancelForward` is optional.
export async function cancelForwardSafe(deps, localPort, remotePort) {
  if (typeof deps.cancelForward !== 'function') {
    return
  }

  try {
    await deps.cancelForward(localPort, remotePort)
  } catch {
    // best effort
  }
}

export function isForwardBindCollision(error) {
  return /address already in use|cannot listen to port|bind.*failed/i.test(String(error?.message || error || ''))
}

export async function openForward(deps, remotePort, attempts = 3) {
  let lastError

  for (let attempt = 0; attempt < attempts; attempt++) {
    const localPort = await deps.pickLocalPort()

    try {
      await deps.forward(localPort, remotePort)

      return localPort
    } catch (error) {
      lastError = error

      if (!isForwardBindCollision(error) || attempt === attempts - 1) {
        throw error
      }
    }
  }

  throw lastError
}

/**
 * Establish (or reuse) a remote dashboard and a tunnel to it. `deps` injects the
 * opened SshConnection, forward/pickLocalPort/waitForHermes, a token-gated
 * probeReuseProof, and adoptServedToken. Returns the connection descriptor
 * { baseUrl, token, tokenFingerprint, remotePort, localPort, pid, reused, platform }.
 */
export async function adoptOwnedServedToken(adoptServedToken, baseUrl, expectedToken, ssh, pid, label) {
  const token = await adoptServedToken(baseUrl, expectedToken, {
    childAlive: () => true,
    label
  })

  if (!(await remotePidAlive(ssh, pid))) {
    const error: any = new Error(`${label} exited while its served token was being resolved.`)
    error.kind = token === expectedToken ? 'spawn-failed' : 'foreign-backend'
    throw error
  }

  return token
}

export async function waitForRemoteSpawnCompletion(ssh, ownershipId, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const lock = await readLockfile(ssh, ownershipId)

    if (!lock) {
      return false
    }

    if (lock.port > 0) {
      return true
    }

    await new Promise(resolve => setTimeout(resolve, READY_POLL_INTERVAL_MS))
  }

  const error: any = new Error('Timed out waiting for the concurrent SSH connection to publish its backend.')
  error.kind = 'spawn-failed'
  throw error
}
