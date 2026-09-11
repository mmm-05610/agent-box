import { createContext, useContext } from 'react'

import type { PaneLifecycle } from './pane-lifecycle'

/** React face of the same policy: the pane layer provides its visibility so a
 *  kept-alive surface can gate hot subscriptions (streaming re-renders) off
 *  while it's an inactive tab. Default TRUE — surfaces outside a tab stack
 *  (secondary windows, plain routes) are always visible. */
export const PaneVisibleContext = createContext(true)

export const usePaneVisible = (): boolean => useContext(PaneVisibleContext)

/** Lifecycle face for expensive descendants. Outside a pane tree the surface is
 * visible; hot-hidden panes stay mounted but can lower their render budget. */
export const PaneLifecycleContext = createContext<PaneLifecycle>('visible')

export const usePaneLifecycle = (): PaneLifecycle => useContext(PaneLifecycleContext)

/** Fallback group key for a surface rendered outside the layout tree (secondary
 *  windows, plain routes) — one bucket, since there are no sibling zones there
 *  to tell apart. */
export const NO_PANE_GROUP = 'window'

/** The layout-tree GROUP (zone) a pane is rendered in — the identity of "this
 *  set of tabs". Panes stacked as tabs share one group; each split zone is its
 *  own. State that should be per-zone rather than per-window or per-tab keys off
 *  this (see the composer pop-out). Follows a pane dragged between zones,
 *  because the provider is the zone that renders it. */
export const PaneGroupContext = createContext(NO_PANE_GROUP)

export const usePaneGroup = (): string => useContext(PaneGroupContext)
