// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  HUD_HEADING,
  HUD_ITEM,
  HUD_NOTE,
  HUD_NOTE_VARIANT,
  HUD_POSITION,
  HUD_SURFACE,
  HUD_TEXT
} from '@/app/floating-hud'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { HighlightMatches } from '@/components/ui/highlight-matches'
import { KbdCombo } from '@/components/ui/kbd'
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
import { cn } from '@/lib/utils'
import { $bindings, bindingsFor } from '@/store/keybinds'
import { luminance } from '@/themes/color'
import { isUserTheme, resolveTheme } from '@/themes/user-themes'
import {
  PAGE_PARENTS,
  type PaletteGroup,
  type PaletteItem,
  type PalettePage,
  paletteValue,
  rankGroups,
  type SessionEntry,
} from './palette-model'

export const EMPTY_GROUPS: PaletteGroup[] = []

export const PaletteGroups = memo(function PaletteGroups({
  bindings,
  groups,
  modHeld,
  noResultsLabel,
  onSelectItem,
  onSelectMods,
  search
}: {
  bindings: Record<string, string[]>
  groups: PaletteGroup[]
  modHeld: boolean
  noResultsLabel: string
  onSelectItem: (item: PaletteItem) => void
  onSelectMods: (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  search: string
}) {
  const deferred = useDeferredValue(groups, EMPTY_GROUPS)
  // While the rows are still catching up, an empty list means "not rendered
  // yet", not "nothing matched" — don't flash the empty state on open.
  const pending = deferred !== groups

  return (
    <>
      {/* Filtering happens in rankGroups, so cmdk's own CommandEmpty
          (keyed to its internal filter count) would never fire. */}
      {deferred.length === 0 && !pending && (
        <div className="py-6 text-center text-sm text-muted-foreground">{noResultsLabel}</div>
      )}
      {deferred.map((group, index) => (
        <CommandGroup className={HUD_HEADING} heading={group.heading} key={group.heading ?? `palette-group-${index}`}>
          {group.items.map(item => (
            <PaletteRow
              bindings={bindings}
              item={item}
              key={item.id}
              modHeld={modHeld}
              onSelectItem={onSelectItem}
              onSelectMods={onSelectMods}
              search={search}
            />
          ))}
        </CommandGroup>
      ))}
    </>
  )
})

export const PaletteRow = memo(function PaletteRow({
  bindings,
  item,
  modHeld,
  onSelectMods,
  onSelectItem,
  search
}: {
  bindings: Record<string, string[]>
  item: PaletteItem
  modHeld: boolean
  onSelectMods: (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
  onSelectItem: (item: PaletteItem) => void
  search: string
}) {
  const Icon = item.icon
  // The row's live keybind, else a static modifier-variant hint (⌘↵). One slot,
  // so every downstream `ml-auto` fallback below keeps working unchanged.
  // `bindingsFor`, not a raw lookup: a plugin's action is contributed after
  // $bindings was seeded, so its combo only resolves through the fallback chain.
  const combo = (item.action ? bindingsFor(item.action, bindings)[0] : undefined) ?? item.comboHint
  // While ⌘/⌃ is held, a row with a modifier variant previews it: the label
  // swaps to the variant's copy so Enter reads as what it will actually do.
  const modPreview = modHeld && Boolean(item.modLabel)

  return (
    <CommandItem
      className={cn(HUD_ITEM, HUD_TEXT)}
      keywords={item.keywords}
      onMouseDown={onSelectMods}
      onSelect={() => onSelectItem(item)}
      value={paletteValue(item)}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn('truncate', modPreview && 'text-muted-foreground/80')}>
        {modPreview ? (
          item.modLabel
        ) : (
          /* Same per-term split as scoreItem's AND matcher, so the emphasis
             shows exactly which words earned the row its rank. */
          <HighlightMatches query={search.split(/\s+/)} text={item.label} />
        )}
      </span>
      {item.detail && (
        <span className={cn(HUD_NOTE, HUD_NOTE_VARIANT[item.detailVariant ?? 'muted'])}>{item.detail}</span>
      )}
      {combo && (
        <KbdCombo className={cn('ml-auto', modPreview ? 'opacity-90' : 'opacity-55')} combo={combo} size="sm" />
      )}
      {item.to && <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground/70', !combo && 'ml-auto')} />}
      {item.active && <Check className={cn('size-3.5 shrink-0 text-primary', !combo && !item.to && 'ml-auto')} />}
    </CommandItem>
  )
})

export type NonConfigSettingsLabel =
  | 'about'
  | 'archivedChats'
  | 'gateway'
  | 'keysSettings'
  | 'keysTools'
  | 'mcp'
  | 'plugins'
  | 'providerAccounts'
  | 'providerApiKeys'

export const NON_CONFIG_SETTINGS: ReadonlyArray<{
  icon: IconComponent
  keywords?: string[]
  labelKey: NonConfigSettingsLabel
  tab: string
}> = [
  {
    icon: Zap,
    keywords: ['accounts', 'sign in', 'oauth', 'login', 'subscription', 'models', 'anthropic', 'openai'],
    labelKey: 'providerAccounts',
    tab: 'providers&pview=accounts'
  },
  {
    icon: KeyRound,
    keywords: ['providers', 'api key', 'keys', 'secrets', 'tokens', 'egress', 'iron proxy', 'sandbox proxy'],
    labelKey: 'providerApiKeys',
    tab: 'providers&pview=keys'
  },
  {
    icon: Globe,
    // The Connections registry merged into the unified Gateways page.
    keywords: [
      'connection',
      'connections',
      'messaging',
      'remote',
      'multi',
      'instances',
      'ssh',
      'cloud',
      'add gateway',
      'registry'
    ],
    labelKey: 'gateway',
    tab: 'gateway'
  },
  {
    icon: KeyRound,
    keywords: ['api', 'secrets', 'tokens', 'credentials', 'browser', 'search'],
    labelKey: 'keysTools',
    tab: 'keys&kview=tools'
  },
  {
    icon: Settings2,
    keywords: ['gateway', 'proxy', 'server', 'webhook', 'env', 'egress proxy', 'iron proxy'],
    labelKey: 'keysSettings',
    tab: 'keys&kview=settings'
  },
  {
    icon: Package,
    keywords: ['plugins', 'extensions', 'desktop plugins', 'addon', 'add-on'],
    labelKey: 'plugins',
    tab: 'plugins'
  },
  { icon: Archive, keywords: ['history', 'archived'], labelKey: 'archivedChats', tab: 'sessions' },
  { icon: Info, keywords: ['version', 'about'], labelKey: 'about', tab: 'about' }
]

export function themeSupportsMode(name: string, target: 'light' | 'dark'): boolean {
  if (!isUserTheme(name)) {
    return true
  }

  const resolved = resolveTheme(name)

  if (!resolved) {
    return true
  }

  const background =
    target === 'dark' ? (resolved.darkColors ?? resolved.colors).background : resolved.colors.background

  return target === 'dark' ? luminance(background) <= 0.5 : luminance(background) > 0.5
}
