import { useCallback, useState } from 'react'

export interface OpenFile {
  path: string
  content: string
  /** Last saved snapshot of the content on disk. */
  savedContent: string
  dirty: boolean
}

export function useOpenFiles({ max }: { max: number }) {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [active, setActive] = useState<string | null>(null)

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

  return {
    openFiles,
    active,
    open,
    setActive,
    updateContent,
    markClean,
    close,
  }
}
