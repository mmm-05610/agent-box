import { beforeEach, describe, expect, it } from 'vitest'

import {
  $workspaceLocalHiddenIds,
  hideLocalWorkspace,
  isWorkspaceLocallyHidden,
  unhideLocalWorkspace,
  workspaceHiddenKey
} from './workspace-view'

// The 36R removal contract for LOCAL workspaces: "remove from sidebar" hides
// the project behind a view pref scoped by backend/profile/id. The backend
// record — and its id — stays the identity, so a hide must never leak across
// scopes, and a reopen of the same record unhides it.
beforeEach(() => {
  localStorage.clear()
  $workspaceLocalHiddenIds.set([])
})

describe('workspace view prefs (local hidden ids)', () => {
  it('a hide is scoped by backend, profile AND id', () => {
    hideLocalWorkspace(workspaceHiddenKey({ backend: 'local', id: 'proj-1', profile: 'alpha' }))

    expect(isWorkspaceLocallyHidden(workspaceHiddenKey({ backend: 'local', id: 'proj-1', profile: 'alpha' }))).toBe(true)
    // The SAME-named project under another profile, backend, or id is not hidden.
    expect(isWorkspaceLocallyHidden(workspaceHiddenKey({ backend: 'local', id: 'proj-1', profile: 'beta' }))).toBe(false)
    expect(isWorkspaceLocallyHidden(workspaceHiddenKey({ backend: 'local', id: 'proj-2', profile: 'alpha' }))).toBe(false)
    expect(isWorkspaceLocallyHidden(workspaceHiddenKey({ backend: 'wsl', id: 'proj-1', profile: 'alpha' }))).toBe(false)
  })

  it('unhide restores visibility for exactly the hidden scope', () => {
    const key = workspaceHiddenKey({ backend: 'local', id: 'proj-1', profile: 'alpha' })

    hideLocalWorkspace(key)
    unhideLocalWorkspace(key)

    expect(isWorkspaceLocallyHidden(key)).toBe(false)
  })

  it('hiding twice stores the key once', () => {
    const key = workspaceHiddenKey({ backend: 'local', id: 'proj-1', profile: 'alpha' })

    hideLocalWorkspace(key)
    hideLocalWorkspace(key)

    expect($workspaceLocalHiddenIds.get()).toEqual([key])
  })
})
