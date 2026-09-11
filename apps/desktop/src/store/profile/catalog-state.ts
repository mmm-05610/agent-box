import { atom } from 'nanostores'

import type { ProfileInfo } from '@/types/hermes'

// The profile CATALOG as the renderer caches it: which profile the running
// local backend is scoped to, and the last list it served. Reading it is
// state; refreshing it is a request and lives in `application/profile/catalog`.

// The profile the running local backend is actually scoped to (mirrors
// /api/profiles/active `current`). "default" is the root ~/.hermes. This is the
// display source of truth for the statusbar pill; the desktop's *stored*
// preference (which may be unset) lives in the Electron main process.
export const $activeProfile = atom<string>('default')

// Cached profile list for the picker. Refreshed lazily; the dropdown also
// re-fetches on open so a profile created elsewhere shows up.
export const $profiles = atom<ProfileInfo[]>([])

export function setActiveProfile(name: string): void {
  $activeProfile.set(name || 'default')
}
