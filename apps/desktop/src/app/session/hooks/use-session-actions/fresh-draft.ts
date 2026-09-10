import { useCallback } from 'react'

import { revealTreePane } from '@/components/pane-shell/tree/store'
import { clearNotifications } from '@/store/notifications'
import {
  resolveNewSessionCwd
} from '@/store/projects'
import {
  setActiveSessionId,
  setAwaitingResponse,
  setBusy,
  setCurrentBranch,
  setCurrentCwd,
  setCurrentCwdTransient,
  setCurrentServiceTier,
  setCurrentUsage,
  setFreshDraftReady,
  setIntroSeed,
  setMessages,
  setNewChatWorkspaceTarget,
  setSessionStartedAt,
  setTurnStartedAt,
  setWorkspaceCwdOwner,
  setSelectedStoredSessionId,
  setYoloActive,
  type NewChatWorkspaceTarget
} from '@/store/session'
import { NEW_CHAT_ROUTE } from '../../../routes'

import { type SessionActionsOptions } from './session-actions-options'

interface FreshSessionDraftOptions {
  preserveRoute?: boolean
  replaceRoute?: boolean
  workspaceTarget?: NewChatWorkspaceTarget
}

export type FreshSessionDraftStarter = (options?: boolean | FreshSessionDraftOptions) => void

function normalizeNewChatWorkspaceTarget(target: NewChatWorkspaceTarget): NewChatWorkspaceTarget {
  return typeof target === 'string' ? target.trim() || null : target
}

/** Reset the workspace to an empty new-chat draft, optionally retargeting cwd. */
export function useFreshSessionDraft(options: SessionActionsOptions): FreshSessionDraftStarter {
  const {
    activeSessionIdRef,
    busyRef,
    navigate,
    onFreshDraftRouteIntent,
    resetViewSync,
    selectedStoredSessionIdRef
  } = options

  const startFreshSessionDraft = useCallback(
    (options: boolean | FreshSessionDraftOptions = false) => {
      const draftOptions = typeof options === 'boolean' ? { replaceRoute: options } : options
      const preserveRoute = draftOptions.preserveRoute ?? false
      const replaceRoute = draftOptions.replaceRoute ?? false

      const hasWorkspaceTarget =
        Object.hasOwn(draftOptions, 'workspaceTarget') && draftOptions.workspaceTarget !== undefined

      const workspaceTarget = hasWorkspaceTarget
        ? normalizeNewChatWorkspaceTarget(draftOptions.workspaceTarget)
        : undefined

      resetViewSync()
      busyRef.current = false
      setBusy(false)
      setAwaitingResponse(false)
      clearNotifications()
      setIntroSeed(seed => seed + 1)
      // A fresh chat takes the screen. Front the workspace — and ONLY that:
      // `$terminalTakeover` is the terminal's open/closed state in every
      // layout, not a Focus-only overlay flag, so clearing it here would close
      // a terminal sitting harmlessly in its own zone (Default, Terminal deck,
      // Quad) and would persist a `false` that leaves the Focus tab unable to
      // mount its workspace on the next boot. Behind another tab the terminal
      // is hidden, not closed: it keeps its PTYs and the overlay stops
      // painting on the pane-hidden marker, which is what actually cleared the
      // chat.
      revealTreePane('workspace')
      // Clear the durable route intent synchronously, before React Router
      // publishes /new. Submit uses that intent to heal an existing-session
      // rebind race, so leaving the old id here could revive it on a very fast
      // New Chat -> Enter sequence.
      onFreshDraftRouteIntent?.()

      if (!preserveRoute) {
        navigate(NEW_CHAT_ROUTE, { replace: replaceRoute })
      }

      setActiveSessionId(null)
      activeSessionIdRef.current = null
      setSelectedStoredSessionId(null)
      selectedStoredSessionIdRef.current = null
      setMessages([])
      setCurrentUsage({
        calls: 0,
        input: 0,
        output: 0,
        total: 0
      })
      setSessionStartedAt(null)
      setTurnStartedAt(null)
      // The composer's model/effort/fast is sticky UI state (persisted in
      // localStorage) — a new chat FOLLOWS your last pick instead of snapping
      // back to the profile default, so we deliberately don't reset it here. The
      // profile default still owns first-run seeding and profile switches (see
      // refreshCurrentModel). Only $currentServiceTier (a live-session mirror)
      // is cleared.
      setCurrentServiceTier('')
      setYoloActive(false)
      setNewChatWorkspaceTarget(hasWorkspaceTarget ? workspaceTarget : undefined)

      if (!hasWorkspaceTarget) {
        // In a project → the repo's default-branch checkout; not in a project →
        // detached. So cmd-n does not inherit an unrelated linked worktree.
        // Transient: a resolved default is not the user naming a workspace, and
        // remembering it here would make the NEXT new chat inherit it.
        setCurrentCwdTransient(resolveNewSessionCwd())
      } else if (workspaceTarget === null) {
        setCurrentCwdTransient('')
      } else if (typeof workspaceTarget === 'string') {
        setCurrentCwd(workspaceTarget)
      }

      // A fresh draft resolves its own workspace right here, so it owns it. The
      // selected stored id is null for a draft, and so is the owner — they match,
      // which keeps workspace surfaces live on a new chat instead of treating the
      // draft as an un-re-homed switch (#71254).
      setWorkspaceCwdOwner(null)
      setCurrentBranch('')
      // Never clear the composer here — ChatBar's per-thread draft swap owns it.
      setFreshDraftReady(true)
    },
    [activeSessionIdRef, busyRef, navigate, onFreshDraftRouteIntent, resetViewSync, selectedStoredSessionIdRef]
  )

  return startFreshSessionDraft
}
