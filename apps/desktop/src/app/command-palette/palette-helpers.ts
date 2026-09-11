// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import { getHermesConfigRecord, listAllProfileSessions } from '@/hermes'
import { sessionTitle } from '@/lib/chat-runtime'
import {
  Activity,
  AppWindow,
  Archive,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  Egg,
  GitBranch,
  Globe,
  type IconComponent,
  Info,
  KeyRound,
  Layers3,
  MessageCircle,
  Monitor,
  Moon,
  Package,
  Palette,
  PawPrint,
  Plus,
  RefreshCw,
  Settings,
  Settings2,
  SlidersHorizontal,
  Starmap,
  Sun,
  Users,
  Wrench,
  Zap
} from '@/lib/icons'
import { type ThemeMode, useTheme } from '@/themes/context'
import {
  PAGE_PARENTS,
  type PaletteGroup,
  type PaletteItem,
  type PalettePage,
  paletteValue,
  rankGroups,
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
