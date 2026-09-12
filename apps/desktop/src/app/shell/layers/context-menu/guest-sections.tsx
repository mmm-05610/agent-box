import type { ReactNode } from 'react'

import { writeClipboardText } from '@/components/ui/copy-button'
import { type Translations } from '@/i18n'
import { hostPathLabel, hudForcesNativeLinks, openExternalLink } from '@/lib/external-link'
import { openPreview } from '@/store/preview'

import { EDIT_SHORTCUTS, Item } from './item'
import { closeContextMenu, type OpenContextMenu } from './store'
import { isWebUrl } from './target'

/** The guest (in-app browser) menu: link/image/selection/editable sections
 *  from the Chromium params, plus select all for the page, closed by
 *  Inspect element. The page-level verbs (copy URL, open externally,
 *  console) live on the browser bar, not here. */
export function guestSections(open: Extract<OpenContextMenu, { kind: 'guest' }>, t: Translations): ReactNode[][] {
  const copy = t.contextMenu
  const { guest, params } = open
  const sections: ReactNode[][] = []
  const linkUrl = params.linkURL
  const imageUrl = params.srcURL
  const openInApp = !hudForcesNativeLinks()

  // Same trap-timing rule as the dom side: dispatch AFTER the menu closes,
  // so the webview's focus() is not stolen back by the radix content.
  const guestEdit = (command: 'copy' | 'cut' | 'paste' | 'selectAll') => {
    closeContextMenu()
    requestAnimationFrame(() => guest.editCommand(command))
  }

  if (linkUrl) {
    sections.push(
      [
        isWebUrl(linkUrl) && openInApp ? (
          <Item
            icon="globe"
            key="guest-link-open-app"
            label={copy.link.openInApp}
            onSelect={() =>
              openPreview(
                { kind: 'url', label: hostPathLabel(linkUrl), source: linkUrl, url: linkUrl },
                'explicit-link'
              )
            }
          />
        ) : null,
        <Item
          icon="link-external"
          key="guest-link-open-external"
          label={copy.link.openExternal}
          onSelect={() => openExternalLink(linkUrl)}
        />,
        <Item
          icon="copy"
          key="guest-link-copy"
          label={copy.link.copyUrl}
          onSelect={() => void writeClipboardText(linkUrl)}
        />
      ].filter(Boolean)
    )
  }

  if (params.hasImageContents || imageUrl) {
    sections.push(
      [
        isWebUrl(imageUrl) ? (
          <Item
            icon="link-external"
            key="guest-image-open-external"
            label={copy.link.openExternal}
            onSelect={() => openExternalLink(imageUrl)}
          />
        ) : null,
        params.hasImageContents ? (
          <Item icon="file-media" key="guest-image-copy" label={copy.image.copyImage} onSelect={guest.copyImage} />
        ) : null,
        imageUrl ? (
          <Item
            icon="copy"
            key="guest-image-copy-address"
            label={copy.image.copyImageAddress}
            onSelect={() => void writeClipboardText(imageUrl)}
          />
        ) : null,
        imageUrl ? (
          <Item
            icon="save"
            key="guest-image-save"
            label={copy.image.saveImageAs}
            onSelect={() => void window.hermesDesktop?.saveImageFromUrl?.(imageUrl)}
          />
        ) : null
      ].filter(Boolean)
    )
  }

  if (params.isEditable) {
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      sections.push([
        ...params.dictionarySuggestions
          .slice(0, 5)
          .map(suggestion => (
            <Item
              icon="edit"
              key={`guest-spell-${suggestion}`}
              label={suggestion}
              onSelect={() => guest.replaceMisspelling(suggestion)}
            />
          )),
        <Item
          icon="book"
          key="guest-spell-add"
          label={copy.edit.addToDictionary}
          onSelect={() => guest.addToDictionary(params.misspelledWord)}
        />
      ])
    }

    // Chromium's editFlags gate the verbs — the same availability verdict
    // the native menu showed (empty field → no cut/copy/select-all, empty
    // clipboard → no paste).
    sections.push([
      <Item
        disabled={!params.editFlags.canCut}
        key="guest-edit-cut"
        label={copy.edit.cut}
        onSelect={() => guestEdit('cut')}
        shortcut={EDIT_SHORTCUTS.cut}
      />,
      <Item
        disabled={!params.editFlags.canCopy}
        key="guest-edit-copy"
        label={t.common.copy}
        onSelect={() => guestEdit('copy')}
        shortcut={EDIT_SHORTCUTS.copy}
      />,
      <Item
        disabled={!params.editFlags.canPaste}
        key="guest-edit-paste"
        label={copy.edit.paste}
        onSelect={() => guestEdit('paste')}
        shortcut={EDIT_SHORTCUTS.paste}
      />
    ])
    sections.push([
      <Item
        disabled={!params.editFlags.canSelectAll}
        key="guest-edit-select-all"
        label={copy.edit.selectAll}
        onSelect={() => guestEdit('selectAll')}
        shortcut={EDIT_SHORTCUTS.selectAll}
      />
    ])
  } else if (params.selectionText.trim()) {
    sections.push([
      <Item icon="copy" key="guest-selection-copy" label={t.common.copy} onSelect={() => guestEdit('copy')} />
    ])
  }

  // Text tool for the page itself: select all works everywhere Chromium
  // says it can (a bare page has no field to scope to, so it selects the
  // page content).
  if (!params.isEditable) {
    sections.push([
      <Item
        disabled={!params.editFlags.canSelectAll}
        key="guest-select-all"
        label={copy.edit.selectAll}
        onSelect={() => guestEdit('selectAll')}
        shortcut={EDIT_SHORTCUTS.selectAll}
      />
    ])
  }

  // Inspect element closes every guest menu — the one page tool that earns
  // its place on any click. The other page verbs (copy URL, open
  // externally, console) live on the browser bar only.
  sections.push([
    <Item icon="inspect" key="guest-inspect" label={copy.page.inspectElement} onSelect={guest.inspectElement} />
  ])

  return sections
}
