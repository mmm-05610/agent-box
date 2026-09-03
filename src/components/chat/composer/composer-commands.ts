import type { Editor } from "@tiptap/core"

import type { PromptInputBlock } from "@/lib/types"

import type { InputAttachment } from "../message-input-attachments"
import { blocksToRestoredDraft } from "./from-prompt-blocks"
import { textToSeededInlineContent } from "./plain-text-content"
import type { ReferenceAttrs } from "./types"

/**
 * Whether the composer has nothing sendable. Stricter than `editor.isEmpty`,
 * which is false for a whitespace-only document (the legacy textarea gated the
 * send button on `text.trim()`), but still treats a document holding only an
 * inline reference badge (e.g. an `@file` mention with no prose) as sendable.
 */
export function isComposerEmpty(editor: Editor): boolean {
  if (editor.isEmpty) return true
  if (editor.getText().trim().length > 0) return false
  let hasReference = false
  editor.state.doc.descendants((node) => {
    if (hasReference) return false
    if (node.type.name === "reference") {
      hasReference = true
      return false
    }
    return true
  })
  return !hasReference
}

// Elements that own their own click behavior: the editor surface, interactive
// controls, and inline badges. A mousedown landing on any of these (or a
// descendant) is NOT an "empty chrome" click.
const NON_CHROME_SELECTOR =
  '.ProseMirror, button, a, input, textarea, select, [role="button"], [role="combobox"], [role="menuitem"], [data-reference-badge], [contenteditable]'

/**
 * Whether a mousedown `target` landed on the message input's empty chrome — its
 * padding, the blank space below a short message, or the gaps in the action bar
 * — rather than on the editor surface or an interactive control. The host uses
 * this to focus the editor when the user clicks the otherwise-dead space around
 * it (only the editor surface itself used to be clickable).
 */
export function isComposerChromeClick(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(NON_CHROME_SELECTOR)
}

/**
 * Re-stamp the invocation prefix of every scoped skill badge in the document to
 * `prefix`. Codex triggers skills with `$`, every other agent with `/`, and a
 * badge freezes its prefix in at insert time (see `skillToReference`). A badge
 * inserted under one agent and then sent under another would carry the wrong
 * trigger — most visibly a `/`-baked skill sent to Codex, which parses the
 * leading `/skill` as a slash COMMAND and rejects the turn. Calling this
 * whenever the effective agent changes keeps the leading invocation in sync
 * with the selected agent.
 *
 * Only skill references carrying a `meta.scope` are agent-dependent. Bare ACP
 * slash commands (`commandToReference`, no scope) are always `/` and are left
 * untouched. The rewrite is a single attrs-only transaction kept out of the
 * undo history. Returns true if anything changed.
 */
export function restampSkillPrefixes(
  editor: Editor,
  prefix: "/" | "$"
): boolean {
  const updates: { pos: number; attrs: ReferenceAttrs }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "reference") return true
    const attrs = node.attrs as ReferenceAttrs
    if (
      attrs.refType === "skill" &&
      attrs.meta?.scope != null &&
      attrs.meta.invocationPrefix !== prefix
    ) {
      updates.push({
        pos,
        attrs: {
          ...attrs,
          meta: { ...attrs.meta, invocationPrefix: prefix },
        },
      })
    }
    return true
  })
  if (updates.length === 0) return false
  // Attrs-only `setNodeMarkup` never changes node sizes, so earlier positions
  // stay valid as later nodes are updated in the same transaction.
  const tr = editor.state.tr
  for (const { pos, attrs } of updates) {
    tr.setNodeMarkup(pos, undefined, attrs)
  }
  tr.setMeta("addToHistory", false)
  editor.view.dispatch(tr)
  return true
}

/**
 * Replay a previously-sent `PromptInputBlock[]` (a queued message's draft) back
 * into the editor: prose + reference badges in order, returning the out-of-band
 * attachments (images / embedded resources / non-composer links) for the host to
 * set. Inverse of `docToPromptBlocks` for the queue-edit round-trip. The editor
 * is cleared first so this fully replaces the current content.
 *
 * A text segment goes through {@link textToSeededInlineContent}, so the
 * references `docToPromptBlocks` serialized INTO that text (it emits one text
 * block with every badge inline) come back as badges instead of raw
 * `[label](uri)` / `/cmd` source — the same treatment paste and the other
 * seeding paths get. Lossless: re-serializing the restored badges reproduces the
 * block text verbatim.
 */
export function restoreBlocksIntoEditor(
  editor: Editor,
  blocks: PromptInputBlock[]
): InputAttachment[] {
  const { segments, attachments } = blocksToRestoredDraft(blocks)
  let chain = editor.chain().clearContent()
  for (const segment of segments) {
    chain =
      segment.kind === "text"
        ? chain.insertContent(textToSeededInlineContent(segment.text))
        : chain.insertReference(segment.attrs)
  }
  chain.focus("end").run()
  return attachments
}
