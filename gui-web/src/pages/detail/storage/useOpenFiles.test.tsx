// @vitest-environment jsdom
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
