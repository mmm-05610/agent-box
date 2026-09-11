/**
 * The pane-chrome CONTRACT, render half — the tab callbacks only the strip
 * (`renderer/tree-group.tsx`) invokes. Split from the data flags in
 * `@/lib/pane-shell/chrome` so the pure model can live below `components/`
 * without naming a component-kit type.
 */

import type * as React from 'react'

import type { MenuKit } from '@/components/ui/actions-menu'
import { paneChrome, type PaneChromeData } from '@/lib/pane-shell/chrome'
import type { Contribution } from '@/types/contributions'

export interface PaneChromeRender extends PaneChromeData {
  /** Wrap this pane's TAB (e.g. in a domain context menu — a session tile's
   *  pin/branch/rename/archive/delete). The wrapper must render `tab` as its
   *  interactive child; the zone's own strip menu still owns non-tab space. */
  tabWrap?: (tab: React.ReactElement) => React.ReactNode
  /** Extra rows at the top of the zone tab menu. Called when the menu opens
   *  against the right-clicked pane — a Browser tab's Open-in-external, without
   *  replacing Reload / Close / the strip. */
  tabMenuPrefix?: (kit: MenuKit) => React.ReactNode
  /** Override this pane's TAB drag (a session tab drags like a sidebar row —
   *  stack / split / composer-link — not the generic pane move). Given the
   *  tab's tap (activate) so that gesture survives. Returns whether it took the
   *  drag; `false` (or absent) defers to `startPaneDrag` — e.g. the workspace
   *  tab on a fresh draft, nothing to link. */
  tabDrag?: (event: React.PointerEvent<HTMLElement>, onTap: () => void) => boolean
  /** A lead NODE for this pane's TAB, rendered before the label. A session
   *  pane (main workspace + tiles) passes its live `SessionStatusDot` here so
   *  the tab and the sidebar row render status/color from the ONE primitive
   *  (self-subscribing — it updates without the strip re-registering). */
  tabLead?: () => React.ReactNode
  /** Mint another tab of THIS pane's kind — the strip's "+" while this pane is
   *  active. A Browser tab makes another Browser tab; a pane that is one of a
   *  kind (a file peek) leaves it absent and the strip falls back to the chat
   *  "+" if the zone holds session tabs. */
  newTab?: () => void
  /** This pane's TAB LABEL, when it changes faster than the contribution
   *  should. A session pane whose draft is being typed renames on every
   *  debounce beat; re-registering `title` that often would re-render the
   *  whole panes area, so the label subscribes for itself instead. Absent, or
   *  returning nothing, falls back to `title`. */
  tabTitle?: () => React.ReactNode
}

export const paneChromeRender = (c: Contribution | undefined) => paneChrome(c) as PaneChromeRender
