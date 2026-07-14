// gui-web/src/pages/detail/storage/SaveBar.tsx
import { Button } from '@/components/ui'
import { formatRelativeTime } from '@/lib/utils'

export function SaveBar({
  dirty,
  saving,
  lastSavedAt,
  onSave,
  path,
}: {
  dirty: boolean
  saving: boolean
  lastSavedAt: number | null
  onSave: () => void
  path: string | null
}) {
  const tip = path ?? 'No file selected'
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
      <span className="font-mono text-xs text-muted-foreground truncate" title={tip}>
        {tip}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {saving
            ? 'Saving…'
            : dirty
              ? 'Unsaved changes'
              : lastSavedAt
                ? `Saved · ${formatRelativeTime(lastSavedAt)}`
                : ''}
        </span>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!path || !dirty || saving}
        >
          Save
        </Button>
      </div>
    </div>
  )
}