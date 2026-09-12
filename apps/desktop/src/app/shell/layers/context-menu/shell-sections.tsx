import type { ReactNode } from 'react'
import type { useNavigate } from 'react-router'

import { navigateToWorkspacePage, NEW_CHAT_ROUTE, SETTINGS_ROUTE } from '@/app/routes'
import { type Translations } from '@/i18n'
import { openCommandPalette } from '@/store/command-palette'
import { toggleTargetZoneTabStrip } from '@/store/pane-shell/tree'
import { toggleStatusbarVisible } from '@/store/statusbar-prefs'
import { requestActiveUpdate } from '@/store/updates'
import { canOpenNewWindow, openNewWindow } from '@/store/windows'

import { Item } from './item'

export type ShellVerbs = {
  navigate: ReturnType<typeof useNavigate>
  t: Translations
}

/** Bare right-click on app chrome: the window verbs (the old shell fallback). */
export function shellSections({ navigate, t }: ShellVerbs): ReactNode[][] {
  return [
    [
      <Item
        icon="add"
        key="shell-new-chat"
        label={t.commandCenter.nav.newChat.title}
        onSelect={() => navigateToWorkspacePage(navigate, NEW_CHAT_ROUTE)}
      />,
      canOpenNewWindow() ? (
        <Item
          icon="multiple-windows"
          key="shell-new-window"
          label={t.keybinds.actions['session.newWindow']}
          onSelect={() => void openNewWindow()}
        />
      ) : null,
      <Item icon="search" key="shell-palette" label={t.commandCenter.paletteTitle} onSelect={openCommandPalette} />
    ].filter(Boolean),
    [
      <Item
        icon="layout-statusbar"
        key="shell-statusbar"
        label={t.keybinds.actions['view.toggleStatusbar']}
        onSelect={toggleStatusbarVisible}
      />,
      // The pointer-only way back to a hidden tab strip: right-clicking the
      // shell reaches this menu from anywhere, including a zone that has no
      // chrome left to right-click.
      <Item
        icon="layout-menubar"
        key="shell-tabstrip"
        label={t.keybinds.actions['view.toggleTabStrip']}
        onSelect={() => void toggleTargetZoneTabStrip()}
      />,
      <Item
        icon="settings-gear"
        key="shell-settings"
        label={t.commandCenter.settings}
        onSelect={() => navigateToWorkspacePage(navigate, SETTINGS_ROUTE)}
      />
    ],
    [
      <Item
        icon="cloud-download"
        key="shell-update"
        label={t.commandCenter.updateHermes}
        onSelect={requestActiveUpdate}
      />
    ]
  ]
}
