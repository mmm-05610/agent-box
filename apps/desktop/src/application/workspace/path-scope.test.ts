import { describe, expect, it } from 'vitest'

import { judgeWorkspacePathScope, looksLikeWindowsPath } from './path-scope'

// The 36R path boundary: a local directory pick may only become a project
// record or a session cwd when it lives in the backend's path space. A
// refusal must cost zero creation and zero launch — these pins keep the
// judgment pure so the refusal logic cannot rot into a /mnt/c guess.
describe('judgeWorkspacePathScope', () => {
  it('local mode accepts the pick outright: the backend runs where the app runs', () => {
    expect(judgeWorkspacePathScope({ backendFsVerified: true, fsMode: 'local', pickedPath: '/home/maoqh/proj' })).toEqual({
      ok: true,
      scope: 'backend'
    })
    // Even a Windows path: on a Windows host with a local backend it IS the
    // backend's own space.
    expect(judgeWorkspacePathScope({ backendFsVerified: false, fsMode: 'local', pickedPath: 'C:\\dev\\proj' })).toEqual({
      ok: true,
      scope: 'backend'
    })
  })

  it('remote mode accepts a POSIX path only when the backend FS actually answered', () => {
    expect(judgeWorkspacePathScope({ backendFsVerified: true, fsMode: 'remote', pickedPath: '/home/maoqh/proj' })).toEqual({
      ok: true,
      scope: 'backend'
    })

    const refused = judgeWorkspacePathScope({ backendFsVerified: false, fsMode: 'remote', pickedPath: '/home/maoqh/proj' })

    expect(refused.ok).toBe(false)

    if (!refused.ok) {
      expect(refused.reason).toBe('backend-unverified')
    }
  })

  it('remote mode refuses a Windows path even with a verified backend — no /mnt/c guessing', () => {
    for (const picked of ['C:\\dev\\proj', 'C:/dev/proj', '\\\\server\\share\\proj']) {
      const refused = judgeWorkspacePathScope({ backendFsVerified: true, fsMode: 'remote', pickedPath: picked })

      expect(refused.ok).toBe(false)

      if (!refused.ok) {
        expect(refused.reason).toBe('windows-path')
      }
    }
  })
})

describe('looksLikeWindowsPath', () => {
  it('tells Windows drive/UNC paths from POSIX ones', () => {
    expect(looksLikeWindowsPath('C:\\dev')).toBe(true)
    expect(looksLikeWindowsPath('c:/dev')).toBe(true)
    expect(looksLikeWindowsPath('\\\\server\\share')).toBe(true)
    expect(looksLikeWindowsPath('/home/maoqh')).toBe(false)
    expect(looksLikeWindowsPath('relative/path')).toBe(false)
    expect(looksLikeWindowsPath('')).toBe(false)
  })
})
