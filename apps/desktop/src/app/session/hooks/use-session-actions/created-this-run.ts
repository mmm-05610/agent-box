// Stored ids created in THIS renderer run. A brand-new session lives only in the
// gateway's in-memory map until its first turn persists a state.db row — so if a
// respawning/flapping backend drops it, both resume RPC and the REST transcript
// 404 even though the user just made it. We must NOT treat that as "gone" (which
// yanks them to a fresh draft — the "new sessions clear themselves" bug); the
// bounded retry rebinds it when the backend returns. Boot-into-a-stale-last-id
// (NOT in this set) still legitimately drops to a draft.
const createdThisRun = new Set<string>()

export function markSessionCreatedThisRun(storedSessionId: string): void {
  createdThisRun.add(storedSessionId)
}

export function wasSessionCreatedThisRun(storedSessionId: string): boolean {
  return createdThisRun.has(storedSessionId)
}
