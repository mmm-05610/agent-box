import { describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, type WorkspacesBrowseResult } from '@/types/wire/wire-v1'

import { wireAgentBoxWorkspaceBrowserPort } from './wire-workspace-browser'

const environment = { host: 'Ubuntu', kind: 'wsl' as const, user: 'maoqh' }

const result: WorkspacesBrowseResult = {
  entries: [
    { canOpen: true, canWrite: true, kind: 'directory', name: 'projects', reason: null },
    { canOpen: true, canWrite: false, kind: 'directory', name: 'readonly', reason: null },
    { canOpen: false, canWrite: false, kind: 'directory', name: 'locked', reason: 'PERMISSION_DENIED' },
    { canOpen: false, canWrite: false, kind: 'file', name: 'notes.txt', reason: null },
    { canOpen: false, canWrite: false, kind: 'other', name: 'socket', reason: null }
  ],
  path: '/home/maoqh'
}

describe('wireAgentBoxWorkspaceBrowserPort', () => {
  it('sends the verified environment and the path exactly as held', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => result)

    const port = wireAgentBoxWorkspaceBrowserPort({ call } as unknown as WireV1Client, {
      createRequestId: () => asRequestId('request-browse-0001')
    })

    await expect(port.browse({ environment, path: '/home/maoqh/../maoqh' })).resolves.toBe(result)

    expect(call.mock.calls.map(entry => entry[0])).toEqual(['workspaces.browse'])
    expect(call).toHaveBeenCalledWith('workspaces.browse', {
      environment,
      path: '/home/maoqh/../maoqh',
      requestId: 'request-browse-0001'
    })
  })

  it('mints a fresh request id for every browse intent', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => result)
    const port = wireAgentBoxWorkspaceBrowserPort({ call } as unknown as WireV1Client)

    await port.browse({ environment, path: '/' })
    await port.browse({ environment, path: '/home' })

    const ids = call.mock.calls.map(entry => (entry[1] as { requestId: string }).requestId)

    expect(new Set(ids).size).toBe(2)
    expect(ids.every(id => id.startsWith('desktop-'))).toBe(true)
  })

  it('returns the service listing verbatim, including its access facts', async () => {
    const call = vi.fn(async (_method: string, _params?: unknown) => result)
    const port = wireAgentBoxWorkspaceBrowserPort({ call } as unknown as WireV1Client)

    const listed = await port.browse({ environment, path: '/home/maoqh' })

    expect(listed.path).toBe('/home/maoqh')
    expect(listed.entries.map(entry => [entry.name, entry.kind, entry.canOpen, entry.canWrite])).toEqual([
      ['projects', 'directory', true, true],
      ['readonly', 'directory', true, false],
      ['locked', 'directory', false, false],
      ['notes.txt', 'file', false, false],
      ['socket', 'other', false, false]
    ])
    expect(listed.entries[2]?.reason).toBe('PERMISSION_DENIED')
  })

  it('lets a typed failure and a transport failure surface untouched', async () => {
    const denied = {
      call: vi.fn(async () => {
        throw new Error('WSL_DIRECTORY_NO_PERMISSION')
      })
    } as unknown as WireV1Client

    const port = wireAgentBoxWorkspaceBrowserPort(denied)

    await expect(port.browse({ environment, path: '/root' })).rejects.toThrow('WSL_DIRECTORY_NO_PERMISSION')

    const offline = {
      call: vi.fn(async () => {
        throw new Error('UNAVAILABLE')
      })
    } as unknown as WireV1Client

    await expect(wireAgentBoxWorkspaceBrowserPort(offline).browse({ environment, path: '/' })).rejects.toThrow(
      'UNAVAILABLE'
    )
  })
})
