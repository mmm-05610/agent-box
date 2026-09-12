/**
 * Zone eligibility for SESSION drops — the resolve-side half of the drop
 * contract shared with the zone overlay (hostsSessionDropTarget in
 * store/pane-shell/tree decides PAINT; this decides COMMIT). Living apart
 * from either resolver keeps them from importing each other (and dragging
 * their unrelated module graphs together), while still answering the same
 * question with the same pane predicates.
 */

import { findGroup } from '@/lib/pane-tree'
import { $layoutTree, isMainStripPane, isSessionStripPane } from '@/store/pane-shell/tree'

/** A session may land in any zone hosting a MAIN tile — another chat stack, a
 *  Browser tile, a page — never the sidebar/terminal zones. Returns the pane a
 *  stack anchors to, plus whether the zone hosts a CHAT surface (only those
 *  offer the link-to-composer center; a preview zone's center stacks). */
export function tileZoneHost(groupId: string): { chat: boolean; pane: string } | null {
  const tree = $layoutTree.get()
  const panes = tree ? (findGroup(tree, groupId)?.panes ?? []) : []
  const pane = panes.find(isSessionStripPane) ?? panes.find(isMainStripPane)

  return pane ? { chat: panes.some(isSessionStripPane), pane } : null
}
