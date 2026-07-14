import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOpenFiles } from './useOpenFiles'

describe('useOpenFiles', () => {
  it('opens a file and reports dirty status', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }))
    act(() => result.current.open('/a/b.md', 'hello'))
    expect(result.current.openFiles[0]).toMatchObject({ path: '/a/b.md', content: 'hello', dirty: false })
    act(() => result.current.updateContent('/a/b.md', 'hello!'))
    expect(result.current.openFiles[0].dirty).toBe(true)
  })

  it('switches active file', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }))
    act(() => {
      result.current.open('/a.md', 'A')
      result.current.open('/b.md', 'B')
    })
    expect(result.current.active).toBe('/b.md')
    act(() => result.current.setActive('/a.md'))
    expect(result.current.active).toBe('/a.md')
  })

  it('evicts least-recently-used when over max', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 2 }))
    act(() => {
      result.current.open('/a.md', 'A')
      result.current.open('/b.md', 'B')
      result.current.open('/c.md', 'C')
    })
    const paths = result.current.openFiles.map((f) => f.path)
    expect(paths).not.toContain('/a.md')
    expect(paths).toContain('/b.md')
    expect(paths).toContain('/c.md')
  })

  it('wouldEvictDirty returns the LRU dirty file when next open exceeds max', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 2 }))
    act(() => {
      result.current.open('/a.md', 'A') // oldest; will be LRU
      result.current.updateContent('/a.md', 'A-edited') // make a.md dirty
    })
    // /b.md has length=1, room to grow without evicting
    expect(result.current.wouldEvictDirty('/b.md')).toEqual({ evictPath: null })

    act(() => result.current.open('/b.md', 'B')) // now full (a.md, b.md)
    // Next open would evict the LRU, which is /a.md (still dirty)
    expect(result.current.wouldEvictDirty('/c.md')).toEqual({ evictPath: '/a.md' })
  })

  it('wouldEvictDirty returns null when only the LRU file is clean', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 2 }))
    act(() => {
      result.current.open('/a.md', 'A') // clean (just opened)
      result.current.open('/b.md', 'B')
    })
    expect(result.current.wouldEvictDirty('/c.md')).toEqual({ evictPath: null })
  })

  it('wouldEvictDirty returns null when opening a path already open', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 2 }))
    act(() => {
      result.current.open('/a.md', 'A')
      result.current.open('/b.md', 'B')
    })
    // opening /a.md again is a focus, not a new file; nothing is evicted
    expect(result.current.wouldEvictDirty('/a.md')).toEqual({ evictPath: null })
  })

  it('marks clean after successful save', () => {
    const { result } = renderHook(() => useOpenFiles({ max: 5 }))
    act(() => {
      result.current.open('/x.md', 'orig')
      result.current.updateContent('/x.md', 'edit')
    })
    expect(result.current.openFiles[0].dirty).toBe(true)
    act(() => result.current.markClean('/x.md'))
    expect(result.current.openFiles[0].dirty).toBe(false)
  })
})
