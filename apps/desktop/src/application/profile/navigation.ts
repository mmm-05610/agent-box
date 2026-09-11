import { activeGatewayConnectionId } from '@/store/gateway'
import { notifyError } from '@/store/notifications'
import { notifyRemoteOverrideAuthFailure } from '@/store/profile-remote-override'
import { $profileOrder, sortByProfileOrder } from '@/store/profile/appearance-preferences'
import { $activeProfile, $profiles, setActiveProfile } from '@/store/profile/catalog-state'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $newChatProfile, $newChatRoute } from '@/store/profile/new-chat-state'
import { requestFreshSession } from '@/store/profile/request-atoms'
import { $activeGatewayProfile } from '@/store/profile/runtime-route-state'
import { $showAllProfiles } from '@/store/profile/sidebar-scope'

import { activateOnCurrentSource, profilePickConnectionId } from './gateway-routing'
import { captureNewChatSource } from './new-session'

// Moving the user between profiles: a rail click, a hotkey, or the legacy
// relaunch door. Every one of them is a workspace switch — the shell stays
// put and only the gateway-bound view is re-homed (apps/desktop/AGENTS.md).

// Switch the active context to `name`: leave "All profiles" mode, point new
// chats at it, and swap the single live gateway onto its backend (which moves
// $activeGatewayProfile → name, so $profileScope follows).
export function selectProfile(name: string): void {
  const target = normalizeProfileKey(name)
  // Switching profiles (or coming back from the all-profiles browse view) starts
  // fresh; re-tapping the profile you're already in leaves your session be.
  const switching = $showAllProfiles.get() || target !== normalizeProfileKey($activeGatewayProfile.get())
  $showAllProfiles.set(false)
  $newChatProfile.set(target)
  $newChatRoute.set(null)
  // Clearing the agent route must NOT discard the registry identity: the pick
  // is made on the source the user is looking at (activateOnCurrentSource
  // dials exactly that pair), so the draft's exact owner is that pair — or the
  // legacy profile-only path when that is the door the pick takes.
  captureNewChatSource(profilePickConnectionId(target))

  if (switching) {
    requestFreshSession()
  }

  // A profile with a remote override can fail to activate because the remote
  // host rejected its saved token (rotated/revoked). That must surface as a
  // "re-enter token" affordance, never a silently dead profile (#91349).
  // #81094: any other failed switch must be visible too — the profile pill
  // stays on the previous profile and the user learns why the backend is
  // unreachable.
  //
  // The profile rail is a live workspace switch, so it must not call
  // profile.set() and reload the window. Once activation succeeds, remember
  // the selection for the next Desktop launch through the persistence-only
  // IPC instead (#79886). Registry-source picks name ANOTHER source's
  // profiles, so only a primary-backend activation updates the startup
  // preference.
  const onPrimary = activeGatewayConnectionId() == null

  const shouldRememberStartupProfile = onPrimary ? isLocalDesktopProfile(target) : Promise.resolve(false)

  void Promise.all([activateOnCurrentSource(target), shouldRememberStartupProfile])
    .then(([, shouldRemember]) => {
      if (shouldRemember) {
        return window.hermesDesktop?.profile?.remember(target)
      }

      return undefined
    })
    .catch((error: unknown) => {
      if (!notifyRemoteOverrideAuthFailure(target, error)) {
        notifyError(error, `Failed to switch to profile "${target}"`)
      }
    })
}

// Resolve persistence from the saved per-profile Desktop route, rather than the
// live backend descriptor. A descriptor lookup is intentionally best-effort:
// failure must not discard a successful local selection's startup preference.
// Conversely, `ssh`, `remote`, and `cloud` here are per-profile overrides and
// must never replace the local Desktop startup profile.
async function isLocalDesktopProfile(target: string): Promise<boolean> {
  const getConnectionConfig = window.hermesDesktop?.getConnectionConfig

  if (!getConnectionConfig) {
    return true
  }

  try {
    return (await getConnectionConfig(target)).mode === 'local'
  } catch {
    // Preserve the pre-fix local-primary behavior when Electron's config bridge
    // is temporarily unavailable. The next successful config read will still
    // exclude any remote override.
    return true
  }
}

// Persist the choice and relaunch the backend under the new HERMES_HOME. The
// main process reloads the window, so this normally never returns to the caller
// (the renderer is torn down). We optimistically reflect the selection first so
// the pill updates instantly if the reload is delayed.
export async function switchProfile(name: string): Promise<void> {
  if (!name || name === $activeProfile.get()) {
    return
  }

  setActiveProfile(name)
  await window.hermesDesktop.profile.set(name)
}

// ── Hotkey-driven profile switching ────────────────────────────────────────
// Positional + relative navigation for the rail, used by the keybind runtime.
// The ordered list is [default, ...named-in-rail-order]; switching is a no-op
// when the slot is empty so unused ⌘N keys stay harmless.

function orderedProfileKeys(): string[] {
  const profiles = $profiles.get()

  const named = sortByProfileOrder(
    profiles.filter(profile => !profile.is_default),
    $profileOrder.get()
  ).map(profile => normalizeProfileKey(profile.name))

  const hasDefault = profiles.some(profile => profile.is_default)

  return hasDefault ? ['default', ...named] : named
}

// Switch to the default (root ~/.hermes) profile — bound to ⌘1.
export function switchToDefaultProfile(): void {
  const def = $profiles.get().find(profile => profile.is_default)

  selectProfile(def ? def.name : 'default')
}

// Switch to the Nth named (non-default) profile in rail order (1-based).
export function switchProfileToSlot(slot: number): void {
  const named = sortByProfileOrder(
    $profiles.get().filter(profile => !profile.is_default),
    $profileOrder.get()
  )

  const target = named[slot - 1]

  if (target) {
    selectProfile(target.name)
  }
}

// Step to the next/previous profile in the rail, wrapping around.
export function cycleProfile(direction: 1 | -1): void {
  const keys = orderedProfileKeys()

  if (keys.length < 2) {
    return
  }

  const current = $showAllProfiles.get() ? -1 : keys.indexOf(normalizeProfileKey($activeGatewayProfile.get()))
  const start = current < 0 ? (direction === 1 ? -1 : 0) : current
  const next = (start + direction + keys.length) % keys.length

  selectProfile(keys[next])
}
