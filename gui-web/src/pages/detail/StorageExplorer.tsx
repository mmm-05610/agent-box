/**
 * Storage Explorer — flat tree on the left, plain textarea editor on the
 * right. Keep the editor simple: no Monaco, no multi-tab, no JSON schema
 * validation, no dirty-eviction dance. Users who want richer editing can
 * reach for VSCode.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { readFile, saveFile } from '@/api/files'
import { useToast } from '@/components/feedback/toast'
import { buildTreeFromFlatList, type TreeNode } from './buildTreeFromFlatList'
import { FileTree } from './FileTree'

export function StorageExplorer({ profilePath, fileTree, onRefresh }: {
  profilePath: string
  fileTree: string[]
  onRefresh?: () => void
}) {
  const { toast } = useToast()
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  // Build tree from flat list whenever fileTree or profilePath changes
  useEffect(() => {
    setTree(buildTreeFromFlatList(fileTree.map((p) => ({ path: p })), profilePath))
  }, [fileTree, profilePath])

  const dirty = content !== originalContent

  const handleSelect = useCallback(
    async (path: string) => {
      try {
        const text = await readFile(path)
        setSelected(path)
        setContent(text)
        setOriginalContent(text)
        setLastSavedAt(Date.now())
      } catch {
        toast({ type: 'error', message: `Failed to read ${path}` })
      }
    },
    [toast],
  )

  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    try {
      await saveFile(selected, content)
      setOriginalContent(content)
      setLastSavedAt(Date.now())
      toast({ type: 'success', message: `Saved ${selected.split('/').pop()}` })
      onRefresh?.()
    } catch (e: unknown) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [selected, content, onRefresh, toast])

  const activeFile = useMemo(() => {
    if (!selected) return null
    return { path: selected, name: selected.split('/').pop() ?? selected }
  }, [selected])

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* File tree */}
      <Card className="col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Files</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-auto p-2">
          <FileTree
            tree={tree}
            rootLabel={profilePath.split('/').pop() ?? profilePath}
            selected={selected}
            onSelect={handleSelect}
          />
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">
            {activeFile ? activeFile.name : 'Select a file'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected ? (
            <>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={20}
                className="w-full text-sm font-mono rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-foreground/30"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {saving
                    ? 'Saving…'
                    : dirty
                      ? 'Unsaved changes'
                      : lastSavedAt
                        ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString()}`
                        : ''}
                </span>
                <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click a file on the left to edit it here.
              Use this for settings keys not covered by the other tabs.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
