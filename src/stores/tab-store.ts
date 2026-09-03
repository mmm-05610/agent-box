import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { registerBackendScopedStoreReset } from "@/stores/backend-scoped-store-reset"
import { getFolderConversation, listOpenedTabs } from "@/lib/api"
import { resolveDefaultAgent } from "@/lib/resolve-default-agent"
import { formatConversationTitle } from "@/lib/conversation-title"
import {
  firstLeafId,
  isLayoutNode,
  leafIds,
  makeGroupId,
  neighborGroupId,
  normalizeTree,
  removeGroup,
  resizeSplitAt,
  singleGroupLayout,
  splitGroup,
  toggleOrientation,
  type LayoutNode,
  type SplitDirection,
} from "@/lib/tab-group-layout"
import {
  loadLastActiveContext,
  saveLastActiveContext,
  clearLastActiveContext,
} from "@/lib/last-active-context-storage"
import {
  buildNewConversationDraftStorageKey,
  clearMessageInputDraftV2,
  moveMessageInputDraft,
  sweepOrphanDraftKeys,
} from "@/lib/message-input-draft"
import { discardAskSelectionPrompts } from "@/lib/ask-selection-handoff"
import { pushClosedTab, snapshotConversationTab } from "@/lib/closed-tab-stack"
import type {
  AgentType,
  ConversationChange,
  ConversationStatus,
  DbConversationSummary,
} from "@/lib/types"

/**
 * Workspace tab state as a Zustand store. Replaces the former single
 * merged-value `TabContext`, whose value changed identity on every tab/status
 * update and re-rendered all ~20 consumers (including every keep-alive
 * `ConversationTabView`, which reads the context internally and so could not be
 * memo-blocked). Consumers now subscribe to the narrowest slice they render via
 * `useTabStore(selector)` / `useTabActions()`.
 *
 * The store owns all state, the cross-derive-stable `tabs` derivation, and every
 * mutation + orchestration action (hydration, debounced CAS save, cross-client
 * `tabs://changed` apply, sub-session summary seeding, provisional-agent
 * correction, post-hydration recovery). `TabRuntimeEffects` (in
 * `contexts/tab-context.tsx`) is a thin component that injects the React-land
 * dependencies (i18n labels, `activateConversationPane`, `acpDisconnect`, the
 * agent availability list) and drives the effects that need a React lifecycle
 * (platform subscriptions, timers, gates).
 */

export interface TabItemInternal {
  id: string
  kind: "conversation"
  folderId: number
  conversationId: number | null
  /** The runtime session key used by ConversationRuntimeContext.
   *  For new conversations this is a virtual (negative) ID that differs
   *  from the persisted `conversationId`. */
  runtimeConversationId?: number
  agentType: AgentType
  title: string
  isPinned: boolean
  workingDir?: string
  status?: ConversationStatus
  /**
   * Marks `agentType` as a system best-guess that should be replaced once
   * the agent list becomes fresh. True for draft tabs whose default came
   * from a stale localStorage seed or the AGENT_DISPLAY_ORDER fallback;
   * cleared by `confirmDraftAgent` (user click), `bindConversationTab`
   * (draft → real conversation), or the correction effect (fresh agent
   * list arrives). **Not persisted** to opened_tabs — hydrated drafts
   * default to false and are re-evaluated only when their agent_type is
   * no longer in the fresh sorted list (the `!sortedAvailableAgents.
   * includes(...)` branch of correction). Internal-only: no UI component
   * reads it, so a stale `true` value is harmless if correction never
   * runs (e.g. `acpListAgents()` keeps failing).
   */
  agentTypeProvisional?: boolean
  /**
   * Marks a draft tab as "chat mode" (folderless). Set by `openChatModeTab`,
   * cleared implicitly once the draft binds to a real conversation (whose hidden
   * hidden chat folder then drives chat-mode chrome via `useIsActiveChatMode`).
   * **Internal-only and never persisted** — drafts (`conversationId == null`) are
   * not written to opened_tabs, so this flag only ever lives in memory for the
   * pre-send draft. While set, the draft has no resolvable folder, so the
   * composer hides the branch picker and shows the "no-folder" chip.
   */
  isChat?: boolean
}

export type TabItem = TabItemInternal

interface DraftRetargetRequest {
  tabId: string
  expectedAgent: AgentType
  folderId: number
  workingDir: string
  agentType: AgentType
  provisional: boolean
}

/**
 * What a "new conversation" open resolved to: the draft tab that ended up
 * serving the request — the freshly created one, or the target group's existing
 * draft it reused — and the identity that tab will be carrying once the open has
 * fully settled.
 *
 * `agentType`/`folderId` are a PROMISE, not necessarily the tab's state right
 * now: reusing a draft that belongs to another folder or agent retargets it
 * asynchronously (see `consumeDraftRetargets`), so the tab only takes on this
 * identity after its stale ACP session has been torn down. Callers that hand
 * work to the tab must gate on it rather than acting the moment they get the id.
 */
export interface OpenedDraftTarget {
  tabId: string
  agentType: AgentType
  folderId: number
}

/** i18n strings the store needs for seed titles, injected from `TabProvider`
 *  (the store itself is locale-agnostic). Defaults to the raw keys until the
 *  provider's first effect injects the translated values — a one-frame window
 *  that only touches cosmetic seed titles, which the `tabs` derivation then
 *  overwrites from `conversations`. */
export interface TabLabels {
  loadingConversation: string
  newConversation: string
  untitledConversation: string
}

export interface TabStoreState {
  rawTabs: TabItemInternal[]
  activeTabId: string | null
  previewReplacedTabIds: string[]
  draftRetargetRequests: DraftRetargetRequest[]
  tabsHydrated: boolean
  /**
   * IDEA-style split groups (device-local, like tile mode). `groupLayout` is
   * the splitter tree (leaves = groups); `groupOf` maps tab id → group id
   * (missing = first leaf); `groupSelection` is each group's selected tab
   * (the visible one in non-tiled mode); `tileByGroup` is the per-group tile
   * flag. Group state never enters the synced `opened_tabs` payload — it is
   * persisted to localStorage by `persistGroupState` and re-keyed to
   * canonical tab ids there so it survives restarts.
   */
  groupLayout: LayoutNode
  groupOf: Record<string, string>
  groupSelection: Record<string, string>
  tileByGroup: Record<string, boolean>
  /**
   * Transient cross-group tab drag (never persisted): the dragged tab, the
   * live pointer position, and the FOREIGN group currently under the pointer
   * (null while over the tab's own strip / no valid target). Drives the
   * drop-target highlight and the floating ghost chip; cleared on drag end.
   */
  tabDrag: {
    tabId: string
    title: string
    x: number
    y: number
    overGroupId: string | null
  } | null
  childSummaries: Map<number, DbConversationSummary>
  /**
   * Derived from `rawTabs` × `conversations` × `childSummaries`: tab titles and
   * status decorated from the live conversation list, with cross-derive
   * reference reuse so an update that touches no open tab keeps the array (and
   * every item's) identity stable. Recomputed on every relevant write and on
   * `conversations` change (see the module-level app-workspace subscription).
   */
  tabs: TabItemInternal[]
  /** Bumped on reconnect to re-run the child-summary reconcile. */
  reseedTick: number
  // ── Mutations ──────────────────────────────────────────────────────────────
  openTab: (
    folderId: number,
    conversationId: number,
    agentType: AgentType,
    pin?: boolean,
    title?: string
  ) => void
  /**
   * `recordForReopen: false` closes without offering the tab to
   * `reopen_last_closed_tab`. Pass it whenever the tab is going away because
   * its conversation no longer exists — resurrecting it would mint a tab (and
   * an `opened_tabs` row) pointing at a deleted conversation.
   */
  closeTab: (tabId: string, options?: { recordForReopen?: boolean }) => void
  closeConversationTab: (
    folderId: number,
    conversationId: number,
    agentType: AgentType
  ) => void
  closeOtherTabs: (tabId: string) => void
  closeAllTabs: () => void
  closeTabsByFolder: (folderId: number) => void
  switchTab: (tabId: string) => void
  pinTab: (tabId: string) => void
  toggleGroupTile: (groupId: string) => void
  splitTab: (
    tabId: string,
    direction: SplitDirection,
    opts: { move: boolean }
  ) => void
  moveTabToGroup: (
    tabId: string,
    targetGroupId: string,
    opts?: {
      /** Position within the target group (clamped). Omitted = keep the tab's
       *  global rawTabs slot (menu moves — no reorder, no synced save). */
      index?: number
    }
  ) => void
  updateTabDrag: (drag: NonNullable<TabStoreState["tabDrag"]>) => void
  endTabDrag: () => void
  toggleGroupOrientation: (groupId: string) => void
  dissolveGroup: (groupId: string) => void
  unsplitAll: () => void
  reorderGroupTabs: (groupId: string, orderedTabs: TabItem[]) => void
  resizeGroupSplit: (
    splitId: string,
    handleIndex: number,
    boundaryFraction: number
  ) => void
  openNewConversationTab: (
    folderId: number,
    workingDir: string,
    options?: {
      inheritFromActive?: boolean
      folderDefaultAgent?: AgentType | null
      targetGroup?: string
      /** Pin the draft to this agent, outranking BOTH the folder default and
       *  the inherit/fallback chain. For callers that must reproduce a specific
       *  agent (e.g. "ask about this selection" continues the conversation the
       *  text came from), not merely suggest one. */
      forceAgent?: AgentType
    }
  ) => OpenedDraftTarget
  openChatModeTab: (options?: {
    targetGroup?: string
    /** See `openNewConversationTab`'s `forceAgent`. */
    forceAgent?: AgentType
  }) => OpenedDraftTarget
  setChatDraftWorkingDir: (tabId: string, workingDir: string) => void
  confirmDraftAgent: (tabId: string, agentType: AgentType) => void
  setDraftAgentFromFallback: (tabId: string, agentType: AgentType) => void
  bindConversationTab: (
    tabId: string,
    conversationId: number,
    agentType: AgentType,
    title: string,
    runtimeConversationId?: number,
    folderId?: number,
    workingDir?: string
  ) => void
  setTabRuntimeConversationId: (
    tabId: string,
    runtimeConversationId: number
  ) => void
  reorderTabs: (reorderedTabs: TabItem[]) => void
  consumeRemoteActivation: () => boolean
  onPreviewTabReplaced: (callback: (tabId: string) => void) => () => void

  // ── Orchestration (driven by TabProvider) ───────────────────────────────────
  hydrate: () => () => void
  reconcileChildSummaries: () => void
  handleChildConversationChange: (change: ConversationChange) => void
  handleChildReconnect: () => void
  correctDraftAgents: () => void
  recoverActiveContext: () => void
  consumePreviewReplaced: () => void
  consumeDraftRetargets: () => void
  syncActiveFolderId: () => void
  persistLastActiveContext: () => void

  // ── Runtime dependency injection ─────────────────────────────────────────────
  setLabels: (labels: TabLabels) => void
  setSideEffects: (deps: {
    activateConversationPane: () => void
    acpDisconnect: (contextKey: string) => Promise<void>
  }) => void
  setAgentAvailability: (sortedTypes: AgentType[], fresh: boolean) => void
}

/** Legacy pre-groups tile flag — read once as the first group's default. */
const TILE_MODE_STORAGE_KEY = "workspace:tile-mode"
/** Device-local split-group state (layout tree, assignments, selection, tile
 *  flags), keyed by canonical tab ids. See `persistGroupState`. */
const TAB_GROUPS_STORAGE_KEY = "workspace:tab-groups:v1"

// ── React-land dependencies, injected by TabProvider ─────────────────────────
// Kept out of the reactive store state so updating them never notifies
// consumers; actions read them directly.
interface TabRuntime {
  labels: TabLabels
  activateConversationPane: () => void
  acpDisconnect: (contextKey: string) => Promise<void>
  sortedAvailableAgents: AgentType[]
  agentsFresh: boolean
}

function defaultRuntime(): TabRuntime {
  return {
    labels: {
      loadingConversation: "loadingConversation",
      newConversation: "newConversation",
      untitledConversation: "untitledConversation",
    },
    activateConversationPane: () => {},
    acpDisconnect: async () => {},
    sortedAvailableAgents: [],
    agentsFresh: false,
  }
}

let runtime: TabRuntime = defaultRuntime()

// ── Coordination state (non-reactive) ─────────────────────────────────────────
// Single-session mode (D-005): the CAS save / cross-client merge machinery is
// gone — `tabs://changed` is unsubscribed and nothing calls `save_opened_tabs`.
// `hydrate` still reads the server's last snapshot, but only to restore the
// previously active session; `recomputeTabs` collapses it to one tab.
let remoteActivationPending = false
// Last JSON written to TAB_GROUPS_STORAGE_KEY (no-op gate), plus the trailing
// debounce used while a split divider is being dragged.
let lastGroupBlob: string | null = null
let groupPersistTimer: ReturnType<typeof setTimeout> | null = null
// Device-local draft tabs read from the blob at store creation, consumed once by
// `hydrate` (kept out of store state: they are an input to hydration, not
// renderable state). Refreshed whenever `initialTabState()` runs.
let pendingRestoreDrafts: PersistedDraft[] = []
let pendingRestoreActiveDraft: string | null = null
let orphanDraftPruneRan = false
// True once a tab snapshot has actually been read from the backend (hydration,
// a refetch, or a remote change). Until then the open-tab set is UNKNOWN — a
// failed `listOpenedTabs` leaves it empty — and treating that emptiness as truth
// would prune every group assignment, collapse the layout, and write that ruin
// over the good blob (destroying the user's remembered layout on a transient
// backend hiccup). Both the invariant prune and the blob write wait for it; the
// session self-heals the moment any snapshot lands.
let tabsSnapshotLoaded = false
const childSummaryInFlight = new Set<number>()
const childSeedBuffer = new Map<
  number,
  { summary?: DbConversationSummary; status?: string; deleted?: boolean }
>()
let seedEpoch = 0
const previewReplacedCallbacks = new Set<(tabId: string) => void>()
let correctionRan = false
let recoveryRan = false
// Tracks the last `conversations` reference recomputeTabs derived against, so
// the module-level app-workspace subscription recomputes only when it changes.
let lastConversations = useAppWorkspaceStore.getState().conversations

function makeConversationTabId(
  folderId: number,
  agentType: AgentType,
  conversationId: number
): string {
  return `conv-${folderId}-${agentType}-${conversationId}`
}

function makeNewConversationTabId(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function findTabIndexForConversation(
  tabs: TabItemInternal[],
  folderId: number,
  agentType: AgentType,
  conversationId: number
): number {
  const canonicalId = makeConversationTabId(folderId, agentType, conversationId)
  const idx = tabs.findIndex((t) => t.id === canonicalId)
  if (idx >= 0) return idx
  return tabs.findIndex(
    (t) =>
      t.folderId === folderId &&
      t.conversationId === conversationId &&
      t.agentType === agentType
  )
}

/** Field-wise equality for derived tab items. Backs the cross-derive reuse in
 *  the `tabs` derivation: an item whose every field matches the previous derive
 *  keeps its old reference, so downstream `Object.is` gates (consumers' memos)
 *  can short-circuit. TabItemInternal is a closed shape — keep this list in sync
 *  when adding fields. */
function sameDerivedTab(a: TabItemInternal, b: TabItemInternal): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.folderId === b.folderId &&
    a.conversationId === b.conversationId &&
    a.runtimeConversationId === b.runtimeConversationId &&
    a.agentType === b.agentType &&
    a.title === b.title &&
    a.isPinned === b.isPinned &&
    a.workingDir === b.workingDir &&
    a.status === b.status &&
    a.agentTypeProvisional === b.agentTypeProvisional &&
    a.isChat === b.isChat
  )
}

/** Resolve a tab's group: its assignment when it points at a live leaf, else
 *  the first leaf. Exported for the strip / detail-panel render filters. */
export function groupOfTab(
  groupOf: Record<string, string>,
  layout: LayoutNode,
  tabId: string
): string {
  const assigned = groupOf[tabId]
  if (assigned != null && leafIds(layout).includes(assigned)) return assigned
  return firstLeafId(layout)
}

/** True when more than one group exists (the canonical tree keeps a split root
 *  only while it has ≥ 2 leaves). */
export function selectIsSplit(s: TabStoreState): boolean {
  return s.groupLayout.type !== "group"
}

/**
 * Unmount classifier for a conversation view: is it being REPARENTED (its tab
 * moved to another split group — remount, keep the ACP connection) or TORN
 * DOWN (disconnect)?
 *
 * Narrowly scoped on purpose. "The tab is still open" alone is NOT a reparent
 * marker: the whole conversation surface also unmounts with tabs left open
 * (mobile conversation→file pane switch, workbench route overlay), and those
 * must still disconnect — the idle sweep skips viewers, so a viewer left
 * attached leaks its subscription. Since group shells are flat siblings keyed
 * by group id, a surviving tab leaves its shell if and only if its group
 * assignment changed, which is exactly what this compares.
 */
export function isReparentUnmount(
  state: Pick<TabStoreState, "rawTabs" | "groupOf" | "groupLayout">,
  tabId: string,
  renderedGroupId: string
): boolean {
  if (!state.rawTabs.some((tab) => tab.id === tabId)) return false
  return groupOfTab(state.groupOf, state.groupLayout, tabId) !== renderedGroupId
}

/** Where a new tab should land: the explicit target when it's a live group,
 *  else the focused (active tab's) group. */
function resolveTargetGroup(
  st: Pick<TabStoreState, "activeTabId" | "groupOf" | "groupLayout">,
  explicit?: string
): string {
  if (explicit != null && leafIds(st.groupLayout).includes(explicit)) {
    return explicit
  }
  return st.activeTabId != null
    ? groupOfTab(st.groupOf, st.groupLayout, st.activeTabId)
    : firstLeafId(st.groupLayout)
}

function sanitizeStringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof value !== "object" || value === null) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v
  }
  return out
}

function sanitizeBoolRecord(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (typeof value !== "object" || value === null) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v
  }
  return out
}

/**
 * A device-local draft tab as stored in the group blob. Drafts never reach
 * `opened_tabs` (the lazy-conversation invariant: no DB row before the first
 * send), so without this a split group holding only a draft — the common
 * "conversation | new conversation" layout — lost its member on restart and
 * `normalizeTree` collapsed the whole group.
 *
 * `index` is the draft's position in `rawTabs` at save time, so restoring
 * splices it back among the conversation tabs instead of appending. `agentType`
 * is written ONLY for an explicitly-chosen agent (`agentTypeProvisional` is
 * falsy) — persisting a provisional pick would launder a cold-start guess into
 * a user choice, the same rule `last-active-context-storage` documents. Chat
 * drafts omit `workingDir`: their scratch dir is recreated eagerly on focus.
 */
interface PersistedDraft {
  id: string
  group: string
  index: number
  folderId: number
  isChat?: boolean
  workingDir?: string
  agentType?: AgentType
}

function sanitizeDrafts(value: unknown): PersistedDraft[] {
  if (!Array.isArray(value)) return []
  const out: PersistedDraft[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const e = entry as Record<string, unknown>
    if (typeof e.id !== "string" || e.id.length === 0) continue
    if (typeof e.group !== "string" || e.group.length === 0) continue
    if (typeof e.folderId !== "number" || !Number.isFinite(e.folderId)) continue
    const index =
      typeof e.index === "number" && Number.isFinite(e.index) && e.index >= 0
        ? Math.floor(e.index)
        : out.length
    out.push({
      id: e.id,
      group: e.group,
      index,
      folderId: e.folderId,
      ...(e.isChat === true ? { isChat: true } : {}),
      ...(typeof e.workingDir === "string" && e.workingDir.length > 0
        ? { workingDir: e.workingDir }
        : {}),
      ...(typeof e.agentType === "string" && e.agentType.length > 0
        ? { agentType: e.agentType as AgentType }
        : {}),
    })
  }
  return out
}

/** Seed group state from the device-local blob (canonical tab ids — they match
 *  nothing until `hydrate` restores canonical-id tabs; `applyGroupInvariants`
 *  defers pruning until then). Falls back to a single group, seeding its tile
 *  flag from the legacy pre-groups key. The blob's draft entries are parked in
 *  module scope (not store state) for `hydrate` to splice back in. */
function readPersistedGroupState(): {
  groupLayout: LayoutNode
  groupOf: Record<string, string>
  groupSelection: Record<string, string>
  tileByGroup: Record<string, boolean>
} {
  pendingRestoreDrafts = []
  pendingRestoreActiveDraft = null
  const fallback = () => ({
    groupLayout: singleGroupLayout() as LayoutNode,
    groupOf: {} as Record<string, string>,
    groupSelection: {} as Record<string, string>,
    tileByGroup: {} as Record<string, boolean>,
  })
  if (typeof window === "undefined") return fallback()
  try {
    const raw = localStorage.getItem(TAB_GROUPS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed && isLayoutNode(parsed.layout)) {
        // Older blobs predate `drafts`/`activeDraft` — both sanitize to empty.
        pendingRestoreDrafts = sanitizeDrafts(parsed.drafts)
        pendingRestoreActiveDraft =
          typeof parsed.activeDraft === "string" ? parsed.activeDraft : null
        return {
          groupLayout: parsed.layout,
          groupOf: sanitizeStringRecord(parsed.assignments),
          groupSelection: sanitizeStringRecord(parsed.selection),
          tileByGroup: sanitizeBoolRecord(parsed.tileByGroup),
        }
      }
    }
    const seeded = fallback()
    if (localStorage.getItem(TILE_MODE_STORAGE_KEY) === "true") {
      seeded.tileByGroup[firstLeafId(seeded.groupLayout)] = true
    }
    return seeded
  } catch {
    return fallback()
  }
}

/** Write the group blob: conversation tabs re-keyed to canonical tab ids, draft
 *  tabs carried in `drafts` under their own (now restart-stable) ids so a
 *  draft-only group survives a restart. String-diffed no-op gate; never runs
 *  before hydration so a transient pre-hydration state can't clobber the good
 *  blob. */
function persistGroupState() {
  if (typeof window === "undefined") return
  const st = useTabStore.getState()
  // Both gates matter: pre-hydration the state is transient, and after a FAILED
  // hydration it is missing every conversation tab — writing either would
  // replace the good blob with a collapsed layout.
  if (!st.tabsHydrated || !tabsSnapshotLoaded) return
  const assignments: Record<string, string> = {}
  const drafts: PersistedDraft[] = []
  st.rawTabs.forEach((tab, index) => {
    const group = groupOfTab(st.groupOf, st.groupLayout, tab.id)
    if (tab.conversationId != null) {
      assignments[
        makeConversationTabId(tab.folderId, tab.agentType, tab.conversationId)
      ] = group
      return
    }
    drafts.push({
      id: tab.id,
      group,
      index,
      folderId: tab.folderId,
      ...(tab.isChat === true ? { isChat: true } : {}),
      // Chat drafts get a fresh scratch dir on focus; persisting the old one
      // would point the connection at a directory the GC may have removed.
      ...(tab.isChat !== true && tab.workingDir
        ? { workingDir: tab.workingDir }
        : {}),
      ...(tab.agentTypeProvisional ? {} : { agentType: tab.agentType }),
    })
  })
  const selection: Record<string, string> = {}
  for (const [groupId, tabId] of Object.entries(st.groupSelection)) {
    const tab = st.rawTabs.find((t) => t.id === tabId)
    if (!tab) continue
    selection[groupId] =
      tab.conversationId != null
        ? makeConversationTabId(tab.folderId, tab.agentType, tab.conversationId)
        : tab.id
  }
  const activeTab = st.rawTabs.find((t) => t.id === st.activeTabId)
  const blob = JSON.stringify({
    layout: st.groupLayout,
    assignments,
    selection,
    tileByGroup: st.tileByGroup,
    drafts,
    // Only a DRAFT focus needs restoring here; conversation focus rides the
    // synced `opened_tabs.is_active`.
    activeDraft:
      activeTab && activeTab.conversationId == null ? activeTab.id : null,
  })
  if (blob === lastGroupBlob) return
  lastGroupBlob = blob
  try {
    localStorage.setItem(TAB_GROUPS_STORAGE_KEY, blob)
  } catch {
    /* ignore */
  }
}

/**
 * Splice the blob's draft tabs back among the freshly-hydrated conversation
 * tabs, returning the merged list plus the group assignments to seed. Consumed
 * once (the pending list is cleared), so a later refetch/reconnect never
 * resurrects a draft the user closed.
 *
 * The agent is re-resolved exactly like any new draft unless the blob carried an
 * explicit (non-provisional) choice; the title comes from the current locale's
 * label rather than the stale persisted one.
 */
function mergeRestoredDrafts(restored: TabItemInternal[]): {
  tabs: TabItemInternal[]
  groupOf: Record<string, string>
} {
  const pending = pendingRestoreDrafts
  pendingRestoreDrafts = []
  if (pending.length === 0) return { tabs: restored, groupOf: {} }

  const tabs = [...restored]
  const groupOf: Record<string, string> = {}
  const seen = new Set(restored.map((tab) => tab.id))
  for (const draft of [...pending].sort((a, b) => a.index - b.index)) {
    if (seen.has(draft.id)) continue
    seen.add(draft.id)
    const resolved = draft.agentType
      ? { agentType: draft.agentType, provisional: false }
      : resolveAgentForFolder(draft.folderId, null)
    const tab: TabItemInternal = {
      id: draft.id,
      kind: "conversation",
      folderId: draft.folderId,
      conversationId: null,
      agentType: resolved.agentType,
      title: runtime.labels.newConversation,
      isPinned: true,
      workingDir: draft.workingDir,
      agentTypeProvisional: resolved.provisional,
      ...(draft.isChat === true ? { isChat: true } : {}),
    }
    tabs.splice(Math.min(draft.index, tabs.length), 0, tab)
    groupOf[draft.id] = draft.group
  }
  return { tabs, groupOf }
}

/** Trailing-debounced persist for divider drags (per-frame ratio writes). */
function schedulePersistGroupState() {
  if (groupPersistTimer) clearTimeout(groupPersistTimer)
  groupPersistTimer = setTimeout(() => {
    groupPersistTimer = null
    persistGroupState()
  }, 300)
}

function shallowRecordEqual(
  a: Record<string, string> | Record<string, boolean>,
  b: Record<string, string> | Record<string, boolean>
): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every((k) => a[k] === (b as Record<string, unknown>)[k])
}

/**
 * Re-establish the group invariants after any tab/group write:
 *   1. assignments only for open tabs, pointing at live leaves;
 *   2. every leaf has ≥ 1 tab (normalizeTree collapses the rest);
 *   3. each group's selection is one of its members, and the focused group's
 *      selection IS the active tab;
 *   4. per-group tile flags only for live groups.
 * Pruning/normalizing waits until the open-tab set is KNOWN — before hydration
 * the blob-seeded canonical-id state matches nothing yet, and after a failed
 * snapshot fetch the set is empty for want of data, not because the tabs closed
 * (selection repair still runs either way, for the live drafts). Never touches
 * rawTabs/tabs — no recursion with `recomputeTabs`.
 */
function applyGroupInvariants() {
  const st = useTabStore.getState()
  const openIds = new Set(st.rawTabs.map((t) => t.id))
  const tabSetKnown = st.tabsHydrated && tabsSnapshotLoaded

  let groupOf = st.groupOf
  let layout = st.groupLayout

  if (tabSetKnown) {
    let pruned: Record<string, string> | null = null
    const layoutLeaves = new Set(leafIds(layout))
    for (const [tabId, groupId] of Object.entries(groupOf)) {
      if (!openIds.has(tabId) || !layoutLeaves.has(groupId)) {
        pruned = pruned ?? { ...groupOf }
        delete pruned[tabId]
      }
    }
    if (pruned) groupOf = pruned

    const firstLeaf = firstLeafId(layout)
    const liveGroups = new Set<string>()
    for (const tab of st.rawTabs) {
      liveGroups.add(groupOf[tab.id] ?? firstLeaf)
    }
    layout = normalizeTree(layout, liveGroups)
    if (layout !== st.groupLayout) {
      // Leaves may have merged away — re-validate assignments against the
      // normalized tree so every entry still points at a live leaf.
      const nextLeaves = new Set(leafIds(layout))
      let revalidated: Record<string, string> | null = null
      for (const [tabId, groupId] of Object.entries(groupOf)) {
        if (!nextLeaves.has(groupId)) {
          revalidated = revalidated ?? { ...groupOf }
          delete revalidated[tabId]
        }
      }
      if (revalidated) groupOf = revalidated
    }
  }

  const leaves = leafIds(layout)
  const active =
    st.activeTabId != null && openIds.has(st.activeTabId)
      ? st.activeTabId
      : null
  const activeGroup = active ? groupOfTab(groupOf, layout, active) : null

  const selection: Record<string, string> = {}
  for (const groupId of leaves) {
    const members = st.rawTabs.filter(
      (t) => groupOfTab(groupOf, layout, t.id) === groupId
    )
    if (members.length === 0) {
      // An empty leaf can only stand while the tab set is still unknown; keep
      // its seeded selection for the repair that follows the real snapshot.
      const kept = st.groupSelection[groupId]
      if (!tabSetKnown && kept != null) selection[groupId] = kept
      continue
    }
    if (activeGroup === groupId && active != null) {
      selection[groupId] = active
      continue
    }
    const current = st.groupSelection[groupId]
    selection[groupId] =
      current != null && members.some((t) => t.id === current)
        ? current
        : members[0].id
  }

  let tileByGroup = st.tileByGroup
  if (tabSetKnown) {
    const leafSet = new Set(leaves)
    let prunedTile: Record<string, boolean> | null = null
    for (const groupId of Object.keys(tileByGroup)) {
      if (!leafSet.has(groupId)) {
        prunedTile = prunedTile ?? { ...tileByGroup }
        delete prunedTile[groupId]
      }
    }
    if (prunedTile) tileByGroup = prunedTile
  }

  const changed =
    groupOf !== st.groupOf ||
    layout !== st.groupLayout ||
    tileByGroup !== st.tileByGroup ||
    !shallowRecordEqual(selection, st.groupSelection)
  if (changed) {
    useTabStore.setState({
      groupOf,
      groupLayout: layout,
      groupSelection: selection,
      tileByGroup,
    })
  }
  persistGroupState()
}

/** Focus a tab and realign the per-group selection with it. The shared path
 *  for every activeTabId-only write (rawTabs writes get the same invariant
 *  pass via `recomputeTabs`). */
function focusTab(tabId: string) {
  if (useTabStore.getState().activeTabId !== tabId) {
    useTabStore.setState({ activeTabId: tabId })
  }
  applyGroupInvariants()
}

/**
 * Recompute the decorated `tabs` from `rawTabs` × `conversations` ×
 * `childSummaries`, reusing prior-derive references so an update touching no open
 * tab keeps the array identity stable (no consumer re-render). Called after every
 * rawTabs/childSummaries write, on `conversations` change, and when labels change.
 */
function recomputeTabs() {
  // Single-session main area (D-005): at most ONE conversation tab survives.
  // Every path that can add tabs — openTab, the draft openers, hydrate, the
  // remote-snapshot merge — funnels through here, so collapsing here enforces
  // the rule regardless of where the tabs came from. The keeper is the ACTIVE
  // tab (every add path activates the tab it opens); fallback is the first.
  // Dropped tabs are removed silently: they do NOT go onto the closed-tab
  // reopen stack (that records closes a user can meaningfully undo — a
  // background auto-replace is not one) and their ACP keep-alive registration
  // drops with the next TabKeysSync pass.
  {
    const cur = useTabStore.getState()
    if (cur.rawTabs.length > 1) {
      const keeper =
        cur.rawTabs.find((t) => t.id === cur.activeTabId) ?? cur.rawTabs[0]
      useTabStore.setState({ rawTabs: [keeper] })
    }
  }
  const st = useTabStore.getState()
  const { rawTabs, childSummaries } = st
  const conversations = useAppWorkspaceStore.getState().conversations
  const prev = st.tabs

  let next: TabItemInternal[]
  if (conversations.length === 0 && childSummaries.size === 0) {
    next = rawTabs
  } else {
    const conversationMap = new Map<string, (typeof conversations)[number]>()
    for (const c of conversations) {
      conversationMap.set(`${c.folder_id}-${c.agent_type}-${c.id}`, c)
    }
    const prevById = prev.length ? new Map(prev.map((d) => [d.id, d])) : null
    next = rawTabs.map((tab) => {
      if (tab.conversationId != null) {
        const conv =
          conversationMap.get(
            `${tab.folderId}-${tab.agentType}-${tab.conversationId}`
          ) ?? childSummaries.get(tab.conversationId)
        if (conv) {
          const newTitle =
            formatConversationTitle(conv.title) ||
            runtime.labels.untitledConversation
          const newStatus = conv.status as ConversationStatus | undefined
          if (tab.title !== newTitle || tab.status !== newStatus) {
            const derived = { ...tab, title: newTitle, status: newStatus }
            const prevItem = prevById?.get(tab.id)
            return prevItem && sameDerivedTab(prevItem, derived)
              ? prevItem
              : derived
          }
        }
      }
      return tab
    })
  }

  if (
    prev.length === next.length &&
    next.every((item, i) => item === prev[i])
  ) {
    // Membership may have changed even when the derived output didn't (it
    // usually can't, but the invariant pass is cheap and self-no-ops).
    applyGroupInvariants()
    return
  }
  useTabStore.setState({ tabs: next })
  applyGroupInvariants()
}

/** Pick the agent + provisional flag for a new draft tab. Wraps the pure
 *  `resolveDefaultAgent` helper with tab-store-scoped lookups (folder default
 *  from the live app-workspace store, latest sorted types, fresh flag). */
function resolveAgentForFolder(
  folderId: number,
  inherit: AgentType | null,
  // `undefined` = look the folder default up; `null` = explicitly none.
  folderDefaultOverride?: AgentType | null
): { agentType: AgentType; provisional: boolean } {
  const folderDefault =
    folderDefaultOverride !== undefined
      ? folderDefaultOverride
      : (useAppWorkspaceStore.getState().folders.find((f) => f.id === folderId)
          ?.default_agent_type ?? null)
  return resolveDefaultAgent({
    folderDefault,
    inherit,
    sortedTypes: runtime.sortedAvailableAgents,
    fresh: runtime.agentsFresh,
  })
}

function makeReplacementDraftTab(preferred?: TabItemInternal): TabItemInternal {
  const { folders, allFolders } = useAppWorkspaceStore.getState()
  // A closing chat-mode tab (its hidden chat folder, or the in-memory draft
  // flag) must not seed the replacement draft — that folder is hidden from
  // folder lists and has no real project cwd. Fall back to a real folder.
  // Detection reads `allFolders` (the in-memory draft flag is dropped on reload,
  // and `folders` excludes chat folders after refetch), while the fallback pool
  // reads the user-facing `folders`.
  const preferredIsChat =
    preferred?.isChat === true ||
    allFolders.find((f) => f.id === preferred?.folderId)?.kind === "chat"
  const nonChatFallbackId = folders.find((f) => f.kind !== "chat")?.id ?? 0
  const folderId = preferredIsChat
    ? nonChatFallbackId
    : (preferred?.folderId ?? nonChatFallbackId)
  const workingDir = preferredIsChat
    ? (folders.find((f) => f.id === folderId)?.path ?? "")
    : (preferred?.workingDir ??
      folders.find((f) => f.id === folderId)?.path ??
      "")
  // If we have a preferred (closing) tab, inherit BOTH its agent and its
  // provisional flag — never silently launder a system best-guess into a
  // confirmed value just because the source tab was closed.
  const { agentType, provisional } = preferred?.agentType
    ? {
        agentType: preferred.agentType,
        provisional: preferred.agentTypeProvisional ?? false,
      }
    : resolveAgentForFolder(folderId, null)
  return {
    id: makeNewConversationTabId(),
    kind: "conversation",
    folderId,
    conversationId: null,
    agentType,
    title: runtime.labels.newConversation,
    isPinned: true,
    workingDir,
    agentTypeProvisional: provisional,
  }
}

function initialTabState() {
  return {
    rawTabs: [] as TabItemInternal[],
    activeTabId: null as string | null,
    previewReplacedTabIds: [] as string[],
    draftRetargetRequests: [] as DraftRetargetRequest[],
    tabsHydrated: false,
    ...readPersistedGroupState(),
    tabDrag: null as TabStoreState["tabDrag"],
    childSummaries: new Map<number, DbConversationSummary>(),
    tabs: [] as TabItemInternal[],
    reseedTick: 0,
  }
}

export const useTabStore = create<TabStoreState>()((set, get) => ({
  ...initialTabState(),

  openTab: (folderId, conversationId, agentType, pin = false, title) => {
    const prevState = get()
    const existingIndex = findTabIndexForConversation(
      prevState.rawTabs,
      folderId,
      agentType,
      conversationId
    )

    if (existingIndex >= 0) {
      const activateTabId = prevState.rawTabs[existingIndex].id
      if (pin && !prevState.rawTabs[existingIndex].isPinned) {
        const updated = [...prevState.rawTabs]
        updated[existingIndex] = { ...updated[existingIndex], isPinned: true }
        set({ rawTabs: updated, activeTabId: activateTabId })
        recomputeTabs()
      } else {
        focusTab(activateTabId)
      }
      runtime.activateConversationPane()
      return
    }

    // New tabs land in the focused group (the active tab's group).
    const targetGroup = resolveTargetGroup(prevState)

    // Format the seed title so a draft/conversation title carrying an inline
    // reference link (`[README.md](file://…)`) shows its label, not raw
    // Markdown, before the `tabs` derivation re-derives it from the refreshed
    // conversation list.
    const resolvedTitle =
      formatConversationTitle(
        title ??
          useAppWorkspaceStore
            .getState()
            .conversations.find(
              (c) =>
                c.id === conversationId &&
                c.agent_type === agentType &&
                c.folder_id === folderId
            )?.title
      ) || runtime.labels.untitledConversation

    const tabId = makeConversationTabId(folderId, agentType, conversationId)
    const newTab: TabItemInternal = {
      id: tabId,
      kind: "conversation",
      folderId,
      conversationId,
      agentType,
      title: resolvedTitle,
      isPinned: pin,
    }

    if (pin) {
      set({
        rawTabs: [...prevState.rawTabs, newTab],
        activeTabId: tabId,
        groupOf: { ...prevState.groupOf, [tabId]: targetGroup },
      })
      recomputeTabs()
      runtime.activateConversationPane()
      return
    }

    // Preview replacement stays within the focused group — a preview parked in
    // another group is left alone (the new tab appends instead).
    const previewIndex = prevState.rawTabs.findIndex(
      (t) =>
        !t.isPinned &&
        groupOfTab(prevState.groupOf, prevState.groupLayout, t.id) ===
          targetGroup
    )
    if (previewIndex >= 0) {
      const updated = [...prevState.rawTabs]
      const replacedPreviewTabId = updated[previewIndex].id
      updated[previewIndex] = newTab
      set({
        rawTabs: updated,
        activeTabId: tabId,
        groupOf: { ...prevState.groupOf, [tabId]: targetGroup },
        previewReplacedTabIds: [
          ...prevState.previewReplacedTabIds,
          replacedPreviewTabId,
        ],
      })
      recomputeTabs()
      runtime.activateConversationPane()
      return
    }

    set({
      rawTabs: [...prevState.rawTabs, newTab],
      activeTabId: tabId,
      groupOf: { ...prevState.groupOf, [tabId]: targetGroup },
    })
    recomputeTabs()
    runtime.activateConversationPane()
  },

  closeTab: (tabId, options) => {
    const shouldActivateConversation = tabId === get().activeTabId

    const prevState = get()
    const index = prevState.rawTabs.findIndex((t) => t.id === tabId)
    if (index >= 0) {
      const closingTab = prevState.rawTabs[index]
      if (options?.recordForReopen !== false) {
        pushClosedTab(snapshotConversationTab(closingTab))
      }
      const next = prevState.rawTabs.filter((t) => t.id !== tabId)
      // A closing draft's composer text is scoped to that tab's key. Drop it —
      // unless this close spawns the replacement draft, which continues the same
      // slot and inherits the text instead of losing it silently.
      const closingDraftKey =
        closingTab.conversationId == null
          ? buildNewConversationDraftStorageKey(closingTab.id)
          : null
      // An "ask about this selection" prompt parked for this tab has no panel
      // left to drain it. Drop it rather than leave it in the module buffer for
      // the rest of the session — the tab id is never reused, so it could only
      // sit there.
      discardAskSelectionPrompts(closingTab.id)

      let draftKeyHandedOver = false

      if (next.length === 0) {
        if (useAppWorkspaceStore.getState().folders.length === 0) {
          set({ rawTabs: [], activeTabId: null })
        } else {
          const replacementTab = makeReplacementDraftTab(closingTab)
          set({ rawTabs: [replacementTab], activeTabId: replacementTab.id })
          if (closingDraftKey) {
            draftKeyHandedOver = true
            moveMessageInputDraft(
              closingDraftKey,
              buildNewConversationDraftStorageKey(replacementTab.id)
            )
          }
        }
      } else if (tabId === prevState.activeTabId) {
        // Pick the neighbor within the closed tab's group; when the group
        // emptied, fall to the neighboring group's selected tab.
        const { groupOf, groupLayout, groupSelection } = prevState
        const closedGroup = groupOfTab(groupOf, groupLayout, tabId)
        const inGroup = (t: TabItemInternal) =>
          groupOfTab(groupOf, groupLayout, t.id) === closedGroup
        const indexInGroup = prevState.rawTabs
          .filter(inGroup)
          .findIndex((t) => t.id === tabId)
        const groupAfter = next.filter(inGroup)
        let newActiveId: string
        if (groupAfter.length > 0) {
          newActiveId =
            groupAfter[Math.min(indexInGroup, groupAfter.length - 1)].id
        } else {
          const neighbor = neighborGroupId(groupLayout, closedGroup)
          const neighborSelection = neighbor
            ? groupSelection[neighbor]
            : undefined
          newActiveId =
            neighborSelection != null &&
            next.some((t) => t.id === neighborSelection)
              ? neighborSelection
              : next[0].id
        }
        set({ rawTabs: next, activeTabId: newActiveId })
      } else {
        set({ rawTabs: next })
      }
      if (closingDraftKey && !draftKeyHandedOver) {
        clearMessageInputDraftV2(closingDraftKey)
      }
      recomputeTabs()
    }

    if (shouldActivateConversation) {
      runtime.activateConversationPane()
    }
  },

  closeConversationTab: (folderId, conversationId, agentType) => {
    const target = get().rawTabs.find(
      (tab) =>
        tab.folderId === folderId &&
        tab.conversationId === conversationId &&
        tab.agentType === agentType
    )
    if (!target) return
    // Every caller reaches here right after `deleteConversation` — the row is
    // gone, so the tab must not be offered back by "reopen closed tab".
    get().closeTab(target.id, { recordForReopen: false })
  },

  closeOtherTabs: (tabId) => {
    const prevState = get()
    const target = prevState.rawTabs.find((tab) => tab.id === tabId)
    if (!target) return
    // Group-scoped while split: "others" are the target's group siblings only —
    // the other groups keep their tabs (IDEA semantics).
    const { groupOf, groupLayout } = prevState
    const targetGroup = groupOfTab(groupOf, groupLayout, tabId)
    const keep =
      groupLayout.type === "group"
        ? [target]
        : prevState.rawTabs.filter(
            (tab) =>
              tab.id === tabId ||
              groupOfTab(groupOf, groupLayout, tab.id) !== targetGroup
          )
    if (keep.length === prevState.rawTabs.length) {
      // Nothing to close (already alone in its group) — just focus.
      focusTab(tabId)
      return
    }
    const keepIds = new Set(keep.map((tab) => tab.id))
    for (const tab of prevState.rawTabs) {
      if (!keepIds.has(tab.id)) {
        pushClosedTab(snapshotConversationTab(tab))
      }
    }
    set({ rawTabs: keep, activeTabId: tabId })
    recomputeTabs()
  },

  closeAllTabs: () => {
    if (useAppWorkspaceStore.getState().folders.length === 0) {
      const prevState = get()
      if (prevState.rawTabs.length === 0 && prevState.activeTabId == null) {
        return
      }
      for (const tab of prevState.rawTabs) {
        pushClosedTab(snapshotConversationTab(tab))
      }
      set({ rawTabs: [], activeTabId: null })
      recomputeTabs()
      return
    }

    const prevState = get()
    const seedTab =
      prevState.rawTabs.find((t) => t.conversationId == null && t.workingDir) ??
      prevState.rawTabs.find((t) => t.id === prevState.activeTabId) ??
      prevState.rawTabs[0]
    const replacementTab = makeReplacementDraftTab(seedTab)
    for (const tab of prevState.rawTabs) {
      pushClosedTab(snapshotConversationTab(tab))
    }
    set({ rawTabs: [replacementTab], activeTabId: replacementTab.id })
    recomputeTabs()
    runtime.activateConversationPane()
  },

  closeTabsByFolder: (folderId) => {
    const prevState = get()
    const remaining = prevState.rawTabs.filter((t) => t.folderId !== folderId)
    if (remaining.length === prevState.rawTabs.length) return
    // Deliberately not recorded for reopen: this runs when the folder itself
    // stops existing (a removed worktree, or the sidebar's "remove folder"),
    // so every tab it drops points at a cwd that is gone.

    const currentActive = prevState.activeTabId
    const stillActive =
      currentActive != null && remaining.some((t) => t.id === currentActive)

    set({
      rawTabs: remaining,
      activeTabId: stillActive ? currentActive : (remaining[0]?.id ?? null),
    })
    recomputeTabs()
  },

  switchTab: (tabId) => {
    if (!get().rawTabs.some((t) => t.id === tabId)) return
    focusTab(tabId)
    runtime.activateConversationPane()
  },

  pinTab: (tabId) => {
    const prev = get().rawTabs
    const idx = prev.findIndex((t) => t.id === tabId)
    // No-op when the tab is absent or already pinned — `map` would otherwise
    // always allocate a new array (and a new object for the matched tab),
    // needlessly re-rendering that tab's `ownTab` subscriber.
    if (idx < 0 || prev[idx].isPinned) return
    const next = prev.map((t, i) => (i === idx ? { ...t, isPinned: true } : t))
    set({ rawTabs: next })
    recomputeTabs()
  },

  toggleGroupTile: (groupId) => {
    const st = get()
    set({
      tileByGroup: { ...st.tileByGroup, [groupId]: !st.tileByGroup[groupId] },
    })
    persistGroupState()
  },

  splitTab: (tabId, direction, opts) => {
    const st = get()
    const tab = st.rawTabs.find((t) => t.id === tabId)
    if (!tab) return
    const sourceGroup = groupOfTab(st.groupOf, st.groupLayout, tabId)

    if (opts.move) {
      // A draft belongs to the group that spawned it (see `moveTabToGroup`);
      // plain split still seeds the new group with its own draft.
      if (tab.conversationId == null) return
      // Moving the group's only tab would just shift the group — pointless.
      const groupSize = st.rawTabs.filter(
        (t) => groupOfTab(st.groupOf, st.groupLayout, t.id) === sourceGroup
      ).length
      if (groupSize < 2) return
      const newGroupId = makeGroupId()
      const nextLayout = splitGroup(
        st.groupLayout,
        sourceGroup,
        direction,
        newGroupId
      )
      if (nextLayout === st.groupLayout) return
      set({
        groupLayout: nextLayout,
        groupOf: { ...st.groupOf, [tabId]: newGroupId },
        activeTabId: tabId,
      })
      recomputeTabs()
      runtime.activateConversationPane()
      return
    }

    // Split without moving: the new group opens with a fresh draft seeded from
    // the context tab (conversations can't be duplicated across groups).
    const newGroupId = makeGroupId()
    const nextLayout = splitGroup(
      st.groupLayout,
      sourceGroup,
      direction,
      newGroupId
    )
    if (nextLayout === st.groupLayout) return
    const inherit =
      tab.conversationId != null || !tab.agentTypeProvisional
        ? tab.agentType
        : null
    const { allFolders, folders } = useAppWorkspaceStore.getState()
    const contextIsChat =
      tab.isChat === true ||
      allFolders.find((f) => f.id === tab.folderId)?.kind === "chat"
    let newTab: TabItemInternal
    if (contextIsChat) {
      const { agentType, provisional } = resolveAgentForFolder(0, inherit, null)
      newTab = {
        id: makeNewConversationTabId(),
        kind: "conversation",
        folderId: 0,
        conversationId: null,
        agentType,
        title: runtime.labels.newConversation,
        isPinned: true,
        workingDir: undefined,
        agentTypeProvisional: provisional,
        isChat: true,
      }
    } else {
      const { agentType, provisional } = resolveAgentForFolder(
        tab.folderId,
        inherit
      )
      newTab = {
        id: makeNewConversationTabId(),
        kind: "conversation",
        folderId: tab.folderId,
        conversationId: null,
        agentType,
        title: runtime.labels.newConversation,
        isPinned: true,
        workingDir:
          tab.workingDir ?? folders.find((f) => f.id === tab.folderId)?.path,
        agentTypeProvisional: provisional,
      }
    }
    set({
      rawTabs: [...st.rawTabs, newTab],
      groupLayout: nextLayout,
      groupOf: { ...st.groupOf, [newTab.id]: newGroupId },
      activeTabId: newTab.id,
    })
    recomputeTabs()
    runtime.activateConversationPane()
  },

  moveTabToGroup: (tabId, targetGroupId, opts) => {
    const st = get()
    const moving = st.rawTabs.find((t) => t.id === tabId)
    if (!moving) return
    if (!leafIds(st.groupLayout).includes(targetGroupId)) return
    if (groupOfTab(st.groupOf, st.groupLayout, tabId) === targetGroupId) return
    // Drafts are group-bound: each group owns its unsent scratch conversation
    // (its own composer text, its own folder/agent context), and every group can
    // spawn one on demand from its own strip. Moving one would leave a group
    // without its slot and hand another a second. Reordering WITHIN the group is
    // unaffected (that path never reaches here). The UI hides both move
    // affordances for drafts; this backstops the programmatic path.
    if (moving.conversationId == null) return

    if (opts?.index == null) {
      // Menu move: only the assignment changes — the tab keeps its global
      // rawTabs slot (group order = filtered order), so the synced payload
      // stays byte-identical and no save fires.
      set({
        groupOf: { ...st.groupOf, [tabId]: targetGroupId },
        activeTabId: tabId,
      })
      recomputeTabs()
      runtime.activateConversationPane()
      return
    }

    // Drag drop: land at `index` within the target group. Splice the tab out,
    // then insert it before the target group's k-th member (after its last
    // member when k = member count) — a partition insert, so every OTHER
    // group's relative order is untouched. rawTabs order changes, which
    // syncs like any user reorder.
    const without = st.rawTabs.filter((t) => t.id !== tabId)
    const memberSlots: number[] = []
    without.forEach((t, i) => {
      if (groupOfTab(st.groupOf, st.groupLayout, t.id) === targetGroupId) {
        memberSlots.push(i)
      }
    })
    const k = Math.max(0, Math.min(opts.index, memberSlots.length))
    const insertPos =
      k < memberSlots.length
        ? memberSlots[k]
        : memberSlots.length > 0
          ? memberSlots[memberSlots.length - 1] + 1
          : without.length
    const nextRaw = [
      ...without.slice(0, insertPos),
      moving,
      ...without.slice(insertPos),
    ]
    set({
      rawTabs: nextRaw,
      groupOf: { ...st.groupOf, [tabId]: targetGroupId },
      activeTabId: tabId,
    })
    recomputeTabs()
    runtime.activateConversationPane()
  },

  updateTabDrag: (drag) => {
    const prev = get().tabDrag
    // Per-frame writes: skip the set when nothing observable changed.
    if (
      prev != null &&
      prev.tabId === drag.tabId &&
      prev.x === drag.x &&
      prev.y === drag.y &&
      prev.overGroupId === drag.overGroupId
    ) {
      return
    }
    set({ tabDrag: drag })
  },

  endTabDrag: () => {
    if (get().tabDrag == null) return
    set({ tabDrag: null })
  },

  toggleGroupOrientation: (groupId) => {
    const st = get()
    const next = toggleOrientation(st.groupLayout, groupId)
    if (next === st.groupLayout) return
    set({ groupLayout: next })
    persistGroupState()
  },

  dissolveGroup: (groupId) => {
    const st = get()
    const target = neighborGroupId(st.groupLayout, groupId)
    if (!target) return
    const groupOf = { ...st.groupOf }
    for (const tab of st.rawTabs) {
      if (groupOfTab(st.groupOf, st.groupLayout, tab.id) === groupId) {
        groupOf[tab.id] = target
      }
    }
    set({ groupOf, groupLayout: removeGroup(st.groupLayout, groupId) })
    recomputeTabs()
  },

  unsplitAll: () => {
    const st = get()
    if (st.groupLayout.type === "group") return
    // Everyone falls back to the (kept) first leaf; rawTabs order is already
    // the merged display order, so the synced payload doesn't change.
    set({
      groupLayout: singleGroupLayout(firstLeafId(st.groupLayout)),
      groupOf: {},
    })
    recomputeTabs()
  },

  reorderGroupTabs: (groupId, orderedTabs) => {
    const st = get()
    const raw = st.rawTabs
    const slots: number[] = []
    raw.forEach((tab, i) => {
      if (groupOfTab(st.groupOf, st.groupLayout, tab.id) === groupId) {
        slots.push(i)
      }
    })
    if (orderedTabs.length !== slots.length) return
    const slotIds = new Set(slots.map((i) => raw[i].id))
    const seen = new Set<string>()
    const ordered: TabItemInternal[] = []
    for (const tab of orderedTabs) {
      if (!slotIds.has(tab.id) || seen.has(tab.id)) return
      seen.add(tab.id)
      const item = raw.find((t) => t.id === tab.id)
      if (!item) return
      ordered.push(item)
    }
    // Partition permutation: only this group's slots move, so the other
    // groups' persisted positions stay byte-stable.
    const next = [...raw]
    slots.forEach((slot, k) => {
      next[slot] = ordered[k]
    })
    if (next.every((tab, i) => tab === raw[i])) return
    set({ rawTabs: next })
    recomputeTabs()
  },

  resizeGroupSplit: (splitId, handleIndex, boundaryFraction) => {
    const st = get()
    const next = resizeSplitAt(
      st.groupLayout,
      splitId,
      handleIndex,
      boundaryFraction
    )
    if (next === st.groupLayout) return
    set({ groupLayout: next })
    schedulePersistGroupState()
  },

  reorderTabs: (reorderedTabs) => {
    set({ rawTabs: reorderedTabs })
    recomputeTabs()
  },

  openNewConversationTab: (folderId, workingDir, options) => {
    // "New conversation" while a chat conversation is active resolves the active
    // (hidden) chat folder. Never pile a second conversation into a
    // per-conversation chat folder — start a fresh folderless chat draft
    // instead. Single choke point for every "new conversation" entry point.
    if (
      useAppWorkspaceStore.getState().allFolders.find((f) => f.id === folderId)
        ?.kind === "chat"
    ) {
      return get().openChatModeTab({
        ...(options?.targetGroup != null
          ? { targetGroup: options.targetGroup }
          : {}),
        ...(options?.forceAgent != null
          ? { forceAgent: options.forceAgent }
          : {}),
      })
    }
    const inheritFromActive = options?.inheritFromActive === true
    let inherit: AgentType | null = null
    if (inheritFromActive) {
      const st = get()
      const activeTab = st.rawTabs.find((t) => t.id === st.activeTabId)
      if (
        activeTab &&
        (activeTab.conversationId != null || !activeTab.agentTypeProvisional)
      ) {
        inherit = activeTab.agentType
      }
    }
    // A forced agent short-circuits resolution entirely (it outranks the folder
    // default, which `inherit` would lose to) and is never provisional — it is
    // explicit caller intent, not a guess to be corrected once the agent list
    // goes fresh.
    const { agentType: targetAgent, provisional } =
      options?.forceAgent != null
        ? { agentType: options.forceAgent, provisional: false }
        : resolveAgentForFolder(folderId, inherit, options?.folderDefaultAgent)

    const tabId = makeNewConversationTabId()
    const prevState = get()
    // Per-group draft singleton: reuse the target group's existing draft tab
    // (regardless of folder), so each group carries at most one draft.
    const targetGroup = resolveTargetGroup(prevState, options?.targetGroup)
    const existingTab = prevState.rawTabs.find(
      (t) =>
        t.conversationId == null &&
        groupOfTab(prevState.groupOf, prevState.groupLayout, t.id) ===
          targetGroup
    )

    if (!existingTab) {
      const newTab: TabItemInternal = {
        id: tabId,
        kind: "conversation",
        folderId,
        conversationId: null,
        agentType: targetAgent,
        title: runtime.labels.newConversation,
        isPinned: true,
        workingDir,
        agentTypeProvisional: provisional,
      }
      set({
        rawTabs: [...prevState.rawTabs, newTab],
        activeTabId: tabId,
        groupOf: { ...prevState.groupOf, [tabId]: targetGroup },
      })
      recomputeTabs()
      runtime.activateConversationPane()
      return { tabId, agentType: targetAgent, folderId }
    }

    const folderChanged = existingTab.folderId !== folderId
    const workingDirChanged = existingTab.workingDir !== workingDir
    const agentChanged = existingTab.agentType !== targetAgent
    const provisionalChanged =
      (existingTab.agentTypeProvisional ?? false) !== provisional

    if (folderChanged || agentChanged) {
      set({
        draftRetargetRequests: [
          ...prevState.draftRetargetRequests,
          {
            tabId: existingTab.id,
            expectedAgent: existingTab.agentType,
            folderId,
            workingDir,
            agentType: targetAgent,
            provisional,
          },
        ],
      })
      focusTab(existingTab.id)
    } else if (workingDirChanged || provisionalChanged) {
      set({
        rawTabs: prevState.rawTabs.map((tab) =>
          tab.id === existingTab.id
            ? { ...tab, workingDir, agentTypeProvisional: provisional }
            : tab
        ),
        activeTabId: existingTab.id,
      })
      recomputeTabs()
    } else {
      focusTab(existingTab.id)
    }
    runtime.activateConversationPane()
    // Every branch above leaves the tab on `targetAgent` in `folderId` — either
    // already there, or once its queued retarget lands.
    return { tabId: existingTab.id, agentType: targetAgent, folderId }
  },

  openChatModeTab: (options) => {
    const st = get()
    // Inherit the agent like openNewConversationTab's inherit path.
    const activeTab = st.rawTabs.find((x) => x.id === st.activeTabId)
    const inherit =
      activeTab &&
      (activeTab.conversationId != null || !activeTab.agentTypeProvisional)
        ? activeTab.agentType
        : null
    // Same short-circuit as openNewConversationTab: an explicitly forced agent
    // is caller intent and skips resolution.
    const { agentType: targetAgent, provisional } =
      options?.forceAgent != null
        ? { agentType: options.forceAgent, provisional: false }
        : resolveAgentForFolder(0, inherit, null)

    // Per-group draft singleton — all draft handling below is scoped to the
    // target group. Capture its existing draft (if any) up front so a stale
    // ACP session can be torn down after we flip it to chat mode.
    const targetGroup = resolveTargetGroup(st, options?.targetGroup)
    const inTargetGroup = (t: TabItemInternal) =>
      groupOfTab(st.groupOf, st.groupLayout, t.id) === targetGroup
    const existingDraft = st.rawTabs.find(
      (t) => t.conversationId == null && inTargetGroup(t)
    )
    const needsDisconnect =
      existingDraft != null &&
      !(existingDraft.isChat && existingDraft.folderId === 0)

    const tabId = makeNewConversationTabId()
    const prevState = get()
    const existingTab = prevState.rawTabs.find(
      (t) => t.conversationId == null && inTargetGroup(t)
    )

    if (!existingTab) {
      const newTab: TabItemInternal = {
        id: tabId,
        kind: "conversation",
        folderId: 0,
        conversationId: null,
        agentType: targetAgent,
        title: runtime.labels.newConversation,
        isPinned: true,
        workingDir: undefined,
        agentTypeProvisional: provisional,
        isChat: true,
      }
      set({
        rawTabs: [...prevState.rawTabs, newTab],
        activeTabId: tabId,
        groupOf: { ...prevState.groupOf, [tabId]: targetGroup },
      })
      recomputeTabs()
    } else if (existingTab.isChat && existingTab.folderId === 0) {
      // Already a chat-mode draft. Normally there is nothing to do but focus it
      // — it keeps whatever agent it was on, because `inherit` is only ever a
      // suggestion. A FORCED agent is not: the caller needs this draft to run on
      // that agent (an "ask about this selection" continuing a chat
      // conversation), so re-point it. No explicit disconnect: the connection
      // lifecycle is keyed on the agent and tears the old one down itself, the
      // same way the agent picker's `confirmDraftAgent` relies on.
      if (
        options?.forceAgent != null &&
        (existingTab.agentType !== targetAgent ||
          (existingTab.agentTypeProvisional ?? false) !== provisional)
      ) {
        set({
          activeTabId: existingTab.id,
          rawTabs: prevState.rawTabs.map((tab) =>
            tab.id === existingTab.id
              ? {
                  ...tab,
                  agentType: targetAgent,
                  agentTypeProvisional: provisional,
                }
              : tab
          ),
        })
        recomputeTabs()
      } else {
        focusTab(existingTab.id)
      }
    } else {
      // Existing draft on a real folder: flip it to chat mode SYNCHRONOUSLY
      // (folderId + isChat together), so a send issued before any async teardown
      // can never still create/send in the old folder. The agent is re-resolved
      // for chat mode (no folder default).
      set({
        activeTabId: existingTab.id,
        rawTabs: prevState.rawTabs.map((tab) =>
          tab.id === existingTab.id
            ? {
                ...tab,
                folderId: 0,
                workingDir: undefined,
                isChat: true,
                agentType: targetAgent,
                agentTypeProvisional: provisional,
              }
            : tab
        ),
      })
      recomputeTabs()
    }

    if (needsDisconnect && existingDraft) {
      void runtime.acpDisconnect(existingDraft.id).catch((err) => {
        console.error("[TabStore] disconnect chat-mode draft:", err)
      })
    }
    runtime.activateConversationPane()
    // A reused chat draft that was NOT force-agented keeps its own agent (the
    // focus-only branch above), so report that rather than the resolved one.
    const settledAgent =
      existingTab && existingTab.isChat && existingTab.folderId === 0
        ? options?.forceAgent != null
          ? targetAgent
          : existingTab.agentType
        : targetAgent
    return {
      tabId: existingTab ? existingTab.id : tabId,
      agentType: settledAgent,
      folderId: 0,
    }
  },

  setChatDraftWorkingDir: (tabId, workingDir) => {
    const prev = get().rawTabs
    const next = prev.map((tab) => {
      if (tab.id !== tabId) return tab
      // Guard against a stale eager-prepare result landing after the draft
      // already bound, retargeted, or left chat mode. Only patch a still-unbound
      // chat draft, and skip a redundant write to keep the reference stable.
      if (
        tab.conversationId != null ||
        tab.isChat !== true ||
        tab.workingDir === workingDir
      ) {
        return tab
      }
      return { ...tab, workingDir }
    })
    if (next.every((tab, i) => tab === prev[i])) return
    set({ rawTabs: next })
    recomputeTabs()
  },

  confirmDraftAgent: (tabId, agentType) => {
    const prev = get().rawTabs
    const next = prev.map((t) => {
      if (t.id !== tabId) return t
      if (t.conversationId != null) return t // not a draft
      if (t.agentType === agentType && !t.agentTypeProvisional) return t
      return { ...t, agentType, agentTypeProvisional: false }
    })
    if (next.every((t, i) => t === prev[i])) return
    set({ rawTabs: next })
    recomputeTabs()
  },

  setDraftAgentFromFallback: (tabId, agentType) => {
    const prev = get().rawTabs
    const next = prev.map((t) => {
      if (t.id !== tabId) return t
      if (t.conversationId != null) return t // not a draft
      if (t.agentType === agentType && t.agentTypeProvisional) return t
      return { ...t, agentType, agentTypeProvisional: true }
    })
    if (next.every((t, i) => t === prev[i])) return
    set({ rawTabs: next })
    recomputeTabs()
  },

  bindConversationTab: (
    tabId,
    conversationId,
    agentType,
    title,
    runtimeConversationId,
    folderId,
    workingDir
  ) => {
    const prevState = get()
    const nextTabs = prevState.rawTabs.flatMap((tab) => {
      if (tab.id === tabId) {
        const nextTab: TabItemInternal = {
          ...tab,
          conversationId,
          agentType,
          title: formatConversationTitle(title) || tab.title,
          runtimeConversationId,
          agentTypeProvisional: false,
          ...(folderId != null ? { folderId } : {}),
          ...(workingDir != null ? { workingDir } : {}),
        }
        return [nextTab]
      }
      // Drop any other tab that already represents the same (conversationId,
      // agentType) — conversation IDs are globally unique.
      if (
        tab.conversationId === conversationId &&
        tab.agentType === agentType
      ) {
        return []
      }
      return [tab]
    })

    const activeStillExists =
      prevState.activeTabId != null &&
      nextTabs.some((tab) => tab.id === prevState.activeTabId)
    const boundTab = nextTabs.find((tab) => tab.id === tabId)

    set({
      rawTabs: nextTabs,
      activeTabId: activeStillExists
        ? prevState.activeTabId
        : (boundTab?.id ?? nextTabs[0]?.id ?? null),
    })
    recomputeTabs()
  },

  setTabRuntimeConversationId: (tabId, runtimeConversationId) => {
    const prev = get().rawTabs
    const target = prev.find((tab) => tab.id === tabId)
    if (!target || target.runtimeConversationId === runtimeConversationId) {
      return
    }
    set({
      rawTabs: prev.map((tab) =>
        tab.id === tabId ? { ...tab, runtimeConversationId } : tab
      ),
    })
    recomputeTabs()
  },

  consumeRemoteActivation: () => {
    if (!remoteActivationPending) return false
    remoteActivationPending = false
    return true
  },

  onPreviewTabReplaced: (callback) => {
    previewReplacedCallbacks.add(callback)
    return () => {
      previewReplacedCallbacks.delete(callback)
    }
  },

  hydrate: () => {
    let cancelled = false
    void (async () => {
      let snapshotLoaded = false
      try {
        const snap = await listOpenedTabs()
        if (cancelled) return
        snapshotLoaded = true
        tabsSnapshotLoaded = true
        const restored: TabItemInternal[] = snap.items.map((it) => ({
          id:
            it.conversation_id != null
              ? makeConversationTabId(
                  it.folder_id,
                  it.agent_type,
                  it.conversation_id
                )
              : makeNewConversationTabId(),
          kind: "conversation",
          folderId: it.folder_id,
          conversationId: it.conversation_id,
          agentType: it.agent_type,
          title:
            it.conversation_id != null
              ? runtime.labels.loadingConversation
              : runtime.labels.newConversation,
          isPinned: it.is_pinned,
        }))
        const activeItem = snap.items.find(
          (it) => it.is_active && it.conversation_id != null
        )
        let restoredActive: string | null = activeItem
          ? makeConversationTabId(
              activeItem.folder_id,
              activeItem.agent_type,
              activeItem.conversation_id as number
            )
          : null
        // Splice the device-local drafts back in (same frame as the conversation
        // tabs, so the first invariant pass sees complete groups and can't
        // collapse a draft-only one).
        const { tabs: withDrafts, groupOf: draftGroups } =
          mergeRestoredDrafts(restored)
        if (
          pendingRestoreActiveDraft != null &&
          withDrafts.some((tab) => tab.id === pendingRestoreActiveDraft)
        ) {
          restoredActive = pendingRestoreActiveDraft
        }
        if (!restoredActive && withDrafts.length > 0) {
          restoredActive = withDrafts[0].id
        }
        set({
          rawTabs: withDrafts,
          activeTabId: restoredActive,
          ...(Object.keys(draftGroups).length > 0
            ? { groupOf: { ...get().groupOf, ...draftGroups } }
            : {}),
        })
        recomputeTabs()
      } catch (err) {
        console.error("[TabStore] listOpenedTabs failed:", err)
        if (!cancelled) {
          // The snapshot is the CONVERSATION half only; the drafts are
          // device-local and still valid, so restore them rather than starting
          // blank. Everything that could destroy on-disk state — the invariant
          // prune, the blob write, the composer-key sweep — stays parked behind
          // `tabsSnapshotLoaded` until a snapshot actually lands (single-session
          // mode has no subscription refetch anymore; a later cold start or a
          // store reset retries the read).
          const { tabs: draftsOnly, groupOf: draftGroups } =
            mergeRestoredDrafts(get().rawTabs)
          if (draftsOnly.length > 0) {
            const focus =
              pendingRestoreActiveDraft != null &&
              draftsOnly.some((tab) => tab.id === pendingRestoreActiveDraft)
                ? pendingRestoreActiveDraft
                : draftsOnly[0].id
            set({
              rawTabs: draftsOnly,
              activeTabId: focus,
              groupOf: { ...get().groupOf, ...draftGroups },
            })
            recomputeTabs()
          }
        }
      } finally {
        if (!cancelled) {
          set({ tabsHydrated: true })
          // First full invariant pass: with hydration done, blob-seeded group
          // entries that matched nothing (tabs closed on another client) prune
          // and ghost empty groups collapse.
          applyGroupInvariants()
          // Retire composer drafts left behind by tabs that no longer exist
          // (crash / pre-per-tab-key builds). The live set is read when the
          // sweep runs, so a draft opened in the meantime is never swept. Only
          // safe once the tab set is known — after a failed fetch every key
          // would look orphaned and the user's unsent text would be deleted.
          if (snapshotLoaded) {
            sweepOrphanDraftKeys(
              () =>
                new Set(
                  get()
                    .rawTabs.filter((tab) => tab.conversationId == null)
                    .map((tab) => tab.id)
                )
            )
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  },

  reconcileChildSummaries: () => {
    const { conversations, conversationsLoading } =
      useAppWorkspaceStore.getState()
    if (conversationsLoading) return
    const conversationKeys = new Set<string>()
    for (const c of conversations) {
      conversationKeys.add(`${c.folder_id}-${c.agent_type}-${c.id}`)
    }
    const rawTabs = get().rawTabs
    const openChildIds = new Set<number>()
    for (const tab of rawTabs) {
      const id = tab.conversationId
      if (id == null) continue
      if (conversationKeys.has(`${tab.folderId}-${tab.agentType}-${id}`)) {
        continue
      }
      openChildIds.add(id)
    }
    // Prune cached summaries for child tabs that have since closed.
    const prevChild = get().childSummaries
    let prunedChild: Map<number, DbConversationSummary> | null = null
    for (const id of prevChild.keys()) {
      if (!openChildIds.has(id)) {
        prunedChild = prunedChild ?? new Map(prevChild)
        prunedChild.delete(id)
      }
    }
    if (prunedChild) {
      set({ childSummaries: prunedChild })
      recomputeTabs()
    }
    // Seed the open child tabs that aren't cached or already being fetched.
    for (const id of openChildIds) {
      if (get().childSummaries.has(id)) continue
      if (childSummaryInFlight.has(id)) continue
      childSummaryInFlight.add(id)
      const epoch = seedEpoch
      void getFolderConversation(id)
        .then((detail) => {
          if (seedEpoch !== epoch) return
          const buffered = childSeedBuffer.get(id)
          if (buffered?.deleted) return
          if (!get().rawTabs.some((tb) => tb.conversationId === id)) return
          let summary = buffered?.summary ?? detail.summary
          if (buffered?.status != null) {
            summary = { ...summary, status: buffered.status }
          }
          const nextChild = new Map(get().childSummaries)
          nextChild.set(id, summary)
          set({ childSummaries: nextChild })
          recomputeTabs()
        })
        .catch(() => {
          // Leave unseeded (e.g. deleted) — a later pass or live event retries.
        })
        .finally(() => {
          if (seedEpoch !== epoch) return
          childSummaryInFlight.delete(id)
          childSeedBuffer.delete(id)
        })
    }
  },

  handleChildConversationChange: (change) => {
    const id = change.kind === "upsert" ? change.summary.id : change.id
    if (get().childSummaries.has(id)) {
      if (change.kind === "upsert") {
        const summary = change.summary
        const prev = get().childSummaries
        if (!prev.has(summary.id)) return
        const next = new Map(prev)
        next.set(summary.id, summary)
        set({ childSummaries: next })
        recomputeTabs()
      } else if (change.kind === "status") {
        const prev = get().childSummaries
        const cur = prev.get(change.id)
        if (!cur || cur.status === change.status) return
        const next = new Map(prev)
        next.set(change.id, { ...cur, status: change.status })
        set({ childSummaries: next })
        recomputeTabs()
      } else {
        const prev = get().childSummaries
        if (!prev.has(change.id)) return
        const next = new Map(prev)
        next.delete(change.id)
        set({ childSummaries: next })
        recomputeTabs()
      }
      return
    }
    // Seed for this id is still in flight — accumulate into the pending buffer.
    if (childSummaryInFlight.has(id)) {
      const pending = childSeedBuffer.get(id) ?? {}
      if (change.kind === "deleted") {
        pending.deleted = true
      } else if (!pending.deleted) {
        if (change.kind === "upsert") {
          pending.summary = change.summary
          pending.status = undefined
        } else {
          pending.status = change.status
        }
      }
      childSeedBuffer.set(id, pending)
    }
  },

  handleChildReconnect: () => {
    seedEpoch += 1
    childSummaryInFlight.clear()
    childSeedBuffer.clear()
    if (get().childSummaries.size !== 0) {
      set({ childSummaries: new Map() })
      recomputeTabs()
    }
    set({ reseedTick: get().reseedTick + 1 })
  },

  correctDraftAgents: () => {
    const candidates = get().rawTabs.filter((tab) => {
      if (tab.conversationId != null) return false
      if (tab.agentTypeProvisional) return true
      if (!runtime.sortedAvailableAgents.includes(tab.agentType)) return true
      return false
    })
    if (candidates.length === 0) return

    for (const tab of candidates) {
      void (async () => {
        const { agentType: newAgent } = resolveAgentForFolder(
          tab.folderId,
          null
        )
        const current = get().rawTabs.find((t) => t.id === tab.id)
        if (!current || current.conversationId != null) return

        if (current.agentType === newAgent) {
          if (!current.agentTypeProvisional) return
          const prev = get().rawTabs
          const next = prev.map((t) =>
            t.id === tab.id &&
            t.conversationId == null &&
            t.agentTypeProvisional
              ? { ...t, agentTypeProvisional: false }
              : t
          )
          if (next.every((t, i) => t === prev[i])) return
          set({ rawTabs: next })
          recomputeTabs()
          return
        }

        const expectedAgent = current.agentType
        try {
          await runtime.acpDisconnect(tab.id)
        } catch (err) {
          console.error("[TabStore] correct provisional disconnect:", err)
        }

        const prev = get().rawTabs
        const target = prev.find((t) => t.id === tab.id)
        if (!target) return
        if (target.conversationId != null) return
        if (
          target.agentType !== expectedAgent &&
          !target.agentTypeProvisional
        ) {
          return
        }
        set({
          rawTabs: prev.map((t) =>
            t.id === tab.id
              ? { ...t, agentType: newAgent, agentTypeProvisional: false }
              : t
          ),
        })
        recomputeTabs()
      })()
    }
  },

  recoverActiveContext: () => {
    const hint = loadLastActiveContext()
    if (hint?.isChat) {
      get().openChatModeTab()
      return
    }
    const folders = useAppWorkspaceStore.getState().folders
    if (hint) {
      const f = folders.find((x) => x.id === hint.folderId)
      if (f) {
        get().openNewConversationTab(f.id, f.path)
        return
      }
    }
    const first = folders[0]
    if (first) {
      get().openNewConversationTab(first.id, first.path)
      return
    }
    get().openChatModeTab()
  },

  consumePreviewReplaced: () => {
    const consumedIds = get().previewReplacedTabIds
    if (consumedIds.length === 0) return
    for (const tabId of consumedIds) {
      for (const cb of previewReplacedCallbacks) {
        cb(tabId)
      }
    }
    const prev = get().previewReplacedTabIds
    const matchesPrefix = consumedIds.every(
      (tabId, index) => prev[index] === tabId
    )
    if (!matchesPrefix) return
    set({ previewReplacedTabIds: prev.slice(consumedIds.length) })
  },

  consumeDraftRetargets: () => {
    const consumedRequests = get().draftRetargetRequests
    if (consumedRequests.length === 0) return

    const prev = get().draftRetargetRequests
    const matchesPrefix = consumedRequests.every(
      (request, index) => prev[index] === request
    )
    if (matchesPrefix) {
      set({
        draftRetargetRequests: prev.slice(consumedRequests.length),
      })
    }

    for (const request of consumedRequests) {
      void (async () => {
        try {
          await runtime.acpDisconnect(request.tabId)
        } catch (err) {
          console.error("[TabStore] disconnect draft tab:", err)
        }

        const rawTabs = get().rawTabs
        const target = rawTabs.find((tab) => tab.id === request.tabId)
        if (!target) return
        if (target.conversationId != null) return
        if (
          target.agentType !== request.expectedAgent &&
          !target.agentTypeProvisional
        ) {
          return
        }
        set({
          rawTabs: rawTabs.map((tab) =>
            tab.id === request.tabId
              ? {
                  ...tab,
                  folderId: request.folderId,
                  workingDir: request.workingDir,
                  agentType: request.agentType,
                  agentTypeProvisional: request.provisional,
                  isChat: false,
                }
              : tab
          ),
        })
        recomputeTabs()
      })()
    }
  },

  syncActiveFolderId: () => {
    const st = get()
    const activeTab = st.rawTabs.find((t) => t.id === st.activeTabId) ?? null
    useAppWorkspaceStore
      .getState()
      .setActiveFolderId(activeTab?.folderId ?? null)
  },

  persistLastActiveContext: () => {
    const st = get()
    if (!st.tabsHydrated) return
    const active = st.rawTabs.find((t) => t.id === st.activeTabId)
    if (!active) return
    if (active.conversationId == null) {
      saveLastActiveContext({
        folderId: active.folderId,
        isChat: active.isChat === true,
      })
    } else {
      clearLastActiveContext()
    }
  },

  setLabels: (labels) => {
    runtime.labels = labels
    recomputeTabs()
  },

  setSideEffects: (deps) => {
    runtime.activateConversationPane = deps.activateConversationPane
    runtime.acpDisconnect = deps.acpDisconnect
  },

  setAgentAvailability: (sortedTypes, fresh) => {
    runtime.sortedAvailableAgents = sortedTypes
    runtime.agentsFresh = fresh
  },
}))

/**
 * Correction / recovery are one-shot per session (module flags). `TabProvider`
 * calls these gate wrappers when their conditions flip, replacing the former
 * `correctionRanRef` / `recoveryRanRef`.
 */
export function runCorrectionOnce() {
  if (correctionRan) return
  correctionRan = true
  useTabStore.getState().correctDraftAgents()
}

export function runRecoveryOnce() {
  if (recoveryRan) return
  recoveryRan = true
  useTabStore.getState().recoverActiveContext()
}

/**
 * Drop restored drafts whose folder no longer exists (deleted while the app was
 * closed, so no `closeTabsByFolder` ever ran). Folder-blind at hydrate time by
 * design — hydration must not wait on the folder list — so this runs once the
 * folders land, and `applyGroupInvariants` collapses any group it empties.
 * Chat drafts are folderless (`folderId` 0) and always survive.
 */
export function pruneOrphanDraftsOnce() {
  if (orphanDraftPruneRan) return
  orphanDraftPruneRan = true
  const st = useTabStore.getState()
  const { allFolders } = useAppWorkspaceStore.getState()
  const orphaned = st.rawTabs.filter(
    (tab) =>
      tab.conversationId == null &&
      tab.isChat !== true &&
      !allFolders.some((folder) => folder.id === tab.folderId)
  )
  if (orphaned.length === 0) return
  const orphanIds = new Set(orphaned.map((tab) => tab.id))
  const next = st.rawTabs.filter((tab) => !orphanIds.has(tab.id))
  useTabStore.setState({
    rawTabs: next,
    activeTabId:
      st.activeTabId != null && orphanIds.has(st.activeTabId)
        ? (next[0]?.id ?? null)
        : st.activeTabId,
  })
  for (const tab of orphaned) {
    clearMessageInputDraftV2(buildNewConversationDraftStorageKey(tab.id))
  }
  recomputeTabs()
}

// Recompute `tabs` whenever the app-workspace `conversations` list changes (any
// agent's turn start/stop): titles/status decorate from it. Reference reuse in
// recomputeTabs keeps the array stable when no open tab is affected.
useAppWorkspaceStore.subscribe(() => {
  const c = useAppWorkspaceStore.getState().conversations
  if (c !== lastConversations) {
    lastConversations = c
    recomputeTabs()
  }
})

/** All tab actions as a shallow-stable object. Actions never change identity, so
 *  this hook never triggers a re-render — consumers that only dispatch use it
 *  instead of subscribing to any state slice. */
export function useTabActions() {
  return useTabStore(
    useShallow((s) => ({
      openTab: s.openTab,
      closeTab: s.closeTab,
      closeConversationTab: s.closeConversationTab,
      closeOtherTabs: s.closeOtherTabs,
      closeAllTabs: s.closeAllTabs,
      closeTabsByFolder: s.closeTabsByFolder,
      switchTab: s.switchTab,
      pinTab: s.pinTab,
      toggleGroupTile: s.toggleGroupTile,
      splitTab: s.splitTab,
      moveTabToGroup: s.moveTabToGroup,
      toggleGroupOrientation: s.toggleGroupOrientation,
      dissolveGroup: s.dissolveGroup,
      unsplitAll: s.unsplitAll,
      reorderGroupTabs: s.reorderGroupTabs,
      resizeGroupSplit: s.resizeGroupSplit,
      updateTabDrag: s.updateTabDrag,
      endTabDrag: s.endTabDrag,
      openNewConversationTab: s.openNewConversationTab,
      openChatModeTab: s.openChatModeTab,
      setChatDraftWorkingDir: s.setChatDraftWorkingDir,
      confirmDraftAgent: s.confirmDraftAgent,
      setDraftAgentFromFallback: s.setDraftAgentFromFallback,
      bindConversationTab: s.bindConversationTab,
      setTabRuntimeConversationId: s.setTabRuntimeConversationId,
      reorderTabs: s.reorderTabs,
      consumeRemoteActivation: s.consumeRemoteActivation,
      onPreviewTabReplaced: s.onPreviewTabReplaced,
    }))
  )
}

/**
 * Restore pristine state (store + module coordination vars + injected runtime).
 * Used by tests, and by the backend-scoped reset registry if a realm's backend
 * identity ever changes (an invariant-violating transition that does not occur
 * today — see `RemoteConnectionGate`). In normal operation the store lives for
 * the window's lifetime and is never reset.
 */
export function resetTabStore() {
  if (groupPersistTimer) {
    clearTimeout(groupPersistTimer)
    groupPersistTimer = null
  }
  remoteActivationPending = false
  lastGroupBlob = null
  childSummaryInFlight.clear()
  childSeedBuffer.clear()
  seedEpoch = 0
  previewReplacedCallbacks.clear()
  correctionRan = false
  recoveryRan = false
  orphanDraftPruneRan = false
  tabsSnapshotLoaded = false
  runtime = defaultRuntime()
  lastConversations = useAppWorkspaceStore.getState().conversations
  // Merge (not replace) so the action methods are preserved; only the data
  // fields reset to their initial values.
  useTabStore.setState(initialTabState())
}

// Reset this backend-scoped store on any (currently-unreachable) in-realm
// backend switch. See `backend-scoped-store-reset.ts`.
registerBackendScopedStoreReset(resetTabStore)
