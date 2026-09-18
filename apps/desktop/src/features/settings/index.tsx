import { useStore } from '@nanostores/react'
import { useEffect, useMemo } from 'react'

import { OverlayMain, OverlayNav, type OverlayNavGroup, OverlaySplitLayout } from '@/app/shell/layers/overlays/overlay-split-layout'
import { OverlayView } from '@/app/shell/layers/overlays/overlay-view'
import { useRouteEnumParam } from '@/components/hooks/use-route-enum-param'
import { KbdCombo } from '@/components/ui/kbd'
import { typeToFocusChar } from '@/features/chat/composer/focus-keys'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Archive, Bell, Cpu, Info, Keyboard, Package, Palette, Zap, Search, Users, Wrench } from '@/lib/icons'
import { isEditableTarget } from '@/lib/keybinds/combo'
import { cn } from '@/lib/utils'
import { $commandPaletteOpen, openCommandPalettePage } from '@/store/command-palette'
import { bindingsFor } from '@/store/keybinds'

import { AboutSettings } from './about-settings'
import { AppearanceSettings } from './appearance-settings'
import { KeybindSettings } from './keybind-settings'
import { NotificationsSettings } from './notifications-settings'
import { ProductSettings } from './product-settings'
import {
  ACTIVE_SETTINGS_VIEWS,
  LEGACY_SETTINGS_REDIRECTS,
  type ProductSettingsView,
  resolveSettingsView
} from './settings-navigation'
import type { SettingsPageProps, SettingsView as SettingsViewId } from './types'

const SETTINGS_ICONS = {
  'product:data': Archive,
  'product:harnesses': Wrench,
  'product:hooks': Zap,
  'product:identities': Users,
  'product:models': Cpu,
  'product:resources': Package
} as const

const SETTINGS_VIEWS: readonly SettingsViewId[] = [
  ...ACTIVE_SETTINGS_VIEWS,
  ...Object.keys(LEGACY_SETTINGS_REDIRECTS)
] as SettingsViewId[]

export function SettingsView({ authority, onClose }: SettingsPageProps) {
  const { t } = useI18n()
  const [routeView, setRouteView] = useRouteEnumParam('tab', SETTINGS_VIEWS, 'product:models')
  const activeView = resolveSettingsView(routeView)

  useEffect(() => {
    if (activeView !== routeView) {
      setRouteView(activeView)
    }
  }, [activeView, routeView, setRouteView])

  const navGroups: OverlayNavGroup[] = useMemo(
    () => [
      ...(
        [
          'product:models',
          'product:resources',
          'product:identities',
          'product:harnesses',
          'product:hooks',
          'product:data'
        ] as const
      ).map(
        view => ({
          active: activeView === view,
          icon: SETTINGS_ICONS[view],
          id: view,
          label: t.settings.product[view.slice('product:'.length) as ProductSettingsView].title,
          onSelect: () => setRouteView(view)
        })
      ),
      {
        active: activeView === 'appearance',
        gapBefore: true,
        icon: Palette,
        id: 'appearance',
        label: t.settings.sections.appearance,
        onSelect: () => setRouteView('appearance')
      },
      {
        active: activeView === 'notifications',
        icon: Bell,
        id: 'notifications',
        label: t.settings.nav.notifications,
        onSelect: () => setRouteView('notifications')
      },
      {
        active: activeView === 'keybinds',
        icon: Keyboard,
        id: 'keybinds',
        label: t.settings.nav.keybinds,
        onSelect: () => setRouteView('keybinds')
      },
      {
        active: activeView === 'about',
        gapBefore: true,
        icon: Info,
        id: 'about',
        label: t.settings.nav.about,
        onSelect: () => setRouteView('about')
      }
    ],
    [activeView, setRouteView, t]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ($commandPaletteOpen.get() || isEditableTarget(event.target)) {
        return
      }

      const char = typeToFocusChar(event)

      if (char === null || char === ' ') {
        return
      }

      event.preventDefault()
      openCommandPalettePage('settings', char)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const searchCombo = bindingsFor('nav.commandPalette')[0]
  const paletteOpen = useStore($commandPaletteOpen)

  const searchPill = (
    <button
      className={cn(
        'flex h-(--titlebar-control-height) items-center gap-1.5 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) px-2.5 text-(--ui-text-tertiary) shadow-sm transition-all duration-200 ease-out hover:text-foreground motion-reduce:transition-none',
        paletteOpen && 'pointer-events-none scale-110 opacity-0'
      )}
      data-glass-opaque=""
      onClick={() => {
        triggerHaptic('open')
        openCommandPalettePage('settings')
      }}
      tabIndex={paletteOpen ? -1 : undefined}
      type="button"
    >
      <Search className="size-3" />
      <span className="text-xs">{t.settings.search.pill}</span>
      {searchCombo && <KbdCombo combo={searchCombo} size="sm" variant="ghost" />}
    </button>
  )

  const activeSettingsContent =
    activeView === 'appearance' ? (
      // The authority rides through to the page itself: Appearance's resume /
      // terminal-font controls are Desktop-local under agentbox and
      // backend-config-backed under hermes, and that choice must not be
      // re-derived below (see appearance-settings.tsx).
      <AppearanceSettings authority={authority} />
    ) : activeView === 'about' ? (
      <AboutSettings />
    ) : activeView === 'keybinds' ? (
      <KeybindSettings />
    ) : activeView === 'notifications' ? (
      <NotificationsSettings />
    ) : (
      <ProductSettings view={activeView.slice('product:'.length) as ProductSettingsView} />
    )

  return (
    <OverlayView closeLabel={t.settings.closeSettings} edgeBadge={searchPill} onClose={onClose}>
      <OverlaySplitLayout>
        <OverlayNav groups={navGroups} />
        <OverlayMain className="px-0 pb-0">{activeSettingsContent}</OverlayMain>
      </OverlaySplitLayout>
    </OverlayView>
  )
}

export { SettingsView as SettingsPage }
