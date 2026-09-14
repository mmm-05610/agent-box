import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxWorkspaces } from '@/store/agentbox-service'
import { asWireId, type WorkspaceRecord } from '@/types/wire/wire-v1'

import { refreshAgentBoxWorkspaces, resolveAgentBoxWorkspace } from './wire-workspace-catalog'

function workspace(
  id: string,
  kind: WorkspaceRecord['environment']['kind'],
  path: string,
  host: null | string = null
): WorkspaceRecord {
  return {
    accessibility: { executableForRole: null, readable: true, reasons: [], writable: true },
    archivedAt: null,
    connection: { state: 'connected' },
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: id,
    environment: { host, kind, user: null },
    id: asWireId(id),
    normalizedPath: path,
    updatedAt: '2026-09-14T00:00:00.000Z',
    version: 1
  }
}

beforeEach(() => $agentBoxWorkspaces.set([]))

describe('AgentBox Workspace catalog', () => {
  it('replaces the cache only with the server list', async () => {
    const item = workspace('workspace-1', 'local', 'C:/work/app')

    const client = {
      call: vi.fn(async () => ({ items: [item], nextCursor: null }))
    } as unknown as WireV1Client

    await expect(refreshAgentBoxWorkspaces(client)).resolves.toEqual([item])
    expect($agentBoxWorkspaces.get()).toEqual([item])
    expect(client.call).toHaveBeenCalledWith('workspaces.list', { includeArchived: false })
  })

  it('uses a direct service id without reinterpreting paths', () => {
    const direct = workspace('workspace-1', 'local', '/service/path')

    expect(
      resolveAgentBoxWorkspace([direct], { currentPath: '/different/path', selectedId: 'workspace-1' })
    ).toBe(direct)
  })

  it('matches local paths only against local environments', () => {
    const local = workspace('local', 'local', 'C:/Work/App')
    const wsl = workspace('wsl', 'wsl', 'C:/Work/App', 'Ubuntu')

    expect(resolveAgentBoxWorkspace([wsl, local], { currentPath: 'c:\\work\\app\\', selectedId: 'legacy' })).toBe(local)
  })

  it('matches WSL by distribution and Linux path, never by a same-path sibling distro', () => {
    const ubuntu = workspace('ubuntu', 'wsl', '/home/me/app/', 'Ubuntu')
    const debian = workspace('debian', 'wsl', '/home/me/app', 'Debian')

    expect(
      resolveAgentBoxWorkspace([debian, ubuntu], {
        currentPath: null,
        selectedId: 'legacy-wsl-id',
        wsl: { distribution: 'Ubuntu', rootPath: '/home/me/app' }
      })
    ).toBe(ubuntu)
  })

  it('fails closed when an old shell id cannot be proven equivalent to a service Workspace', () => {
    expect(resolveAgentBoxWorkspace([workspace('service', 'local', '/known')], { currentPath: null, selectedId: 'old' })).toBeNull()
  })
})
