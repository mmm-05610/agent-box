/**
 * remote-lifecycle.ts — barrel over the remote dashboard lifecycle modules
 * (resolve, ownership, spawn, connect). Pure, electron-free; public surface
 * unchanged.
 */

export {
  connect,
} from './connect'
export {
  classifySshReuseProof,
  cleanupStale,
  connectReservationPath,
  DEFAULT_READY_TIMEOUT_MS,
  disconnect,
  expandRemotePath,
  fingerprintToken,
  isLockfileSkew,
  LOCKFILE_SCHEMA_VERSION,
  lockfilePath,
  mintToken,
  ownershipDirectory,
  pidIsOurDashboard,
  PROTOCOL_VERSION,
  readLockfile,
  READY_RE,
  REMOTE_LOCK_DIR,
  remotePidAlive,
  remoteProcessCreationTime,
  removeLockfile,
  shq,
  spawnLogPath,
  spawnTokenPath,
  SUPPORTED_REMOTE_OS,
  terminateOwnedDashboardForUpdate,
  validateRemotePath,
  writeLockfile,
} from './ownership'
export {
  assertRemoteInstallUpdateClear,
  listRemoteHermesProfiles,
  locateHermes,
  probeHermesVersion,
  probeRemoteHermesHome,
  probeRemotePlatform,
} from './resolve'
export {
  adoptOwnedServedToken,
  buildSpawnCommand,
  isForwardBindCollision,
  openForward,
  remoteSupportsSshOwnership,
  scrapeReadyPort,
  spawnRemoteDashboard,
} from './spawn'
