import { useCallback } from 'react'

import { setWorkspaceScope } from '@/store/pane-shell/workspace-scope'
import type { SidebarNavItem } from '@/types/sidebar'

import { navigateToWorkspacePage, NEW_CHAT_ROUTE, sessionRoute, SETTINGS_ROUTE } from '../../../routes'

import { type FreshSessionDraftStarter } from './fresh-draft'
import { type SessionActionsOptions } from './session-actions-options'

/** Sidebar selection and settings-page navigation owned by the session surface. */
export function useSessionNavigationActions(
  options: SessionActionsOptions,
  deps: { startFreshSessionDraft: FreshSessionDraftStarter }
) {
  const { navigate, selectedStoredSessionId } = options
  const { startFreshSessionDraft } = deps

  const selectSidebarItem = useCallback(
    (item: SidebarNavItem) => {
      if (item.action === 'new-session') {
        setWorkspaceScope('sessions')
        startFreshSessionDraft()

        return
      }

      if (item.route) {
        navigateToWorkspacePage(navigate, item.route)
      }
    },
    [navigate, startFreshSessionDraft]
  )

  const openSettings = useCallback(() => {
    navigate(SETTINGS_ROUTE)
  }, [navigate])

  const closeSettings = useCallback(() => {
    if (selectedStoredSessionId) {
      navigate(sessionRoute(selectedStoredSessionId))

      return
    }

    navigate(NEW_CHAT_ROUTE)
  }, [navigate, selectedStoredSessionId])

  return { closeSettings, openSettings, selectSidebarItem }
}
