/**
 * Real-featureset wiring for the contrib (layout tree) root — the minimal
 * subset of DesktopController's hook chain that makes the REAL surfaces work:
 * gateway boot -> sessions list -> click-to-resume -> live transcript ->
 * composer send, plus the real terminal.
 *
 * The wired nodes (sidebar / chat routes / terminal) are exposed through
 * context; registered panes render `<WiredPane part="…"/>` to consume them.
 */

import { useStore } from '@nanostores/react'
import { useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { useDesktopFsConnection } from '@/app/composition/bridges/desktop-filesystem'
import { useDesktopIntegrations } from '@/app/composition/bridges/desktop-integrations'
import { usePetBridge } from '@/app/composition/bridges/pet-window'
import { useQuickEntryBridge } from '@/app/composition/bridges/quick-entry-window'
import { useTitlebarToolContributions } from '@/app/composition/registrations/chrome-contributions'
import { CommandPalette } from '@/app/composition/registrations/command-palette'
import { useAppKeybindings } from '@/app/composition/registrations/keybindings'
import { ChatRoutesSurface, SidebarSurface, StatusbarSurface, TerminalSurface } from '@/app/composition/registrations/surfaces'
import { ContribWiringContext } from '@/app/composition/root/context'
import { useOverlayRouting } from '@/app/composition/routing/overlay-routing'
import {
  archiveRoutedAgentBoxSession,
  toggleRoutedAgentBoxSessionPin
} from '@/app/composition/wiring/agentbox-session-commands'
import {
  CRON_ROUTE,
  navigateToWorkspacePage,
  routeSessionId,
  sessionRoute,
  SETTINGS_ROUTE,
  syncWorkspaceRoute
} from '@/app/routes'
import { TitlebarControls } from '@/app/shell/chrome/titlebar/controls'
import { useWindowControlsOverlayWidth } from '@/app/shell/platform/use-window-controls-overlay-width'
import { useHermesConfigRecord } from '@/application/config/use-config-record'
import { refreshActiveProfile } from '@/application/profile/catalog'
import { getLatestSessionMessages } from '@/application/session-transcripts'
import { openSession } from '@/application/session/open-session'
import { createSessionRpcDispatcher } from '@/application/session/session-rpc-dispatcher'
import { useSessionHandback } from '@/application/session/window-handoff'
import { closeAllTerminals } from '@/application/terminal/terminals'
import { useSkinCommand } from '@/application/theme/use-skin-command'
import { graftRefreshedTailOntoBackfill } from '@/application/transcript/transcript-backfill'
import { BootFailureOverlay } from '@/components/boot-failure-overlay'
import { requestComposerInsert } from '@/components/composer/focus'
import { useComposerActions } from '@/components/composer/use-composer-actions'
import { ConfirmHost } from '@/components/confirm-host'
import { DesktopInstallOverlay } from '@/components/desktop-install-overlay'
import { FindBar } from '@/components/find-bar'
import { GatewayConnectingOverlay } from '@/components/gateway-connecting-overlay'
import { useGatewayRequest } from '@/components/hooks/use-gateway-request'
import { NotificationStack } from '@/components/notifications'
import { DesktopOnboardingOverlay } from '@/components/onboarding'
import { FloatingPet } from '@/components/pet/floating-pet'
import { RemoteDisplayBanner } from '@/components/remote-display-banner'
import { SendDiagnosticsHost } from '@/components/send-diagnostics-dialog'
import { TipHost } from '@/components/tips'
import { emitGatewayEvent } from '@/extension/contrib/events'
import { closeWorkspaceTab } from '@/features/chat/close-tab'
import { $restartPreviewServer } from '@/features/chat/right-rail/restart-preview-server'
import { PetGenerateOverlay } from '@/features/pet-generate/pet-generate-overlay'
import { ModelPickerOverlay } from '@/features/profiles/model-picker-overlay'
import { ModelVisibilityOverlay } from '@/features/profiles/model-visibility-overlay'
import { FileActionDialogs } from '@/features/right-sidebar/file-actions'
import { RemoteFolderPicker } from '@/features/right-sidebar/files/remote-picker'
import { resetProjectTreeState } from '@/features/right-sidebar/files/use-project-tree'
import { PersistentTerminal } from '@/features/right-sidebar/terminal/persistent'
import { useGatewayBoot } from '@/features/runtime/gateway/hooks/use-gateway-boot'
import { SessionImportView } from '@/features/session-import'
import { useBackgroundQueueDrain } from '@/features/session/hooks/use-background-queue-drain'
import { useContextSuggestions } from '@/features/session/hooks/use-context-suggestions'
import { useCwdActions } from '@/features/session/hooks/use-cwd-actions'
import { useHermesConfig } from '@/features/session/hooks/use-hermes-config'
import { useMessageStream } from '@/features/session/hooks/use-message-stream'
import { useModelControls } from '@/features/session/hooks/use-model-controls'
import { usePreviewRouting } from '@/features/session/hooks/use-preview-routing'
import { usePromptActions } from '@/features/session/hooks/use-prompt-actions'
import { useRouteResume } from '@/features/session/hooks/use-route-resume'
import { useSessionActions } from '@/features/session/hooks/use-session-actions'
import { useSessionListActions } from '@/features/session/hooks/use-session-list-actions'
import { useSessionStateCache } from '@/features/session/hooks/use-session-state-cache'
import { SessionPickerOverlay } from '@/features/session/session-picker-overlay'
import { SessionSwitcher } from '@/features/session/session-switcher'
import {
  reconcileActiveTranscript,
  resolveActiveTranscriptSession,
  useBackgroundSync
} from '@/features/session/sync/background-sync'
import { useSessionTileDelegate } from '@/features/session/tiles/use-session-tile-delegate'
import { startWorkspaceSession } from '@/features/session/workspace-session-target'
import { PluginInstallModal } from '@/features/settings/plugin-install-modal'
import { UpdatesOverlay } from '@/features/updates/updates-overlay'
import { useI18n } from '@/i18n'
import { type ChatMessage, chatMessageText, preserveLocalAssistantErrors, toChatMessages } from '@/lib/chat-messages'
import { formatRefValue } from '@/lib/format-ref-value'
import {
  titlebarControlsPosition,
  titlebarControlsYNudge,
  titlebarToolsRightCss,
  titlebarToolsWidthCss
} from '@/lib/titlebar'
import { latestSessionTodos } from '@/lib/todos'
import { $billingSettingsRequest } from '@/store/billing-block'
import { $desktopBoot } from '@/store/boot'
import { $activeConnectionId } from '@/store/connections'
import { $cronReviewRequest } from '@/store/cron'
import { $pinnedSessionIds, pinSession, restoreWorktree, unpinSession } from '@/store/layout'
import { notifyError } from '@/store/notifications'
import { $newSessionTabAction, registerPaneCloser } from '@/store/pane-shell/tree'
import {
  $workspaceMode,
  $workspaceNewSessionTarget,
  $workspaceOwnerKey,
  setWorkspaceScope
} from '@/store/pane-shell/workspace-scope'
import { $previewTarget } from '@/store/preview'
import { $activeGatewayProfile, $freshSessionRequest, $profileScope, normalizeProfileKey } from '@/store/profile'
import { $newProjectSessionRequest, $startWorkSessionRequest, followActiveSessionCwd } from '@/store/projects'
import {
  $activeSessionId,
  $connection,
  $currentCwd,
  $freshDraftReady,
  $gatewayState,
  $messages,
  $resumeExhaustedSessionId,
  $resumeFailedSessionId,
  $selectedStoredSessionId,
  $sessionResumeRequest,
  $sessions,
  forgetSessionOwnerHintsForSession,
  requestSessionResume,
  sessionMatchesStoredId,
  sessionOwnerRouteFromRow,
  sessionPinId,
  setAwaitingResponse,
  setBusy,
  setMessages
} from '@/store/session'
import { clearSessionTodos, setSessionTodos, todosForHydration } from '@/store/todos'
import { isAuxiliaryWindow, isBrowserWindow, isHudWindow } from '@/store/windows'

import type { WiringActions, WiringApi } from './types'

// Overlay views the controller mounts over the shell — lazy, load on demand.
// The workspace-route full-page views (skills/artifacts) are the
// ChatRoutesSurface's and live in ./surfaces.
const CommandCenterView = lazy(async () => ({ default: (await import('@/features/command-center')).CommandCenterView }))
const ProfilesView = lazy(async () => ({ default: (await import('@/features/profiles')).ProfilesView }))
const SettingsView = lazy(async () => ({ default: (await import('@/features/settings')).SettingsView }))

// Agents / Cron / Webhooks / Starmap are deliberately NOT code-split here. This
// is the AgentBox product controller, and those views read the legacy Hermes
// REST plane. Their routes land on the honest "not available" product page
// instead (see ChatRoutesSurface's route table), and nothing offers an entry.
//
// The boot-failure overlay likewise gets no gateway/connection panel: that panel
// is legacy Hermes connection management, and its "Test connection" button dials
// `hermes:connections:test`, which can start the runtime. The overlay renders the
// action only when a panel is handed in, so passing nothing removes the path.

// Surfaces (the four wired panes), the render context + WiredPane, and the
// WiringActions/WiringApi contracts all live in sibling modules — this file is
// the controller that assembles them.
export { WiredPane } from '@/app/composition/root/context'

export function ContribWiring({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()

  const busyRef = useRef(false)
  const creatingSessionRef = useRef(false)
  // Billing recovery routes to Settings → Billing from surfaces without router
  // context (the sticky toast). The shell owns `navigate`, so it consumes the
  // intent counter here; the ref skips the initial mount value.
  const billingSettingsSeenRef = useRef(0)
  const cronReviewSeenRef = useRef(0)
  const activeTranscriptSignatureRef = useRef(new Map<string, string>())
  const activeTranscriptRequestSequenceRef = useRef(0)
  // Stable identity for the whole callback surface (see WiringActions). Mutated
  // in place each render so memoized surfaces never re-render on churn.
  const actionsRef = useRef<WiringActions | null>(null)

  const gatewayState = useStore($gatewayState)
  const activeSessionId = useStore($activeSessionId)
  const billingSettingsRequest = useStore($billingSettingsRequest)
  const cronReviewRequest = useStore($cronReviewRequest)
  const currentCwd = useStore($currentCwd)

  // eslint-disable-next-line no-restricted-syntax -- one-shot request-seen sentinel, not an atom mirror
  useEffect(() => {
    if (billingSettingsRequest === billingSettingsSeenRef.current) {
      return
    }

    billingSettingsSeenRef.current = billingSettingsRequest

    if (billingSettingsRequest > 0) {
      navigate(`${SETTINGS_ROUTE}?tab=billing`)
    }
  }, [billingSettingsRequest, navigate])

  // eslint-disable-next-line no-restricted-syntax -- one-shot request-seen sentinel, not an atom mirror
  useEffect(() => {
    if (cronReviewRequest === cronReviewSeenRef.current) {
      return
    }

    cronReviewSeenRef.current = cronReviewRequest

    if (cronReviewRequest > 0) {
      navigate(CRON_ROUTE)
    }
  }, [cronReviewRequest, navigate])
  const freshDraftReady = useStore($freshDraftReady)
  const resumeFailedSessionId = useStore($resumeFailedSessionId)
  const resumeExhaustedSessionId = useStore($resumeExhaustedSessionId)
  const sessionResumeRequest = useStore($sessionResumeRequest)
  const selectedStoredSessionId = useStore($selectedStoredSessionId)
  const sessions = useStore($sessions)
  const activeConnectionId = useStore($activeConnectionId)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const profileScope = useStore($profileScope)
  const boot = useStore($desktopBoot)

  const routedSessionId = routeSessionId(location.pathname)
  const routedSessionIdRef = useRef(routedSessionId)

  routedSessionIdRef.current = routedSessionId
  const routeToken = `${location.pathname}:${location.search}:${location.hash}`
  const routeTokenRef = useRef(routeToken)
  routeTokenRef.current = routeToken
  const getRouteToken = useCallback(() => routeTokenRef.current, [])

  const getRoutedStoredSessionId = useCallback(() => routedSessionIdRef.current, [])

  const clearRoutedSessionIntent = useCallback(() => {
    routedSessionIdRef.current = null
  }, [])

  // Point the workspace at the route: the pane contribution re-registers
  // headerVeto from $workspaceIsPage (so the main zone's tab bar stands down
  // on pages), and a page route fronts the pane so it can't stay stuck behind
  // a focused session tile.
  useEffect(() => {
    syncWorkspaceRoute(location.pathname)
  }, [location.pathname])

  const {
    agentsOpen,
    chatOpen,
    closeOverlayToPreviousRoute,
    commandCenterInitialSection,
    commandCenterOpen,
    cronOpen,
    currentView,
    openAgents,
    openCommandCenterSection,
    openStarmap,
    profilesOpen,
    resetOverlayReturnRoute,
    settingsOpen,
    starmapOpen,
    toggleCommandCenter,
    webhooksOpen
  } = useOverlayRouting()

  const {
    activeSessionIdRef,
    ensureSessionState,
    getRuntimeIdForStoredSession,
    holdSessionTranscriptView,
    resetViewSync,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    syncSessionStateToView,
    updateSessionState
  } = useSessionStateCache({
    activeSessionId,
    busyRef,
    selectedStoredSessionId,
    setAwaitingResponse,
    setBusy,
    setMessages
  })

  const { connectionRef, gateway, gatewayRef, requestGateway: ambientRequestGateway } = useGatewayRequest()

  // When chrome stays on the launch backend (Bot Mode / all-profiles
  // navigation), session-owned RPCs still have to hit the session's backend.
  // The routing itself lives in createSessionRpcDispatcher (routed by the
  // session the RPC targets, owner ladder in resolveSessionRpcOwner) so the
  // exact production dispatcher is what the integration tests drive.
  const requestGateway = useMemo(
    () =>
      createSessionRpcDispatcher({
        ambientRequest: ambientRequestGateway,
        runtimeIdByStoredSessionIdRef,
        selectedStoredSessionIdRef,
        sessionStateByRuntimeIdRef
      }),
    [ambientRequestGateway, runtimeIdByStoredSessionIdRef, selectedStoredSessionIdRef, sessionStateByRuntimeIdRef]
  )

  const { loadMoreSessions, refreshCronJobs, refreshSessions } = useSessionListActions({ profileScope })

  const updateActiveSessionRuntimeInfo = useCallback(
    (info: { branch?: string; cwd?: string }) => {
      const sessionId = activeSessionIdRef.current

      if (!sessionId) {
        return
      }

      updateSessionState(sessionId, state => ({
        ...state,
        branch: info.branch ?? state.branch,
        cwd: info.cwd ?? state.cwd
      }))
    },
    [activeSessionIdRef, updateSessionState]
  )

  const { refreshProjectBranch } = useCwdActions({
    activeSessionIdRef,
    onSessionRuntimeInfo: updateActiveSessionRuntimeInfo,
    requestGateway
  })

  const { refreshHermesConfig } = useHermesConfig({ activeSessionIdRef })

  const { applySavedMainModel, refreshCurrentModel, selectModel } = useModelControls({
    cacheOwnerConnectionId: activeConnectionId || undefined,
    cacheProfile: activeGatewayProfile,
    queryClient,
    requestGateway
  })

  const openProviderSettings = useCallback(() => navigate(`${SETTINGS_ROUTE}?tab=providers`), [navigate])

  // Palette "Keyboard shortcuts" entry dispatches a custom event (contributions
  // don't have router access); listen and navigate to the settings keybinds tab.
  useEffect(() => {
    const onOpenKeybinds = () => navigate(`${SETTINGS_ROUTE}?tab=keybinds`)
    window.addEventListener('hermes:open-keybinds', onOpenKeybinds)

    return () => window.removeEventListener('hermes:open-keybinds', onOpenKeybinds)
  }, [navigate])

  // Dev-only: install the credit-notice demo trigger (Ctrl+Shift+C / ⌘K palette
  // / window.__creditsDemo). Dynamic import inside the DEV guard so the module
  // is dropped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    let dispose: (() => void) | undefined

    void import('@/app/composition/dev/credits-notice-demo').then(m => {
      dispose = m.installCreditsNoticeDemo()
    })

    return () => dispose?.()
  }, [])

  // Post-turn rehydrate from stored history (same behavior as DesktopController,
  // including finished-todos restoration).
  const hydrateFromStoredSession = useCallback(
    async (
      attempts = 1,
      storedSessionId = selectedStoredSessionIdRef.current,
      runtimeSessionId = activeSessionIdRef.current
    ) => {
      if (!storedSessionId || !runtimeSessionId) {
        return
      }

      const storedProfile = $sessions.get().find(session => sessionMatchesStoredId(session, storedSessionId))?.profile

      for (let index = 0; index < Math.max(1, attempts); index += 1) {
        try {
          const latest = await getLatestSessionMessages(storedSessionId, storedProfile)
          const messages = toChatMessages(latest.messages)
          updateSessionState(
            runtimeSessionId,
            state => ({
              ...state,
              // Post-turn rehydrate reads only the newest tail page — graft it
              // onto any backfilled older pages instead of dropping them.
              messages: preserveLocalAssistantErrors(
                graftRefreshedTailOntoBackfill(messages, state.messages),
                state.messages
              )
            }),
            storedSessionId
          )

          const restored = todosForHydration(latestSessionTodos(messages))

          if (restored) {
            setSessionTodos(runtimeSessionId, restored)
          } else {
            clearSessionTodos(runtimeSessionId)
          }

          return
        } catch {
          // Best-effort fallback when live stream payloads are empty.
        }

        if (index < attempts - 1) {
          await new Promise(resolve => window.setTimeout(resolve, 250))
        }
      }
    },
    [activeSessionIdRef, selectedStoredSessionIdRef, updateSessionState]
  )

  // Refresh any active transcript changed by another process. Signature-gated
  // so a no-change event does not churn the thread.
  const refreshActiveTranscript = useCallback(
    () =>
      reconcileActiveTranscript({
        activeSessionIdRef,
        busyRef,
        requestSequenceRef: activeTranscriptRequestSequenceRef,
        resolveSession: resolveActiveTranscriptSession,
        selectedStoredSessionIdRef,
        signatureRef: activeTranscriptSignatureRef,
        updateSessionState
      }),
    [activeSessionIdRef, busyRef, selectedStoredSessionIdRef, updateSessionState]
  )

  const { handleGatewayEvent } = useMessageStream({
    activeGatewayProfile,
    activeSessionIdRef,
    hydrateFromStoredSession,
    queryClient,
    refreshHermesConfig,
    refreshSessions,
    sessionStateByRuntimeIdRef,
    updateSessionState
  })

  // Agent-driven preview routing (agent opens a URL/file -> the preview rail
  // follows) + the preview server restart handler, layered over the base
  // gateway event stream exactly like DesktopController.
  const { handleDesktopGatewayEvent, restartPreviewServer } = usePreviewRouting({
    baseHandleGatewayEvent: handleGatewayEvent,
    currentCwd,
    requestGateway
  })

  // Composer @-mention context suggestions (files/dirs under the cwd).
  useContextSuggestions({
    activeSessionId,
    activeSessionIdRef,
    currentCwd,
    gatewayState,
    requestGateway
  })

  // Expose the restart handler to the preview pane contribution (module
  // boundary crossed via atom — the preview pane (features/chat/right-rail)
  // can't import this file).
  useEffect(() => {
    $restartPreviewServer.set(restartPreviewServer)

    return () => $restartPreviewServer.set(null)
  }, [restartPreviewServer])

  const {
    archiveSession,
    branchCurrentSession,
    branchStoredSession,
    createBackendSessionForSend,
    openNewSessionTile,
    removeSession,
    resumeSession,
    selectSidebarItem,
    startFreshSessionDraft
  } = useSessionActions({
    activeSessionId,
    activeSessionIdRef,
    busyRef,
    creatingSessionRef,
    ensureSessionState,
    getRouteToken,
    getRoutedStoredSessionId,
    holdSessionTranscriptView,
    navigate,
    onFreshDraftRouteIntent: clearRoutedSessionIntent,
    requestGateway,
    resetViewSync,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionId,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    syncSessionStateToView,
    updateSessionState
  })

  // A profile switch/create drops to a fresh new-session draft so the
  // previously open session doesn't bleed across contexts. Skip initial value.
  const freshSessionRequest = useStore($freshSessionRequest)
  const lastFreshRef = useRef(freshSessionRequest)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (freshSessionRequest === lastFreshRef.current) {
      return
    }

    lastFreshRef.current = freshSessionRequest
    startFreshSessionDraft()
  }, [freshSessionRequest, startFreshSessionDraft])

  // Swapping the live gateway to another source or profile must re-pull that
  // source's model/config/profile state. Two sources commonly both expose a
  // `default` profile, so profile alone is not a sufficient identity.
  const gatewayScope = `${activeConnectionId ?? ''}\0${activeGatewayProfile}`
  const lastGatewayScopeRef = useRef(gatewayScope)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (gatewayScope === lastGatewayScopeRef.current) {
      return
    }

    lastGatewayScopeRef.current = gatewayScope
    // Force: the new source/profile pair has its own defaults, so reseed the
    // selector even if the composer already shows values from the previous
    // backend. These refreshes carry intent tokens so an in-flight picker
    // click still wins.
    void refreshCurrentModel(true)
    void refreshHermesConfig(true)
    void refreshActiveProfile()
    resetProjectTreeState()
  }, [gatewayScope, refreshCurrentModel, refreshHermesConfig])

  // New session anchored to a workspace. Seeds cwd + branch from the clicked
  // workspace; an explicit worktree path also drills the sidebar into that
  // project so the new lane is visible.
  //
  // Workspace selection always takes the existing product surface to a local
  // draft. It must never spend a backend Session merely because main already
  // displays history; the first Send is the creation boundary.
  const startSessionInWorkspace = useCallback(
    (path: null | string) => {
      setWorkspaceScope('sessions')
      startWorkspaceSession({
        activeSessionIdRef,
        followActiveSessionCwd,
        onExplicitWorkspace: restoreWorktree,
        path,
        requestGateway,
        startFreshSessionDraft
      })
    },
    [activeSessionIdRef, requestGateway, startFreshSessionDraft]
  )

  // Composer "branch off into a new worktree": open a fresh session anchored
  // to the just-created tree, then prefill the task that kicked it off.
  const startWorkSessionRequest = useStore($startWorkSessionRequest)
  const lastStartWorkTokenRef = useRef(startWorkSessionRequest?.token ?? 0)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (!startWorkSessionRequest || startWorkSessionRequest.token === lastStartWorkTokenRef.current) {
      return
    }

    lastStartWorkTokenRef.current = startWorkSessionRequest.token
    startSessionInWorkspace(startWorkSessionRequest.path)

    if (startWorkSessionRequest.draft) {
      requestComposerInsert(startWorkSessionRequest.draft, { target: 'main' })
    }
  }, [startSessionInWorkspace, startWorkSessionRequest])

  // "New project" DRAG completion: the dialog created a project that was
  // dropped onto a chat zone (tab-strip slot / pane edge / pane center). Open
  // its fresh session draft exactly there — the same `openNewSessionTile`
  // create path the new-session drags use — so the project starts, and stays,
  // where it was dropped. Consume-once: drop the request after handling.
  const newProjectSessionRequest = useStore($newProjectSessionRequest)

  useEffect(() => {
    if (!newProjectSessionRequest) {
      return
    }

    const { path, placement } = newProjectSessionRequest

    $newProjectSessionRequest.set(null)
    void openNewSessionTile(placement.dir, {
      anchor: placement.anchor,
      before: placement.before,
      cwd: path,
      // Same draft-tab contract as onNewSessionSplit: a center/strip drop is
      // an unlisted draft tab until its first turn; an edge split lists.
      listed: placement.dir === 'center' ? false : undefined
    })
  }, [newProjectSessionRequest, openNewSessionTile])

  const composer = useComposerActions({ activeSessionId, currentCwd, requestGateway })

  const branchInNewChat = useCallback(
    async (messageId?: string) => {
      const branched = await branchCurrentSession(messageId)

      if (branched) {
        await refreshSessions().catch(() => undefined)
      }

      return branched
    },
    [branchCurrentSession, refreshSessions]
  )

  const handleSkinCommand = useSkinCommand()

  const {
    cancelRun,
    editMessage,
    executeSlashCommand,
    handleThreadMessagesChange,
    reloadFromMessage,
    restoreToMessage,
    steerPrompt,
    submitText
  } = usePromptActions({
    activeSessionId,
    activeSessionIdRef,
    branchCurrentSession: branchInNewChat,
    busyRef,
    createBackendSessionForSend,
    getRoutedStoredSessionId,
    getRuntimeIdForStoredSession,
    getRouteToken,
    handleSkinCommand,
    openMemoryGraph: openStarmap,
    refreshSessions,
    requestGateway,
    resumeStoredSession: resumeSession,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionIdRef,
    startFreshSessionDraft,
    updateSessionState
  })

  // Runs outside the selected ChatBar so queues belonging to background
  // sessions continue once those sessions are idle.
  useBackgroundQueueDrain({
    enabled: gatewayState === 'open',
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionId,
    submitText
  })

  // Session-tile delegate (resume/submit/interrupt/slash + the session verbs
  // the tile TAB menu needs, without touching the primary view).
  useSessionTileDelegate({
    archiveSession,
    branchStoredSession,
    executeSlashCommand,
    removeSession,
    requestGateway,
    runtimeIdByStoredSessionIdRef,
    sessionStateByRuntimeIdRef,
    updateSessionState
  })

  // The host-capability adapters learn which connection is live from here, so
  // `lib/desktop-fs` never has to read the session store itself.
  useDesktopFsConnection()

  // The popped-out pet overlay's bridge back into the app.
  usePetBridge({ requestGateway, resumeSession, submitText })

  // The global-hotkey Quick Entry window's bridge: its captured text rides the
  // SAME submit machinery the normal composer uses (current chat / picked
  // session / new session), and it hears gateway truth from this window.
  useQuickEntryBridge({ startFreshSessionDraft, submitText })

  // Leaving HUD mode hands this window the conversation back; the legacy
  // stream re-attach stays behind the host adapter seam (adoptSession).
  useSessionHandback({ adoptSession: resumeSession, navigate })

  // Clear a failed turn's red error banner. Errors are renderer-local (never
  // persisted): a bare error placeholder is dropped entirely; a partial-output
  // failure keeps its content and sheds the error. Both the runtime cache AND
  // the live $messages view must be updated — preserveLocalAssistantErrors
  // re-grafts any still-errored view message on the next session.info flush.
  const dismissError = useCallback(
    (messageId: string) => {
      const runtimeSessionId = activeSessionIdRef.current

      if (!runtimeSessionId) {
        return
      }

      const clearErrorIn = (messages: ChatMessage[]): ChatMessage[] =>
        messages.flatMap(message => {
          if (message.id !== messageId || !message.error) {
            return [message]
          }

          if (!chatMessageText(message).trim() && !message.parts.some(part => part.type !== 'text')) {
            return []
          }

          return [{ ...message, error: undefined, pending: false }]
        })

      // View first: the cache update below triggers a re-sync that reads
      // $messages as the error-preservation baseline.
      setMessages(clearErrorIn($messages.get()))

      updateSessionState(runtimeSessionId, state => ({
        ...state,
        messages: clearErrorIn(state.messages)
      }))
    },
    [activeSessionIdRef, updateSessionState]
  )

  useRouteResume({
    activeSessionId,
    activeSessionIdRef,
    creatingSessionRef,
    currentView,
    freshDraftReady,
    gatewayState,
    locationPathname: location.pathname,
    resumeSession,
    resumeFailedSessionId,
    resumeExhaustedSessionId,
    sessionResumeRequest,
    routedSessionId,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionId,
    selectedStoredSessionIdRef,
    startFreshSessionDraft
  })

  // Plugins hear the stream FIRST (isolated fan-out in contrib/events), then
  // the app dispatches as before — a plugin listener can't affect app flow.
  const handleGatewayEventWithPlugins = useCallback(
    (event: Parameters<typeof handleDesktopGatewayEvent>[0]) => {
      emitGatewayEvent(event)

      handleDesktopGatewayEvent(event)
    },
    [handleDesktopGatewayEvent]
  )

  useGatewayBoot({
    beforeConnectionSwitch: () => {
      startFreshSessionDraft({ preserveRoute: true, workspaceTarget: null })
      resetOverlayReturnRoute()
      resetProjectTreeState()
      closeAllTerminals()
    },
    handleGatewayEvent: handleGatewayEventWithPlugins,
    legacyGatewayAutostart: false,
    onConnectionReady: c => {
      connectionRef.current = c
    },
    onGatewayReady: g => {
      gatewayRef.current = g
    },
    refreshHermesConfig,
    refreshSessions
  })

  // Keep app data live while the gateway is open (on-connect reseed + the
  // cron / transcript visibility polls + fresh-draft reseed).
  useBackgroundSync({
    activeConnectionId,
    activeGatewayProfile,
    activeSessionId,
    activeStoredSessionId: selectedStoredSessionId,
    freshDraftReady,
    gatewayState,
    refreshActiveTranscript,
    refreshCronJobs,
    refreshCurrentModel,
    refreshHermesConfig,
    refreshSessions,
    requestGateway,
    updateSessionState
  })

  // Electron-main / OS / cross-window integrations: update polling, ⌘W close,
  // deep links, native-notification nav, preview-shortcut enablement,
  // remembered-session restore, and cross-window session-list sync.
  const previewTarget = useStore($previewTarget)

  // display.resume_last_session gates the cold-start restore. `undefined` while
  // the record is still loading holds the restore latch open; a failed fetch
  // falls back to the historical behavior (resume).
  const configRecord = useHermesConfigRecord()

  const resumeLastSession = configRecord.isPending
    ? undefined
    : (configRecord.data?.display as { resume_last_session?: unknown } | undefined)?.resume_last_session !== false

  useDesktopIntegrations({
    activeProfile: normalizeProfileKey(activeGatewayProfile),
    chatOpen,
    hasPreview: Boolean(previewTarget),
    locationPathname: location.pathname,
    navigate,
    profileReady: boot.phase === 'renderer.ready',
    refreshSessions,
    resumeLastSession,
    resumeExhaustedSessionId,
    routedSessionId,
    runtimeIdByStoredSessionId: runtimeIdByStoredSessionIdRef,
    sessions
  })

  // Pin/unpin the selected session (statusbar keybind + chat header) — pinned
  // on the durable lineage-root id so it survives auto-compression. On an
  // AgentBox session route the service record is the authority and the flip
  // rides `sessions.update` CAS instead of the renderer-local pin store; the
  // narrow command module keeps that decision independently testable.
  const toggleSelectedPin = useCallback(() => {
    const routed = toggleRoutedAgentBoxSessionPin(location.pathname)

    if (routed) {
      // The service's reason surfaces exactly like the sidebar row's does —
      // the old pinned state stands (nothing was written locally).
      void routed.promise.catch(error =>
        notifyError(error, routed.pinned ? t.sidebar.agentBoxSession.pinFailed : t.sidebar.agentBoxSession.unpinFailed)
      )

      return
    }

    if (routeSessionId(location.pathname)) {
      // A session route the service cannot prove (no record, no service, no
      // declared capability) fails closed — no wire call, no legacy pin.
      return
    }

    const sessionId = $selectedStoredSessionId.get()

    if (!sessionId) {
      return
    }

    const session = $sessions.get().find(s => sessionMatchesStoredId(s, sessionId))
    const pinId = session ? sessionPinId(session) : sessionId

    if ($pinnedSessionIds.get().includes(pinId)) {
      unpinSession(pinId)
    } else {
      pinSession(pinId)
    }
  }, [location.pathname, t])

  // The tab-strip "+" and ⌘T share one action: open a new session as its own
  // tab (stacked into the workspace zone) WITHOUT polluting the session list.
  // Created `listed: false`, so each new tab's in-memory session stays out of
  // the sidebar until its first message persists a turn and a refresh surfaces
  // it — Cursor-style. Every click opens a fresh "New session" tab (multiple
  // empty tabs are fine since none touch the session list).
  //
  // Bot Mode aims the "+" at the selected bot's own profile. Anything short of
  // an exact route — a group chat's `blocked` target, an orphaned roster row —
  // falls THROUGH to the ordinary session rather than refusing: the main strip
  // carries plain session tabs alongside bot chats, so a "+" there must never
  // be dead just because the sidebar's current selection has nowhere to route.
  const openNewSessionTab = useCallback(() => {
    const workspaceOwnerKey = $workspaceOwnerKey.get()
    const workspaceNewSessionTarget = $workspaceNewSessionTarget.get()

    if ($workspaceMode.get() === 'bots' && workspaceNewSessionTarget?.kind === 'route' && workspaceOwnerKey) {
      void openNewSessionTile('center', {
        listed: false,
        route: workspaceNewSessionTarget.route,
        workspaceScope: {
          ownerRoute: workspaceNewSessionTarget.route,
          workspaceMode: 'bots',
          workspaceOwnerKey
        }
      })

      return
    }

    void openNewSessionTile('center', { listed: false })
  }, [openNewSessionTile])

  // Archive the selected session (rebindable `session.archive` hotkey). On an
  // AgentBox session route the service record is the authority and the archive
  // rides `sessions.archive` CAS; the narrow command module keeps that decision
  // independently testable. The open route, its history and any running turn
  // are left exactly as they are — archiving hides the row from the sidebar,
  // it does not close what the user is reading.
  const archiveSelectedSession = useCallback(() => {
    const routed = archiveRoutedAgentBoxSession(location.pathname)

    if (routed) {
      // The service's reason surfaces exactly like the sidebar's does — no
      // local mutation happened, so nothing on screen has to roll back.
      void routed.promise.catch(error => notifyError(error, t.sidebar.agentBoxSession.archiveFailed))

      return
    }

    if (routeSessionId(location.pathname)) {
      // A session route the service cannot prove (no record, no service, no
      // declared capability, or an already archived record) fails closed — no
      // wire call, and never the same-id legacy session.
      return
    }

    const sessionId = $selectedStoredSessionId.get()

    if (!sessionId) {
      return
    }

    void archiveSession(sessionId)
  }, [archiveSession, location.pathname, t])

  // Single global listener for every rebindable hotkey plus the on-screen
  // keybind editor's capture mode (same as DesktopController).
  useAppKeybindings({
    archiveSelectedSession,
    openNewSessionTab,
    startFreshSession: startFreshSessionDraft,
    toggleCommandCenter,
    toggleSelectedPin
  })

  // Register the tab-strip "+" action (the generic renderer stays
  // session-agnostic; null until wired hides the glyph).
  useEffect(() => {
    $newSessionTabAction.set(openNewSessionTab)

    return () => $newSessionTabAction.set(null)
  }, [openNewSessionTab])

  // The MAIN tab's Close. The workspace pane can't leave the tree, so its
  // closer empties it instead: the next stacked session shifts in, else main
  // drops to a fresh draft. Registering it here is also what gives the tab its
  // close GESTURE (⌘-click / middle-click) — the strip reads the closer, not
  // the `uncloseable` flag, so the pane stays undismissable either way.
  useEffect(() => {
    registerPaneCloser('workspace', () => void closeWorkspaceTab(id => navigate(sessionRoute(id))))

    return () => registerPaneCloser('workspace')
  }, [navigate])

  // The controller's entire callback surface, gathered into the stable
  // `actions` bag. `nextActions` is TS-checked against WiringActions each
  // render; its fields are copied into the ref object so `actions` keeps one
  // identity for the app's life (memoized surfaces don't re-render on churn)
  // while every handler still closes over the latest values.
  const nextActions: WiringActions = {
    onAddContextRef: composer.addContextRefAttachment,
    onAddUrl: url => composer.addContextRefAttachment(`@url:${formatRefValue(url)}`, url),
    onArchiveSession: sessionId => void archiveSession(sessionId),
    onAttachDroppedItems: composer.attachDroppedItems,
    onAttachImageBlob: composer.attachImageBlob,
    onAttachPrCommentUrl: composer.attachPrCommentUrl,
    onBranchInNewChat: messageId => void branchInNewChat(messageId),
    onBranchSession: sessionId => void branchStoredSession(sessionId),
    onCancel: cancelRun,
    onDeleteSelectedSession: () => {
      const id = $selectedStoredSessionId.get()

      if (id) {
        void removeSession(id)
      }
    },
    onDeleteSession: sessionId => void removeSession(sessionId),
    onDismissError: dismissError,
    onEdit: editMessage,
    onLoadMoreSessions: loadMoreSessions,
    onNavigate: selectSidebarItem,
    onNewSessionInWorkspace: path => startSessionInWorkspace(path),
    onNewSessionSplit: (dir, opts) =>
      void openNewSessionTile(dir, {
        ...opts,
        // A CENTER drop stacks a fresh TAB: keep the existing draft-tab
        // contract and leave it out of the sidebar until its first turn
        // persists (same as the tab-strip "+" and the occupied-project "+").
        // An EDGE drop SPLITS a visible pane — list it like every other split.
        listed: dir === 'center' ? false : undefined
      }),
    onPasteClipboardImage: opts => composer.pasteClipboardImage(opts),
    onPickFiles: () => void composer.pickContextPaths('file'),
    onPickFolders: () => void composer.pickContextPaths('folder'),
    onPickImages: () => void composer.pickImages(),
    onReload: reloadFromMessage,
    onRemoveAttachment: id => void composer.removeAttachment(id),
    onRestoreToMessage: restoreToMessage,
    // Already on screen (open tile, or the main session)? Jump to its tab;
    // otherwise load it into main. Same door every other session link uses.
    // The clicked ROW is the identity, not its bare id: two profiles can hold
    // twins with the same stored id (#92454), and an id-only resume resolves
    // against whichever cached row is found first — the user clicks a row
    // previewing profile A and the resume dials profile B. Pin the row's own
    // (connection, profile) as the resume owner before navigating; untagged
    // rows (single-profile installs and the legacy primary-SSH path) keep the
    // ambient/id-only path. Clear any stale explicit hint first: older builds
    // incorrectly persisted those rows as `local`, which made a remote session
    // click switch to the Mac backend and fail with "session not found".
    onResumeSession: (sessionId, session) => {
      const ownerRoute = sessionOwnerRouteFromRow(session)

      if (ownerRoute) {
        requestSessionResume(sessionId, ownerRoute)
      } else {
        forgetSessionOwnerHintsForSession(sessionId)
        requestSessionResume(sessionId)
      }

      openSession(sessionId, navigate)
    },
    onRetryResume: sessionId => void resumeSession(sessionId, true),
    onSteer: steerPrompt,
    onSubmit: submitText,
    onThreadMessagesChange: handleThreadMessagesChange,
    onToggleSelectedPin: toggleSelectedPin,
    getGateway: () => gatewayRef.current,
    openAgents,
    openCommandCenterSection,
    requestGateway,
    selectModel,
    toggleCommandCenter
  }

  if (actionsRef.current) {
    Object.assign(actionsRef.current, nextActions)
  } else {
    actionsRef.current = nextActions
  }

  const actions = actionsRef.current

  // Each pane node is memoized on ONLY the reactive inputs it truly consumes;
  // everything else reaches its surface through `actions` (stable) or the
  // surface's own atom subscriptions. A wiring tick that doesn't touch a
  // node's keys leaves its element reference intact, so `WiredPane` (memoized)
  // bails on that pane subtree — panes render independently of one another.
  const sidebarNode = useMemo(
    () => <SidebarSurface actions={actions} currentView={currentView} />,
    [actions, currentView]
  )

  const terminalNode = useMemo(() => <TerminalSurface />, [])

  const statusbarNode = useMemo(
    () => (
      <StatusbarSurface
        actions={actions}
        agentsOpen={agentsOpen}
        chatOpen={chatOpen}
        commandCenterOpen={commandCenterOpen}
      />
    ),
    [actions, agentsOpen, chatOpen, commandCenterOpen]
  )

  // The gateway instance + all chat reactivity are subscribed inside
  // ChatRoutesSurface / ChatView.
  const chatRoutesNode = useMemo(() => <ChatRoutesSurface actions={actions} />, [actions])

  const api = useMemo<WiringApi>(
    () => ({
      chatRoutes: chatRoutesNode,
      sidebar: sidebarNode,
      statusbar: statusbarNode,
      terminal: terminalNode
    }),
    [chatRoutesNode, sidebarNode, statusbarNode, terminalNode]
  )

  // The REAL titlebar tool clusters (sidebar/flip toggles, haptics, keybinds,
  // settings gear) — fixed chrome positioned via the same CSS vars AppShell
  // sets, computed here from the live connection. Page-registered tools
  // (preview's monitor/devtools cluster, …) arrive as registry contributions.
  const leftTitlebarTools = useTitlebarToolContributions('left')
  const rightTitlebarTools = useTitlebarToolContributions('right')
  const connection = useStore($connection)
  const controlsPos = titlebarControlsPosition(connection?.windowButtonPosition, Boolean(connection?.isFullscreen))
  // Windows/WSLg reserve native min/max/close on the right (AppShell parity:
  // prefer the live WCO measurement, fall back to the static reservation).
  const measuredOverlayWidth = useWindowControlsOverlayWidth()
  const nativeOverlayWidth = measuredOverlayWidth ?? connection?.nativeOverlayWidth ?? 0

  const titlebarChrome = {
    darwinMajor: connection?.darwinMajor ?? 0,
    isFullscreen: Boolean(connection?.isFullscreen),
    windowButtonPosition: connection?.windowButtonPosition
  }

  const titlebarToolsRight = titlebarToolsRightCss(nativeOverlayWidth, titlebarChrome)
  // Pane-registered tools (preview's monitor/devtools cluster) anchor flush
  // against the static system cluster — in the tree layout the titlebar band
  // sits ABOVE the grid, so AppShell's pane-width anchoring doesn't apply.
  // Count every button the static cluster actually renders: four systemTools
  // (layout, haptics, keybinds, settings) PLUS the always-present
  // right-sidebar toggle (see titlebar-controls.tsx). A shared width that
  // under-counts leaves the find bar, the titlebar header padding, and the
  // pane-cluster anchor overlapping the fifth button.
  const SYSTEM_TOOL_COUNT = 5
  const paneToolCount = rightTitlebarTools.filter(tool => !tool.hidden).length
  const systemToolsWidth = titlebarToolsWidthCss(SYSTEM_TOOL_COUNT)

  const titlebarToolsWidth =
    paneToolCount > 0 ? `calc(${systemToolsWidth} + ${titlebarToolsWidthCss(paneToolCount)})` : systemToolsWidth

  return (
    <ContribWiringContext.Provider value={api}>
      <div
        className="contents"
        style={
          {
            '--titlebar-controls-left': `${controlsPos.left}px`,
            '--titlebar-controls-top': `${controlsPos.top}px`,
            '--titlebar-controls-y-nudge': titlebarControlsYNudge(titlebarChrome),
            '--titlebar-tools-right': titlebarToolsRight,
            '--titlebar-tools-width': titlebarToolsWidth,
            '--shell-preview-toolbar-gap': systemToolsWidth
          } as CSSProperties
        }
      >
        {/* HUD and the popped-out Browser have no titlebar to hang these off —
            the clusters are `fixed`, so without this they'd float over the
            surface as orphaned buttons. */}
        {!isHudWindow() && !isBrowserWindow() && (
          <TitlebarControls
            leftTools={leftTitlebarTools}
            onOpenSettings={() => navigate(SETTINGS_ROUTE)}
            tools={rightTitlebarTools}
          />
        )}
        {children}
      </div>

      {/* The full real overlay set (mirrors DesktopController's `overlays`). */}
      <RemoteDisplayBanner />
      {!isAuxiliaryWindow() && <DesktopInstallOverlay />}
      {!isAuxiliaryWindow() && (
        <DesktopOnboardingOverlay
          enabled={gatewayState === 'open'}
          onCompleted={() => {
            void refreshHermesConfig()
            void refreshCurrentModel()
            void queryClient.invalidateQueries({ queryKey: ['model-options'] })
          }}
          profile={activeGatewayProfile}
          requestGateway={requestGateway}
        />
      )}
      <ModelPickerOverlay
        gateway={gateway || undefined}
        onSelect={selectModel}
        ownerConnectionId={activeConnectionId || undefined}
        profile={activeGatewayProfile}
        requestGateway={requestGateway}
      />
      <SessionPickerOverlay onResume={sessionId => openSession(sessionId, navigate)} />
      <ModelVisibilityOverlay
        gateway={gateway || undefined}
        onOpenProviders={openProviderSettings}
        ownerConnectionId={activeConnectionId || undefined}
        profile={activeGatewayProfile}
      />
      <UpdatesOverlay />
      <GatewayConnectingOverlay />
      <BootFailureOverlay onboardingEnabled={gatewayState === 'open'} />
      <CommandPalette />
      <PluginInstallModal />
      <PetGenerateOverlay />
      <SessionSwitcher />
      <FileActionDialogs />
      <RemoteFolderPicker />
      <FindBar />

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsView
            gateway={gateway}
            onClose={closeOverlayToPreviousRoute}
            onConfigSaved={() => {
              void refreshHermesConfig()
              void refreshCurrentModel()
              void queryClient.invalidateQueries({ queryKey: ['model-options'] })
            }}
            onMainModelChanged={(provider, model) => {
              applySavedMainModel(provider, model)
              void refreshCurrentModel()
              void queryClient.invalidateQueries({ queryKey: ['model-options'] })
            }}
          />
        </Suspense>
      )}

      {currentView === 'session-import' && (
        <SessionImportView
          key={`${activeConnectionId}:${activeGatewayProfile}`}
          onClose={closeOverlayToPreviousRoute}
          onOpenSession={sessionId => {
            closeOverlayToPreviousRoute()
            openSession(sessionId, navigate, 'stack')
          }}
          owner={{ connectionId: activeConnectionId || 'local', profile: activeGatewayProfile }}
        />
      )}

      {commandCenterOpen && (
        <Suspense fallback={null}>
          {/* The AgentBox product shell names its session authority explicitly —
              never inferred from gateway state, errors or cache contents — so an
              agentbox Command Center reads the service cache and cannot mount
              or call the legacy Hermes system/usage/maintenance panels. */}
          <CommandCenterView
            authority="agentbox"
            initialSection={commandCenterInitialSection}
            onClose={closeOverlayToPreviousRoute}
            onDeleteSession={removeSession}
            onNavigateRoute={path => navigateToWorkspacePage(navigate, path)}
            onOpenSession={sessionId => openSession(sessionId, navigate)}
          />
        </Suspense>
      )}

      {profilesOpen && (
        <Suspense fallback={null}>
          <ProfilesView onClose={closeOverlayToPreviousRoute} />
        </Suspense>
      )}

      {/* Toasts above everything. */}
      <NotificationStack />

      {/* Backs confirm() from @/store/confirm — renders only while one is open. */}
      <ConfirmHost />

      {/* Send Diagnostics consent/upload dialog — driven by $sendDiagnostics
          (error card action); renders nothing until requested. */}
      <SendDiagnosticsHost />

      {/* Petdex floating mascot — renders nothing unless installed + enabled.
          Never in the HUD: that window is the chat bar and nothing else. */}
      {!isHudWindow() && !isBrowserWindow() && <FloatingPet />}

      {/* In-app tips. Renders nothing until the app is quiet and has something
          to point at, and nothing at all once they're off or all retired. The
          HUD and browser windows have none of the surfaces a tip talks about. */}
      {!isHudWindow() && !isBrowserWindow() && <TipHost />}

      {/* Single persistent xterm host chasing the terminal pane's slot rect.
          The HUD has no terminal pane, so it has nothing to chase. */}
      {!isHudWindow() && !isBrowserWindow() && (
        <PersistentTerminal onAddSelectionToChat={composer.addTerminalSelectionAttachment} />
      )}
    </ContribWiringContext.Provider>
  )
}
