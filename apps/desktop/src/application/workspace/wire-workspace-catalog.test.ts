import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxWorkspaces } from '@/store/agentbox-service'
import { asRequestId, asWireId, type WorkspaceRecord, type WorkspacesOpenResult } from '@/types/wire/wire-v1'

import {
  archiveAgentBoxWorkspace,
  openAgentBoxWorkspace,
  refreshAgentBoxWorkspaces,
  resolveAgentBoxWorkspace
} from './wire-workspace-catalog'

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

  it('uses an explicit service id for a known Workspace and skips every other rule', () => {
    const direct = workspace('workspace-1', 'wsl', '/service/path', 'Ubuntu', 'someone-else')

    // A Session's own workspaceId is authoritative even when the shell
    // selection could never have matched that record's identity.
    expect(resolveAgentBoxWorkspace([direct], { localPath: '/elsewhere', serviceWorkspaceId: 'workspace-1' })).toBe(
      direct
    )
    expect(resolveAgentBoxWorkspace([direct], { serviceWorkspaceId: 'missing' })).toBeNull()
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
    expect(
      resolveAgentBoxWorkspace([local, wsl], { wsl: { distribution: 'Ubuntu', rootPath: '/work/app', user: 'me' } })
    ).toBe(wsl)
  })

  it('matches WSL by distribution and Linux path, never by a same-path sibling distro', () => {
    const ubuntu = workspace('ubuntu', 'wsl', '/home/me/app/', 'Ubuntu', 'me')
    const debian = workspace('debian', 'wsl', '/home/me/app', 'Debian', 'me')

    expect(
      resolveAgentBoxWorkspace([debian, ubuntu], {
        wsl: { distribution: 'Ubuntu', rootPath: '/home/me/app', user: 'me' }
      })
    ).toBe(ubuntu)
  })

  it('keeps two users of the same distro and path apart', () => {
    const alice = workspace('alice-app', 'wsl', '/home/app', 'Ubuntu', 'alice')
    const bob = workspace('bob-app', 'wsl', '/home/app', 'Ubuntu', 'bob')

    expect(
      resolveAgentBoxWorkspace([bob, alice], { wsl: { distribution: 'Ubuntu', rootPath: '/home/app', user: 'alice' } })
    ).toBe(alice)
    expect(
      resolveAgentBoxWorkspace([alice, bob], { wsl: { distribution: 'Ubuntu', rootPath: '/home/app', user: 'bob' } })
    ).toBe(bob)
  })

  it('fails closed when only another user holds that distro and path', () => {
    const bob = workspace('bob-app', 'wsl', '/home/app', 'Ubuntu', 'bob')

    expect(
      resolveAgentBoxWorkspace([bob], { wsl: { distribution: 'Ubuntu', rootPath: '/home/app', user: 'alice' } })
    ).toBeNull()
    // A record whose user is unknown is not the same identity either.
    expect(
      resolveAgentBoxWorkspace([workspace('unknown-user', 'wsl', '/home/app', 'Ubuntu', null)], {
        wsl: { distribution: 'Ubuntu', rootPath: '/home/app', user: 'alice' }
      })
    ).toBeNull()
  })

  it('never reuses a local record that carries a host or a user', () => {
    const machine = workspace('machine', 'local', '/work/app')
    const remoteish = workspace('remoteish', 'local', '/work/app', 'some-host', 'someone')

    expect(resolveAgentBoxWorkspace([remoteish], { localPath: '/work/app' })).toBeNull()
    expect(resolveAgentBoxWorkspace([remoteish, machine], { localPath: '/work/app' })).toBe(machine)
  })

  it('fails closed when a shell selection cannot be proven equivalent to a service Workspace', () => {
    expect(resolveAgentBoxWorkspace([workspace('service', 'local', '/known')], { localPath: '/unknown' })).toBeNull()
    expect(resolveAgentBoxWorkspace([workspace('service', 'local', '/known')], {})).toBeNull()
  })
})

describe('archiveAgentBoxWorkspace', () => {
  const requestId = asRequestId('request-archive-0001')

  it('sends the service id and the version it is replacing', async () => {
    const archived: WorkspaceRecord = {
      ...workspace('workspace-1', 'local', 'C:/work/app'),
      archivedAt: '2026-09-14T02:00:00.000Z',
      version: 4
    }

    const call = vi.fn(async (_method: string, _params?: unknown) => ({ workspace: archived }))
    const client = { call } as unknown as WireV1Client

    await expect(
      archiveAgentBoxWorkspace(
        client,
        { expectedVersion: 3, workspaceId: 'workspace-1' },
        { createRequestId: () => requestId }
      )
    ).resolves.toBe(archived)

    expect(call.mock.calls.map(entry => entry[0])).toEqual(['workspaces.archive'])
    expect(call).toHaveBeenCalledWith('workspaces.archive', {
      expectedVersion: 3,
      requestId,
      workspaceId: 'workspace-1'
    })
  })

  it('mints a fresh request id for every archive intent', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => ({
      workspace: { ...workspace('workspace-1', 'local', 'C:/work/app'), archivedAt: '2026-09-14T02:00:00.000Z' }
    }))

    const client = { call } as unknown as WireV1Client

    await archiveAgentBoxWorkspace(client, { expectedVersion: 1, workspaceId: 'workspace-1' })
    await archiveAgentBoxWorkspace(client, { expectedVersion: 1, workspaceId: 'workspace-1' })

    const ids = call.mock.calls.map(entry => (entry[1] as { requestId: string }).requestId)

    expect(new Set(ids).size).toBe(2)
    expect(ids.every(id => id.startsWith('desktop-'))).toBe(true)
  })

  it('lets a version conflict and a transport failure surface untouched, changing nothing locally', async () => {
    const conflict = {
      call: vi.fn(async () => {
        throw new Error('CONFLICT_VERSION')
      })
    } as unknown as WireV1Client

    await expect(
      archiveAgentBoxWorkspace(conflict, { expectedVersion: 1, workspaceId: 'workspace-1' })
    ).rejects.toThrow('CONFLICT_VERSION')

    const offline = {
      call: vi.fn(async () => {
        throw new Error('UNAVAILABLE')
      })
    } as unknown as WireV1Client

    await expect(archiveAgentBoxWorkspace(offline, { expectedVersion: 1, workspaceId: 'workspace-1' })).rejects.toThrow(
      'UNAVAILABLE'
    )

    // The application layer never writes the projection itself: only a caller
    // that received an answer decides what the cache does.
    expect($agentBoxWorkspaces.get()).toEqual([])
  })
})
