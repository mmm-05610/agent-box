import { useCallback, useRef, useState } from 'react'

export interface OpenFile {
  path: string
  content: string
  /** Last saved snapshot of the content on disk. */
  savedContent: string
  dirty: boolean
}

export interface WouldEvictDirtyResult {
  /** The path of an LRU-evictable dirty file that would be discarded, or null. */
  evictPath: string | null
}

/**
 * Hook to manage a small set of open files with LRU eviction.
 *
 * The hook itself never refuses to open a file — it always appends and trims
 * the LRU end. To prevent silent data loss when an LRU-evicted file is dirty,
 * callers should consult `wouldEvictDirty(newPath)` *before* `open()` and
 * surface a confirmation prompt to the user. See StorageExplorer for the
 * UI guard.
 */
export function useOpenFiles({ max }: { max: number }) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [active, setActive] = useState<string | null>(null)

  // Read-only mirror used to compute `wouldEvictDirty` against current state
  // without re-creating the closure on every render.
  const openFilesRef = useRef<OpenFile[]>([])
  openFilesRef.current = openFiles

  const open = useCallback(
    (path: string, content: string) => {
      setOpenFiles((prev) => {
        const existing = prev.find((f) => f.path === path)
        let next: OpenFile[]
        if (existing) {
          // move to front
          next = [{ ...existing, content, savedContent: content, dirty: false }, ...prev.filter((f) => f.path !== path)]
        } else {
          next = [{ path, content, savedContent: content, dirty: false }, ...prev]
          if (next.length > max) next = next.slice(0, max)
        }
        return next
      })
      setActive(path)
    },
    [max],
  )

  const updateContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, content, dirty: content !== f.savedContent } : f,
      ),
    )
  }, [])

  const markClean = useCallback((path: string) => {
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === path ? { ...f, savedContent: f.content, dirty: false } : f,
      ),
    )
  }, [])

  const close = useCallback((path: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== path))
    setActive((cur) => (cur === path ? null : cur))
  }, [])

  /**
   * Returns the path of the LRU-evictable dirty file that would be discarded
   * if `newPath` were opened now, or null if no eviction would happen or the
   * only evictable file is clean.
   *
   * Used by the UI to confirm before silently dropping unsaved edits.
   */
  const wouldEvictDirty = useCallback(
    (newPath: string): WouldEvictDirtyResult => {
      const current = openFilesRef.current
      // Already open → no eviction.
      if (current.some((f) => f.path === newPath)) return { evictPath: null }
      if (current.length < max) return { evictPath: null }
      // current is ordered most-recent-first; the LRU victim is the LAST entry.
      const victim = current[current.length - 1]
      if (!victim) return { evictPath: null }
      // If victim is the same path as newPath (defensive), no eviction.
      if (victim.path === newPath) return { evictPath: null }
      return victim.dirty ? { evictPath: victim.path } : { evictPath: null }
    },
    [max],
  )

  return {
    openFiles,
    active,
    open,
    setActive,
    updateContent,
    markClean,
    close,
    wouldEvictDirty,
  }
}
