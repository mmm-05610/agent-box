import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SidebarProjectTree } from '@/store/projects/membership'

import { LocalWorkspaceRow } from './workspace-row'

// Round 36R: these are the project-overview-row pins, re-targeted onto the
// LocalWorkspaceRow that now carries the local rows inside the workspace root
// list (ProjectOverviewRow was retired with the old append seam).
afterEach(cleanup)

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        newSessionIn: (label: string) => `New session in ${label}`,
        projects: {
          enter: (label: string) => `Enter ${label}`,
          reorder: (label: string) => `Reorder ${label}`,
          toggle: (label: string, open: boolean) => `${open ? 'Show' : 'Hide'} ${label} sessions`,
          autoDiscovered: 'Auto-discovered'
        }
      }
    }
  })
}))

vi.mock('../projects/model', () => ({
  PROJECT_PREVIEW_COUNT: 3,
  latestProjectSessions: () => [],
  useWorkspaceNodeOpen: () => [false, vi.fn()]
}))

// ProjectMenu (the kebab) has its own dedicated test file — stub it here so
// this file only exercises the row's own Tip usage (the disclosure toggle)
// plus the WorkspaceAddButton wiring. ProjectContextMenu (the row's
// right-click wrapper) is stubbed as a pass-through so the row still renders.
vi.mock('../projects/project-menu', () => ({
  ProjectContextMenu: ({ children }: { children: ReactNode }) => children,
  ProjectMenu: () => null
}))

const project = { id: 'p1', label: 'Test D' } as unknown as SidebarProjectTree

const item = {
  id: 'p1',
  backend: 'local' as const,
  name: 'Test D',
  path: null,
  detail: null,
  sessionCount: 0
}

const tipTrigger = (el: HTMLElement) => el.closest('[data-slot="tooltip-trigger"]')

function renderRow(overrides: Partial<Parameters<typeof LocalWorkspaceRow>[0]> = {}) {
  return render(
    <LocalWorkspaceRow
      expandable={false}
      item={item}
      project={project}
      {...overrides}
    />
  )
}

describe('LocalWorkspaceRow (local rows of the workspace root list)', () => {
  it('wraps the "new session" add button in a Tip with the project-scoped label', () => {
    renderRow({ onNewSession: vi.fn() })

    const button = screen.getByRole('button', { name: 'New session in Test D' })
    expect(tipTrigger(button)).toBeTruthy()
  })

  it('wraps the disclosure toggle in a Tip when there is content to reveal', () => {
    renderRow({ content: <div />, expandable: true })

    // Collapsed by default, so the disclosure offers to show the sessions.
    const button = screen.getByRole('button', { name: 'Show Test D sessions' })
    expect(tipTrigger(button)).toBeTruthy()
  })

  it('does not render the disclosure toggle when there is nothing to reveal', () => {
    renderRow()

    expect(screen.queryByRole('button', { name: 'Show Test D sessions' })).toBeNull()
  })

  it('offers the "new session" add button on Home, which starts one with no folder', () => {
    const home = {
      id: '__no_project__',
      isNoProject: true,
      label: 'Home',
      path: null
    } as unknown as SidebarProjectTree

    const onNewSession = vi.fn()

    renderRow({ onNewSession, project: home })
    fireEvent.click(screen.getByRole('button', { name: 'New session in Home' }))

    expect(onNewSession).toHaveBeenCalledWith(null)
  })

  it('tags the row with its id markers: data-sessions-project and the shared workspace-row id', () => {
    const { container } = renderRow()

    // The project marker (custom skins) and the shared workspace-row marker
    // (the one row language) both carry the row's id.
    expect(container.querySelector('[data-sessions-project="p1"]')).toBeTruthy()
    expect(container.querySelector('[data-workspace-row="p1"]')).toBeTruthy()
  })

  it('explicit projects keep the folder-library glyph and a plain accessible name', () => {
    const explicit = { id: 'p1', label: 'Explicit' } as unknown as SidebarProjectTree

    const { container } = renderRow({ project: explicit })

    expect(container.querySelector('.codicon-folder-library')).toBeTruthy()
    expect(container.querySelector('.codicon-repo')).toBeNull()
    expect(screen.getByRole('button', { name: 'Enter Explicit' })).toBeTruthy()
  })

  it('auto-discovered repos get the repo glyph, an "Auto-discovered" tooltip, and an accessible name that says so', () => {
    const auto = { id: '/Users/dev/my-repo', label: 'my-repo', isAuto: true } as unknown as SidebarProjectTree

    const { container } = renderRow({ project: auto })

    expect(container.querySelector('.codicon-repo')).toBeTruthy()
    expect(container.querySelector('.codicon-folder-library')).toBeNull()

    const link = screen.getByRole('button', { name: 'Enter my-repo (Auto-discovered)' })
    expect(tipTrigger(link)).toBeTruthy()
  })
})
