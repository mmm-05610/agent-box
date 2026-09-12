import { useStore } from '@nanostores/react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

import { $contextMenu, augmentSpellcheck, closeContextMenu, type SpellcheckContext } from './store'

/** A host-provided source for the late spell-check facts of the open menu.
 *  Returns the unsubscribe (or nothing when there is no such source). */
export type ContextMenuSpellcheckSubscribe = (
  onFacts: (payload: SpellcheckContext) => void
) => (() => void) | undefined

/** The context-menu HOST: presentation, keyboard, and the close lifecycle
 *  for a menu whose sections were already chosen by composition. It does
 *  not know what those sections are, and it does not know where spell-check
 *  facts come from — that subscription is injected. */
export function ContextMenuHost({
  sections,
  subscribeSpellcheck
}: {
  sections: ReactNode[][]
  subscribeSpellcheck?: ContextMenuSpellcheckSubscribe
}) {
  const open = useStore($contextMenu)

  // Spell-check facts arrive after the menu opens (Chromium reports them on
  // its own context-menu event); attach them to the open menu.
  useEffect(() => subscribeSpellcheck?.(augmentSpellcheck), [subscribeSpellcheck])

  if (!open) {
    return null
  }

  return (
    <DropdownMenu
      onOpenChange={openState => {
        if (!openState) {
          closeContextMenu()
        }
      }}
      open
    >
      <DropdownMenuTrigger asChild>
        {/* A zero-size anchor at the click point: the menu positions against
            it exactly like a real trigger. */}
        <span aria-hidden style={{ left: open.x, position: 'fixed', top: open.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={event => event.preventDefault()}
        portalContainer={open.kind === 'dom' ? open.target.dialogPortalContainer : undefined}
        side="bottom"
      >
        {sections.map((section, index) => (
          // Sections are positional by construction, so the index IS the key.
          <div className="contents" key={index}>
            {index > 0 && <DropdownMenuSeparator />}
            {section}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
