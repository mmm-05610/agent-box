/**
 * types/workspace.ts — WSL Workspace DTOs (work order 35) and the neutral
 * workspace list shapes (work order 36R).
 *
 * Neutral request/response shapes and the persisted Workspace projection.
 * Rank 0: imports nothing product-side. These mirror the Electron host
 * service's outcome shapes; the renderer never parses wsl.exe output.
 */

/** Which authority a workspace row comes from (36R): the backend project tree
 *  or the Electron host's WSL workspace store. View-preference keys build on
 *  this so a hide never crosses backends. */
export type WorkspaceBackend = 'local' | 'wsl'

/** One row of the unified workspace list — a VIEW of two authoritative stores,
 *  carrying neither sessions nor online status. Neutral on purpose: any layer
 *  may consume it without importing features/store/application. */
export interface WorkspaceListItem {
  id: string
  backend: WorkspaceBackend
  name: string
  /** Local project path (desktop path space) or the WSL rootPath (POSIX). */
  path: null | string
  /** Secondary line (e.g. `Ubuntu · /home/…` for WSL rows). */
  detail: null | string
  sessionCount: number
}

/** A workspace that answered a sidebar search by its name or its path. */
export interface WorkspaceSearchHit {
  item: WorkspaceListItem
  matchedBy: 'name' | 'path'
}

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
  | 'WSL_STORE_ILLEGAL_VERSION'

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
  /** Removal is an archive (36R): non-null hides the row; a later save of the
   *  same location restores the SAME record/id. Null = live. */
  archivedAt: number | null
}

export interface WslWorkspacesResult {
  ok: true
  /** A projection only — deliberately carries no online status. Archived
   *  records are excluded: the list is the live projection. */
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

/** Archive = the sidebar's "remove" (36R): the record survives behind its
 *  marker; `archived: false` answers an already-archived or unknown id. */
export type WslArchiveWorkspaceResult = {
  ok: true
  archived: boolean
  workspace: WslWorkspaceRecord | null
}
