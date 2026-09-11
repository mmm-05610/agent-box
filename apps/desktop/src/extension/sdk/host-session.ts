import { type ReadableAtom } from 'nanostores'
import type { ReactNode } from 'react'

import { newSessionInAgent, newSessionInProfile } from '@/application/profile/new-session'
import { ensureGatewayProfile } from '@/application/profile/runtime-selection'
import { registry } from '@/lib/contributions'
import { requestOpenSession } from '@/lib/open-session'
import {
  activeGatewayConnectionId,
  openGatewayForAgent,
  openGatewayForProfile
} from '@/store/gateway'
import { notify } from '@/store/notifications'
import {
  $newSessionTabAction,
  $paneVisible,
  registerPaneCloser,
  removeTreePane,
  revealTreePane
} from '@/store/pane-shell/tree'
import {
  $workspaceMode,
  $workspaceOwnerKey,
  setWorkspaceScope as publishWorkspaceScope,
  setWorkspaceOwnerLabel,
  type WorkspaceNewSessionTarget
} from '@/store/pane-shell/workspace-scope'
import { $activeGatewayProfile, $gatewaySwapTarget, $hydrationSyncProfile, normalizeProfileKey, setShowAllProfiles } from '@/store/profile'
import {
  $activeSessionId,
  $messages,
  $selectedStoredSessionId,
  requestSessionResume,
  setResumeExhaustedSessionId,
  setSessionOwnerHint
} from '@/store/session'
import {
  $focusedRuntimeId,
  $focusedSessionState,
  $focusedStoredSessionId,
  $sessionStates,
  $sessionTiles,
  focusWorkspaceOwnerSessionTile,
  sessionTileDelegate
} from '@/store/session-states'
import type { WorkspaceMode } from '@/types/contributions'

import { awaitProfileActivation, pluginRouteStillRegistered } from './host-routing'
import {
  DEFAULT_SESSION_HYDRATION_TIMEOUT_MS,
  type PluginNewChatOptions,
  type PluginOpenSessionOptions
} from './host-session-options'
import { $activeConnectionId, type PluginProfileRoute } from './host-state'
import { planPluginOpenSession } from './plugin-open-session-plan'

let openSessionGeneration = 0

// Raise the "Syncing…" affordance for a paint-first wake (#89843) and tear it
// down as soon as the active-profile gate catches up. The listener clears ONLY
// its own profile's badge: a newer wake may have replaced the badge with a
// different profile, and the stale listener must not wipe the winner's.
function beginHydrationBackgroundSync(profile: string): void {
  $hydrationSyncProfile.set(profile)

  const unlisten = $activeGatewayProfile.listen(next => {
    if (normalizeProfileKey(next) === profile) {
      if ($hydrationSyncProfile.get() === profile) {
        $hydrationSyncProfile.set(null)
      }

      unlisten()
    }
  })
}

function waitForFocusedSessionHydration({
  expectHistory,
  generation,
  isCurrent,
  profile,
  requireActiveProfile,
  storedSessionId,
  timeoutMs
}: {
  expectHistory: boolean
  generation: number
  isCurrent?: () => boolean
  profile: string
  requireActiveProfile: boolean
  storedSessionId: string
  timeoutMs: number
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const unbinds: Array<() => void> = []
    let timer: number | undefined

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true

      if (timer !== undefined) {
        window.clearTimeout(timer)
      }

      for (const unbind of unbinds) {
        unbind()
      }

      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    const check = () => {
      if (generation !== openSessionGeneration || (isCurrent && !isCurrent())) {
        finish(new Error('Session open was superseded by a newer selection.'))

        return
      }

      const profileMatches = !requireActiveProfile || normalizeProfileKey($activeGatewayProfile.get()) === profile
      const mainMatches = $selectedStoredSessionId.get() === storedSessionId
      const storedTile = $sessionTiles.get().find(tile => tile.storedSessionId === storedSessionId)
      const tileMatches = $focusedStoredSessionId.get() === storedSessionId || Boolean(storedTile)
      const focusedTileMatches = $focusedStoredSessionId.get() === storedSessionId
      const tileRuntimeId = focusedTileMatches ? $focusedRuntimeId.get() : (storedTile?.runtimeId ?? null)

      const tileState = focusedTileMatches
        ? $focusedSessionState.get()
        : tileRuntimeId
          ? $sessionStates.get()[tileRuntimeId]
          : undefined

      const runtimeReady = mainMatches ? Boolean($activeSessionId.get()) : tileMatches ? Boolean(tileRuntimeId) : false

      const historyPainted = mainMatches
        ? Boolean($messages.get().length)
        : tileMatches
          ? Boolean(tileState?.messages.length)
          : false

      // Paint-first hydration: for a history-bearing chat, the wake is DONE
      // the moment the persisted transcript is painted on the right session —
      // the REST prefetch delivers it seconds after the profile backend's
      // HTTP comes up, while the full runtime resume (agent build, MCP
      // discovery, skill load) keeps warming in the background and binds the
      // composer when it lands. Gating on runtimeReady serialized the wake
      // behind that whole boot: on a cold multi-profile start the 20s budget
      // regularly lost the race on slower machines and surfaced as "errors
      // waking up bots" even though the transcript had been available almost
      // immediately. Only an expected-EMPTY chat still waits for the runtime
      // — with no transcript to paint, a bound runtime is the only proof the
      // surface is real rather than a stuck loader.
      const hydrated = expectHistory ? historyPainted : runtimeReady

      if ((mainMatches || tileMatches) && hydrated) {
        if (profileMatches) {
          finish()

          return
        }

        // Paint-first completion on an unsatisfiable profile gate (#89843).
        // On a shared-remote connection every profile is legitimately served
        // through the primary socket, so $activeGatewayProfile can NEVER
        // equal the bot's profile — the old gate held a fully painted
        // transcript hostage for the whole 20s budget and then stranded the
        // pane. When the stored history is already painted on exactly this
        // session, that content IS the proof the surface is real: resolve
        // now, raise the subtle "Syncing…" affordance, and let the profile
        // gate catch up in the background.
        //
        // Fail closed everywhere the content is NOT its own proof: a
        // superseded generation already rejected above (conflicting
        // concurrent hydration never resolves paint-first), and an
        // expected-EMPTY chat keeps waiting for the full gate — with no
        // transcript to paint, a bound runtime on an unmatched profile is
        // not evidence of a real surface.
        if (expectHistory && historyPainted) {
          beginHydrationBackgroundSync(profile)
          finish()
        }
      }
    }

    unbinds.push($activeGatewayProfile.listen(check))
    unbinds.push($activeConnectionId.listen(check))
    unbinds.push($selectedStoredSessionId.listen(check))
    unbinds.push($activeSessionId.listen(check))
    unbinds.push($messages.listen(check))
    unbinds.push($focusedStoredSessionId.listen(check))
    unbinds.push($focusedRuntimeId.listen(check))
    unbinds.push($focusedSessionState.listen(check))
    unbinds.push($sessionTiles.listen(check))
    unbinds.push($sessionStates.listen(check))
    unbinds.push($workspaceMode.listen(check))
    unbinds.push($workspaceOwnerKey.listen(check))

    timer = window.setTimeout(() => {
      finish(new Error(`Timed out loading ${profile}'s session history.`))
    }, timeoutMs)

    check()
  })
}


/** Session/workspace doors: open, scope, new chat, focus and pane state. */
export const hostSessionActions = {
  /** Open a stored session the way core surfaces do. A plugin/Bot Mode open
   *  is navigation, not a workspace or chrome API-home switch —
   *  keepAllProfilesScope defaults true so `$activeGatewayProfile` /
   *  Sessions REST stay on the previous (usually launch) backend while the
   *  bot backend is dialed in the background. The bot forever-chat is hidden
   *  and would otherwise look like every session disappeared. Pass false to
   *  also scope chrome onto that profile and collapse the sidebar. */
  openSession: async (storedSessionId: string, options: PluginOpenSessionOptions = {}): Promise<void> => {
    const generation = ++openSessionGeneration

    // A new wake owns the syncing affordance — a lingering badge from an
    // earlier paint-first wake must not survive into this one.
    $hydrationSyncProfile.set(null)
    const explicitRoute = options.route ? { ...options.route } : null
    const profile = (explicitRoute?.profile ?? options.profile ?? '').trim()
    const targetProfile = normalizeProfileKey(profile || $activeGatewayProfile.get())

    // A local bot open passes only `profile` (no cross-connection route), but
    // its RPCs STILL have to reach that profile's own local gateway while chrome
    // stays on the launch profile. Synthesize a local owner route from the
    // profile so the persisted tile carries it — the session-request router
    // reads the tile route to dispatch on the owning backend, and the canonical
    // Bot Chat is hidden (never in $sessions), so this is the only owner record
    // it can consult. Without it, submit falls back to the active profile and
    // 4001s / hangs against a backend that never owned the session.
    //
    // This is ROUTING metadata only (tile ownerRoute + owner hint); the dial
    // path below still keys off the explicit cross-connection route, so a plain
    // local open dials exactly as before (openGatewayForProfile), never the
    // registry-secondary path.
    const localConnectionId = activeGatewayConnectionId()

    const ownerRoute =
      explicitRoute ??
      (options.workspaceMode === 'bots' && profile && localConnectionId
        ? { connectionId: localConnectionId, mode: 'local' as const, profile: targetProfile }
        : null)

    const expectHistory = options.expectHistory ?? false

    if (options.workspaceMode === 'bots') {
      publishWorkspaceScope(
        'bots',
        options.workspaceOwnerKey ?? null,
        ownerRoute ? { kind: 'route', route: ownerRoute } : null
      )
    }

    const openingStillCurrent = () =>
      generation === openSessionGeneration &&
      (options.workspaceMode !== 'bots' ||
        ($workspaceMode.get() === 'bots' && $workspaceOwnerKey.get() === (options.workspaceOwnerKey ?? null)))

    const plan = planPluginOpenSession({
      activeProfile: $activeGatewayProfile.get(),
      keepAllProfilesScope: options.keepAllProfilesScope,
      profile
    })

    // Wake-path phase timings. Logged ONLY on a hydration timeout (bridged
    // into desktop.log via the renderer-console tap), so a support bundle
    // pinpoints WHERE the budget went — profile activation vs hydration —
    // instead of leaving us to infer it from process spawn timestamps.
    const wakeStartedAt = Date.now()
    let profileActiveAt = wakeStartedAt
    const hydrationTimeoutMs = Math.max(1, options.hydrationTimeoutMs ?? DEFAULT_SESSION_HYDRATION_TIMEOUT_MS)
    // Which half of the wake a timeout landed in. Only meaningful on the
    // failure path, where the two phases have different remedies: a stuck dial
    // is a gateway problem, a slow transcript is a backend-warmup one.
    let wakePhase: 'activation' | 'hydration' = 'activation'

    if (ownerRoute) {
      setSessionOwnerHint(storedSessionId, ownerRoute)
    } else if (profile) {
      // Local plugin-owned opens (Bot Mode without a cross-connection route)
      // still carry an explicit owning profile. Record it: hidden sessions
      // (canonical Bot Chats) have no sidebar row, so this hint is the only
      // durable owner record the session-RPC router can consult — without it
      // a later prompt.submit resolves to the ACTIVE profile's backend and
      // 4001s while the bot's own backend is healthy.
      const connectionId = activeGatewayConnectionId()

      if (connectionId) {
        setSessionOwnerHint(storedSessionId, { connectionId, mode: 'local', profile: targetProfile })
      }
    }

    // Bounded to 2 attempts (never more): a cold profile backend can lose the
    // hydration-timeout race once and still be fine moments later, but this is
    // a caller-opt-in retry of the SAME wait, not a backoff loop.
    const maxAttempts = options.awaitHydration && options.retryHydrationTimeoutOnce ? 2 : 1

    try {
      // WHICH backend to dial is the plan's call; HOW LONG to wait is the wake
      // budget's. A workspace switch moves $activeGatewayProfile / chrome REST;
      // a plain navigation only opens the bot's gateway so session.resume can
      // hydrate, leaving chrome on the launch backend.
      // Dial keys off the EXPLICIT cross-connection route only: a synthesized
      // local ownerRoute is routing metadata for the tile/hint, and a local
      // profile must dial through openGatewayForProfile (its established path),
      // not the registry-secondary path openGatewayForAgent takes for a 'local'
      // connection id. Behavior for a plain local open is unchanged.
      const dial = explicitRoute
        ? () =>
            openGatewayForAgent(explicitRoute.connectionId, explicitRoute.profile, {
              spawnPriority: 'foreground'
            })
        : plan.switchWorkspace
          ? () => ensureGatewayProfile(plan.switchWorkspace as string)
          : plan.dialWithoutSwitching
            ? () => openGatewayForProfile(plan.dialWithoutSwitching as string, { spawnPriority: 'foreground' })
            : null

      if (dial) {
        // Bounded only on the hydration contract, which is where a budget and a
        // Retry surface both already exist. A plain open never asked for a
        // deadline and has nowhere to render one, so it keeps today's
        // behaviour rather than gaining a rejection its callers cannot handle.
        await (options.awaitHydration ? awaitProfileActivation(dial, targetProfile, hydrationTimeoutMs) : dial())
        profileActiveAt = Date.now()
      }

      if (!openingStillCurrent()) {
        throw new Error('Session open was superseded by a newer selection.')
      }

      // Only a cross-connection (explicit route) open forces the all-profiles
      // view; a local bot open keeps the planner's decision, unchanged from
      // before the synthesized-route addition.
      if (explicitRoute) {
        setShowAllProfiles(true)
      } else if (plan.showAllProfiles !== null) {
        setShowAllProfiles(plan.showAllProfiles)
      }

      wakePhase = 'hydration'

      if (!openingStillCurrent()) {
        throw new Error('Session open was superseded by a newer selection.')
      }

      if (options.awaitHydration) {
        // Keep the target-specific overlay visible through transcript hydration,
        // not merely through the gateway/profile activation that precedes it.
        $gatewaySwapTarget.set(targetProfile)
      }

      // Only the HYDRATION half retries. Activation already failed its own
      // bounded wait above, and a wedged dial does not get better by dialling
      // again inside the same wake — that is the Retry surface's job.
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const navigate = (to: string, opts?: { replace?: boolean }) => {
            const target = to.startsWith('#') ? to : `#${to}`

            if (opts?.replace) {
              window.location.replace(target)
            } else {
              window.location.hash = target
            }
          }

          const intent = options.intent ?? 'in-place'

          if (options.workspaceMode === 'bots') {
            requestOpenSession(storedSessionId, navigate, intent, {
              ownerRoute: ownerRoute ?? undefined,
              workspaceMode: 'bots',
              workspaceOwnerKey: options.workspaceOwnerKey,
              ...(options.tabTitle ? { workspaceTabTitle: options.tabTitle } : {})
            })
          } else {
            requestOpenSession(storedSessionId, navigate, intent)
          }

          // Judge the main surface AFTER the open: on a cold start the persisted
          // route can already point at this session while selection has not
          // settled, so a pre-open "already selected" precondition skips the
          // resume exactly when it is needed (#89206 — blank Bot Chat with the
          // roster preview intact). The surface is healthy only when this stored
          // session is selected, a runtime is bound, and the expected transcript
          // is present; anything less gets an explicit sequenced resume request.
          // The route-resume effect only honors the request while the route
          // points at this session, and consumes it alongside any resume the
          // navigation itself triggers, so a redundant request is a no-op.
          const surfaceHealthy =
            $selectedStoredSessionId.get() === storedSessionId &&
            Boolean($activeSessionId.get()) &&
            (!expectHistory || $messages.get().length > 0)

          // surfaceHealthy trusts ANY non-empty cached transcript, so it
          // cannot distinguish a fresh transcript from a stale snapshot the
          // session-states cache kept across a bot switch (#93604). Callers
          // that represent an explicit user navigation pass forceResume to
          // skip the heuristic entirely; the resume is idempotent either way.
          //
          // Bot Chat opens as a tab/tile. requestSessionResume is consumed
          // only when the MAIN route is that session, so a roster reopen of
          // an already-mounted tile would paint the idle snapshot and never
          // pull messages that arrived while the panel WS was down (#96183).
          // Refresh the tile transcript in place instead.
          if (options.awaitHydration && (options.forceResume || !surfaceHealthy)) {
            const existingTile = $sessionTiles.get().some(tile => tile.storedSessionId === storedSessionId)
            const tileDelegate = existingTile ? sessionTileDelegate() : null

            if (tileDelegate) {
              try {
                await tileDelegate.resumeTile(storedSessionId, { refreshTranscript: true })
              } catch {
                requestSessionResume(storedSessionId, ownerRoute || undefined)
              }
            } else {
              requestSessionResume(storedSessionId, ownerRoute || undefined)
            }
          }

          if (options.awaitHydration) {
            await waitForFocusedSessionHydration({
              expectHistory,
              generation,
              isCurrent: openingStillCurrent,
              profile: targetProfile,
              // A background dial never moves $activeGatewayProfile, so gating
              // hydration on it would wait for something that is not coming.
              requireActiveProfile: ownerRoute ? false : plan.requireActiveProfileForHydration,
              storedSessionId,
              timeoutMs: hydrationTimeoutMs
            })
          }

          break
        } catch (error) {
          const retryable =
            options.awaitHydration &&
            generation === openSessionGeneration &&
            attempt < maxAttempts &&
            error instanceof Error &&
            error.message.startsWith('Timed out loading ')

          if (!retryable) {
            throw error
          }

          // The registry check applies only to a real cross-connection route
          // (explicit): a synthesized local route is never in getProfileRoutes,
          // so checking it would spuriously abort a local bot's hydration retry.
          if (explicitRoute && !(await pluginRouteStillRegistered(explicitRoute))) {
            throw new Error(`The ${targetProfile} gateway is no longer available.`)
          }

          // Logged per attempt so a support bundle shows the retry happened at
          // all; the terminal failure is reported once by the catch below.
          console.warn('[bot-wake] hydration timed out, retrying', {
            attempt,
            hydrationWaitMs: Date.now() - profileActiveAt,
            profile: targetProfile,
            storedSessionId
          })
        }
      }
    } catch (error) {
      if (
        options.awaitHydration &&
        openingStillCurrent() &&
        error instanceof Error &&
        error.message.startsWith('Timed out loading ')
      ) {
        const timedOutAt = Date.now()

        console.warn('[bot-wake] hydration timed out', {
          attempts: wakePhase === 'hydration' ? maxAttempts : 1,
          hydrationWaitMs: wakePhase === 'hydration' ? timedOutAt - profileActiveAt : 0,
          phase: wakePhase,
          profile: targetProfile,
          profileActivationMs: (wakePhase === 'activation' ? timedOutAt : profileActiveAt) - wakeStartedAt,
          runtimeBound: Boolean($activeSessionId.get()),
          selectionSettled: $selectedStoredSessionId.get() === storedSessionId,
          storedSessionId,
          transcriptPainted: $messages.get().length > 0
        })
        // Reuse the core stranded-session surface: it renders the explicit
        // error and Retry button, and the normal resume path clears the latch.
        setResumeExhaustedSessionId(storedSessionId)
      }

      throw error
    } finally {
      if (options.awaitHydration && generation === openSessionGeneration) {
        $gatewaySwapTarget.set(null)
      }
    }
  },


  /** Open (or re-front) a plugin-rendered MAIN-AREA workspace tile — the same
   *  surface a session tile or a preview occupies: a closeable tab docked
   *  beside the main workspace, taking over the chat area when active. This is
   *  the generic main-view door for plugins whose surface is not a stored
   *  session (`openSession` stays the door for those). Re-opening the same
   *  `id` refreshes `render`/`title` in place and fronts the existing tab
   *  instead of stacking a duplicate. Returns a disposer that closes the tab;
   *  the tab's own Close (⌘W / strip ✕) routes through the same teardown and
   *  fires `onClose`. Feature-detect on older desktops
   *  (`typeof host.openWorkspace === 'function'`) and keep an in-panel
   *  fallback. */
  openWorkspace: (
    id: string,
    options: {
      dock?: { before?: null | string; pane: string; pos: 'bottom' | 'center' | 'left' | 'right' | 'top' }
      headerVeto?: boolean
      minWidth?: string
      onClose?: () => void
      render: () => ReactNode
      title?: string
      uncloseable?: boolean
    }
  ): (() => void) => {
    const key = (id ?? '').trim()

    if (!key || typeof options?.render !== 'function') {
      throw new Error('openWorkspace: an id and a render function are required')
    }

    const paneId = `plugin-workspace:${key}`

    const dispose = registry.register({
      area: 'panes',
      data: {
        // The session-tile shape: a full workspace surface docked beside main,
        // closeable so it keeps its tab when it lands in a zone of its own.
        dock: options.dock ?? { pane: 'workspace', pos: 'center' },
        headerVeto: options.headerVeto,
        minWidth: options.minWidth ?? '22rem',
        placement: 'main',
        uncloseable: options.uncloseable
      },
      id: paneId,
      render: options.render,
      title: options.title ?? key
    })

    const close = () => {
      registerPaneCloser(paneId)
      dispose()
      removeTreePane(paneId)
      options.onClose?.()
    }

    // Route the tab's Close through OUR teardown: without a closer, closing a
    // core-sourced contributed pane only dismisses it and the registration
    // would leak past the plugin surface that owns it.
    registerPaneCloser(paneId, close)
    revealTreePane(paneId)

    return close
  },

  /** Name a workspace owner on its tabs (a bot's display name). A canonical
   *  chat's STORED title is an identity the backend resolves by name; this is
   *  the caption shown for it. Feature-detect on older desktops. */
  setWorkspaceOwnerLabel,


  /** Switch the visible main-pane workspace without unregistering retained panes. */
  setWorkspaceScope: (
    mode: WorkspaceMode,
    ownerKey: null | string = null,
    newSessionTarget: WorkspaceNewSessionTarget | null = null
  ): boolean => publishWorkspaceScope(mode, ownerKey, newSessionTarget),


  /** Start a fresh chat draft, optionally pointed at another profile (its
   *  backend spins up in the background — same door the sidebar's per-profile
   *  "+" uses). */
  newChat: (profile?: null | string | PluginProfileRoute, options: PluginNewChatOptions = {}): void => {
    if (options.workspaceMode === 'bots') {
      if (!profile || typeof profile === 'string' || !options.workspaceOwnerKey) {
        notify({ kind: 'error', message: 'Select a Bot before starting another chat.' })

        return
      }

      publishWorkspaceScope('bots', options.workspaceOwnerKey, { kind: 'route', route: { ...profile } })

      const openTab = $newSessionTabAction.get()

      if (!openTab) {
        notify({ kind: 'error', message: 'Update Hermes Desktop to open another Bot chat.' })

        return
      }

      openTab()

      return
    }

    if (profile && typeof profile !== 'string') {
      newSessionInAgent({ ...profile })
    } else {
      newSessionInProfile((profile ?? '').trim() || $activeGatewayProfile.get())
    }

    window.location.hash = '#/'
  },


  /** Front the tab a Bot Mode owner already has open — the tile that owner's
   *  zone last had active, else its most recent — and return that stored id;
   *  `null` when the owner has nothing open. A roster click asks this before
   *  resolving the canonical chat, so the tabs the user left (and the ones
   *  they closed) are respected. Presentation only: no gateway activation,
   *  no session create. Feature-detect on older desktops.
   *
   *  `isStaleTile` (hermes-agent#90102): the caller's reconciliation probe
   *  against backend truth. The tile bucket is a Local Storage cache — a
   *  persisted bot tile can name a session the backend has since superseded,
   *  and fronting it pinned the roster click to a stale finished session
   *  forever. Tiles the probe rejects are discarded (never fronted), so the
   *  caller falls through to its authoritative open path. */
  focusOpenWorkspaceSession: (
    workspaceOwnerKey: string,
    isStaleTile?: (tile: { storedSessionId: string; workspaceTabTitle?: string }) => boolean,
    onlyStoredIds?: readonly string[]
  ): null | string => focusWorkspaceOwnerSessionTile(workspaceOwnerKey, isStaleTile, onlyStoredIds),


  /** Reactive on-screen visibility of a contributed pane: true while it is in
   *  the layout tree, not dismissed/hidden, its zone un-minimized, AND holding
   *  its zone's active tab slot (a lone pane in its own zone counts). The
   *  contribution-scoped pane id is `<pluginId>:<paneId>`. Memoized per id —
   *  safe to call in render. Feature-detect on older desktops
   *  (`typeof host.paneVisibility === 'function'`). */
  paneVisibility: (paneId: string): ReadableAtom<boolean> => $paneVisible(paneId),

}
