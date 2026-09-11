/**
 * The pre-mount paint.
 *
 * Runs when this module is imported — i.e. at the top of `main.tsx`, before
 * React mounts — so the first frame is already the right palette instead of
 * flashing the default. It reads the LAST active scope's appearance (recorded
 * on every profile switch) so a non-default profile relaunch paints its own
 * skin + mode, and the OS appearance so `system` is honest on frame one.
 *
 * Exported so the behaviour is testable as a function rather than by
 * re-importing a module graph.
 */

import { matchesQuery } from '@/lib/hooks/use-media-query'
import { normalizeProfileKey } from '@/store/profile/identity'
import { resolveAppearance } from '@/themes/appearance'
import { normalizeSkinName, pickTheme } from '@/themes/resolve'

import { $accentOverride } from './adapters/accent-override'
import { modePref, storedScope, storedSkin } from './adapters/preferences'
import { listAllThemes } from './adapters/user-themes'
import { themeAppearance } from './appearance-port'

/** Paint the appearance the last session left behind, before anything mounts. */
export function paintStoredAppearance(): void {
  const scope = normalizeProfileKey(storedScope())
  const themes = listAllThemes()
  const preferences = { theme: storedSkin(scope), mode: modePref.resolve(scope) }

  themeAppearance.paint(
    resolveAppearance({
      theme: pickTheme(normalizeSkinName(preferences.theme, themes), themes),
      mode: preferences.mode,
      systemDark: matchesQuery('(prefers-color-scheme: dark)'),
      accentOverride: $accentOverride.get()
    })
  )
}
