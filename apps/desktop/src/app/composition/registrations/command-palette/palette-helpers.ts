// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import {
  type IconComponent,
  Monitor,
  Moon,
  Sun
} from '@/lib/icons'
import { type ThemeMode } from '@/themes/context'
import type { SessionRecord } from '@/types/wire/wire-v1'

export const SESSION_ID_RE = /^\d{8}_\d{6}_[a-f0-9]{6}$/

export const FOLDER_PATH_RE = /^(\/|[A-Za-z]:[/\\]).+/

/**
 * The command palette's session rows: the service's SessionRecords, projected
 * from the renderer cache itself. Nothing is invented — no legacy preview,
 * branch, title, token or cost field exists on a SessionRecord, and a missing
 * record is an honestly empty row list, not a reason to enumerate another
 * backend.
 *
 * Order is the service's own facts, same as the sidebar projection: pinned
 * first, then newest activity (`updatedAt`, an ISO instant so string order is
 * time order), with the session id as the stable tie-break so equal stamps
 * never reshuffle.
 */
export function projectAgentBoxPaletteSessions(
  sessions: Readonly<Record<string, SessionRecord>>
): SessionRecord[] {
  const pinned: SessionRecord[] = []
  const recent: SessionRecord[] = []

  for (const session of Object.values(sessions)) {
    if (session.archivedAt !== null) {
      continue
    }

    ;(session.pinned ? pinned : recent).push(session)
  }

  const newestFirst = (a: SessionRecord, b: SessionRecord) => {
    const byUpdatedAt = b.updatedAt.localeCompare(a.updatedAt)

    return byUpdatedAt !== 0 ? byUpdatedAt : a.id.localeCompare(b.id)
  }

  pinned.sort(newestFirst)
  recent.sort(newestFirst)

  return [...pinned, ...recent]
}

export const THEME_MODES: ReadonlyArray<{ icon: IconComponent; mode: ThemeMode }> = [
  { icon: Sun, mode: 'light' },
  { icon: Moon, mode: 'dark' },
  { icon: Monitor, mode: 'system' }
]
