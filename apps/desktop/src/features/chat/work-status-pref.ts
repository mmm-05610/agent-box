import { atom } from 'nanostores'

/**
 * P20 work-status panel placement preference. The renderer may remember the
 * user's own choice (collapsed / expanded / closed) — a presentation fact about
 * THIS user's window, the same narrow lease `panes.ts` holds. It is never a
 * substitute for a service fact and never leaves this device.
 */

const STORAGE_KEY = 'agentbox.work-status-panel'

export type WorkStatusPanelMode = 'closed' | 'collapsed' | 'expanded'

export const $workStatusPanelMode = atom<WorkStatusPanelMode>('collapsed')

let hydrated = false

/** Read the user's last choice once per renderer. Anything unparsable is the
 *  default (collapsed single line) — a corrupt value never becomes an error
 *  surface. */
export function hydrateWorkStatusPanelMode(): void {
  if (hydrated) {
    return
  }

  hydrated = true

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (raw === 'closed' || raw === 'collapsed' || raw === 'expanded') {
      $workStatusPanelMode.set(raw)
    }
  } catch {
    // storage unavailable (private mode etc.) — the default stands
  }
}

export function setWorkStatusPanelMode(mode: WorkStatusPanelMode): void {
  $workStatusPanelMode.set(mode)

  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // the in-memory choice still holds for this session
  }
}
