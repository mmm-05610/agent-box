import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SidebarProjectTree } from '@/store/projects/membership'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { LocalWorkspaceRow, WslWorkspaceRow } from './workspace-row'

const wslUsecases = vi.hoisted(() => ({
  archive: vi.fn(),
  reconnect: vi.fn(),
  rename: vi.fn()
}))

vi.mock('@/application/workspace/wsl-workspace-usecases', () => ({
  archiveWslWorkspaceProjection: (...args: unknown[]) => wslUsecases.archive(...args),
  reconnectWslWorkspaceProjection: (...args: unknown[]) => wslUsecases.reconnect(...args),
  renameWslWorkspaceProjection: (...args: unknown[]) => wslUsecases.rename(...args)
}))

vi.mock('@/store/wsl-workspace', () => ({
  $wslWorkspaceValidation: { get: () => ({}), listen: () => () => {}, subscribe: () => () => {} },
  openWslWorkspaceInfo: vi.fn()
}))

// Round 36R: these are the project-overview-row pins, re-targeted onto the
// LocalWorkspaceRow that now carries the local rows inside the workspace root
// list (ProjectOverviewRow was retired with the old append seam).
afterEach(cleanup)

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        agentBoxArchive: { action: 'Archive in AgentBox' },
        newSessionIn: (label: string) => `New session in ${label}`,
        projects: {
          enter: (label: string) => `Enter ${label}`,
          reorder: (label: string) => `Reorder ${label}`,
          toggle: (label: string, open: boolean) => `${open ? 'Show' : 'Hide'} ${label} sessions`,
          autoDiscovered: 'Auto-discovered'
        }
      },
      wslWorkspace: {
        connectionInfo: 'Connection info',
        menuRemove: 'Remove from sidebar',
        menuRename: 'Rename…',
        moreActions: 'More actions',
        reconnect: 'Reconnect',
        toggleExpand: (name: string, open: boolean) => `${open ? 'Show' : 'Hide'} ${name} sessions`,
        wslBadge: 'WSL'
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
  return render(<LocalWorkspaceRow expandable={false} item={item} project={project} {...overrides} />)
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

describe('WslWorkspaceRow AgentBox archive injection', () => {
  const workspace = {
    actualUser: 'me',
    archivedAt: null,
    configuredUser: null,
    createdAt: 1,
    distribution: 'Ubuntu',
    id: 'wsl_ws_1',
    kind: 'wsl',
    name: 'WSL app',
    rootPath: '/home/me/app',
    updatedAt: 1
  } as WslWorkspaceRecord

  const item = {
    id: 'wsl_ws_1',
    backend: 'wsl' as const,
    name: 'WSL app',
    path: '/home/me/app',
    detail: 'Ubuntu · /home/me/app',
    sessionCount: 0
  }

  const openTriggerMenu = (trigger: HTMLElement) => {
    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.click(trigger)
  }

  const renderWslRow = (onArchiveInAgentBox?: () => void) => {
    const onRemove = vi.fn()

    render(
      <WslWorkspaceRow
        infoOpen={false}
        item={item}
        onArchiveInAgentBox={onArchiveInAgentBox}
        onRemove={onRemove}
        onRename={vi.fn()}
        state={undefined}
        workspace={workspace}
      />
    )

    return { onRemove }
  }

  it('keeps the host remove and the AgentBox archive as two separate entries', async () => {
    const onArchiveInAgentBox = vi.fn()

    const { onRemove } = renderWslRow(onArchiveInAgentBox)

    openTriggerMenu(screen.getByRole('button', { name: 'More actions' }))

    const archive = await screen.findByRole('menuitem', { name: 'Archive in AgentBox' })
    const remove = await screen.findByRole('menuitem', { name: 'Remove from sidebar' })

    fireEvent.click(archive)

    expect(onArchiveInAgentBox).toHaveBeenCalledTimes(1)
    // The host's own remove (and the host's record archive) were not touched.
    expect(onRemove).not.toHaveBeenCalled()
    expect(wslUsecases.archive).not.toHaveBeenCalled()
    expect(remove).not.toBe(archive)
  })

  it('shows no AgentBox action when the list matched no service Workspace', async () => {
    renderWslRow()

    openTriggerMenu(screen.getByRole('button', { name: 'More actions' }))

    expect(await screen.findByRole('menuitem', { name: 'Remove from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()
  })
})
