// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import type { listAllProfileSessions } from '@/hermes';
import { sessionTitle } from '@/lib/chat-runtime'
import {
  type IconComponent,
  Monitor,
  Moon,
  Sun
} from '@/lib/icons'
import { type ThemeMode } from '@/themes/context'

import {
  type SessionEntry,
} from './palette-model'

export const SESSION_ID_RE = /^\d{8}_\d{6}_[a-f0-9]{6}$/

export const FOLDER_PATH_RE = /^(\/|[A-Za-z]:[/\\]).+/

export type SessionRow = Awaited<ReturnType<typeof listAllProfileSessions>>['sessions'][number]

export const toSessionEntry = (session: SessionRow): SessionEntry => ({
  git_branch: session.git_branch ?? null,
  id: session.id,
  preview: session.preview ?? undefined,
  title: sessionTitle(session)
})

export const THEME_MODES: ReadonlyArray<{ icon: IconComponent; mode: ThemeMode }> = [
  { icon: Sun, mode: 'light' },
  { icon: Moon, mode: 'dark' },
  { icon: Monitor, mode: 'system' }
]
