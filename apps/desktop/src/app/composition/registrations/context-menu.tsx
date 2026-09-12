import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import {
  type DomContextMenuActions,
  domSections
} from '@/app/shell/layers/context-menu/dom-sections'
import {
  type GuestContextMenuActions,
  guestSections
} from '@/app/shell/layers/context-menu/guest-sections'
import { ContextMenuHost, type ContextMenuSpellcheckSubscribe } from '@/app/shell/layers/context-menu/host'
import {
  $contextMenu,
  openDomContextMenu,
  openTerminalContextMenu
} from '@/app/shell/layers/context-menu/store'
import { CONTEXT_MENU_SKIP_ATTR, resolveDomTarget } from '@/app/shell/layers/context-menu/target'
import { terminalMenuHandleFor } from '@/application/terminal/terminal-context-menu'
import { HERMES_CONTEXT_MENU_TRIGGER_ATTR } from '@/components/ui/context-menu'
import { writeClipboardText } from '@/components/ui/copy-button'
import { terminalSections } from '@/features/right-sidebar/terminal/context-menu-sections'
import { useI18n } from '@/i18n'
import { isRemoteGateway } from '@/lib/desktop-fs'
import { hostPathLabel, hudForcesNativeLinks, openExternalLink } from '@/lib/external-link'
import { reachablePreviewUrl } from '@/lib/preview-reach'
import { openPreview } from '@/store/preview'

import { contextMenuShellSections } from './context-menu-shell-sections'

/** Spell-check facts come from the desktop bridge: Chromium reports them on
 *  the main-process context-menu event, after the DOM gesture opened the
 *  menu. Module-level so the subscription identity stays stable for the
 *  host's mount-once effect. */
const subscribeSpellcheck: ContextMenuSpellcheckSubscribe = onFacts =>
  window.hermesDesktop?.onContextMenuSpellcheck?.(onFacts)

/** The in-app-browser link verb over the preview pane — the same target the
 *  link rows built before the verbs were injected. */
function openLinkInApp(url: string): void {
  openPreview({ kind: 'url', label: hostPathLabel(url), source: url, url }, 'explicit-link')
}

/** The operations the generic DOM sections dispatch to, over the existing
 *  bridges. Built per render: the capability facts read live connection and
 *  window state, exactly where the sections used to inspect it. */
function domMenuActions(): DomContextMenuActions {
  return {
    canOpenLinksInApp: !hudForcesNativeLinks(),
    canResolveLoopbackLinks: isRemoteGateway(),
    copyImage: () => void window.hermesDesktop?.contextMenuCopyImage?.(),
    copyResolvedLinkUrl: url => void reachablePreviewUrl(url).then(writeClipboardText),
    copyText: text => void writeClipboardText(text),
    editCommand: command => void window.hermesDesktop?.contextMenuEdit?.(command),
    openLinkExternal: url => openExternalLink(url),
    openLinkInApp,
    saveImage: url => void window.hermesDesktop?.saveImageFromUrl?.(url),
    spellcheckAction: action => void window.hermesDesktop?.contextMenuSpellcheck?.(action)
  }
}

/** The operations the generic guest sections dispatch to — the preview
 *  handle already carries the page verbs; these are the rest. */
function guestMenuActions(): GuestContextMenuActions {
  return {
    canOpenLinksInApp: !hudForcesNativeLinks(),
    copyText: text => void writeClipboardText(text),
    openLinkExternal: url => openExternalLink(url),
    openLinkInApp,
    saveImage: url => void window.hermesDesktop?.saveImageFromUrl?.(url)
  }
}

/**
 * THE app context menu assembly (batch 30 C3, verbs injected in batch 32):
 * composition selects the sections for the open menu — terminal product
 * content, the generic DOM and guest sections over injected product verbs,
 * or the shell-verb fallback — and hands them to the shell host, which
 * renders without knowing any of them.
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
        openTerminalContextMenu(event.clientX, event.clientY, terminal, () => window.hermesDesktop?.readClipboard?.())

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
        ? guestSections(open, t, guestMenuActions())
        : (list => (list.length ? list : contextMenuShellSections({ navigate, t })))(domSections(open, t, domMenuActions()))
    : []

  return <ContextMenuHost sections={sections} subscribeSpellcheck={subscribeSpellcheck} />
}
