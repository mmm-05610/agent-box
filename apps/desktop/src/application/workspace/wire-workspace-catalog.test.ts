import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxWorkspaces } from '@/store/agentbox-service'
import { asRequestId, asWireId, type WorkspaceRecord, type WorkspacesOpenResult } from '@/types/wire/wire-v1'

import { openAgentBoxWorkspace, refreshAgentBoxWorkspaces, resolveAgentBoxWorkspace } from './wire-workspace-catalog'

function workspace(
  id: string,
  kind: WorkspaceRecord['environment']['kind'],
  path: string,
  host: null | string = null,
  user: null | string = null
): WorkspaceRecord {
  return {
    accessibility: { executableForRole: null, readable: true, reasons: [], writable: true },
    archivedAt: null,
    connection: { state: 'connected' },
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: id,
    environment: { host, kind, user },
    id: asWireId(id),
    normalizedPath: path,
    updatedAt: '2026-09-14T00:00:00.000Z',
    version: 1
  }
}

const requestId = asRequestId('request-fixed-0001')

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

  it('registers a local folder with the service exactly as the shell holds it', async () => {
    const result: WorkspacesOpenResult = { created: true, workspace: workspace('workspace-9', 'local', 'C:/work/app') }
    const call = vi.fn(async (_method: string, _params?: unknown) => result)
    const client = { call } as unknown as WireV1Client

    await expect(
      openAgentBoxWorkspace(
        client,
        { environment: { host: null, kind: 'local', user: null }, path: 'C:\\work\\app' },
        { createRequestId: () => requestId }
      )
    ).resolves.toBe(result)

    expect(call.mock.calls.map(entry => entry[0])).toEqual(['workspaces.open'])
    expect(call).toHaveBeenCalledWith('workspaces.open', {
      environment: { host: null, kind: 'local', user: null },
      path: 'C:\\work\\app',
      requestId
    })
  })

  it('registers a WSL row with the host-verified identity and the POSIX root untouched', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => ({
      created: true,
      workspace: workspace('workspace-wsl', 'wsl', '/home/me/app', 'Ubuntu', 'me')
    }))

    const client = { call } as unknown as WireV1Client

    await openAgentBoxWorkspace(
      client,
      {
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' },
        path: '/home/me/app'
      },
      { createRequestId: () => requestId }
    )

    expect(call).toHaveBeenCalledWith('workspaces.open', {
      environment: { host: 'Ubuntu', kind: 'wsl', user: 'me' },
      path: '/home/me/app',
      requestId
    })
    expect(call.mock.calls.map(entry => entry[0])).toEqual(['workspaces.open'])
  })

  it('sends expectedVersion only when the caller supplies one', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => ({
      created: false,
      workspace: workspace('workspace-1', 'local', 'C:/a')
    }))

    const client = { call } as unknown as WireV1Client

    await openAgentBoxWorkspace(
      client,
      { environment: { host: null, kind: 'local', user: null }, expectedVersion: 4, path: 'C:/a' },
      { createRequestId: () => requestId }
    )

    expect(call).toHaveBeenCalledWith('workspaces.open', expect.objectContaining({ expectedVersion: 4 }))
  })

  it('lets a transport failure surface instead of inventing a Workspace', async () => {
    const client = {
      call: vi.fn(async () => {
        throw new Error('OUTCOME_UNKNOWN')
      })
    } as unknown as WireV1Client

    await expect(
      openAgentBoxWorkspace(client, { environment: { host: null, kind: 'local', user: null }, path: 'C:/a' })
    ).rejects.toThrow('OUTCOME_UNKNOWN')
    expect($agentBoxWorkspaces.get()).toEqual([])
  })

  it('uses an explicit service id for a known Workspace and skips path matching', () => {
    const direct = workspace('workspace-1', 'local', '/service/path')

    expect(resolveAgentBoxWorkspace([direct], { serviceWorkspaceId: 'workspace-1' })).toBe(direct)
  })

  it('never lets a shell row id that happens to equal a Wire id become a hit', () => {
    const unrelated = workspace('shell-row-1', 'local', '/somewhere/else')

    // The shell row id is 'shell-row-1' — the same string as this service id —
    // but the location is what decides, so nothing is reused.
    expect(resolveAgentBoxWorkspace([unrelated], { localPath: '/work/app' })).toBeNull()
  })

  it('matches local paths only against local environments', () => {
    const local = workspace('local', 'local', 'C:/Work/App')
    const wsl = workspace('wsl', 'wsl', 'C:/Work/App', 'Ubuntu')

    expect(resolveAgentBoxWorkspace([wsl, local], { localPath: 'c:\\work\\app\\' })).toBe(local)
  })

  it('keeps equal path strings apart across environments', () => {
    const local = workspace('local-app', 'local', '/work/app')
    const wsl = workspace('wsl-app', 'wsl', '/work/app', 'Ubuntu', 'me')

    expect(resolveAgentBoxWorkspace([local, wsl], { localPath: '/work/app' })).toBe(local)
    expect(resolveAgentBoxWorkspace([local, wsl], { wsl: { distribution: 'Ubuntu', rootPath: '/work/app' } })).toBe(wsl)
  })

  it('matches WSL by distribution and Linux path, never by a same-path sibling distro', () => {
    const ubuntu = workspace('ubuntu', 'wsl', '/home/me/app/', 'Ubuntu', 'me')
    const debian = workspace('debian', 'wsl', '/home/me/app', 'Debian', 'me')

    expect(
      resolveAgentBoxWorkspace([debian, ubuntu], { wsl: { distribution: 'Ubuntu', rootPath: '/home/me/app' } })
    ).toBe(ubuntu)
  })

  it('fails closed when a shell selection cannot be proven equivalent to a service Workspace', () => {
    expect(resolveAgentBoxWorkspace([workspace('service', 'local', '/known')], { localPath: '/unknown' })).toBeNull()
    expect(resolveAgentBoxWorkspace([workspace('service', 'local', '/known')], {})).toBeNull()
  })
})
