/**
 * api/workspace.ts — the narrow WorkspaceHostPort client (work order 35).
 *
 * The renderer's only door to the WSL Workspace host service. Thin on
 * purpose: every call forwards to the typed preload bridge and returns the
 * host's structured outcome verbatim. No store, no application logic.
 */

import type {
  WslConnectRequest,
  WslConnectResult,
  WslDirectoryListing,
  WslDiscoveryResult,
  WslFailure,
  WslListDirectoriesRequest,
  WslReconnectResult,
  WslSaveWorkspaceRequest,
  WslSaveWorkspaceResult,
  WslWorkspacesResult
} from '@/types/workspace'

function bridge(): Window['hermesDesktop']['wslWorkspace'] {
  const api = window.hermesDesktop?.wslWorkspace

  if (!api) {
    throw new Error('Desktop IPC bridge is unavailable')
  }

  return api
}

export function discoverWsl(): Promise<WslDiscoveryResult> {
  return bridge().discover()
}

export function connectWsl(request: WslConnectRequest): Promise<WslConnectResult | WslFailure> {
  return bridge().connect(request)
}

export function listWslDirectories(request: WslListDirectoriesRequest): Promise<WslDirectoryListing | WslFailure> {
  return bridge().listDirectories(request)
}

export function saveWslWorkspace(request: WslSaveWorkspaceRequest): Promise<WslSaveWorkspaceResult | WslFailure> {
  return bridge().saveWorkspace(request)
}

export function listWslWorkspaces(): Promise<WslWorkspacesResult | WslFailure> {
  return bridge().listWorkspaces()
}

export function reconnectWslWorkspace(workspaceId: string): Promise<WslReconnectResult> {
  return bridge().reconnectWorkspace({ workspaceId })
}

export function releaseWslConnection(connectionId: string): Promise<{ ok: true; released: boolean }> {
  return bridge().releaseConnection({ connectionId })
}

export function cancelWslOperation(operationId: string): Promise<{ ok: true; cancelled: boolean }> {
  return bridge().cancelOperation({ operationId })
}
