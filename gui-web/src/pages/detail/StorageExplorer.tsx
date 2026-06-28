/**
 * Storage Explorer — file tree + raw JSON editor for every file.
 * The escape hatch for config keys not covered by form editors.
 */

import { useCallback, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { readFile, saveFile } from '@/api/files'

export function StorageExplorer({ profilePath, fileTree, onRefresh }: {
  profilePath: string
  fileTree: string[]
  onRefresh: () => void
}) {
  const files = [...fileTree].sort()
  const [selected, setSelected] = useState<string>('')
  const [editContent, setEditContent] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const openFile = useCallback(async (path: string) => {
    setSelected(path)
    try {
      const content = await readFile(path)
      setEditContent(content)
    } catch {
      setEditContent('')
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    try {
      await saveFile(selected, editContent)
      onRefresh()
    } finally {
      setSaving(false)
    }
  }, [selected, editContent, onRefresh])

  // Group files by directory
  const configFile = files.find((f) => f.endsWith('settings.json'))
  const claudeMd = files.find((f) => f.endsWith('CLAUDE.md'))
  const claudeJson = files.find((f) => f.endsWith('dot-claude.json'))
  const other = files.filter((f) => f !== configFile && f !== claudeMd && f !== claudeJson)

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* File tree */}
      <Card className="col-span-1">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Files</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[600px] overflow-auto">
          {configFile && (
            <FileRow path={configFile} label="settings.json" selected={selected} onClick={openFile} />
          )}
          {claudeMd && (
            <FileRow path={claudeMd} label="CLAUDE.md" selected={selected} onClick={openFile} />
          )}
          {claudeJson && (
            <FileRow path={claudeJson} label="dot-claude.json" selected={selected} onClick={openFile} />
          )}
          {other.map((f) => (
            <FileRow
              key={f}
              path={f}
              label={f.replace(profilePath + '/', '')}
              selected={selected}
              onClick={openFile}
            />
          ))}
          {files.length === 0 && (
            <p className="text-xs text-muted-foreground">No files found</p>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono">
            {selected ? selected.replace(profilePath + '/', '') : 'Select a file'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selected ? (
            <>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={20}
                className="text-sm font-mono"
              />
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save File'}
              </Button>
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

function FileRow({ path, label, selected, onClick }: {
  path: string; label: string; selected: string; onClick: (p: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(path)}
      className={`block w-full text-left text-xs font-mono px-2 py-1 rounded truncate
        ${selected === path ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      title={path}
    >
      {label}
    </button>
  )
}
