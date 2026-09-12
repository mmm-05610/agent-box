import type { ReactNode } from 'react'

import { writeClipboardText } from '@/components/ui/copy-button'
import { type Translations } from '@/i18n'
import { isRemoteGateway } from '@/lib/desktop-fs'
import { hostPathLabel, hudForcesNativeLinks, normalizeExternalUrl, openExternalLink } from '@/lib/external-link'
import { reachablePreviewUrl } from '@/lib/preview-reach'
import { openPreview } from '@/store/preview'

import { EDIT_SHORTCUTS, Item } from './item'
import { closeContextMenu, type OpenContextMenu } from './store'
import { isWebUrl } from './target'

const LOOPBACK_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i

function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

export function domSections(open: Extract<OpenContextMenu, { kind: 'dom' }>, t: Translations): ReactNode[][] {
  const copy = t.contextMenu
  const { spellcheck, target } = open
  const sections: ReactNode[][] = []
  const linkUrl = target.linkUrl ? normalizeExternalUrl(target.linkUrl) : ''
  const linkIsWeb = isWebUrl(linkUrl)
  const imageIsWeb = isWebUrl(target.imageUrl)
  const openInApp = !hudForcesNativeLinks()
  const showResolvedCopy = linkIsWeb && isRemoteGateway() && isLoopbackUrl(linkUrl)

  // The edit verbs and spell-check actions act on the sender's FOCUSED
  // element in main. Focus cannot be restored while the menu is open: the
  // radix content is a focus trap, so a focus() here is immediately stolen
  // back, the command then runs against `body`, and select-all grabs the
  // WHOLE transcript instead of the field. Close the menu first, then focus
  // and dispatch on the next frame — after the trap is unmounted.
  const withEditableFocus = (action: () => void) => {
    const editable = target.editable

    closeContextMenu()
    requestAnimationFrame(() => {
      editable?.focus()
      action()
    })
  }

  const editableCommand = (command: 'copy' | 'cut' | 'paste') => {
    withEditableFocus(() => void window.hermesDesktop?.contextMenuEdit?.(command))
  }

  // Select all runs entirely in the renderer, scoped to the editable itself.
  // Main's selectAll acts on whatever the FOCUSED FRAME considers "all" and
  // has no notion of the field the menu was opened on — with any focus slip
  // (the edit composer re-parents focus on blur) it selected the whole
  // transcript. A renderer range cannot escape the field.
  const selectAllInEditable = () => {
    withEditableFocus(() => {
      const editable = target.editable

      if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
        editable.select()

        return
      }

      if (editable) {
        const range = document.createRange()

        range.selectNodeContents(editable)

        const selection = window.getSelection()

        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    })
  }

  const spellcheckAction = (action: { kind: 'add' | 'replace'; word: string }) => {
    withEditableFocus(() => void window.hermesDesktop?.contextMenuSpellcheck?.(action))
  }

  if (linkUrl) {
    sections.push(
      [
        linkIsWeb && openInApp ? (
          <Item
            icon="globe"
            key="link-open-app"
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
          key="link-open-external"
          label={copy.link.openExternal}
          onSelect={() => openExternalLink(linkUrl)}
        />,
        <Item
          icon="copy"
          key="link-copy"
          label={copy.link.copyUrl}
          onSelect={() => void writeClipboardText(linkUrl)}
        />,
        showResolvedCopy ? (
          <Item
            icon="copy"
            key="link-copy-resolved"
            label={copy.link.copyResolvedUrl}
            onSelect={() => reachablePreviewUrl(linkUrl).then(writeClipboardText)}
          />
        ) : null
      ].filter(Boolean)
    )
  }

  if (target.onImage) {
    sections.push(
      [
        imageIsWeb && openInApp ? (
          <Item
            icon="globe"
            key="image-open-app"
            label={copy.link.openInApp}
            onSelect={() =>
              openPreview(
                { kind: 'url', label: hostPathLabel(target.imageUrl), source: target.imageUrl, url: target.imageUrl },
                'explicit-link'
              )
            }
          />
        ) : null,
        imageIsWeb ? (
          <Item
            icon="link-external"
            key="image-open-external"
            label={copy.link.openExternal}
            onSelect={() => openExternalLink(target.imageUrl)}
          />
        ) : null,
        <Item
          icon="file-media"
          key="image-copy"
          label={copy.image.copyImage}
          onSelect={() => void window.hermesDesktop?.contextMenuCopyImage?.()}
        />,
        target.imageUrl ? (
          <Item
            icon="copy"
            key="image-copy-address"
            label={copy.image.copyImageAddress}
            onSelect={() => void writeClipboardText(target.imageUrl)}
          />
        ) : null,
        target.imageUrl ? (
          <Item
            icon="save"
            key="image-save"
            label={copy.image.saveImageAs}
            onSelect={() => void window.hermesDesktop?.saveImageFromUrl?.(target.imageUrl)}
          />
        ) : null
      ].filter(Boolean)
    )
  }

  if (target.editable) {
    if (spellcheck) {
      sections.push([
        ...spellcheck.suggestions
          .slice(0, 5)
          .map(suggestion => (
            <Item
              icon="edit"
              key={`spell-${suggestion}`}
              label={suggestion}
              onSelect={() => spellcheckAction({ kind: 'replace', word: suggestion })}
            />
          )),
        <Item
          icon="book"
          key="spell-add"
          label={copy.edit.addToDictionary}
          onSelect={() => spellcheckAction({ kind: 'add', word: spellcheck.misspelledWord })}
        />
      ])
    }

    // Verb availability mirrors the native menu: cut/copy act on the
    // SELECTION, so they need selected text — not just field content.
    // Inputs and textareas carry their selection on the element (Chrome
    // never reflects it into window.getSelection()); contenteditable uses
    // the document selection the resolver captured. Select all needs the
    // field to hold anything. Paste is intentionally NOT gated on a
    // clipboard probe: its action is webContents.paste() in main — the
    // same path Ctrl+V takes — which resolves the system clipboard itself,
    // while the renderer-side readClipboard probe can report empty on
    // Windows even when that path succeeds (#91553). Pasting with an
    // empty clipboard is a harmless no-op, so the item fails open.
    const formField =
      target.editable instanceof HTMLInputElement || target.editable instanceof HTMLTextAreaElement
        ? target.editable
        : null

    const fieldText = formField ? formField.value : (target.editable?.textContent ?? '')

    const hasFieldText = fieldText.length > 0

    const canCutCopy = formField
      ? (formField.selectionStart ?? 0) !== (formField.selectionEnd ?? 0)
      : target.selectionText.length > 0

    sections.push([
      <Item
        disabled={!canCutCopy}
        key="edit-cut"
        label={copy.edit.cut}
        onSelect={() => editableCommand('cut')}
        shortcut={EDIT_SHORTCUTS.cut}
      />,
      <Item
        disabled={!canCutCopy}
        key="edit-copy"
        label={t.common.copy}
        onSelect={() => editableCommand('copy')}
        shortcut={EDIT_SHORTCUTS.copy}
      />,
      <Item
        key="edit-paste"
        label={copy.edit.paste}
        onSelect={() => editableCommand('paste')}
        shortcut={EDIT_SHORTCUTS.paste}
      />
    ])
    sections.push([
      <Item
        disabled={!hasFieldText}
        key="edit-select-all"
        label={copy.edit.selectAll}
        onSelect={selectAllInEditable}
        shortcut={EDIT_SHORTCUTS.selectAll}
      />
    ])
  } else if (target.selectionText) {
    sections.push([
      <Item
        icon="copy"
        key="selection-copy"
        label={t.common.copy}
        onSelect={() => void writeClipboardText(target.selectionText)}
      />
    ])
  }

  return sections
}
