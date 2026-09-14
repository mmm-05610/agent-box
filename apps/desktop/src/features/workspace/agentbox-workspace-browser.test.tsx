import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentBoxWorkspaceBrowserPort } from '@/application/workspace/wire-workspace-browser'
import { type EnvironmentIdentity, type WorkspacesBrowseResult } from '@/types/wire/wire-v1'

import { AgentBoxWorkspaceBrowser } from './agentbox-workspace-browser'

const environment: EnvironmentIdentity = { host: 'Ubuntu', kind: 'wsl', user: 'maoqh' }

const listing = (path: string, entries: WorkspacesBrowseResult['entries'] = []): WorkspacesBrowseResult => ({
  entries,
  path
})

const directory = (
  name: string,
  overrides: {
    canOpen?: boolean
    canWrite?: boolean
    kind?: 'directory' | 'file' | 'other'
    reason?: null | string
  } = {}
): WorkspacesBrowseResult['entries'][number] => ({
  canOpen: overrides.canOpen ?? true,
  canWrite: overrides.canWrite ?? true,
  kind: overrides.kind ?? 'directory',
  name,
  reason: overrides.reason ?? null
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void

  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })

  return { promise, reject, resolve }
}

function port(browse: (input: { environment: EnvironmentIdentity; path: string }) => Promise<WorkspacesBrowseResult>) {
  return { browse: vi.fn(browse) }
}

function renderBrowser(overrides: {
  initialPath?: string
  onBack?: () => void
  onChoose?: (path: string) => Promise<{ message: string; ok: false } | { ok: true }>
  port: AgentBoxWorkspaceBrowserPort
}) {
  return render(
    <AgentBoxWorkspaceBrowser
      environment={environment}
      initialPath={overrides.initialPath ?? '/home/maoqh'}
      onBack={overrides.onBack ?? vi.fn()}
      onChoose={overrides.onChoose ?? (async () => ({ ok: true }) as const)}
      port={overrides.port}
    />
  )
}

const pathInput = () => screen.getByRole('textbox', { name: 'Path' }) as HTMLInputElement
const entryRow = (name: string) => screen.getByText(name).closest('button') as HTMLButtonElement
const chooseButton = () => screen.getByRole('button', { name: /Use this directory/ })

afterEach(cleanup)

describe('AgentBoxWorkspaceBrowser', () => {
  it('browses the initial path as soon as it mounts, for the verified environment', async () => {
    const browse = vi.fn(async () => listing('/home/maoqh', [directory('projects')]))
    renderBrowser({ initialPath: '/home/maoqh', port: port(browse) })

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(1))
    expect(browse).toHaveBeenCalledWith({ environment, path: '/home/maoqh' })
    expect(await screen.findByText('projects')).toBeTruthy()
  })

  it('adopts the canonical path the service answered with', async () => {
    const browse = vi.fn(async (_input: { path: string }) => listing('/home/maoqh', [directory('projects')]))
    renderBrowser({ initialPath: '/home/maoqh/', port: port(browse) })

    await waitFor(() => expect(pathInput().value).toBe('/home/maoqh'))

    // The canonical path is what the next navigation carries.
    fireEvent.click(screen.getByRole('button', { name: 'Up one level' }))
    await waitFor(() => expect(browse).toHaveBeenCalledTimes(2))
    expect(browse.mock.calls[1]?.[0]).toEqual({ environment, path: '/home' })
  })

  it('requests the typed path, the parent, and the child the user picked', async () => {
    const browse = vi.fn(async (input: { path: string }) => {
      if (input.path === '/home/maoqh') {
        return listing('/home/maoqh', [directory('projects'), directory('notes', { kind: 'file' })])
      }

      if (input.path === '/home/maoqh/projects') {
        return listing('/home/maoqh/projects', [directory('app')])
      }

      return listing(input.path)
    })

    renderBrowser({ port: port(browse) })

    await screen.findByText('projects')

    fireEvent.change(pathInput(), { target: { value: '/srv/data' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(browse).toHaveBeenCalledTimes(2))
    expect(browse.mock.calls[1]?.[0]).toEqual({ environment, path: '/srv/data' })

    // Enter a child directory: POSIX join, canonical path carried forward.
    fireEvent.change(pathInput(), { target: { value: '/home/maoqh' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    await screen.findByText('projects')

    fireEvent.click(entryRow('projects'))
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith({ environment, path: '/home/maoqh/projects' }))
    expect(await screen.findByText('app')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Up one level' }))
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith({ environment, path: '/home/maoqh' }))
  })

  it('keeps the newer listing when an older request answers late, success or failure', async () => {
    const slow = deferred<WorkspacesBrowseResult>()
    const fast = deferred<WorkspacesBrowseResult>()

    const browse = vi.fn(async (input: { path: string }) => {
      if (input.path !== '/home/maoqh') {
        throw new Error('unexpected path')
      }

      return listing('/home/maoqh', [directory('slow'), directory('fast')])
    })

    renderBrowser({ port: port(browse) })

    await screen.findByText('slow')

    // Two navigations while the first is still in flight: the rows stay usable
    // (only the toolbar is held), so the race is reachable exactly like in the
    // product.
    browse.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)

    fireEvent.click(entryRow('slow'))
    fireEvent.click(entryRow('fast'))

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(3))

    await act(async () => {
      fast.resolve(listing('/home/maoqh/fast', [directory('fast-dir')]))
    })
    expect(await screen.findByText('fast-dir')).toBeTruthy()

    // A late SUCCESS must not replace the newer listing.
    await act(async () => {
      slow.resolve(listing('/home/maoqh/slow', [directory('slow-dir')]))
    })
    expect(screen.queryByText('slow-dir')).toBeNull()
    expect(screen.getByText('fast-dir')).toBeTruthy()
    expect(pathInput().value).toBe('/home/maoqh/fast')

    // Neither must a late FAILURE, and it must not replace what is on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Up one level' }))
    await screen.findByText('slow')

    const stale = deferred<WorkspacesBrowseResult>()
    const newer = deferred<WorkspacesBrowseResult>()

    browse.mockReturnValueOnce(stale.promise).mockReturnValueOnce(newer.promise)

    fireEvent.click(entryRow('slow'))
    fireEvent.click(entryRow('fast'))
    await waitFor(() => expect(browse).toHaveBeenCalledTimes(6))

    await act(async () => {
      newer.resolve(listing('/home/maoqh/fast', [directory('kept')]))
    })
    expect(await screen.findByText('kept')).toBeTruthy()

    await act(async () => {
      stale.reject(new Error('WSL_LIST_FAILED'))
    })

    expect(screen.getByText('kept')).toBeTruthy()
    expect(screen.queryByText(/WSL_LIST_FAILED/)).toBeNull()
  })

  it('writes nothing when a listing answers after the surface is gone', async () => {
    const pending = deferred<WorkspacesBrowseResult>()
    const failure = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const browse = vi.fn().mockReturnValueOnce(pending.promise)
    const view = renderBrowser({ port: port(browse) })

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(1))

    view.unmount()

    await act(async () => {
      pending.resolve(listing('/late', [directory('late-dir')]))
    })

    expect(failure).not.toHaveBeenCalled()
    failure.mockRestore()
  })

  it('enters a read-only but openable directory and still offers it for choosing', async () => {
    const browse = vi.fn(async (input: { path: string }) =>
      input.path === '/home/maoqh'
        ? listing('/home/maoqh', [directory('shared', { canWrite: false })])
        : listing('/home/maoqh/shared', [])
    )

    const onChoose = vi.fn(async () => ({ ok: true }) as const)

    renderBrowser({ onChoose, port: port(browse) })

    await screen.findByText('shared')

    const shared = entryRow('shared')

    expect(shared.hasAttribute('disabled')).toBe(false)
    expect(within(shared).getByText('Read-only')).toBeTruthy()

    fireEvent.click(shared)
    await waitFor(() => expect(browse).toHaveBeenLastCalledWith({ environment, path: '/home/maoqh/shared' }))

    // Readability is what a successful listing proved, so choosing stays open
    // and the read-only fact is still stated.
    await waitFor(() => expect(chooseButton().hasAttribute('disabled')).toBe(false))
    expect(screen.getByText('Read-only')).toBeTruthy()

    fireEvent.click(chooseButton())
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith('/home/maoqh/shared'))
  })

  it('disables a directory the service refuses to open and shows its reason', async () => {
    const browse = vi.fn(async () =>
      listing('/home/maoqh', [directory('locked', { canOpen: false, canWrite: false, reason: 'PERMISSION_DENIED' })])
    )

    renderBrowser({ port: port(browse) })

    await screen.findByText('locked')

    const locked = entryRow('locked')

    expect(locked.hasAttribute('disabled')).toBe(true)
    expect(locked.textContent).toContain('Cannot open')
    expect(locked.textContent).toContain('PERMISSION_DENIED')

    fireEvent.click(locked)
    expect(browse).toHaveBeenCalledTimes(1)
  })

  it('lists files and other entries without treating them as directories', async () => {
    const browse = vi.fn(async () =>
      listing('/home/maoqh', [directory('notes.txt', { kind: 'file' }), directory('agent.sock', { kind: 'other' })])
    )

    renderBrowser({ port: port(browse) })

    expect(await screen.findByText('notes.txt')).toBeTruthy()
    expect(screen.getByText('File')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()

    fireEvent.click(entryRow('notes.txt'))
    fireEvent.click(entryRow('agent.sock'))
    expect(browse).toHaveBeenCalledTimes(1)
  })

  it('filters hidden entries locally, without another browse request', async () => {
    const browse = vi.fn(async (_input: { path: string }) =>
      listing('/home/maoqh', [directory('.config'), directory('projects')])
    )

    renderBrowser({ port: port(browse) })

    await screen.findByText('projects')
    expect(screen.queryByText('.config')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: /hidden/ }))

    expect(await screen.findByText('.config')).toBeTruthy()
    expect(browse).toHaveBeenCalledTimes(1)
    // No private wire field is invented for the filter: the request stays
    // {environment, path}.
    expect(Object.keys(browse.mock.calls[0]?.[0] ?? {})).toEqual(['environment', 'path'])

    fireEvent.click(screen.getByRole('checkbox', { name: /hidden/ }))
    await waitFor(() => expect(screen.queryByText('.config')).toBeNull())
    expect(browse).toHaveBeenCalledTimes(1)
  })

  it('keeps the last good listing and the typed path when a browse fails', async () => {
    const browse = vi.fn(async (input: { path: string }) => {
      if (input.path === '/home/maoqh') {
        return listing('/home/maoqh', [directory('projects')])
      }

      throw new Error('WSL_DIRECTORY_NOT_FOUND')
    })

    renderBrowser({ port: port(browse) })

    await screen.findByText('projects')

    fireEvent.change(pathInput(), { target: { value: '/home/maoqh/missing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    const error = await screen.findByText(/WSL_DIRECTORY_NOT_FOUND/)
    expect(error.getAttribute('data-browser-list-error')).not.toBeNull()
    // The previous listing is not replaced by an empty one, and the typed path
    // is still there to fix.
    expect(screen.getByText('projects')).toBeTruthy()
    expect(pathInput().value).toBe('/home/maoqh/missing')
  })

  it('reports an unavailable service instead of pretending the directory is empty', async () => {
    const browse = vi.fn(async () => {
      throw new Error('CAPABILITY_NOT_DECLARED')
    })

    renderBrowser({ port: port(browse) })

    expect(await screen.findByText(/AgentBox directory browsing is unavailable/)).toBeTruthy()
    expect(screen.getByText(/CAPABILITY_NOT_DECLARED/)).toBeTruthy()
    expect(screen.queryByText('No subdirectories here')).toBeNull()
    expect(chooseButton().hasAttribute('disabled')).toBe(true)
  })

  it('sends one request per UI intent, and separate paths stay separate requests', async () => {
    const browse = vi.fn(async (input: { path: string }) => listing(input.path))

    renderBrowser({ port: port(browse) })

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(1))

    const go = screen.getByRole('button', { name: 'Go' })

    fireEvent.change(pathInput(), { target: { value: '/srv' } })
    fireEvent.click(go)
    fireEvent.click(go)

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(2))
    expect(browse.mock.calls.filter(call => call[0].path === '/srv')).toHaveLength(1)

    fireEvent.change(pathInput(), { target: { value: '/var' } })
    fireEvent.click(go)
    await waitFor(() => expect(browse).toHaveBeenCalledTimes(3))
    expect(browse.mock.calls[2]?.[0].path).toBe('/var')
  })

  it('goes back through the callback it was given', async () => {
    const onBack = vi.fn()
    const browse = vi.fn(async () => listing('/home/maoqh', []))

    renderBrowser({ onBack, port: port(browse) })

    await waitFor(() => expect(browse).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed choose and stays where it is', async () => {
    const browse = vi.fn(async () => listing('/home/maoqh', [directory('projects')]))
    const onChoose = vi.fn(async () => ({ message: 'Could not save the workspace', ok: false }) as const)

    renderBrowser({ onChoose, port: port(browse) })

    await screen.findByText('projects')
    fireEvent.click(chooseButton())

    expect(await screen.findByText('Could not save the workspace')).toBeTruthy()
    // Nothing navigated away: the same listing is still there for a retry.
    expect(screen.getByText('projects')).toBeTruthy()
    expect(chooseButton().hasAttribute('disabled')).toBe(false)
  })
})
