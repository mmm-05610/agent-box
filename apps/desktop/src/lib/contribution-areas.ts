import type { IconComponent } from '@/lib/icons'

/**
 * Contribution area vocabulary — the pure DATA half of the registry's areas:
 * an area id and its payload type, with no React, no state and no behaviour.
 * Filed in `lib/` (beside `KEYBINDS_AREA`, `CHAT_EMPTY_AREA`) so both the
 * plugin ABI and the feature that owns the area can name them without an
 * upward edge; the behaviour that consumes each area stays in `app/`.
 */

// ── Contributed routes — the `routes` registry area ─────────────────────────
// A contribution mounts a FULL PAGE in the workspace pane at `data.path`
// (`render` on the contribution itself, like every other area). Contributed
// paths are reserved exactly like APP_ROUTES so the session-id parser never
// mistakes them for a session route. Navigate with `host.navigate(path)`.

export const ROUTES_AREA = 'routes'

/** Payload of a `routes` contribution's `data`. */
export interface RouteContribution {
  /** Absolute path, e.g. `/kanban`. One segment; no params. */
  path: string
}

// ── Contributed sidebar nav — the `sidebar.nav` registry area ────────────────
// A DATA contribution adds a row to the sidebar's top nav (below Artifacts).
// Pair with a ROUTES_AREA page: the row navigates to `path` and lights up
// while the app is there.

export const SIDEBAR_NAV_AREA = 'sidebar.nav'

/** Payload of a `sidebar.nav` data contribution. */
export interface SidebarNavContribution {
  /** Codicon name, e.g. `'project'`. */
  codicon: string
  label: string
  /** Route to navigate to (usually a contributed page's path). */
  path: string
}

// ── Command palette — the `palette` registry area ────────────────────────────
// `palette` data contributions become rows in the ⌘K root list, same schema as
// every other area. Contributions with an `action` id render that action's
// live keybind as their hotkey hint.

export const PALETTE_AREA = 'palette'

/** Payload of a `palette` data contribution. */
export interface PaletteContribution {
  id: string
  label: string
  /** Keybind action id — its live combo renders as the hotkey hint. */
  action?: string
  icon?: IconComponent
  keywords?: string[]
  run: () => void
  /**
   * Short note after the label — the live state the row acts on. A function
   * because contributions register once at boot while that state keeps moving;
   * the palette re-reads it on open.
   */
  detail?: () => string
  /** `state` when running the row CHANGES what `detail` says. */
  detailVariant?: 'muted' | 'state'
  /** Leave the palette open after running — for rows you may run repeatedly. */
  keepOpen?: boolean
}

// ── Composer areas ───────────────────────────────────────────────────────────
// Every seam of the composer is hook-into-able through the SAME registry
// schema as every other surface (statusbar, titlebar, panes, layouts):
//
//   render areas (`render`):  composer.top       — banner strip above the input
//                             composer.bottom    — row below the input grid
//                             composer.underside — floating strip BELOW the
//                                                  whole composer (no chrome)
//                             composer.leading   — inline after the "+" menu
//                             composer.actions   — inline before the model pill
//
//   data kinds (`data`):      composer.middleware    (ComposerMiddleware)
//                             composer.attachments   (ComposerAttachmentProvider)
//                             composer.microActions  (ComposerMicroActionProvider)

export const COMPOSER_AREAS = {
  top: 'composer.top',
  bottom: 'composer.bottom',
  underside: 'composer.underside',
  leading: 'composer.leading',
  actions: 'composer.actions',
  middleware: 'composer.middleware',
  attachments: 'composer.attachments',
  microActions: 'composer.microActions',
  atCompletions: 'composer.atCompletions'
} as const
