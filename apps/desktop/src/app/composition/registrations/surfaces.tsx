/**
 * Wiring surfaces — each pane is its own memoized component. Every surface
 * reads the reactive state it renders from at the leaf (its own atom
 * subscriptions) and reaches the controller's callbacks through the stable
 * `actions` bag, so a state change scoped to one surface (or a bare
 * wiring-controller tick) never re-renders another. This is what keeps the
 * layout tree's zones independently rendered — the whole point of the shell.
 */

import { useStore } from '@nanostores/react'
import { type ComponentProps, memo, type ReactNode, Suspense, useMemo } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'

import { useStatusbarContributions } from '@/app/composition/registrations/chrome-contributions'
import { useStatusbarItems } from '@/app/composition/registrations/statusbar-items'
import { latestSidebarActions } from '@/app/composition/wiring/latest-actions'
import type { SidebarActions, WiringActions } from '@/app/composition/wiring/types'
import { contributedRoutes, NEW_CHAT_ROUTE, ROUTES_AREA, sessionRoute, SETTINGS_ROUTE } from '@/app/routes'
import { StatusbarControls } from '@/app/shell/chrome/statusbar/statusbar-controls'
import { ContribBoundary, ContribRender } from '@/extension/contrib/react/boundary'
import { useContributions } from '@/extension/contrib/react/use-contributions'
import { AgentBoxChatView } from '@/features/chat/agentbox-chat-view'
import { ChatSidebar } from '@/features/chat/sidebar'
import { TerminalPaneChrome } from '@/features/right-sidebar/terminal/chrome'
import { useStatusSnapshot } from '@/features/runtime/use-status-snapshot'
import { $activeConnectionId } from '@/store/connections'
import { $activeGatewayProfile } from '@/store/profile'
import { $freshDraftReady, $gatewayState } from '@/store/session'

// Same lazy-view split as DesktopController — pages load on demand. The
// full-page views the workspace route table mounts live here; overlay views
// (agents/settings/…) are the controller's and stay in wiring.tsx.
export function LegacySessionRedirect() {
  const { sessionId } = useParams()

  return <Navigate replace to={sessionId ? sessionRoute(sessionId) : NEW_CHAT_ROUTE} />
}

export const SidebarSurface = memo(function SidebarSurface({
  actions,
  currentView
}: {
  actions: SidebarActions
  currentView: ComponentProps<typeof ChatSidebar>['currentView']
}) {
  const latestActions = useMemo(() => latestSidebarActions(actions), [actions])

  // The AgentBox product shell names its session authority explicitly — never
  // inferred from gateway state, cache emptiness or method presence — so the
  // sidebar's search, Archived view and workspace rows read the service cache
  // and cannot reach the legacy Hermes REST surface.
  return <ChatSidebar currentView={currentView} sessionAuthority="agentbox" {...latestActions} />
})

export const TerminalSurface = memo(function TerminalSurface() {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-(--ui-terminal-surface-background)">
      <TerminalPaneChrome />
    </div>
  )
})

/** Owns the statusbar's own data hooks (status snapshot poll, contributed
 *  items) so its 15s refresh — and any statusbar-only churn — re-renders the
 *  bar alone, never the chat/sidebar/terminal. */
export const StatusbarSurface = memo(function StatusbarSurface({
  actions,
  agentsOpen,
  chatOpen,
  commandCenterOpen
}: {
  actions: WiringActions
  agentsOpen: boolean
  chatOpen: boolean
  commandCenterOpen: boolean
}) {
  const activeConnectionId = useStore($activeConnectionId)
  const activeGatewayProfile = useStore($activeGatewayProfile)
  const gatewayState = useStore($gatewayState)
  const freshDraftReady = useStore($freshDraftReady)
  const gatewayScope = `${activeConnectionId ?? ''}\0${activeGatewayProfile}`
  // No status source exists in the AgentBox product runtime: the bar is handed
  // an explicit null, so mounting, focusing or returning to the window polls
  // nothing instead of lazily reaching a Hermes REST endpoint. It reports the
  // neutral null state — never a fabricated healthy one.
  const { inferenceStatus, statusSnapshot } = useStatusSnapshot(null, gatewayState, gatewayScope)
  const extraLeftItems = useStatusbarContributions('left')
  const extraRightItems = useStatusbarContributions('right')

  const { leftStatusbarItems, statusbarItems } = useStatusbarItems({
    agentsOpen,
    // Explicit product authority: it alone decides which statusbar items exist.
    // The connection/gateway switcher talks to `hermes:connections:*`, which the
    // `hermes:api` hard gate does not cover, and the agents/cron/webhooks
    // entries open legacy data-plane views — none of them may be constructed for
    // the AgentBox product.
    authority: 'agentbox',
    chatOpen,
    commandCenterOpen,
    extraLeftItems,
    extraRightItems,
    freshDraftReady,
    gatewayState,
    inferenceStatus,
    openAgents: actions.openAgents,
    openCommandCenterSection: actions.openCommandCenterSection,
    requestGateway: actions.requestGateway,
    statusSnapshot,
    toggleCommandCenter: actions.toggleCommandCenter
  })

  return <StatusbarControls items={statusbarItems} leftItems={leftStatusbarItems} />
})

/** The workspace pane: the real route table (chat + full-page views + plugin
 *  routes). Subscribes to the gateway instance/state and ROUTES_AREA itself;
 *  the voice cap arrives as a prop. ChatView subscribes to its own session
 *  atoms, so streaming never round-trips through the controller. */
export const ChatRoutesSurface = memo(function ChatRoutesSurface({
  maxVoiceRecordingSeconds
}: {
  actions: WiringActions
  maxVoiceRecordingSeconds?: number
}) {
  useContributions(ROUTES_AREA)
  const routeContributions = contributedRoutes()
  const chatView = <AgentBoxChatView maxVoiceRecordingSeconds={maxVoiceRecordingSeconds} />

  // FULL-PAGE views (not chat): a page is not a tab-able surface, so the zone's
  // tab strip stands down while one is showing. That is `paneChrome.headerVeto`
  // on the contribution, not a DOM marker — the `data-zone-no-header` attribute
  // that used to ride this wrapper gated a body double-click toggle that no
  // longer exists, and nothing has read it since.
  const page = (view: ReactNode) => (
    <div className="contents">
      <Suspense fallback={null}>{view}</Suspense>
    </div>
  )

  // The views the AgentBox product does not mount: Agents (retired by the
  // product decision), Starmap and Webhooks (no approved product surface) and
  // Cron (no AgentBox contract yet). Each had a legacy Hermes REST data plane —
  // a deep link must land on the honest "not available" product page rather
  // than an empty pane or that data plane. `/skills` set this precedent.
  const unavailableView = <Navigate replace to={`${SETTINGS_ROUTE}?tab=product:resources`} />

  return (
    <Routes>
      <Route element={chatView} index />
      <Route element={chatView} path=":sessionId" />
      <Route element={unavailableView} path="agents" />
      <Route element={unavailableView} path="cron" />
      <Route element={null} path="command-center" />
      <Route element={null} path="profiles" />
      <Route element={null} path="settings" />
      <Route element={unavailableView} path="skills" />
      <Route element={unavailableView} path="starmap" />
      <Route element={unavailableView} path="webhooks" />
      {/* Registry-contributed pages (core features + plugins) render in the
          workspace pane like any built-in view — behind the same blast wall
          as every other contribution mount. */}
      {routeContributions.map(route => (
        <Route
          element={page(
            <ContribBoundary id={route.key}>
              <ContribRender render={route.render} />
            </ContribBoundary>
          )}
          key={route.key}
          path={route.path.slice(1)}
        />
      ))}
      <Route element={<Navigate replace to={NEW_CHAT_ROUTE} />} path="new" />
      <Route element={<LegacySessionRedirect />} path="sessions/:sessionId" />
      <Route element={<Navigate replace to={NEW_CHAT_ROUTE} />} path="*" />
    </Routes>
  )
})
