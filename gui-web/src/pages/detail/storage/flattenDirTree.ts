/**
 * Flatten a DirTreeNode (the shape returned by Api.list_dir_tree /
 * TS `listDirTree`) into a flat list of files preserving size/mtime.
 *
 * Directories are dropped — only file nodes make it into the output. The
 * returned shape feeds directly into `buildTreeFromFlatList` so we get the
 * same VSCode-style nested rendering with size/mtime plumbed through.
 */

import type { DirTreeNode } from '@/api/files'
import type { FlatFile } from './buildTreeFromFlatList'

export function flattenDirTree(node: DirTreeNode | null | undefined): FlatFile[] {
  const out: FlatFile[] = []
  function walk(n: DirTreeNode) {
    if (n.type === 'file') {
      out.push({ path: n.path, size: n.size, mtime: n.mtime })
      return
    }
    if (n.children) {
      for (const c of n.children) walk(c)
    }
  }
  if (!node) return out
  // The root may itself be a 'file' in odd cases; fall through either way.
  walk(node)
  return out
}
