/**
 * The pane-chrome CONTRACT, data half — the behavior flags a pane contributes
 * with its contribution `data`, read through `paneChrome`. The render-callback
 * half (the tab verbs only the strip invokes) lives beside its one reader, in
 * `components/pane-shell/tree/renderer/chrome-render.ts`.
 */

import type { FloatingAnchor } from '@/components/pane-shell/tree/renderer/floating-rect'
import type { Contribution } from '@/types/contributions'

/** Optional CSS sizing a pane contributes (`data.width` / `data.minWidth`…).
 *  Applied to the pane's GROUP along the axis of the split that contains it —
 *  the same semantics as the app's `Pane width/minWidth/maxWidth` props:
 *  a `width`/`height` makes the zone a FIXED track (sidebar-style — it keeps
 *  its size and the weighted zones absorb the rest); without one the zone
 *  shares leftover space by weight. */
export interface PaneSizing {
  width?: string
  height?: string
  minWidth?: string
  maxWidth?: string
  minHeight?: string
  maxHeight?: string
}

/** Chrome behavior flags a pane contributes. Read via `paneChrome`. */
export interface PaneChromeData extends PaneSizing {
  /** Leaves the grid on narrow viewports; revealed as an edge overlay. */
  collapsible?: boolean
  /** Arrive minimized — a rail tab rather than an open zone. For a pane that
   *  docks to an edge this is the vertical strip; the user's first expand is
   *  persisted on the zone and wins from then on. Applied when the pane ENTERS
   *  the tree, not on every boot, so it is a default and not an invariant. */
  defaultCollapsed?: boolean
  /** Extra ids accepted from PANE_TOGGLE_REVEAL_EVENT (the real app's pane
   *  ids, e.g. `chat-sidebar` for `sessions`). */
  revealAliases?: string[]
  /** Tiling role in the tree, or `'floating'` — the one NON-tiling placement:
   *  the pane is excluded from the tree entirely and rendered as a fixed card
   *  above it (see renderer/floating-panes.tsx). A floating pane takes no
   *  space from any zone, has no tab, and can't be docked or split. */
  placement?: string
  /** Spawn corner for `placement: 'floating'` (default `'top-right'`). The
   *  pane also TRACKS that corner's edges when the window resizes. */
  anchor?: FloatingAnchor
  /** Keep this pane mounted when hidden even after the zone's bounded hot
   *  cache fills. Reserved for stateful resources whose lifetime must not track
   *  tab visibility (for example terminal PTYs). */
  lifecycleKeepAlive?: boolean
  /** No Close in the tab menu — the one surface the app can't lose (the
   *  main workspace). Session tiles share `placement: 'main'` but close. */
  uncloseable?: boolean
  /** Standing chrome tab (sessions / Bots) with NO close verb at all: no ✕,
   *  no middle / ⌘-click, no Close menu rows. It is shown/hidden instead (the
   *  zone menu's Show/Hide rows and a ⌘K toggle, via `setStripTabHidden`).
   *  Close was too destructive for these: an accidental ✕ removed Bot Mode
   *  until the next launch. The ✕ follows the verb (see `PaneTab.onClose`),
   *  so dropping the verb here is what takes the chip off the tab. */
  hideOnly?: boolean
  /** Suppress the zone header while THIS pane is active — full-page views
   *  (artifacts/skills/plugin pages) are not tab-able surfaces. The flag is
   *  live: the workspace contribution re-registers it on route changes. */
  headerVeto?: boolean
}

export const paneChrome = (c: Contribution | undefined) => (c?.data ?? {}) as PaneChromeData
