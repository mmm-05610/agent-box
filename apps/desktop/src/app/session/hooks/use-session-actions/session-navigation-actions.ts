import { useCallback } from 'react'

import { setWorkspaceScope } from '@/components/pane-shell/workspace-scope'
import { NEW_CHAT_ROUTE, SETTINGS_ROUTE, navigateToWorkspacePage, sessionRoute } from '../../../routes'
import type { SidebarNavItem } from '../../../types'

import { type SessionActionsOptions } from './session-actions-options'
import { type FreshSessionDraftStarter } from './fresh-draft'

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
