export interface FlatFile {
  path: string
  size?: number
  mtime?: number
}

export interface TreeNode {
  type: 'dir' | 'file'
  path: string
  children?: TreeNode[]
  size?: number
  mtime?: number
}

/**
 * Convert a flat list of file paths into a nested directory tree,
 * rooted at `root`. Files outside `root` are dropped. Directories
 * appearing only as implied parents are emitted with `type: 'dir'`.
 */
export function buildTreeFromFlatList(
  files: FlatFile[],
  root: string,
): TreeNode[] {
  const rootPrefix = root.endsWith('/') ? root : root + '/'
  const dirs = new Map<string, TreeNode>()
  const result: TreeNode[] = []

  for (const f of files) {
    if (!f.path.startsWith(rootPrefix)) continue
    const rel = f.path.slice(rootPrefix.length)
    if (!rel) continue
    const parts = rel.split('/')
    // ensure all parent dirs exist in `dirs`
    let cursor = rootPrefix.replace(/\/$/, '')
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = cursor + '/' + parts[i]
      if (!dirs.has(cursor)) {
        const node: TreeNode = { type: 'dir', path: cursor, children: [] }
        dirs.set(cursor, node)
      }
    }
    const fileNode: TreeNode = {
      type: 'file',
      path: f.path,
      size: f.size,
      mtime: f.mtime,
    }
    if (parts.length === 1) {
      result.push(fileNode)
    } else {
      const parentPath = rootPrefix + parts.slice(0, -1).join('/')
      dirs.get(parentPath)!.children!.push(fileNode)
    }
  }

  // sort: dirs first then files; alphabetical within each
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.path.localeCompare(b.path)
    })
    nodes.forEach((n) => n.children && sortRec(n.children))
  }

  // attach root-level dirs to result
  const rootDirs = Array.from(dirs.values()).filter((d) => {
    const rel = d.path.slice(rootPrefix.length - 1) // leading slash
    return !rel.slice(1).includes('/')
  })
  sortRec(rootDirs)
  sortRec(result)
  return [...rootDirs, ...result]
}
