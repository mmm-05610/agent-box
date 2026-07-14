/**
 * Storage Explorer — VSCode-style file tree + Monaco editor + JSON save.
 * The escape hatch for config keys not covered by form editors.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { readFile, saveFile } from '@/api/files'
import { useToast } from '@/components/feedback/toast'
import { buildTreeFromFlatList, type FlatFile, type TreeNode } from './buildTreeFromFlatList'
import { validateJson } from './validateJson'
import { useOpenFiles } from './useOpenFiles'
import { FileTree } from './FileTree'
import { MonacoEditorPanel, detectLanguage } from './MonacoEditorPanel'
import { SaveBar } from './SaveBar'

export function StorageExplorer({ profilePath, fileTree }: {
  profilePath: string
  fileTree: FlatFile[]
}) {
  const { toast } = useToast()
  const [tree, setTree] = useState<TreeNode[]>([])
  const { openFiles, active, open, setActive, updateContent, markClean, wouldEvictDirty } =
    useOpenFiles({ max: 5 })
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // Build tree from the flat list returned by `flattenDirTree` (which feeds
  // off `list_dir_tree` on the bridge). Size and mtime are preserved so the
  // file tree can show them next to each leaf.
  useEffect(() => {
    setTree(buildTreeFromFlatList(fileTree, profilePath))
  }, [fileTree, profilePath])

  const openFile = useCallback(
    async (path: string) => {
      try {
        // C-1 guard: opening this path would silently discard unsaved
        // changes from a dirty LRU-evictable file. Ask before proceeding.
        const { evictPath } = wouldEvictDirty(path)
        if (evictPath && evictPath !== path) {
          const ok = window.confirm(
            `Opening ${path.split('/').pop()} will discard unsaved changes in ${evictPath.split('/').pop()}. Continue?`,
          )
          if (!ok) return
        }
        const content = await readFile(path)
        open(path, content)
      } catch {
        toast({ type: 'error', message: `Failed to read ${path}` })
      }
    },
    [open, toast, wouldEvictDirty],
  )

  const handleSave = useCallback(async () => {
    if (!active) return
    const file = openFiles.find((f) => f.path === active)
    if (!file) return

    const validation = validateJson(file.path, file.content)
    if (!validation.ok) {
      toast({ type: 'error', message: validation.error })
      return
    }

    setSaving(true)
    try {
      await saveFile(file.path, file.content)
      markClean(file.path)
      setLastSavedAt(Date.now())
      toast({ type: 'success', message: `Saved ${file.path.split('/').pop()}` })
    } catch (e: unknown) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [active, openFiles, markClean, toast])

  const activeFile = useMemo(() => openFiles.find((f) => f.path === active), [openFiles, active])

  return (
    <div className="grid grid-cols-[35%_1fr] gap-3 h-[640px]">
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto p-2">
          <FileTree
            tree={tree}
            rootLabel={profilePath.split('/').pop() ?? profilePath}
            selected={active}
            onSelect={openFile}
          />
        </CardContent>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1 overflow-x-auto">
          {openFiles.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setActive(f.path)}
              className={`text-xs px-2 py-1 rounded font-mono whitespace-nowrap ${
                active === f.path
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title={f.path}
            >
              {f.dirty && '● '}
              {f.path.split('/').pop()}
            </button>
          ))}
        </div>
        <CardContent className="flex-1 p-0 overflow-hidden">
          {activeFile ? (
            <MonacoEditorPanel
              language={detectLanguage(activeFile.path)}
              value={activeFile.content}
              onChange={(next) => updateContent(activeFile.path, next)}
            />
          ) : (
            <p className="p-4 text-xs text-muted-foreground">Click a file on the left to edit.</p>
          )}
        </CardContent>
        <SaveBar
          dirty={activeFile?.dirty ?? false}
          saving={saving}
          lastSavedAt={lastSavedAt}
          onSave={handleSave}
          path={activeFile?.path ?? null}
        />
      </Card>
    </div>
  )
}
