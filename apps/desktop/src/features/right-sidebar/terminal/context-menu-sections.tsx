import type { ReactNode } from 'react'

import { Item } from '@/app/shell/layers/context-menu/item'
import type { OpenContextMenu } from '@/app/shell/layers/context-menu/store'
import { writeClipboardText } from '@/components/ui/copy-button'
import { type Translations } from '@/i18n'

/** The Terminal product section of the app context menu: copy / paste /
 *  select-all over the registered xterm handle. Ownership split (batch 30
 *  C3): composition selects this section, the shell host renders it.
 *  Action ids, order, enabled conditions and shortcuts unchanged. */
export function terminalSections(open: Extract<OpenContextMenu, { kind: 'terminal' }>, t: Translations): ReactNode[][] {
  const { terminal } = open
  const selection = terminal.getSelection()

  return [
    [
      selection ? (
        <Item
          icon="copy"
          key="terminal-copy"
          label={t.common.copy}
          onSelect={() => void writeClipboardText(selection)}
        />
      ) : null,
      terminal.paste ? (
        <Item
          disabled={!open.clipboardHasText}
          icon="clippy"
          key="terminal-paste"
          label={t.contextMenu.edit.paste}
          onSelect={() =>
            void window.hermesDesktop?.readClipboard().then(text => (text ? terminal.paste?.(text) : undefined))
          }
        />
      ) : null,
      <Item
        icon="list-selection"
        key="terminal-select-all"
        label={t.contextMenu.edit.selectAll}
        onSelect={() => terminal.selectAll()}
      />
    ].filter(Boolean)
  ]
}
