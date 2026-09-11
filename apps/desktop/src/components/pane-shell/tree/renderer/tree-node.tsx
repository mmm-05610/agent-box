import type { LayoutNodeRenderProps } from './renderer-types'
import { TreeGroup } from './tree-group'
import { TreeSplit } from './tree-split'

/** Dispatch a layout node to its renderer — the split/group recursion point.
 *  A split is handed this same component as its child renderer, so the
 *  recursion never has to import back into this module. See `renderer-types.ts`
 *  for what each prop means. */
export function TreeNode({ node, parentAxis, railSide, root, rootRow }: LayoutNodeRenderProps) {
  return node.type === 'split' ? (
    <TreeSplit node={node} renderNode={TreeNode} root={root} rootRow={rootRow} />
  ) : (
    <TreeGroup node={node} parentAxis={parentAxis} railSide={railSide} />
  )
}
