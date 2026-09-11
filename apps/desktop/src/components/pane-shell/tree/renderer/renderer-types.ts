/**
 * The contract every layout-node renderer shares, kept in its own module so the
 * dispatcher and the split renderer can both name it without importing each
 * other.
 */
import type { ComponentType } from 'react'

import type { LayoutNode } from '../model'

/**
 * `node` is any node in the layout tree. `parentAxis` is the containing split's
 * orientation — a group collapses ALONG that axis, so it picks the minimized
 * form (row → vertical rail, column → horizontal header). `railSide` is which
 * half of that row the child sits in — the rail's divider stroke faces the
 * content side. `root` marks the tree's top split (side collapse applies only
 * there). `rootRow` marks the row split that owns the side columns — usually
 * the root itself, but in a column-root layout (Terminal deck, Quad) it's the
 * row child holding sessions/workspace/files. Side collapse (⌘B/⌘J) applies
 * here.
 */
export interface LayoutNodeRenderProps {
  node: LayoutNode
  parentAxis?: 'column' | 'row'
  railSide?: 'left' | 'right'
  root?: boolean
  rootRow?: boolean
}

/**
 * Renders a layout node.
 *
 * `TreeSplit` takes one of these instead of importing `TreeNode`, which is what
 * keeps the split/group recursion a one-way module graph: the dispatcher
 * (`TreeNode`) hands itself down as the child renderer, and the split renders
 * every child through it. The recursive model is unchanged — `SplitNode.children`
 * is still `LayoutNode[]`, still rendered in place, still given the same
 * `parentAxis` / `railSide` / `rootRow` the split computes for that track.
 *
 * Importing `TreeNode` here would close the loop again; implementations are
 * passed in, never looked up.
 */
export type LayoutNodeRenderer = ComponentType<LayoutNodeRenderProps>
