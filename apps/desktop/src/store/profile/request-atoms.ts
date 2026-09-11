import { atom } from 'nanostores'

// Bump-atoms: a counter a surface increments to ASK another surface to do
// something, and the subscriber that reacts. They carry no payload by design —
// the request is "do it again" and the owning surface reads its own state.

// Bumped whenever the open session should be dropped for a fresh new-session
// draft: a profile switch/create (application/profile/navigation), or deleting
// the project that owns the currently-open session (store/projects). The chat
// controller subscribes and resets to the intro draft, so we never strand the
// user in an orphaned view.
export const $freshSessionRequest = atom(0)

export function requestFreshSession(): void {
  $freshSessionRequest.set($freshSessionRequest.get() + 1)
}

// Bumped to ask the rail to open its "create profile" dialog (the dialog state
// is local to the rail component; this lets a global hotkey trigger it).
export const $profileCreateRequest = atom(0)

export function requestProfileCreate(): void {
  $profileCreateRequest.set($profileCreateRequest.get() + 1)
}
