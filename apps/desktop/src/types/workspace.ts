/**
 * types/workspace.ts — WSL Workspace DTOs (work order 35).
 *
 * Neutral request/response shapes and the persisted Workspace projection.
 * Rank 0: imports nothing product-side. These mirror the Electron host
 * service's outcome shapes; the renderer never parses wsl.exe output.
 */

export type WslWorkspaceErrorCode =
  | 'WSL_UNAVAILABLE'
  | 'WSL_UNKNOWN_DISTRIBUTION'
  | 'WSL_USER_NOT_FOUND'
  | 'WSL_CONNECT_TIMEOUT'
  | 'WSL_CONNECT_FAILED'
  | 'WSL_CANCELLED'
  | 'WSL_CONNECTION_EXPIRED'
  | 'WSL_INVALID_PATH'
  | 'WSL_DIRECTORY_NOT_FOUND'
  | 'WSL_DIRECTORY_NO_PERMISSION'
  | 'WSL_LIST_FAILED'
  | 'WSL_LIST_OVERFLOW'
  | 'WSL_SAVE_FAILED'
  | 'WSL_NOT_FOUND'
  | 'WSL_STORE_FUTURE_VERSION'

export interface WslFailure {
  ok: false
  code: WslWorkspaceErrorCode
  /** Safe host-side copy; the renderer renders localized text per code. */
  message: string
  retryable: boolean
}

export interface WslDistributionInfo {
  name: string
  state: string
  version: null | string
  isDefault: boolean
}

export type WslDiscoveryResult =
  | {
      ok: true
      available: true
      distributions: WslDistributionInfo[]
      defaultDistribution: null | string
    }
  | { ok: true; available: false; reason: string }
  | WslFailure

export interface WslConnectRequest {
  distribution: string
  /** Empty/absent = the distribution's default user. */
  user?: string
  /** Renderer-generated id used to cancel this in-flight connect. */
  operationId?: string
}

export interface WslConnectResult {
  ok: true
  /** Opaque, host-owned, temporary. Expires; not a backend ref. */
  connectionId: string
  distribution: string
  /** The identity actually verified on the distribution. */
  user: string
  userIsDefault: boolean
  home: string
}

export interface WslListDirectoriesRequest {
  connectionId?: string
  operationId?: string
  path: string
  showHidden?: boolean
  workspaceId?: string
}

export interface WslDirectoryEntry {
  name: string
  path: string
}

export interface WslDirectoryListing {
  ok: true
  path: string
  parent: string
  entries: WslDirectoryEntry[]
}

export interface WslSaveWorkspaceRequest {
  connectionId: string
  name?: string
  path: string
  /** Idempotency key: a retried save returns the first record, never a dupe. */
  requestId: string
}

export interface WslSaveWorkspaceResult {
  ok: true
  workspace: WslWorkspaceRecord
  requestIdReplay: boolean
}

export interface WslWorkspaceRecord {
  id: string
  name: string
  kind: 'wsl'
  distribution: string
  /** null = the distribution's default user at save time. */
  configuredUser: null | string
  /** Identity actually verified when the record was saved. */
  actualUser: string
  rootPath: string
  createdAt: number
  updatedAt: number
}

export interface WslWorkspacesResult {
  ok: true
  /** A projection only — deliberately carries no online status. */
  workspaces: WslWorkspaceRecord[]
}

export interface WslRenameWorkspaceRequest {
  workspaceId: string
  /** Trimmed by the host; empty/absent is a typed failure, never a silent keep. */
  name: string
}

export type WslRenameWorkspaceResult = {
  ok: true
  workspace: WslWorkspaceRecord
}

export type WslReconnectResult =
  | {
      ok: true
      status: 'connected'
      workspace: WslWorkspaceRecord
      actualUser: string
      /** The default user's identity changed since save; reported, never silently re-bound. */
      userChanged: boolean
    }
  | { ok: true; status: 'failed'; code: WslWorkspaceErrorCode; message: string }
  | WslFailure
