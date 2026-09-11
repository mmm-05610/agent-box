/**
 * @hermes/plugin-sdk — THE plugin language. The vscode-module model: plugin
 * authors import exactly one module and get everything — they never touch
 * `@/…` internals (lint-fenced) and never need codebase access.
 *
 * Two delivery modes, one surface:
 *  - bundled (`src/plugins/<name>/`): the import resolves here via alias;
 *  - runtime-fetched (plugin host, next phase): the loader injects this same
 *    object as `window.__HERMES_PLUGIN_SDK__` and maps the import to it, so a
 *    published plugin builds against the types with the SDK marked external.
 *
 * Capability tiers (WoW-style):
 *  - `host.state.*` — READONLY app state (nanostore atoms; `.get()` or
 *    subscribe; `useValue` in React).
 *  - `host.*` actions — curated, safe verbs (toast, haptic).
 *  - `host.request` — the gateway JSON-RPC door; the plugin's real power,
 *    and the future seam for per-plugin capability grants.
 *  - `ui.*` — the design language, so plugin UI looks native by default.
 */















import { hostProfileRouting } from './host-routing'
import { hostSessionActions } from './host-session'
import { hostReadonlyState } from './host-state'
import { hostSystem } from './host-system'

// -- the host object: composed from the responsibility modules below --------

export const host = {
  ...hostReadonlyState,

  ...hostSystem,

  ...hostProfileRouting,

  ...hostSessionActions
}

export type { PluginProfileRoute } from './host-routing'
export type { PluginNewChatOptions, PluginOpenSessionOptions } from './host-session-options'
export {
  BOT_CHAT_SESSION_HYDRATION_TIMEOUT_MS,
  DEFAULT_SESSION_HYDRATION_TIMEOUT_MS
} from './host-session-options'
export type {
  PluginFocusedSessionOwner,
  ViewportRect
} from './host-state'

// -- react bridge -------------------------------------------------------------

// Every contribution surface, plugin-reachable: register keybinds, palette
// commands, routes, themes, panes, composer extensions, and bar items with
// the same area ids + payload types core uses.
export {
  COMPOSER_AREAS,
  type ComposerAtCompletionItem,
  type ComposerAtCompletionSource,
  type ComposerAttachmentProvider,
  type ComposerMiddleware
} from '@/app/chat/composer/contrib'

// -- ui: the design language --------------------------------------------------

/** THE session status dot — the one primitive the sidebar row, the pane tabs
 *  and the session switcher render, so a session's status can never disagree
 *  between surfaces. Pass the STORED session id and it resolves the rest
 *  itself: the live state (needs-input / working / stalled / background /
 *  unread / draft / idle) and the project color. Never hand-roll a status
 *  circle beside it — a plugin's own dot inverts core's color vocabulary the
 *  moment either side moves. */
export { SessionStatusDot, type SessionStatusDotProps } from '@/app/chat/session-status-dot'
/** The sidebar row's leading cell — the fixed box a dot, icon or handle sits in.
 *  Reserve it and your label starts on the same left edge as every session row
 *  above you; spell the classes yourself and the row drifts. The session row is
 *  canonical; `row-geometry.ts` explains what each measurement belongs to. */
export { SidebarRowLead } from '@/app/chat/sidebar/chrome'
/** One glyph per gateway kind — device, cloud, terminal, network. The statusbar
 *  switcher, the fleet profile rail and any plugin rail listing gateways share
 *  it, so a connection looks the same wherever it is named. */
export { ConnectionGlyph } from '@/app/chat/sidebar/connection-glyph'
export { SIDEBAR_ROW_LEAD, SIDEBAR_TRUNCATED_LEADING } from '@/app/chat/sidebar/row-geometry'
export { PALETTE_AREA, type PaletteContribution } from '@/app/command-palette/contrib'
/** THE master-detail toolkit core uses for list+inspector surfaces (Scheduled
 *  jobs, Kanban, …): a dense left `PanelList` of `PanelListRow`s beside a
 *  scrolling `PanelDetail` of `PanelSectionLabel` / `PanelMeta` / `PanelBlock`.
 *  `PanelEmpty` is the icon+action empty state (plain `EmptyState` is title +
 *  description only, and silently drops an `icon`). A row takes a custom `lead`
 *  (avatar/swatch), trailing `meta`, and `menuItems` for kebab + right-click
 *  parity, so a roster needs no hand-rolled row. The overlay-bound `Panel` root
 *  is deliberately NOT exported — these compose inside a pane just as well. */
export {
  PanelAction,
  PanelAddButton,
  PanelBlock,
  PanelBody,
  PanelDetail,
  PanelEmpty,
  PanelHeader,
  PanelList,
  PanelListRow,
  type PanelMenuItem,
  PanelMeta,
  type PanelMetaRow,
  PanelPill,
  type PanelPillTone,
  PanelRowMenu,
  PanelSectionLabel
} from '@/app/overlays/panel'
export { type RouteContribution, ROUTES_AREA, SIDEBAR_NAV_AREA, type SidebarNavContribution } from '@/app/routes'

/** THE full per-toolset config panel core Settings renders — provider picker,
 *  env vars / API keys, model catalog picker, and post-setup runners. Route-
 *  decoupled (the "manage keys" deep link is a no-op outside the router); pass
 *  `toolset`, optional `onConfiguredChange`, and an optional `profile`. */
export { ToolsetConfigPanel } from '@/app/settings/toolset-config-panel'
/** THE model catalog menu — the same searchable, provider-grouped, family-
 *  collapsing picker the chat composer uses, including the per-row
 *  thinking/effort/fast submenu. Drive it with a `ModelMenuController`: the
 *  menu renders and navigates, your controller decides what a selection MEANS
 *  (write to a session, hold a per-task override, …). Never fork it — a copy
 *  drifts from the composer the first time either side changes. */
export {
  ModelCatalogMenu,
  type ModelChoice,
  ModelMenuCloseContext,
  type ModelMenuController
} from '@/app/shell/model-catalog-menu'
export type { StatusbarItem } from '@/app/shell/statusbar-controls'
export type { TitlebarTool } from '@/app/shell/titlebar-controls'
/** THE whole Capabilities surface (Skills / Tools / MCP tabs, installed
 *  lists, full-skill detail pane, embedded hub picker with one-click
 *  installs). For plugin dialogs pass `embedded` (tab state stays local —
 *  never touches the page router) and `fixedProfile` to pin every tab to one
 *  bot's backend; the internal profile selector hides itself. Add
 *  `fixedConnection` (registry connection id) to pin a bot living on another
 *  registered gateway — probe `SkillsView.supportsFixedConnection` first;
 *  builds without it would route the pin to the ACTIVE gateway. Bot Mode's
 *  Advanced section is the reference consumer. */
export { SkillsView } from '@/app/skills'
/** THE full MCP tab core Settings renders — per-server enable + OAuth sign-in
 *  + API-key setup + live probes, not a checkbox list. Route-decoupled so it
 *  renders anywhere (a plugin dialog); pass a live `gateway` (see
 *  `host.getGateway()`) and an optional `profile` to scope it to one bot. */
export { McpTab } from '@/app/skills/mcp-tab'
/** Live accent override — set a hex and the ACTIVE theme repaints with its
 *  accent family re-seeded from it (see `retintTheme`); `null` restores the
 *  authored palette. Deliberately not persisted: it is an authoring knob, not
 *  a setting, so a plugin that sets it must clear it on dispose. */
export { $accentOverride, setAccentOverride } from '@/application/theme/adapters/accent-override'
/** Switch the theme from outside React (a gateway event, a connection coming
 *  up, any callback with no component around it). Returns false and leaves the
 *  appearance alone when the name doesn't resolve, so it doubles as the "is
 *  this theme installed?" check. */
export { requestTheme } from '@/application/theme/adapters/request'
export { THEMES_AREA } from '@/application/theme/adapters/user-themes'
/** The oversized Collapse lettering an empty chat is titled with — core writes
 *  "HERMES AGENT" with it, a `chat.empty` contribution writes its own name. */
export { Wordmark } from '@/components/chat/wordmark'
/** Pane placement roles. `'floating'` is the one NON-tiling value: the pane is
 *  excluded from the layout tree and rendered as a fixed, draggable card above
 *  it — it takes no width from any zone, has no tab, and can't be docked.
 *  Pair it with `anchor` (spawn corner, default `'top-right'`) plus
 *  `width`/`height`. */
export type { FloatingAnchor } from '@/components/pane-shell/tree/renderer/floating-rect'
export { StatusDot, type StatusTone } from '@/components/status-dot'
export { Badge } from '@/components/ui/badge'
export { Button } from '@/components/ui/button'
export { Checkbox } from '@/components/ui/checkbox'
export { Codicon } from '@/components/ui/codicon'
/** THE color picker — swatch grid plus a clear row that means "back to the
 *  deterministic color". Feed it `PROFILE_SWATCHES` so a hand-picked color
 *  shares the generated palette's saturation and lightness; a bespoke grid of
 *  literal hex drifts off-theme the moment the palette moves. */
export { ColorSwatches } from '@/components/ui/color-swatches'
export { ConfirmDialog } from '@/components/ui/confirm-dialog'
export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  // Submenus: Bot Mode files a bot into a user section from its row menu, and
  // a flat list of every folder would swamp the items already there.
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
export { CopyButton } from '@/components/ui/copy-button'
export { DecodeText } from '@/components/ui/decode-text'
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
/** The caret every collapsible section in core uses — points right when closed
 *  and rotates down when open, so the motion matches the rest of the app. Swap
 *  a hand-written `chevron-down`/`chevron-right` ternary for this. */
export { DisclosureCaret } from '@/components/ui/disclosure-caret'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
export { EmptyState } from '@/components/ui/empty-state'
export { ErrorState } from '@/components/ui/error-state'
export { FadeScroll } from '@/components/ui/fade-scroll'
export { GlyphSpinner } from '@/components/ui/glyph-spinner'
export { Input } from '@/components/ui/input'
export { Kbd, KbdGroup } from '@/components/ui/kbd'
/** The app's canonical loader (animated curves; `lemniscate-bloom` for long
 *  page loads) — the same one every core page uses. */
export { Loader, type LoaderType } from '@/components/ui/loader'
export { LogView } from '@/components/ui/log-view'
export { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
/** Full-row / region click target. Imposes NO styling — the caller keeps its own
 *  layout classes — it just bakes in `type="button"` and a stable `data-slot`.
 *  Use it for rows and regions; `Button` is for ordinary compact actions. */
export { RowButton } from '@/components/ui/row-button'
export { ScrollArea } from '@/components/ui/scroll-area'
export { SearchField } from '@/components/ui/search-field'
export { SegmentedControl } from '@/components/ui/segmented-control'
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
export { Separator } from '@/components/ui/separator'
export { Skeleton } from '@/components/ui/skeleton'
export { Switch } from '@/components/ui/switch'
export { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
export { Textarea } from '@/components/ui/textarea'
export { Tip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// -- contracts ----------------------------------------------------------------

export type { GatewayEventListener } from '@/extension/contrib/events'
export type {
  HermesPlugin,
  PluginContext,
  PluginContribution,
  PluginNativeNotificationInput,
  PluginNotificationAction,
  PluginOs,
  PluginRestOptions,
  PluginStorage
} from '@/extension/contrib/plugin'
/** Mount-scoped contribution: while the rendering component is mounted, its
 *  children render in the target area's slot; unmount disposes it. Use for
 *  page-owned chrome (a page's titlebar control leaves with the page) —
 *  `ctx.register` stays the door for permanent contributions. Namespace the
 *  id with your plugin slug (`kanban:board-switcher`). */
export { Contribute, type ContributeProps } from '@/extension/contrib/react/contribute'
export type { Contribution } from '@/extension/contrib/types'
/** The live gateway instance type — for typing the `gateway` prop `McpTab`
 *  takes; obtain the instance from `host.getGateway()`. */
export type { HermesGateway } from '@/hermes'
/** Localized copy. `useI18n` reuses the app's strings; `usePluginI18n(id)` +
 *  `ctx.i18n.register` let a plugin ship its OWN locale bundles, scoped like
 *  `ctx.storage` and resolved against the app's active locale — no core edit.
 *  `translateNow` is the one-shot form for the places a hook can't reach —
 *  notably a `ctx.register` pane `title`, which is read at registration time
 *  and is why plugin pane titles otherwise strand as hardcoded English. It
 *  samples the locale at call time, so React should still use the hooks. */
export {
  type Locale,
  type PluginI18n,
  type PluginLocaleBundles,
  type PluginMessages,
  type PluginMessageValue,
  type PluginTranslate,
  translateNow,
  useI18n,
  usePluginI18n
} from '@/i18n'
/** THE way to run a decorative rAF animation (avatars, shimmer, sprites):
 *  fps budget + hidden/minimized/unfocused pause + idle dormancy + teardown.
 *  Plugins must route animation clocks through this instead of raw rAF loops
 *  so a disabled plugin or an empty roster costs zero frames. */
export { type BudgetedLoop, type BudgetedLoopOptions, createBudgetedLoop } from '@/lib/budgeted-loop'
/** The blank transcript as a contribution area: claim the sessions you own and
 *  render what stands in the gap. Core's own splash keeps a fresh draft. */
export { CHAT_EMPTY_AREA, type ChatEmptyContribution, type ChatEmptyProps } from '@/lib/chat-empty'
/** THE compact-number formatter — every user-facing count/token figure goes
 *  through here (1230 → "1.2k", 1_500_000 → "1.5M"). Don't hand-roll `/1000`. */
export { compactNumber } from '@/lib/format'
/** THE confirm flow for guarded model switches — when a gateway model-switch
 *  RPC answers `confirm_required` (data-policy / expensive-model guard),
 *  route it through this shared applier instead of forking a per-surface
 *  dialog: it shows the warning and resends with
 *  `confirm_expensive_model: true` on Confirm (#95293). */
export {
  type GuardedModelSwitchResult,
  surfaceModelSwitchConfirm,
  type SurfaceModelSwitchConfirmOptions
} from '@/lib/guarded-model-switch'
export { triggerHaptic as haptic } from '@/lib/haptics'
export type { HermesOpenTarget } from '@/lib/hermes-open-target'
/** Grab-to-pan for overflow containers (boards, timelines, wide tables) —
 *  the shared scrub primitive; don't hand-roll drag-to-scroll. */
export { type GrabScroll, useGrabScroll } from '@/lib/hooks/use-grab-scroll'
/** The app's lucide icon set (RefreshCw, LayoutDashboard, Activity, …). */
export * as icons from '@/lib/icons'
export { type KeybindContribution, KEYBINDS_AREA } from '@/lib/keybinds/actions'
export { formatModifierToken } from '@/lib/keybinds/combo'

export const PANES_AREA = 'panes'
/** A `Map` with a ceiling, for the module-level caches a plugin keeps across
 *  a renderer that stays open for days. Only for values that can be
 *  regenerated — eviction costs a recompute or a refetch, never correctness. */
export { LruCache } from '@/lib/lru-cache'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' } as const
export const TITLEBAR_AREAS = { center: 'titleBar.center', left: 'titleBar.left', right: 'titleBar.right' } as const

/** The app's deterministic identity color for a name (profiles, assignees,
 *  authors), its translucent tag fill, and the curated picker swatches — so
 *  plugin-rendered identities read the same hue as everywhere else. The
 *  swatches share the deterministic palette's saturation/lightness, so a
 *  hand-picked color still sits with the generated ones; reach for them
 *  instead of literal hex, which can't follow the theme. */
export { PROFILE_SWATCHES, profileColor, profileColorSoft } from '@/lib/profile-color'
/** The shared client itself, for invalidation OUTSIDE React (e.g. a
 *  `ctx.socket` frame invalidating a query). Inside components keep using
 *  `useQueryClient`. */
export { queryClient } from '@/lib/query-client'
/** Hermes' reasoning levels + their compact labels, so a plugin surfacing a
 *  thinking depth uses the same scale and spelling as the rest of the app. */
export {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORT_VALUES,
  REASONING_EFFORTS,
  type ReasoningEffort,
  reasoningEffortLabel
} from '@/lib/reasoning-effort'
/** The app's own gateway-readiness evaluation (setup.status +
 *  setup.runtime_check, reconciled) — pass `host.request`. Don't hand-roll
 *  readiness from raw RPC shapes. */
export { evaluateRuntimeReadiness, type RuntimeReadinessResult } from '@/lib/runtime-readiness'
/** Canonical time formatting — every surface pulls from here so timestamps read
 *  the same app-wide. For a row's AGE, bucket with `coarseElapsed` and render
 *  the compact suffixes (`t.sidebar.row.ageMin` → "52m"), which is what the
 *  session rows beside you do; `formatAgo` is the same buckets with an " ago"
 *  suffix. `relativeTime` is the bidirectional Intl form ("in 14 hr") — use it
 *  for a scheduled next-run, not for an age. */
export { type AgoLabels, coarseElapsed, fmtDateTime, fmtDayTime, formatAgo, relativeTime } from '@/lib/time'
/** The transcript as a contribution area: register a named `::directive{...}`
 *  and the model can render your component inline in assistant messages. */
export {
  TRANSCRIPT_DIRECTIVE_AREA,
  type TranscriptDirectiveContribution,
  type TranscriptDirectiveProps
} from '@/lib/transcript-directives'
export { cn } from '@/lib/utils'
/** THE unread store behind `SessionStatusDot`'s emerald dot. A plugin that
 *  learns out-of-band that a session produced something the user hasn't seen
 *  (a roster poll's activity watermark, say) writes HERE rather than keeping
 *  its own unread map — core's dot only paints what this store claims, and a
 *  parallel map means a second badge that drifts. Works for sessions core
 *  cannot see: a hidden session is never in the session list, so the backend
 *  watermark can never claim it, but the transient marker resolves to the id
 *  you pass. Key every call by the SAME stored id you hand the dot.
 *  `markSessionUnreadFinished` lights it, `ackStoredSessionId` clears it when
 *  the user opens the session, `forgetSessionUnread` drops it when the session
 *  is gone. Pass the owning profile — a hidden session has no row to read it
 *  from, and the persisted half is bucketed per profile. */
export { ackStoredSessionId, forgetSessionUnread, markSessionUnreadFinished } from '@/store/session-unread'
/** OKLCH colour maths, for anything deriving a palette rather than hardcoding
 *  one: perceptual conversion, the sRGB gamut boundary, WCAG contrast, and
 *  hue-stable blending. */
export {
  contrastRatio,
  hexToOklch,
  hueDelta,
  maxChroma,
  mixOklab,
  normalizeHex,
  type Oklch,
  oklchToHex,
  oklchToSrgb255,
  readableOn
} from '@/themes/color'
/** The painted theme, its name, and the appearance it resolved to — plus
 *  `setTheme` / `setMode` to change it from a component. */
export { useTheme } from '@/themes/context'
export { retintTheme, themeHue } from '@/themes/retint'
export type { DesktopTheme, DesktopThemeColors } from '@/themes/types'
export type { RpcEvent, StatusResponse } from '@/types/hermes'
/** Subscribe a component to a `host.state` atom. */
export { useStore as useValue } from '@nanostores/react'
/** The app's data-fetching layer. Plugins share the ONE QueryClient mounted at
 *  the app root, so their queries cache, dedupe, poll (`refetchInterval`), and
 *  invalidate exactly like core screens — no hand-rolled atoms or polls. */
export { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
/** Deterministic soft-body avatars from any string (name → face). String
 *  renderer for rasterization; React component for live rendering. */
export { blobatar as blobatarSvg } from 'blobatar/blob'
export { Blobatar } from 'blobatar/react'
/** Plugin-local reactive state (share between a trigger and its panel, poll
 *  loops, cross-component signals) — the same primitive `host.state` uses. */
export { atom, computed } from 'nanostores'
/** Markdown renderer (same pipeline core chat surfaces use) so plugins render
 *  message text as a preview instead of raw Markdown source. */
export { Streamdown } from 'streamdown'
