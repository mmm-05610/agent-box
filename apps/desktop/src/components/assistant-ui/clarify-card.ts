import { queryAllVisible } from '@/lib/pane-visibility'
import { $activeTreeGroup, $hoveredTreeGroup } from '@/store/pane-shell/tree'

// Blockers that live INSIDE a chat surface. Inactive tabs stay mounted, so this
// one has to be visible-scoped: a clarify card waiting in a background thread
// must not take the foreground composer's letter keys.
const BLOCKING_IN_SURFACE = '[data-clarify-choices]'

/** The layout-tree zone a pane is rendered in — see `tree/renderer/tree-group`. */
const TREE_GROUP = '[data-tree-group]'

/**
 * THE live clarify card — the single card whose shortcuts are armed right now.
 *
 * Exported because the card's own `keydown` handler has to resolve the same
 * element this module does. Both bind the same keys on `window`, so if they
 * disagree about which card is live they act for different sessions: this
 * resolver yields to the VISIBLE card, while a handler keyed on anything else
 * (mount order, say) answers one the user cannot see.
 *
 * Visible is not by itself an identity, though. A split layout puts two chat
 * surfaces on screen at once, so both cards clear the hidden-pane filter and
 * taking the first remaining DOM match would pick document ORDER — the earlier
 * zone would own the keys permanently and the other visible card could never
 * receive its shortcut. Break that tie on the SAME hovered → focused zone
 * ladder every tab verb already runs (`tabTargetGroup` in `tree/store`,
 * mirrored for the model hotkey by `composerTargetInHoveredZone`, #74447)
 * rather than inventing a second notion of which surface is "the" one.
 *
 * The last resort stays document order rather than null on purpose: when
 * neither rung names a zone that holds a card (pointer off every zone, nothing
 * interacted with yet) returning null would leave Enter doing nothing at all,
 * which is a worse regression than the single-card behaviour it replaces.
 */
export const visibleClarifyCard = (): HTMLElement | null => {
  const cards = queryAllVisible<HTMLElement>(BLOCKING_IN_SURFACE)

  // Overwhelmingly the common case — nothing to disambiguate, no store read.
  if (cards.length < 2) {
    return cards[0] ?? null
  }

  for (const zone of [$hoveredTreeGroup.get(), $activeTreeGroup.get()]) {
    const card = zone ? cards.find(el => el.closest<HTMLElement>(TREE_GROUP)?.dataset.treeGroup === zone) : undefined

    if (card) {
      return card
    }
  }

  return cards[0]
}
