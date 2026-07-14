import { describe, it, expect } from 'vitest'
import { buildTreeFromFlatList, type FlatFile } from './buildTreeFromFlatList'

describe('buildTreeFromFlatList', () => {
  it('groups files by directory', () => {
    const files: FlatFile[] = [
      { path: '/root/a/x.md' },
      { path: '/root/a/y.json' },
      { path: '/root/b/z.txt' },
    ]
    const tree = buildTreeFromFlatList(files, '/root')
    expect(tree).toEqual([
      {
        type: 'dir',
        path: '/root/a',
        children: [
          { type: 'file', path: '/root/a/x.md' },
          { type: 'file', path: '/root/a/y.json' },
        ],
      },
      {
        type: 'dir',
        path: '/root/b',
        children: [{ type: 'file', path: '/root/b/z.txt' }],
      },
    ])
  })

  it('puts files at root when no subdirectory', () => {
    const files: FlatFile[] = [
      { path: '/root/x.md' },
      { path: '/root/y.json' },
    ]
    const tree = buildTreeFromFlatList(files, '/root')
    expect(tree).toEqual([
      { type: 'file', path: '/root/x.md' },
      { type: 'file', path: '/root/y.json' },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(buildTreeFromFlatList([], '/root')).toEqual([])
  })

  it('ignores files outside the root prefix', () => {
    const files: FlatFile[] = [
      { path: '/other/x.md' },
      { path: '/root/y.json' },
    ]
    const tree = buildTreeFromFlatList(files, '/root')
    expect(tree).toEqual([{ type: 'file', path: '/root/y.json' }])
  })
})
