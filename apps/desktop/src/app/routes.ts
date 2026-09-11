import { atom } from 'nanostores'

import { isWorkspacePageRoute } from '@/lib/routes'
import { noteActiveTreeGroup, revealTreePane } from '@/store/pane-shell/tree'

export * from '@/lib/routes'

type NavigateLike = (to: string, options?: { replace?: boolean }) => void

/** True while the workspace pane shows a FULL PAGE (skills/messaging/
 *  artifacts/plugin routes) instead of the chat. Published by the wiring
 *  (which owns the router location); the workspace pane contribution mirrors
 *  it as `headerVeto` so the zone tab bar stands down on pages. Overlays
 *  (settings/…) don't count — the chat stays beneath them. */
export const $workspaceIsPage = atom(false)

function revealWorkspacePane(): void {
  noteActiveTreeGroup(null)
  revealTreePane('workspace')
}

/**
 * Point the workspace at `pathname`: mirror "showing a full page" into
 * `$workspaceIsPage`, and FRONT the pane when it is one.
 *
 * A page renders inside `workspace`, so a main zone parked on a session tile
 * keeps the tile on screen while the route and the page content change behind
 * it — the navigation looks dead (#72602). Session switches already front the
 * pane in `store/session-states.ts`; pages had no equivalent.
 *
 * The router location drives this, so every entry point gets it without opting
 * in: sidebar, keybinds, command palette, Command Center, contributed
 * statusbar/titlebar `to` targets, back/forward, and cold-start restore.
 */
export function syncWorkspaceRoute(pathname: string): void {
  const isPage = isWorkspacePageRoute(pathname)

  if (isPage !== $workspaceIsPage.get()) {
    $workspaceIsPage.set(isPage)
  }

  if (isPage) {
    revealWorkspacePane()
  }
}

/**
 * Navigate to `to`, fronting the workspace pane when it is a page route.
 *
 * `syncWorkspaceRoute` covers route CHANGES; this covers the RE-CLICK, the one
 * case it can't see — hitting Capabilities while already on `/skills` with a
 * tile focused leaves the location untouched, so no effect fires and only an
 * imperative reveal brings the page back. Use it wherever a nav affordance can
 * be triggered from the page it targets.
 */
export function navigateToWorkspacePage(navigate: NavigateLike, to: string, options?: { replace?: boolean }): void {
  navigate(to, options)

  if (isWorkspacePageRoute(to)) {
    revealWorkspacePane()
  }
}
