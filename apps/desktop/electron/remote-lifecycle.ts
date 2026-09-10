/**
 * remote-lifecycle.ts — barrel over the remote dashboard lifecycle modules
 * (resolve, ownership, spawn, connect). Pure, electron-free; public surface
 * unchanged.
 */

export {
  assertRemoteInstallUpdateClear,
  listRemoteHermesProfiles,
  locateHermes,
  probeHermesVersion,
  probeRemoteHermesHome,
  probeRemotePlatform,
} from './remote-lifecycle/resolve'
export {
  DEFAULT_READY_TIMEOUT_MS,
  LOCKFILE_SCHEMA_VERSION,
  PROTOCOL_VERSION,
  READY_RE,
  REMOTE_LOCK_DIR,
  SUPPORTED_REMOTE_OS,
  classifySshReuseProof,
  cleanupStale,
  connectReservationPath,
  disconnect,
  expandRemotePath,
  fingerprintToken,
  isLockfileSkew,
  lockfilePath,
  mintToken,
  ownershipDirectory,
  pidIsOurDashboard,
  readLockfile,
  remotePidAlive,
  remoteProcessCreationTime,
  removeLockfile,
  shq,
  spawnLogPath,
  spawnTokenPath,
  terminateOwnedDashboardForUpdate,
  validateRemotePath,
  writeLockfile,
} from './remote-lifecycle/ownership'
export {
  adoptOwnedServedToken,
  buildSpawnCommand,
  isForwardBindCollision,
  openForward,
  remoteSupportsSshOwnership,
  scrapeReadyPort,
  spawnRemoteDashboard,
} from './remote-lifecycle/spawn'
export {
  connect,
} from './remote-lifecycle/connect'
