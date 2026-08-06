/**
 * Environment API — binary detection, one-click install, update check
 *
 * Mirrors the "Environment / provisioning" backend surface: what agent
 * binaries exist inside WSL, whether agent-box has a newer release, and the
 * one-click install/update actions.  Zero agent knowledge here — detection is
 * registry-driven, the frontend just renders what the backend reports.
 */

import { call } from '@/lib/bridge'

export interface BinaryInfo {
  kind: 'agent' | 'acs'
  agentType: string
  name: string
  installed: boolean
  /** Found the executable but `--version` fails — installed but can't run. */
  broken: boolean
  path: string | null
  version: string | null
  /** Latest version on npm/pypi — null when the check failed/offline. */
  latestVersion: string | null
  /** Why the latest-version fetch failed, when it did — echoed to the UI. */
  latestError: string | null
}

export interface VersionInfo {
  current: string
  latest: string
  asset_url: string
  release_url: string
  notes: string
}

/** Map snake_case backend fields to the camelCase BinaryInfo shape. */
function toBinary(raw: Record<string, unknown>): BinaryInfo {
  return {
    kind: (raw.kind as BinaryInfo['kind']) ?? 'agent',
    agentType: raw.agent_type as string,
    name: raw.name as string,
    installed: Boolean(raw.installed),
    broken: Boolean(raw.broken),
    path: (raw.path as string | null) ?? null,
    version: (raw.version as string | null) ?? null,
    latestVersion: (raw.latest_version as string | null) ?? null,
    latestError: (raw.latest_error as string | null) ?? null,
  }
}

export async function fetchBinaries(): Promise<BinaryInfo[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.check_binaries!(), [])
  return raw.map(toBinary)
}

export async function installBinary(agentType: string): Promise<void> {
  const result = await call<{ ok: boolean; error?: string | null }>(
    (api) => api.install_binary!(agentType),
    { ok: true },
  )
  if (!result.ok) throw new Error(result.error ?? 'install failed')
}

export async function launchAcs(): Promise<void> {
  await call<void>((api) => api.launch_acs!(), undefined)
}

export async function fetchLatestVersion(): Promise<VersionInfo> {
  return call<VersionInfo>(
    (api) => api.get_latest_version!(),
    { current: '', latest: '', asset_url: '', release_url: '', notes: '' },
  )
}

export interface DownloadStart {
  started: boolean
  dest: string
  mode: 'bits' | 'browser'
}

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'done' | 'error' | 'browser'
  bytesWritten: number
  bytesTotal: number
  dest: string
}

export async function downloadUpdate(): Promise<DownloadStart> {
  return call<DownloadStart>(
    (api) => api.download_update!(),
    { started: false, dest: '', mode: 'browser' },
  )
}

export async function getDownloadProgress(): Promise<DownloadProgress> {
  return call<DownloadProgress>(
    (api) => api.get_download_progress!(),
    { status: 'idle', bytesWritten: 0, bytesTotal: 0, dest: '' },
  )
}

export async function launchUpdateInstaller(): Promise<void> {
  await call<void>((api) => api.launch_update_installer!(), undefined)
}

export async function openExternal(url: string): Promise<void> {
  await call<void>((api) => api.open_external!(url), undefined)
}
