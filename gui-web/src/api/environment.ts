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
  path: string | null
  version: string | null
}

export interface VersionInfo {
  current: string
  latest: string
  asset_url: string
  release_url: string
  notes: string
}

export async function fetchBinaries(): Promise<BinaryInfo[]> {
  return call<BinaryInfo[]>((api) => api.check_binaries!(), [])
}

export async function installBinary(agentType: string): Promise<void> {
  await call<void>((api) => api.install_binary!(agentType), undefined)
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

export async function downloadUpdate(): Promise<{ downloaded: string }> {
  return call<{ downloaded: string }>((api) => api.download_update!(), { downloaded: '' })
}

export async function openExternal(url: string): Promise<void> {
  await call<void>((api) => api.open_external!(url), undefined)
}
