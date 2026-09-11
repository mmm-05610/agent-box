import { describe, expect, it } from 'vitest'

import { sessionMatchesProjectFilter } from '@/app/chat/sidebar/projects/workspace-groups'
import { makeCwdSession } from '@/dev/test/session-info'
import type { ProjectInfo } from '@/types/hermes'

import { liveSessionProjectId, NO_PROJECT_ID, sessionProjectColor } from './membership'

// The membership core (moved out of app/chat/sidebar/projects/
// workspace-groups.test.ts along with its subject): which project a session
// belongs to, the color derived from that answer, and the row-filter rule
// built on both.

const makeProject = (id: string, folders: string[]): ProjectInfo => ({
  archived: false,
  board_slug: null,
  color: null,
  created_at: 0,
  description: null,
  folders: folders.map((path, i) => ({ added_at: 0, is_primary: i === 0, label: null, path })),
  icon: null,
  id,
  name: id,
  primary_path: folders[0] ?? null,
  slug: id
})

describe('liveSessionProjectId', () => {
  it('maps a brand-new (unpersisted) session to its auto project (the repo root)', () => {
    expect(liveSessionProjectId(makeCwdSession('/www/app'), [])).toBe('/www/app')
  })

  it('routes a session under an explicit project folder to that project', () => {
    const id = liveSessionProjectId(makeCwdSession('/www/app/src', { git_repo_root: '/www/app', git_branch: 'feat' }), [
      makeProject('p_app', ['/www/app'])
    ])

    expect(id).toBe('p_app')
  })

  it('anchors a cwd-less session on its git_repo_root (backend groups it there too)', () => {
    // Older/imported rows carry only a repo root; the sidebar files them under
    // the repo's project, so membership (and color) must resolve from the root.
    expect(liveSessionProjectId(makeCwdSession(null, { git_repo_root: '/www/app' }), [])).toBe('/www/app')
    expect(
      liveSessionProjectId(makeCwdSession(null, { git_repo_root: '/www/app' }), [makeProject('p_app', ['/www/app'])])
    ).toBe('p_app')
  })

  it('skips cwd-less, kanban-task, and out-of-tree (sibling) worktree sessions', () => {
    expect(liveSessionProjectId(makeCwdSession(null), [])).toBeNull()
    // Kanban task worktree → folds into the kanban bucket, not a project preview.
    expect(liveSessionProjectId(makeCwdSession('/repo/.worktrees/t_aaaaaaaa'), [])).toBeNull()
    // Sibling worktree OUTSIDE the repo root → project can't be derived from the row.
    expect(liveSessionProjectId(makeCwdSession('/elsewhere/wt', { git_repo_root: '/repo' }), [])).toBeNull()
  })

  it('places an in-tree worktree session under its repo project (the root is in the path)', () => {
    // "Convert a branch" / "new worktree" land at `<repoRoot>/.worktrees/<slug>`,
    // so they belong to the same auto project as the repo root and must show in
    // the overview at once, not wait for the next backend refresh.
    expect(liveSessionProjectId(makeCwdSession('/www/app/.worktrees/test1', { git_repo_root: '/www/app' }), [])).toBe(
      '/www/app'
    )
  })

  it('routes an in-tree worktree session to the owning explicit project', () => {
    const id = liveSessionProjectId(makeCwdSession('/www/app/.worktrees/test1', { git_repo_root: '/www/app' }), [
      makeProject('p_app', ['/www/app'])
    ])

    expect(id).toBe('p_app')
  })

  it('places a cwd-outside-root session under an explicit project matching either path', () => {
    // A mid-session relocation (or a sibling worktree) leaves cwd outside the
    // recorded repo root. An explicit folder match is still authoritative —
    // only the auto-project (repo root) fallback needs cwd-under-root
    // confidence. Match via the repo root...
    expect(
      liveSessionProjectId(makeCwdSession('/www/elsewhere', { git_repo_root: '/home/u/proj' }), [
        makeProject('p_proj', ['/home/u/proj'])
      ])
    ).toBe('p_proj')
    // ...and via the cwd.
    expect(
      liveSessionProjectId(makeCwdSession('/www/elsewhere/sub', { git_repo_root: '/home/u/proj' }), [
        makeProject('p_www', ['/www/elsewhere'])
      ])
    ).toBe('p_www')
  })

  it('matches a mixed-case/separator Windows cwd to its explicit project in the live overlay', () => {
    // The bug: a fresh Windows session drops into the overlay before the next
    // backend refresh; case-sensitive matching missed its project until then.
    const id = liveSessionProjectId(makeCwdSession('c:/work/notes/SUB'), [makeProject('p_notes', ['C:\\Work\\Notes'])])

    expect(id).toBe('p_notes')
  })

  it('matches a root-relative WSL cwd (single backslash) case-insensitively', () => {
    const id = liveSessionProjectId(makeCwdSession('//wsl.localhost/Ubuntu/home/alice/PROJ'), [
      makeProject('p_proj', ['\\wsl.localhost\\Ubuntu\\home\\alice\\proj'])
    ])

    expect(id).toBe('p_proj')
  })

  it('keeps POSIX cwd matching case-sensitive (no false project match)', () => {
    // Distinct case on POSIX is a distinct path → falls back to its own auto id.
    expect(liveSessionProjectId(makeCwdSession('/work/notes'), [makeProject('p_notes', ['/Work/Notes'])])).toBe(
      '/work/notes'
    )
  })
})

describe('sessionProjectColor', () => {
  const colored = (id: string, folders: string[], color: string): ProjectInfo => ({
    ...makeProject(id, folders),
    color
  })

  it('inherits the color of the explicit project the session belongs to', () => {
    const session = makeCwdSession('/www/app/src', { git_repo_root: '/www/app' })

    expect(sessionProjectColor(session, [colored('p_app', ['/www/app'], '#4a9eff')])).toBe('#4a9eff')
  })

  it('returns null when the owning project has no color set', () => {
    const session = makeCwdSession('/www/app/src', { git_repo_root: '/www/app' })

    expect(sessionProjectColor(session, [makeProject('p_app', ['/www/app'])])).toBeNull()
  })

  it('colors a cwd-less session by its git_repo_root project (the grouped-but-grey fix)', () => {
    const session = makeCwdSession(null, { git_repo_root: '/www/app' })

    expect(sessionProjectColor(session, [colored('p_app', ['/www/app'], '#4a9eff')])).toBe('#4a9eff')
  })

  it('colors a cwd-outside-root session when an explicit project folder matches', () => {
    // The backend tree groups such a row under the project; the client color
    // derivation must agree instead of leaving the row (and its tab) grey.
    const session = makeCwdSession('/www/elsewhere', { git_repo_root: '/home/u/proj' })

    expect(sessionProjectColor(session, [colored('p_proj', ['/home/u/proj'], '#4a9eff')])).toBe('#4a9eff')
  })

  it('returns null for a session that only maps to an auto repo root (no explicit project)', () => {
    // liveSessionProjectId falls back to the repo root id, which is not a
    // project row and therefore carries no color.
    expect(sessionProjectColor(makeCwdSession('/www/app'), [])).toBeNull()
  })

  it('returns null for an unplaceable (cwd-less) session', () => {
    expect(sessionProjectColor(makeCwdSession(null), [colored('p_app', ['/www/app'], '#4a9eff')])).toBeNull()
  })

  it('uses the longest-prefix project when nested projects both match', () => {
    const session = makeCwdSession('/www/app/packages/api/src', { git_repo_root: '/www/app' })

    const projects = [
      colored('p_root', ['/www/app'], '#111111'),
      colored('p_api', ['/www/app/packages/api'], '#222222')
    ]

    expect(sessionProjectColor(session, projects)).toBe('#222222')
  })
})

describe('project filter row rule (#97762)', () => {
  const projects = [makeProject('p_app', ['/www/app'])]
  const appRow = makeCwdSession('/www/app/src', { git_repo_root: '/www/app' })
  const homeRow = makeCwdSession(null)

  it('filtering to Home keeps the detached Home rows', () => {
    expect(sessionMatchesProjectFilter(homeRow, [NO_PROJECT_ID], projects)).toBe(true)
    expect(sessionMatchesProjectFilter(appRow, [NO_PROJECT_ID], projects)).toBe(false)
  })

  it('a live id still narrows', () => {
    expect(sessionMatchesProjectFilter(appRow, ['p_app'], projects)).toBe(true)
    expect(sessionMatchesProjectFilter(homeRow, ['p_app'], projects)).toBe(false)
  })
})
