// IPC surface for the WSL Workspace feature (work order 35). State authority
// stays with the injected host service — this module validates renderer input,
// forwards it, and normalizes every outcome to a typed result the renderer can
// branch on. It never touches legacy-hermes.

import { ipcMain } from 'electron'

import type { WslWorkspaceHost } from '../host-capabilities/platform/wsl-workspace'

export interface RegisterWorkspaceIpcDeps {
  wslWorkspaceHost: WslWorkspaceHost
}

function payloadObject(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

/**
 * A host service should only reject through its typed outcomes; anything that
 * throws is a bug or an unexpected environment failure, normalized here so the
 * renderer never sees an unstructured rejection.
 */
function unexpectedError(error: unknown) {
  return {
    ok: false,
    code: 'WSL_LIST_FAILED',
    message: String((error as Error)?.message || error || 'Unexpected failure.'),
    retryable: true
  }
}

export function registerWorkspaceIpc({ wslWorkspaceHost }: RegisterWorkspaceIpcDeps): void {
  ipcMain.handle('hermes:wsl-workspace:discover', async () => {
    try {
      return await wslWorkspaceHost.discover()
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:connect', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.connect({
        distribution: body.distribution,
        operationId: body.operationId,
        user: body.user
      })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:directories:list', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.listDirectories({
        connectionId: body.connectionId,
        operationId: body.operationId,
        path: body.path,
        showHidden: body.showHidden === true,
        workspaceId: body.workspaceId
      })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:save', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.saveWorkspace({
        connectionId: body.connectionId,
        name: body.name,
        path: body.path,
        requestId: body.requestId
      })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:workspaces:list', () => {
    try {
      return wslWorkspaceHost.listWorkspaces()
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:rename', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.renameWorkspace({ workspaceId: body.workspaceId, name: body.name })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:archive', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.archiveWorkspace({ workspaceId: body.workspaceId })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:reconnect', async (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return await wslWorkspaceHost.reconnectWorkspace({ workspaceId: body.workspaceId })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:connection:release', (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return wslWorkspaceHost.releaseConnection({ connectionId: body.connectionId })
    } catch (error) {
      return unexpectedError(error)
    }
  })

  ipcMain.handle('hermes:wsl-workspace:operation:cancel', (_event, payload) => {
    const body = payloadObject(payload)

    try {
      return wslWorkspaceHost.cancelOperation({ operationId: body.operationId })
    } catch (error) {
      return unexpectedError(error)
    }
  })
}
