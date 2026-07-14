import { describe, it, expect } from 'vitest'
import type { DirTreeNode } from '@/api/files'
import { flattenDirTree } from './flattenDirTree'

describe('flattenDirTree', () => {
  it('returns empty array for null/undefined', () => {
    expect(flattenDirTree(null)).toEqual([])
    expect(flattenDirTree(undefined)).toEqual([])
  })

  it('flattens nested files preserving size and mtime', () => {
    const root: DirTreeNode = {
      path: '/root',
      type: 'dir',
      children: [
        {
          path: '/root/.claude',
          type: 'dir',
          children: [
            { path: '/root/.claude/settings.json', type: 'file', size: 128, mtime: 1700000000 },
            { path: '/root/.claude/CLAUDE.md', type: 'file', size: 1024, mtime: 1700000001 },
          ],
        },
        { path: '/root/README.md', type: 'file', size: 64, mtime: 1700000002 },
      ],
    }
    expect(flattenDirTree(root)).toEqual([
      { path: '/root/.claude/settings.json', size: 128, mtime: 1700000000 },
      { path: '/root/.claude/CLAUDE.md', size: 1024, mtime: 1700000001 },
      { path: '/root/README.md', size: 64, mtime: 1700000002 },
    ])
  })

  it('handles a single file at the root', () => {
    const root: DirTreeNode = { path: '/root/foo.md', type: 'file', size: 10 }
    expect(flattenDirTree(root)).toEqual([{ path: '/root/foo.md', size: 10 }])
  })

  it('skips files with missing size/mtime', () => {
    const root: DirTreeNode = {
      path: '/r',
      type: 'dir',
      children: [{ path: '/r/x.json', type: 'file' }],
    }
    expect(flattenDirTree(root)).toEqual([{ path: '/r/x.json' }])
  })
})
