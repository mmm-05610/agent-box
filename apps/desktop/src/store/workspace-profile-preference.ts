import { atom } from 'nanostores'

const STORAGE_KEY = 'agentbox:workspace-profile:v1'

function loadPreferences(): Record<string, string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as unknown

    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => Boolean(entry[0].trim()) && typeof entry[1] === 'string' && Boolean(entry[1].trim())
      )
    )
  } catch {
    return {}
  }
}

export const $workspaceProfilePreferences = atom<Record<string, string>>(loadPreferences())

export function rememberWorkspaceProfile(workspaceId: string, profileId: string): void {
  const workspace = workspaceId.trim()
  const profile = profileId.trim()

  if (!workspace || !profile) {
    return
  }

  const next = { ...$workspaceProfilePreferences.get(), [workspace]: profile }
  $workspaceProfilePreferences.set(next)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best effort. An unavailable storage backend must not block selection.
  }
}
