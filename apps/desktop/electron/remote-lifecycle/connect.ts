import { assertBootstrapNotSuperseded } from '../ssh-connection'

import { cleanupStale, DEFAULT_READY_TIMEOUT_MS, expandRemotePath, fingerprintToken, isLockfileSkew, lockfilePath, mintToken, pidIsOurDashboard, PROTOCOL_VERSION, readLockfile, remotePidAlive, remoteProcessCreationTime, writeLockfile } from './ownership'
import { assertRemoteInstallUpdateClear, locateHermes, probeHermesVersion, probeRemoteHermesHome, probeRemotePlatform } from './resolve'
import { adoptOwnedServedToken, cancelForwardSafe, openForward, scrapeReadyPort, spawnRemoteDashboard, waitForRemoteSpawnCompletion } from './spawn'

/** The connect orchestrator: resolve → gate → reuse-or-spawn → adopt. */


export async function connect(deps) {
  const {
    ssh,
    profile = '',
    remoteHermesPath = '',
    ownershipId,
    forward,
    pickLocalPort,
    waitForHermes,
    probeReuseProof,
    adoptServedToken,
    rememberLog = () => {},
    readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
    signal
  } = deps

  const log = msg => rememberLog(`[ssh-lifecycle] ${msg}`)

  assertBootstrapNotSuperseded(signal)
  const platform = deps.platform ?? (await probeRemotePlatform(ssh))
  log(`remote platform ${platform.os}/${platform.arch}`)
  const hermesHome = await probeRemoteHermesHome(ssh)
  await assertRemoteInstallUpdateClear(ssh, hermesHome)
  const hermesPath = await locateHermes(ssh, remoteHermesPath)
  log(`located hermes at ${hermesPath}`)
  const hermesVersion = await probeHermesVersion(ssh, hermesPath)

  if (hermesVersion) {
    log(`remote hermes version: ${hermesVersion}`)
  }

  const reuseToken = deps.reuseToken || ''
  const lock = await readLockfile(ssh, ownershipId)

  if (isLockfileSkew(lock)) {
    // #95532: the lockfile exists but was written by a different (fork) build
    // or is corrupt. FAIL CLOSED: no reap, no removal, no overwrite, no spawn
    // on top of foreign live state — reaping here is how live tunnels die.
    const lpath = lockfilePath(ownershipId)
    log(
      `lockfile schema/ownership skew (${lock.reason}) at ${lpath} — failing closed: skipping reap, leaving remote state untouched`
    )

    const error: any = new Error(
      `The remote ownership record ${lpath} does not match this Hermes Desktop build (${lock.reason}). ` +
        'It was probably written by a different or modified desktop build sharing this remote, or the file is corrupt. ' +
        'Refusing to reap or overwrite it — that could kill a live SSH backend owned by another build. ' +
        'If nothing else uses this remote, delete that file on the remote host and reconnect.'
    )

    error.kind = 'remote-lockfile-skew'
    throw error
  }

  if (lock) {
    const pidAlive = await remotePidAlive(ssh, lock.pid)

    const owned =
      pidAlive &&
      (await pidIsOurDashboard(
        ssh,
        lock.pid,
        lock.spawnNonce,
        lock.hermesPath,
        lock.hermesHome,
        ownershipId,
        lock.profile
      ))

    const reusable =
      pidAlive &&
      owned &&
      lock.port > 0 &&
      lock.profile === profile &&
      Boolean(reuseToken) &&
      lock.tokenFingerprint === fingerprintToken(reuseToken) &&
      lock.hermesPath === hermesPath &&
      lock.hermesHome === hermesHome

    if (reusable) {
      const creationTime = lock.creationTime || (await remoteProcessCreationTime(ssh, lock.pid))

      if (creationTime && !lock.creationTime) {
        await writeLockfile(ssh, ownershipId, { ...lock, creationTime })
        lock.creationTime = creationTime
      }

      assertBootstrapNotSuperseded(signal)
      await assertRemoteInstallUpdateClear(ssh, hermesHome)
      const localPort = await openForward(deps, lock.port)

      try {
        const baseUrl = `http://127.0.0.1:${localPort}`
        let reuseClassification

        try {
          reuseClassification = await probeReuseProof(baseUrl, reuseToken, lock.spawnNonce)
        } catch (cause) {
          const error: any = new Error('Could not verify the existing SSH backend.')
          error.kind = 'transient-transport-error'
          error.cause = cause
          throw error
        }

        if (reuseClassification === 'authenticated-stale') {
          assertBootstrapNotSuperseded(signal)
          await cancelForwardSafe(deps, localPort, lock.port)
          await assertRemoteInstallUpdateClear(ssh, hermesHome)
          await cleanupStale(ssh, ownershipId, lock)
        } else if (reuseClassification === 'authenticated-ok') {
          const token = await adoptOwnedServedToken(
            adoptServedToken,
            baseUrl,
            reuseToken,
            ssh,
            lock.pid,
            'reused remote dashboard'
          )

          assertBootstrapNotSuperseded(signal)
          log(`reusing remote dashboard pid=${lock.pid} port=${lock.port}`)

          return {
            baseUrl,
            token,
            tokenFingerprint: fingerprintToken(token),
            remotePort: lock.port,
            localPort,
            pid: lock.pid,
            reused: true,
            platform,
            hermesPath,
            hermesVersion,
            ownershipId,
            spawnNonce: lock.spawnNonce,
            logPath: lock.logPath,
            hermesHome,
            startedAt: lock.startedAt,
            creationTime: lock.creationTime || ''
          }
        } else {
          const error: any = new Error('SSH reuse proof returned an invalid classification.')
          error.kind = 'transient-transport-error'
          throw error
        }
      } catch (error) {
        await cancelForwardSafe(deps, localPort, lock.port)
        throw error
      }
    } else {
      assertBootstrapNotSuperseded(signal)
      await assertRemoteInstallUpdateClear(ssh, hermesHome)
      await cleanupStale(ssh, ownershipId, lock, pidAlive)
    }
  }

  assertBootstrapNotSuperseded(signal)
  await assertRemoteInstallUpdateClear(ssh, hermesHome)
  const spawnToken = mintToken()

  const spawned = await spawnRemoteDashboard(ssh, {
    hermesPath,
    profile,
    token: spawnToken,
    ownershipId,
    hermesHome,
    assertInstallClear: () => assertRemoteInstallUpdateClear(ssh, hermesHome)
  })

  if (spawned.existing) {
    if (!reuseToken) {
      const error: any = new Error(
        'Another SSH connection owns this remote dashboard; a session token is required to reuse it.'
      )

      error.kind = 'remote-ownership-contended'
      throw error
    }

    const published = await waitForRemoteSpawnCompletion(ssh, ownershipId, readyTimeoutMs)

    if (!published) {
      return connect({ ...deps, reuseToken })
    }

    return connect({ ...deps, reuseToken })
  }

  const { pid, spawnNonce, logPath, tokenFilePath } = spawned
  log(`spawned remote dashboard pid=${pid}`)
  const creationTime = await remoteProcessCreationTime(ssh, pid)

  const ownedSpawn = {
    ownershipId,
    spawnNonce,
    pid,
    port: 0,
    profile,
    hermesPath,
    hermesHome,
    logPath,
    tokenFingerprint: fingerprintToken(spawnToken),
    protocolVersion: PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    ...(creationTime ? { creationTime } : {})
  }

  let localPort = 0
  let remotePort = 0

  try {
    // Write the ownership record IMMEDIATELY (port=0): a supersede between
    // spawn and readiness whose cleanup cannot reach the box must not leave a
    // lockless orphan — the next connect reaps it by exact ownership via this
    // record. Inside the try: if this write itself fails, the catch still
    // kills the just-spawned process via the in-memory record.
    await writeLockfile(ssh, ownershipId, ownedSpawn)
    remotePort = await scrapeReadyPort(ssh, logPath, {
      timeoutMs: readyTimeoutMs,
      isAlive: () => remotePidAlive(ssh, pid),
      signal
    })
    assertBootstrapNotSuperseded(signal)
    log(`remote dashboard bound port ${remotePort}`)

    localPort = await openForward(deps, remotePort)
    assertBootstrapNotSuperseded(signal)
    const baseUrl = `http://127.0.0.1:${localPort}`
    // Probe with the token this backend was spawned with
    // (HERMES_DASHBOARD_SESSION_TOKEN). A runtime that gates GET /api/health
    // behind that token would otherwise 401 an anonymous probe forever: the
    // anonymous 401 looks like a pre-/api/health backend, so the probe falls back
    // to /api/status — which the same gate also rejects — and readiness times out
    // against a backend that is actually healthy.
    await waitForHermes(baseUrl, spawnToken, undefined, 'token')
    assertBootstrapNotSuperseded(signal)

    const token = await adoptOwnedServedToken(adoptServedToken, baseUrl, spawnToken, ssh, pid, 'remote dashboard')

    assertBootstrapNotSuperseded(signal)
    const tokenFingerprint = fingerprintToken(token)
    await writeLockfile(ssh, ownershipId, { ...ownedSpawn, port: remotePort, tokenFingerprint })
    assertBootstrapNotSuperseded(signal)

    return {
      baseUrl,
      token,
      tokenFingerprint,
      remotePort,
      localPort,
      pid,
      reused: false,
      platform,
      hermesPath,
      hermesVersion,
      ownershipId,
      spawnNonce,
      logPath,
      hermesHome,
      startedAt: ownedSpawn.startedAt,
      creationTime: ownedSpawn.creationTime || ''
    }
  } catch (error) {
    if (localPort && remotePort) {
      await cancelForwardSafe(deps, localPort, remotePort)
    }

    try {
      await ssh.exec(`rm -f ${expandRemotePath(tokenFilePath)}`)
    } catch {
      void 0
    }

    await cleanupStale(ssh, ownershipId, ownedSpawn)
    throw error
  }
}


