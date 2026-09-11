/**
 * The theme composition root.
 *
 * Every source the theme feature used to reach for itself is assembled HERE and
 * injected into the presenter, which is why the presenter can be a leaf:
 *
 *   which scope is active  ← the profile store (`$activeGatewayProfile`)
 *   what themes exist      ← user installs + backend skins + plugin contributions
 *   what the user picked   ← `themePreferences`, wrapping the storage-backed pref
 *   is the OS dark         ← the media query
 *   the dev accent override← `$accentOverride`
 *   where the paint goes   ← `themeAppearance` (root vars, native chrome, translucency)
 *
 * A backend-requested switch (`$pendingSkinApply`) is handed down as a one-shot
 * value and drained by the presenter, so an imperative switch normalizes,
 * persists per profile and drops any preview exactly like a manual pick — one
 * policy, one owner.
 *
 * Nothing in `src/themes/` imports back into this file; the dependency runs one
 * way, from the composition down into the leaf.
 */

import { useStore } from '@nanostores/react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { $registryVersion } from '@/contrib/registry'
import { useMediaQuery } from '@/hooks/use-media-query'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $activeGatewayProfile } from '@/store/profile/runtime-route-state'
import { ThemePresenter } from '@/themes/context'
import type { ThemePreferences } from '@/themes/ports'

import { $accentOverride } from './adapters/accent-override'
import { $backendThemes, $pendingSkinApply } from './adapters/backend-sync'
import { rememberScope } from './adapters/preferences'
import { themePreferences } from './adapters/preferences'
import { $userThemes, listAllThemes } from './adapters/user-themes'
import { themeAppearance } from './appearance-port'
import { paintStoredAppearance } from './boot'

// Avoid a flash before <ThemeProvider> mounts: paint the stored appearance on
// frame one, while this module is still being evaluated.
if (typeof window !== 'undefined') {
  paintStoredAppearance()
}

export function ThemeProvider({ children }: { children?: ReactNode }) {
  // Skin + mode are assigned per profile; the active profile drives which
  // appearance shows. Single-profile users only ever see "default", so their
  // behavior is unchanged.
  const activeScope = normalizeProfileKey(useStore($activeGatewayProfile))

  // Built-ins + user-installed + registry-contributed themes. Reactive so an
  // import or a plugin registration shows up live in the palette, settings grid,
  // and `/skin` without a reload.
  const userThemes = useStore($userThemes)
  const backendThemes = useStore($backendThemes)
  const registryVersion = useStore($registryVersion)

  // userThemes + backendThemes + registryVersion ARE listAllThemes' reactivity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themes = useMemo(() => listAllThemes(), [userThemes, backendThemes, registryVersion])

  const [preferences, setPreferences] = useState<ThemePreferences>(() => themePreferences.read(activeScope))
  const [revision, setRevision] = useState(0)

  useEffect(() => themePreferences.subscribe(() => setRevision(value => value + 1)), [])

  // Follow profile switches, remember the scope for the next boot's first paint,
  // and pick up a peer window's write (`revision`).
  useEffect(() => {
    rememberScope(activeScope)
    setPreferences(themePreferences.read(activeScope))
  }, [activeScope, revision])

  // Read the live scope at call time, so a commit made right after a profile
  // switch lands on the profile that is actually active and the callback stays
  // stable across switches.
  const onPreferencesChange = useCallback((next: Partial<ThemePreferences>) => {
    const target = normalizeProfileKey($activeGatewayProfile.get())

    themePreferences.assign(target, next)
    setPreferences(themePreferences.read(target))
  }, [])

  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')

  // Drain a backend-driven skin switch (Hermes authoring/activating a skin from a
  // prompt, or `/skin` on another surface) by handing it to the presenter, which
  // commits it through the same door a manual pick uses.
  const pendingApply = useStore($pendingSkinApply)
  const onPendingApplyDrained = useCallback(() => $pendingSkinApply.set(null), [])

  const accentOverride = useStore($accentOverride)

  return (
    <ThemePresenter
      accentOverride={accentOverride}
      activeScope={activeScope}
      appearance={themeAppearance}
      availableThemes={themes}
      onPendingApplyDrained={onPendingApplyDrained}
      onPreferencesChange={onPreferencesChange}
      pendingApply={pendingApply}
      preferences={preferences}
      systemDark={systemDark}
    >
      {children}
    </ThemePresenter>
  )
}
