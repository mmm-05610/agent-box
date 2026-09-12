import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { domSections } from '@/app/shell/layers/context-menu/dom-sections'
import { guestSections } from '@/app/shell/layers/context-menu/guest-sections'
import { ContextMenuHost } from '@/app/shell/layers/context-menu/host'
import { shellSections } from '@/app/shell/layers/context-menu/shell-sections'
import {
  $contextMenu,
  openDomContextMenu,
  openTerminalContextMenu
} from '@/app/shell/layers/context-menu/store'
import { CONTEXT_MENU_SKIP_ATTR, resolveDomTarget } from '@/app/shell/layers/context-menu/target'
import { terminalMenuHandleFor } from '@/application/terminal/terminal-context-menu'
import { HERMES_CONTEXT_MENU_TRIGGER_ATTR } from '@/components/ui/context-menu'
import { terminalSections } from '@/features/right-sidebar/terminal/context-menu-sections'
import { useI18n } from '@/i18n'

/**
 * THE app context menu assembly (batch 30 C3): composition selects the
 * sections for the open menu — terminal product content, the generic DOM
 * and guest sections, or the shell-verb fallback — and hands them to the
 * shell host, which renders without knowing any of them.
 *
 * Every right-click in the app resolves here first. Radix-owned surfaces
 * (session rows and other `context-menu-trigger` wrappers) keep their own
 * menus; the reaction bubble keeps plain right-clicks; terminals answer
 * through their registered xterm handles; everything else gets a menu
 * assembled from what the click landed on — link, image, editable,
 * selection — with the window verbs as the empty-target fallback.
 */
export function AppContextMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const open = useStore($contextMenu)

  useEffect(() => {
    // stopPropagation beats other renderer handlers; preventDefault is never
    // called because Chromium emits the main-process context-menu event (the
    // spellcheck + image-coordinate source) only for unprevented gestures —
    // and with no Menu.popup anywhere, "default" means no menu at all.
    const onContextMenu = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null

      // Surfaces with their own Radix context menu keep the whole gesture.
      // Guard the dedicated marker first: Radix `asChild` Slot merges
      // `mergeProps(slotProps, childProps)` so the child's `data-slot` wins
      // (status bar footer is `data-slot="statusbar"`). The marker is stamped
      // after `{...props}` on ContextMenuTrigger and is not overwritten.
      if (element?.closest(`[${HERMES_CONTEXT_MENU_TRIGGER_ATTR}], [data-slot="context-menu-trigger"]`)) {
        return
      }

      // A terminal's canvas has no DOM to resolve; its registered handle
      // carries the xterm selection and paste path instead.
      const terminal = terminalMenuHandleFor(element)

      if (terminal) {
        event.stopPropagation()
        openTerminalContextMenu(event.clientX, event.clientY, terminal)

        return
      }

      const target = resolveDomTarget(element)
      const owned = Boolean(target.linkUrl || target.onImage || target.editable || target.selectionText)

      // The reaction bubble owns bare right-clicks; a link inside it still
      // opens the link menu.
      if (!owned && element?.closest(`[${CONTEXT_MENU_SKIP_ATTR}]`)) {
        return
      }

      event.stopPropagation()
      openDomContextMenu(event.clientX, event.clientY, target)
    }

    window.addEventListener('contextmenu', onContextMenu, true)

    return () => window.removeEventListener('contextmenu', onContextMenu, true)
  }, [])

  const sections = open
    ? open.kind === 'terminal'
      ? terminalSections(open, t)
      : open.kind === 'guest'
        ? guestSections(open, t)
        : (list => (list.length ? list : shellSections({ navigate, t })))(domSections(open, t))
    : []

  return <ContextMenuHost sections={sections} />
}
