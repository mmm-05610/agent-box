"use client"

import { useCallback, type RefObject } from "react"

import type { AvailableCommandInfo } from "@/lib/types"

import { commandToReference } from "@/components/chat/composer/invocation-reference"
import type { RichComposerHandle } from "@/components/chat/composer/rich-composer"

export interface ComposerShortcuts {
  /** Inserts a command badge at the caret (no trigger token to replace). */
  insertSlashCommand: (cmd: AvailableCommandInfo) => void
}

export interface ComposerShortcutsOptions {
  editorRef: RefObject<RichComposerHandle | null>
}

/**
 * Everything the composer's "+" menu can insert: the agent's own `/` commands.
 *
 * Shared by the conversation composer and the to-do task composers so a task
 * brief is written with the same shortcuts as a chat message — the insertion
 * rules live here once.
 */
export function useComposerShortcuts({
  editorRef,
}: ComposerShortcutsOptions): ComposerShortcuts {
  // The "+" → Slash commands picker inserts a command badge at the current caret
  // (no trigger token to replace), adding a leading space if the caret isn't at
  // a boundary, and a trailing space after.
  const insertSlashCommand = useCallback(
    (cmd: AvailableCommandInfo) => {
      const editor = editorRef.current?.getEditor()
      if (!editor) return
      const { $from } = editor.state.selection
      const charBefore =
        $from.parentOffset > 0
          ? $from.parent.textBetween(
              $from.parentOffset - 1,
              $from.parentOffset,
              undefined,
              " "
            )
          : ""
      const needsSpace = charBefore !== "" && !/\s/.test(charBefore)
      let chain = editor.chain().focus()
      if (needsSpace) chain = chain.insertContent(" ")
      chain.insertReference(commandToReference(cmd)).insertContent(" ").run()
    },
    [editorRef]
  )

  return { insertSlashCommand }
}
