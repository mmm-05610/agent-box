import type { ConnectionState } from '@hermes/shared'
import { atom, computed } from 'nanostores'

import { lastVisibleMessageIsUser } from '@/app/chat/thread-loading'
import type { ContextSuggestion } from '@/app/types'
import type { HermesConnection } from '@/global'
import type { ChatMessage } from '@/lib/chat-messages'
import {
  connectionScopeSuffix,
  rescopeConnectionScopedStores
} from '@/lib/connection-scoped'
import { persistBoolean, persistString, storedBoolean, storedString } from '@/lib/storage'
import { syncCronModelImpactConnection } from '@/store/cron-model-impact-scope'
import type { SessionInfo, UsageStats } from '@/types/hermes'

import { isSessionRemovalPending } from '../session-removal'
import type { SessionOwnerRoute } from '../session-request-router'
import { clearUnreadOnOpen } from '../session-unread-remote'

import { lineageAliases } from './identity'
import { setSessionOwnerHint } from './owner-hints'

/** The session surface's reactive atom bank: the shared atoms, their
 *  scoped-persistence setters, and the composer model selection bound to
 *  them. */
type Updater<T> = T | ((current: T) => T)
export type ComposerModelSource = '' | 'default' | 'manual'

const WORKSPACE_CWD_KEY = 'hermes.desktop.workspace-cwd'

// The composer's model/effort/fast is sticky UI state, NOT the profile default
// (that lives in Settings → Model). Persisting it in localStorage makes a pick
// follow across Cmd+N and app restarts instead of snapping back to the default.
// Model/provider/source are scoped to the remote (connection, profile) owner so
// a provider authenticated on one profile cannot contaminate another profile's
// session.create. Local/single-backend users retain the historical bare keys.
const COMPOSER_MODEL_KEY = 'hermes.desktop.composer.model'
const COMPOSER_PROVIDER_KEY = 'hermes.desktop.composer.provider'
const COMPOSER_MODEL_SOURCE_KEY = 'hermes.desktop.composer.model-source'
const COMPOSER_EFFORT_KEY = 'hermes.desktop.composer.reasoning-effort'
const COMPOSER_FAST_KEY = 'hermes.desktop.composer.fast'

// Unlike presentation-oriented $connection, this scope is published from the
// gateway activation coordinate before profile-change effects can reseed the
// composer. null means the exact owner is temporarily unknown: values may still
// paint, but must not be written through the previous backend's storage key.
let composerSelectionScope: string | null = ''

function composerScopeForConnection(connection: HermesConnection | null): string | null {
  if (!connection) {
    return null
  }

  // Electron may infer the sole `local` registry id onto the ordinary primary
  // descriptor. That remains the legacy single-backend path: only an explicit
  // registry-scoped route earns a new namespace.
  if (connection.mode !== 'remote' && !connection.registryScoped) {
    return ''
  }

  if (connection.connectionId) {
    return `.registry.${encodeURIComponent(connection.connectionId)}.${encodeURIComponent(connection.profile || 'default')}`
  }

  return connectionScopeSuffix(connection)
}

function composerSelectionKey(base: string): string | null {
  return composerSelectionScope === null ? null : `${base}${composerSelectionScope}`
}

function storedComposerString(base: string): string | null {
  const key = composerSelectionKey(base)

  return key === null ? null : storedString(key)
}

// The last chat the user had open, so a relaunch lands back on it instead of an
// empty new-chat. Stored (not runtime) id — the route is keyed by stored id.
//
// Scoped per profile with an explicit namespace (`.profile.<encoded>`) and
// encodeURIComponent so a profile name carrying `/` or other reserved chars
// cannot collide or leak across keys. Legacy global (unsuffixed) keys are
// discarded on first read to prevent cross-profile bleed — ownership of the old
// global values is unknowable, and guessing the owning profile is exactly the

function workspaceCwdKey(connection: HermesConnection | null = $connection.get()): string {
  if (connection?.mode !== 'remote') {
    return WORKSPACE_CWD_KEY
  }

  const base = encodeURIComponent(connection.baseUrl || 'remote')
  const profile = encodeURIComponent(connection.profile || 'default')

  return `${WORKSPACE_CWD_KEY}.remote.${base}.${profile}`
}

export const getRememberedWorkspaceCwd = (): string => storedString(workspaceCwdKey())?.trim() || ''
export type NewChatWorkspaceTarget = null | string | undefined

interface AppAtom<T> {
  get: () => T
  set: (value: T) => void
}

function updateAtom<T>(store: AppAtom<T>, next: Updater<T>) {
  store.set(typeof next === 'function' ? (next as (current: T) => T)(store.get()) : next)
}


export const $connection = atom<HermesConnection | null>(null)
export const $gatewayState = atom<ConnectionState>('idle')
export const $sessions = atom<SessionInfo[]>([])
// Cron-job sessions (source === 'cron') are fetched as their own list so the
// scheduler's always-newest sessions never crowd recents out of the page
// budget. Powers the collapsed "Cron jobs" sidebar section.
export const $cronSessions = atom<SessionInfo[]>([])
// Max cron sessions fetched for the sidebar section (single bounded page). When
// the fetch returns exactly this many rows we know more exist, so the section
// badge renders "N+". Lives here so the controller (fetch) and sidebar (badge)
// share one source of truth without a circular import.
export const CRON_SECTION_LIMIT = 50
// Messaging-platform sessions (telegram/discord/...) are fetched as their own
// slice — separate from local recents — so each platform renders a
// self-managed sidebar section and never interleaves with (or buries) local
// chats in the recents page. One combined fetch seeds every platform; a
// platform that exceeds this cap gets its own per-platform "load more".
export const $messagingSessions = atom<SessionInfo[]>([])
export const MESSAGING_SECTION_LIMIT = 100
// Exact per-platform conversation totals, keyed by source id. Empty until a
// per-platform "load more" fetch resolves it (the combined seed fetch only
// knows the aggregate), so sections fall back to their loaded count.
export const $messagingPlatformTotals = atom<Record<string, number>>({})
// True when the combined seed fetch hit MESSAGING_SECTION_LIMIT, so at least
// one platform may have more rows on disk than were loaded.
export const $messagingTruncated = atom<boolean>(false)

/**
 * Every session row the renderer knows, for OWNER lookups. The sidebar splits
 * its fetch into three source-scoped slices ($sessions / $cronSessions /
 * $messagingSessions), and each slice's rows carry the same `profile` (and,
 * when tagged, `connection_id`) stamps — but the owner ladder's row rung only
 * searched recents. A cron or messaging session's approval.respond (or any
 * session-scoped RPC) therefore found no owner, and on a registry-topology
 * install failed closed with SessionOwnerResolutionError even though the row
 * naming its owner was already in memory, one atom over. Concatenation order
 * mirrors lookup priority: recents first (they can carry fresher optimistic
 * connection tags), then the cron and messaging slices.
 */
export function ownerLookupSessionRows(): SessionInfo[] {
  const cron = $cronSessions.get()
  const messaging = $messagingSessions.get()

  // Recents-only stays the common case; keep its array identity (no copy) so
  // per-list memo caches (lineageAliases) keyed on the reference still hit.
  if (!cron.length && !messaging.length) {
    return $sessions.get()
  }

  return [...$sessions.get(), ...cron, ...messaging]
}

// Whether a profile's last session page was CAPPED by the request limit, keyed
// by profile name — i.e. more rows exist on disk than were loaded. Replaces the
// old exact per-profile totals: rendering `loaded/total` in the sidebar cost a
// COUNT(*) per profile DB on every refresh and only ever confused people, while
// "is there another page?" is what pagination actually needs and comes free
// from the row count the query already returned.
export const $sessionProfilesTruncated = atom<Record<string, boolean>>({})

/** Tokens and spend per profile across ALL its sessions, not just the loaded
 *  page — summed in SQL so a profile group's header total doesn't move when the
 *  window does. Keyed by profile name. */
export interface ProfileUsage {
  cost_usd: number
  tokens: number
}

export const $sessionProfilesUsage = atom<Record<string, ProfileUsage>>({})
export const $sessionsLoading = atom(true)
export const $activeSessionId = atom<string | null>(null)
export const $selectedStoredSessionId = atom<string | null>(null)
export interface ActiveSessionStoredIdRotation {
  nextStoredSessionId: string
  previousStoredSessionId: string
  runtimeSessionId: string
}

// One-shot event for when auto-compression rotates the active runtime's stored
// id. Carrying the runtime + previous id is load-bearing: a bare next id cannot
// tell whether the user has already navigated away while React is waiting to
// run the route-following effect, which lets a background session steal the
// foreground route.
export const $activeSessionStoredIdRotation = atom<ActiveSessionStoredIdRotation | null>(null)
export const $messages = atom<ChatMessage[]>([])

// Streaming-stable derivations of $messages. During a token stream the array
// is replaced ~30×/s; components that only care about coarse facts (is the
// thread empty? is the tail a user message?) subscribe to these instead of
// $messages so per-token flushes don't re-render them — nanostores' `computed`
// only notifies when the derived VALUE changes.
export const $messagesEmpty = computed($messages, messages => messages.length === 0)
export const $lastVisibleMessageIsUser = computed($messages, lastVisibleMessageIsUser)

export const $freshDraftReady = atom(false)
export const $busy = atom(false)
export const $awaitingResponse = atom(false)
// Stored-session id whose most recent resume FAILED terminally (the gateway RPC
// rejected AND the REST transcript fallback also failed), leaving the window
// with no runtime and an empty transcript. Drives use-route-resume's self-heal:
// while this matches the routed session the loader would otherwise latch
// forever (messagesEmpty && !activeSessionId), so the hook re-attempts the
// resume on the next render/focus/reconnect instead of stranding the window.
// Null whenever the active route has a healthy (or in-flight) resume.
export const $resumeFailedSessionId = atom<string | null>(null)
export interface SessionResumeRequest {
  ownerRoute?: SessionOwnerRoute
  sequence: number
  sessionId: string
}
let sessionResumeRequestSequence = 0
export const $sessionResumeRequest = atom<SessionResumeRequest | null>(null)

export const $resumeExhaustedSessionId = atom<string | null>(null)
export const $currentModel = atom(storedComposerString(COMPOSER_MODEL_KEY) ?? '')
export const $currentProvider = atom(storedComposerString(COMPOSER_PROVIDER_KEY) ?? '')
export const $currentReasoningEffort = atom(storedString(COMPOSER_EFFORT_KEY) ?? '')
export const $currentServiceTier = atom('')
export const $currentFastMode = atom(storedBoolean(COMPOSER_FAST_KEY, false))
// Effective approval-bypass state mirrored from the gateway (session.info).
// Persistence lives in the backend config (approvals.mode), so this is a plain
// reflection of the truth the gateway reports rather than its own store.
export const $yoloActive = atom(false)
export const $currentCwd = atom(getRememberedWorkspaceCwd())

// Which conversation the live `$currentCwd` is known to describe. Three
// inhabitants, and the difference between the last two is load-bearing:
// a stored-session id (that conversation owns the path), `null` (the fresh-draft
// state, which MATCHES a null selection and therefore reads as OWNED — a draft's
// workspace is immediately usable), and the released marker
// `WORKSPACE_CWD_UNOWNED` below, which matches no selection and so reads as
// owned by nobody. `null` cannot double as the release value precisely because
// it matches: releasing to `null` while a draft is selected would hand the
// leftover path to the draft as its own workspace.
//
// A conversation switch publishes the new stored id immediately, but the new
// workspace only arrives when the resume settles, so for that whole window
// `$currentCwd` still holds the PREVIOUS conversation's folder. Without a way to
// say "this path is not this conversation's yet", workspace-derived surfaces
// treat the leftover path as authoritative and show the old repo's cached Git
// facts under the newly selected chat (#71254).
//
// Ownership, not emptiness, is what makes the switch atomic: clearing the path
// would collapse the workspace panes and drop file-tree state on every switch,
// so the path stays put and is simply marked as not-yet-owned.
export const $workspaceCwdOwner = atom<null | string>(null)

// Terminal execution backend (local | docker | ssh | ...) mirrored from the
// gateway (session.info). Drives attachment upload decisions: container
// backends have their own filesystem, so a dropped host path must be uploaded
// as bytes and staged into a bind-mounted cache dir (#76577).
export const $terminalBackend = atom('')
export const $newChatWorkspaceTarget = atom<NewChatWorkspaceTarget>(undefined)
export const $newChatWorkspaceTargetGeneration = atom(0)
export const $currentBranch = atom('')
export const $currentUsage = atom<UsageStats>({
  calls: 0,
  input: 0,
  output: 0,
  total: 0
})
export const $sessionStartedAt = atom<number | null>(null)
export const $turnStartedAt = atom<number | null>(null)
export const $introPersonality = atom('')
export const $currentPersonality = atom('')
export const $availablePersonalities = atom<string[]>([])
export const $introSeed = atom(0)
export const $contextSuggestions = atom<ContextSuggestion[]>([])
export const $modelPickerOpen = atom(false)
export const $sessionPickerOpen = atom(false)

function rescopeComposerSelection(nextScope: string | null): void {
  if (nextScope === composerSelectionScope) {
    return
  }

  composerSelectionScope = nextScope
  $currentModel.set(storedComposerString(COMPOSER_MODEL_KEY) ?? '')
  $currentProvider.set(storedComposerString(COMPOSER_PROVIDER_KEY) ?? '')
  $currentModelSource.set(getCurrentModelSource())
}

/** Publish an exact registry route before active-profile effects can persist a
 * forced default. A registry id is authority even while its descriptive
 * HermesConnection lookup is unavailable. */
export function setComposerSelectionOwner(connectionId: string, profile: string): void {
  rescopeComposerSelection(
    `.registry.${encodeURIComponent(connectionId)}.${encodeURIComponent(profile.trim() || 'default')}`
  )
}

/** Fail closed while a successful legacy profile activation has no descriptor. */
export function clearComposerSelectionOwner(): void {
  rescopeComposerSelection(null)
}

export const setConnection = (next: Updater<HermesConnection | null>) => {
  updateAtom($connection, next)
  // Repoint connection-scoped persistence (pins, manual session order,
  // remembered navigation) at the new backend's storage scope before any
  // consumer reconciles against it. A null descriptor (reconnect blip)
  // keeps the current scope.
  rescopeConnectionScopedStores($connection.get())
  syncCronModelImpactConnection($connection.get())
  rescopeComposerSelection(composerScopeForConnection($connection.get()))
}

export const setGatewayState = (next: Updater<ConnectionState>) => updateAtom($gatewayState, next)
export const setSessions = (next: Updater<SessionInfo[]>) => updateAtom($sessions, next)
export const setCronSessions = (next: Updater<SessionInfo[]>) => updateAtom($cronSessions, next)
export const setMessagingSessions = (next: Updater<SessionInfo[]>) => updateAtom($messagingSessions, next)
export const setMessagingPlatformTotals = (next: Updater<Record<string, number>>) =>
  updateAtom($messagingPlatformTotals, next)
export const setMessagingTruncated = (next: Updater<boolean>) => updateAtom($messagingTruncated, next)
export const setSessionProfilesTruncated = (next: Updater<Record<string, boolean>>) =>
  updateAtom($sessionProfilesTruncated, next)
export const setSessionProfilesUsage = (next: Updater<Record<string, ProfileUsage>>) =>
  updateAtom($sessionProfilesUsage, next)
export const setSessionsLoading = (next: Updater<boolean>) => updateAtom($sessionsLoading, next)
export const setActiveSessionId = (next: Updater<string | null>) => updateAtom($activeSessionId, next)
export const setActiveSessionStoredIdRotation = (next: Updater<ActiveSessionStoredIdRotation | null>) =>
  updateAtom($activeSessionStoredIdRotation, next)

// A background session finished and the user hasn't opened it since. This atom
// is the transient PAINT layer (what the dots subscribe to); durability lives
// in session-unread.ts, which persists explicit finish markers + per-session
// "seen message_count" watermarks and rebuilds this atom from them on every
// list refresh — so the green dot survives an app restart, and a session that
// finished while the app was CLOSED still comes up unread. The explicit
// Mark-as-unread toggle rides the BACKEND watermark instead
// (SessionDB.set_session_read, session-unread-remote.ts). Written by
// session-states.ts (live busy→idle edge), cleared here on session open.
export const $unreadFinishedSessionIds = atom<string[]>([])

/** Sidebar "mark all as read" — clears every finished-unread dot. Purely
 *  renderer-local, like the atom itself. */
export function markAllSessionsRead() {
  if ($unreadFinishedSessionIds.get().length > 0) {
    $unreadFinishedSessionIds.set([])
  }
}

// Last time the user actually viewed a session. A finished turn should only
// re-arm the unread marker if it settles AFTER this baseline; otherwise an
// already-viewed completion keeps re-lighting the row.
export const $lastReadAtBySessionId = atom<Record<string, number>>({})

/** A new turn started for this session: the read baseline only guarded the
 *  PREVIOUS completion's re-asserts, so drop it — the new turn's finish must
 *  re-light even when it lands in the same millisecond as the last read. */
export const clearReadBaseline = (storedSessionId: string) => {
  const map = $lastReadAtBySessionId.get()

  if (storedSessionId in map) {
    const { [storedSessionId]: _dropped, ...rest } = map
    $lastReadAtBySessionId.set(rest)
  }
}

export const setSelectedStoredSessionId = (next: Updater<string | null>) => {
  updateAtom($selectedStoredSessionId, next)
  // Opening a session clears its unread state — the user is now looking at it.
  // Clear the whole conversation family (branch children + compression lineage
  // root), not just the exact row: the sidebar lights the dot for every alias
  // of a lineage, so reading any row must clear all of them.
  const id = $selectedStoredSessionId.get()

  if (id) {
    markSessionRead(id)
  }

  // ...and the persisted watermark flag, when the row carried one.
  if (id) {
    void clearUnreadOnOpen(id)
  }
}

/** Record that the user has seen a session (and its conversation family) at
 *  this moment. Clears the unread set for the family and stores a last-read
 *  baseline so a later completion that settles BEFORE this view is not
 *  re-lit. Must be callable before any focus short-circuit (openSession top)
 *  so re-clicking an already-visible session still clears its dot. */
export const markSessionRead = (storedSessionId: string | null | undefined) => {
  if (!storedSessionId) {
    return
  }

  const sessions = $sessions.get()
  const familyIds = new Set<string>(lineageAliases(storedSessionId, sessions))

  const lastReadAt = Date.now()
  const nextReadMap = { ...$lastReadAtBySessionId.get() }

  for (const id of familyIds) {
    nextReadMap[id] = lastReadAt
  }

  $lastReadAtBySessionId.set(nextReadMap)
  $unreadFinishedSessionIds.set($unreadFinishedSessionIds.get().filter(id => !familyIds.has(id)))
}

export const setMessages = (next: Updater<ChatMessage[]>) => updateAtom($messages, next)
export const setFreshDraftReady = (next: Updater<boolean>) => updateAtom($freshDraftReady, next)
export const setResumeFailedSessionId = (next: Updater<string | null>) => updateAtom($resumeFailedSessionId, next)

export const requestSessionResume = (sessionId: string, ownerRoute?: SessionOwnerRoute) => {
  const id = sessionId.trim()

  if (!id) {
    return
  }

  // A chat on its way out must never be re-selected. The push path
  // (markRuntimeGone) and the RPC seam both queue a resume off a 4001, and an
  // idle reap can land one in the same tick as a delete — that queued request
  // then resumes a tombstoned id, 404s, and toasts "Resume failed / Session
  // not found" for a chat the user deliberately removed. Filtering at the
  // producer means no consumer has to re-derive "is this id doomed".
  if (isSessionRemovalPending(id)) {
    return
  }

  if (ownerRoute) {
    setSessionOwnerHint(id, ownerRoute)
  }

  $sessionResumeRequest.set({
    ...(ownerRoute ? { ownerRoute: { ...ownerRoute } } : {}),
    sequence: ++sessionResumeRequestSequence,
    sessionId: id
  })
}

export const setResumeExhaustedSessionId = (next: Updater<string | null>) => updateAtom($resumeExhaustedSessionId, next)
export const setBusy = (next: Updater<boolean>) => updateAtom($busy, next)
export const setAwaitingResponse = (next: Updater<boolean>) => updateAtom($awaitingResponse, next)

export const setCurrentModel = (next: Updater<string>) => {
  updateAtom($currentModel, next)
  const key = composerSelectionKey(COMPOSER_MODEL_KEY)

  if (key !== null) {
    persistString(key, $currentModel.get() || null)
  }
}

export const setCurrentProvider = (next: Updater<string>) => {
  updateAtom($currentProvider, next)
  const key = composerSelectionKey(COMPOSER_PROVIDER_KEY)

  if (key !== null) {
    persistString(key, $currentProvider.get() || null)
  }
}

export const getCurrentModelSource = (): ComposerModelSource => {
  const source = storedComposerString(COMPOSER_MODEL_SOURCE_KEY)

  return source === 'default' || source === 'manual' ? source : ''
}

// Reactive mirror of the persisted source so UI (the composer pill's
// override badge) can subscribe. The getter above stays storage-backed —
// it's read cross-window, where this atom wouldn't see writes.
export const $currentModelSource = atom<ComposerModelSource>(getCurrentModelSource())

export const setCurrentModelSource = (source: ComposerModelSource) => {
  const key = composerSelectionKey(COMPOSER_MODEL_SOURCE_KEY)

  if (key !== null) {
    persistString(key, source || null)
  }

  $currentModelSource.set(source)
}

// Monotonic intent token for async default refreshes. A profile/config request
// may start before the user opens the picker and finish after their click; the
// token lets that older response stand down even when the selected value is
// unchanged (value comparisons alone cannot detect re-selecting the same row).
let composerSelectionGeneration = 0

export const getComposerSelectionGeneration = (): number => composerSelectionGeneration

export const markComposerSelectionManual = (): void => {
  composerSelectionGeneration += 1
  setCurrentModelSource('manual')
}

export const setCurrentReasoningEffort = (next: Updater<string>) => {
  updateAtom($currentReasoningEffort, next)
  persistString(COMPOSER_EFFORT_KEY, $currentReasoningEffort.get() || null)
}

// The profile's `agent.reasoning_effort`, mirrored from config so surfaces that
// need to render or apply "the default" resolve the user's configured level
// instead of assuming DEFAULT_REASONING_EFFORT (lib/reasoning-effort). Empty
// until config loads, and re-seeded on every profile switch by useHermesConfig.
export const $defaultReasoningEffort = atom('')

export const setDefaultReasoningEffort = (next: string) => updateAtom($defaultReasoningEffort, next)

export const setCurrentServiceTier = (next: Updater<string>) => updateAtom($currentServiceTier, next)

export const setCurrentFastMode = (next: Updater<boolean>) => {
  updateAtom($currentFastMode, next)
  persistBoolean(COMPOSER_FAST_KEY, $currentFastMode.get())
}

export const setYoloActive = (next: Updater<boolean>) => updateAtom($yoloActive, next)

/** Move the live workspace AND remember it as this backend's workspace.
 *
 *  Only for a path the user chose — a folder pick, a project/worktree entry, an
 *  explicit workspace target. The remembered value is where a new chat starts on
 *  a remote backend, so writing it from a path the user merely *looked at* makes
 *  every new chat land in the last session's folder (#77496, #80213). To follow
 *  a conversation's cwd, use `setCurrentCwdTransient`.
 */
export const setCurrentCwd = (next: Updater<string>) => {
  updateAtom($currentCwd, next)
  persistString(workspaceCwdKey(), $currentCwd.get().trim() || null)
}

export const setTerminalBackend = (next: Updater<string>) => updateAtom($terminalBackend, next)

/** Move the live workspace without claiming it as the user's chosen one.
 *
 *  For paths that come from a conversation rather than from the user: resume
 *  settling, a warm switch, the agent relocating mid-turn, detaching a draft.
 */
export const setCurrentCwdTransient = (next: Updater<string>) => updateAtom($currentCwd, next)

// Released-ownership marker: the live path belongs to no conversation. `null`
// cannot serve as the release value because it MATCHES a fresh draft (whose
// selected id is also null), which would declare a leftover path to be the
// draft's own workspace — #71254, one selection over. Kept here beside the atom
// and the comparison so a release site cannot reinvent a subtly different value.
const WORKSPACE_CWD_UNOWNED = 'desktop:workspace-cwd-unowned'

/** Mark the live workspace as belonging to `storedSessionId`.
 *
 *  Call this wherever a cwd is established for a conversation (resume settling,
 *  a warm switch, an explicit folder pick). Until it is called for the newly
 *  selected conversation, primary workspace-derived selectors hide the previous
 *  conversation's cached facts rather than publishing them (#71254).
 */
export const setWorkspaceCwdOwner = (storedSessionId: null | string) => updateAtom($workspaceCwdOwner, storedSessionId)

/** Declare that no conversation owns the live workspace path.
 *
 *  For a conversation whose workspace is not known yet: the path on screen is
 *  provably still the previous conversation's, so workspace-derived surfaces must
 *  hide it rather than adopt it. The path itself is deliberately left alone —
 *  clearing it would collapse the workspace/review panes and drop file-tree
 *  state on every switch.
 */
export const releaseWorkspaceCwdOwner = () => updateAtom($workspaceCwdOwner, WORKSPACE_CWD_UNOWNED)

/** Commit `cwd` as the workspace of the conversation the user is looking at.
 *
 *  The single primitive for "this path IS the selected conversation's" — a folder
 *  pick, a project entry, the agent relocating itself. Prefer it over a bare
 *  `setCurrentCwdTransient`, which moves the path while leaving ownership naming
 *  whatever held it before; workspace-derived slices then stay hidden even though
 *  the path is correct (#71254).
 */
export const commitWorkspaceCwdForSelectedSession = (cwd: string) => {
  setCurrentCwdTransient(cwd)
  setWorkspaceCwdOwner($selectedStoredSessionId.get())
}

/** True when `$currentCwd` is known to describe the selected conversation. */
export const workspaceCwdBelongsToSelectedSession = (): boolean =>
  ($workspaceCwdOwner.get() ?? null) === ($selectedStoredSessionId.get() ?? null)

export const setNewChatWorkspaceTarget = (next: NewChatWorkspaceTarget): number => {
  const generation = $newChatWorkspaceTargetGeneration.get() + 1
  $newChatWorkspaceTarget.set(next)
  $newChatWorkspaceTargetGeneration.set(generation)

  return generation
}


export const setCurrentBranch = (next: Updater<string>) => updateAtom($currentBranch, next)
export const setCurrentUsage = (next: Updater<UsageStats>) => updateAtom($currentUsage, next)
export const setSessionStartedAt = (next: Updater<number | null>) => updateAtom($sessionStartedAt, next)
export const setTurnStartedAt = (next: Updater<number | null>) => updateAtom($turnStartedAt, next)
export const setIntroPersonality = (next: Updater<string>) => updateAtom($introPersonality, next)
export const setCurrentPersonality = (next: Updater<string>) => updateAtom($currentPersonality, next)
export const setAvailablePersonalities = (next: Updater<string[]>) => updateAtom($availablePersonalities, next)
export const setIntroSeed = (next: Updater<number>) => updateAtom($introSeed, next)
export const setContextSuggestions = (next: Updater<ContextSuggestion[]>) => updateAtom($contextSuggestions, next)
export const setModelPickerOpen = (next: Updater<boolean>) => updateAtom($modelPickerOpen, next)
export const setSessionPickerOpen = (next: Updater<boolean>) => updateAtom($sessionPickerOpen, next)
