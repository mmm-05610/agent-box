import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  HUD_HEADING,
  HUD_ITEM,
  HUD_NOTE,
  HUD_NOTE_VARIANT,
  HUD_POSITION,
  HUD_SURFACE,
  HUD_TEXT
} from '@/app/floating-hud'
import { SESSION_IMPORT_ROUTE } from '@/app/routes'
import { codiconIcon } from '@/components/ui/codicon'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { HighlightMatches } from '@/components/ui/highlight-matches'
import { KbdCombo } from '@/components/ui/kbd'
import { getHermesConfigRecord, listAllProfileSessions } from '@/hermes'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useI18n } from '@/i18n'
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
import { getServers } from '@/lib/mcp-servers'
import { cn } from '@/lib/utils'
import { resolveVersionStatus } from '@/lib/version-status'
import { $repoWorktrees } from '@/store/coding-status'
import {
  $commandPaletteOpen,
  $commandPalettePage,
  $commandPaletteSeed,
  closeCommandPalette,
  setCommandPaletteOpen
} from '@/store/command-palette'
import { $bindings, bindingsFor } from '@/store/keybinds'
import { $dismissedAutoProjectIds, filterVisibleProjects } from '@/store/layout'
import { openPetGenerate } from '@/store/pet-generate'
import { openBrowserTab } from '@/store/preview'
import { $projectTree, goToProject, openFolderAsProject, requestStartWorkSession } from '@/store/projects'
import { $connection } from '@/store/session'
import { runGatewayRestart } from '@/store/system-actions'
import {
  $backendUpdateApply,
  $backendUpdateStatus,
  $desktopVersion,
  $updateApply,
  $updateStatus,
  requestActiveUpdate
} from '@/store/updates'
import { canOpenNewWindow, openNewWindow } from '@/store/windows'
import { luminance } from '@/themes/color'
import { type ThemeMode, useTheme } from '@/themes/context'
import { isUserTheme, resolveTheme } from '@/themes/user-themes'
import { openSession, openSessionIntentFromModifiers } from '../open-session'
import {
  AGENTS_ROUTE,
  ARTIFACTS_ROUTE,
  COMMAND_CENTER_ROUTE,
  CRON_ROUTE,
  MESSAGING_ROUTE,
  navigateToWorkspacePage,
  NEW_CHAT_ROUTE,
  PROFILES_ROUTE,
  SETTINGS_ROUTE,
  SKILLS_ROUTE,
  STARMAP_ROUTE
} from '../routes'
import { SECTIONS } from '../settings/constants'
import { type SettingsSearchEntry, settingsSearchTargetQuery } from '../settings/settings-search'
import { useSettingsSearchCatalog } from '../settings/use-settings-search'
import { usePaletteContributions } from './contrib'
import { HighlightWatcher } from './highlight-watcher'
import { MarketplaceThemePage } from './marketplace-theme-page'
import {
  PAGE_PARENTS,
  type PaletteGroup,
  type PaletteItem,
  type PalettePage,
  paletteValue,
  rankGroups,
  type SessionEntry,
} from './palette-model'
import { PetInlineToggle, PetPalettePage } from './pet-palette-page'
import {
  EMPTY_GROUPS,
  PaletteGroups,
  PaletteRow,
  NonConfigSettingsLabel,
  NON_CONFIG_SETTINGS,
  themeSupportsMode,
} from './palette-sources'

import {
  SESSION_ID_RE,
  FOLDER_PATH_RE,
  SessionRow,
  toSessionEntry,
  THEME_MODES,
} from './palette-helpers'
import { CommandPaletteBody } from './body'

export { CommandPaletteBody }
const EXIT_FALLBACK_MS = 1000
export function CommandPalette() {
  const open = useStore($commandPaletteOpen)
  const [mounted, setMounted] = useState(open)
  const [openCount, setOpenCount] = useState(0)

  const retire = useCallback(() => {
    // Only retire the body if the palette is still closed — a reopen mid-fade
    // must not unmount the fresh instance.
    if (!$commandPaletteOpen.get()) {
      setMounted(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setOpenCount(count => count + 1)
      setMounted(true)

      return
    }

    // Safety net for environments where the exit animation never runs (jsdom,
    // `animation: none`), so the body can't be stranded mounted. The real
    // unmount is `onExited` below; whichever fires first wins.
    const timer = setTimeout(retire, EXIT_FALLBACK_MS)

    return () => clearTimeout(timer)
  }, [open, retire])

  return (
    <DialogPrimitive.Root onOpenChange={setCommandPaletteOpen} open={open}>
      {mounted && <CommandPaletteBody key={openCount} onExited={retire} />}
    </DialogPrimitive.Root>
  )
}
