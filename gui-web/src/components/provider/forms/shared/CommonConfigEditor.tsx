/**
 * CommonConfigEditor — outer-dialog-level settings.json editor.
 *
 * Sits below the per-agent-type form in the AddProvider/EditProvider dialogs.
 * Lets the user inspect / override the raw settings_config JSON that will be
 * written to disk on save. Mirrors the inline editor that used to live inside
 * ClaudeProviderForm / HermesProviderForm / etc., but extracted to the dialog
 * shell so all four agent types share one editor.
 *
 * Two modes:
 *   - controlled: parent owns the value + onChange (recommended). Editor is
 *     editable and edits flow back through onChange.
 *   - read-only preview: no onChange — falls back to a syntax-highlighted
 *     preview of the parent-supplied value.
 */
import { useEffect, useState } from 'react'

export interface CommonConfigEditorProps {
  /** Current settings_config JSON string. */
  value: string
  /** Optional onChange — when provided, the editor is editable. */
  onChange?: (next: string) => void
  /** Title shown above the editor. */
  title?: string
  /** Hint shown below the title. */
  hint?: string
  /** Force read-only (overrides onChange presence for preview mode). */
  readOnly?: boolean
  /** Disabled (read-only + dimmed). */
  disabled?: boolean
}

export function CommonConfigEditor({
  value,
  onChange,
  title = 'settings.json (JSON)',
  hint,
  readOnly,
  disabled,
}: CommonConfigEditorProps) {
  const [localValue, setLocalValue] = useState(value)
  const lastSentRef = useLocalRef(value)

  // Sync parent → local when value changes from above.
  useEffect(() => {
    setLocalValue((current) => (value === current ? current : value))
  }, [value])

  const editable = !readOnly && Boolean(onChange)
  const effective = editable ? value : localValue

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-base font-medium">{title}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hint ?? (editable
              ? '该供应商的完整 settings_config JSON；修改后会被原样写入配置文件。普通编辑请使用上方结构化字段。'
              : '上方结构化字段对应的 settings_config JSON 预览（只读）；保存时由结构化字段自动生成。')}
          </p>
        </div>
        {!editable && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">实时预览</span>
        )}
      </div>
      <textarea
        value={effective}
        onChange={(event) => {
          if (!editable || disabled) return
          const next = event.target.value
          setLocalValue(next)
          if (next === lastSentRef.current) return
          lastSentRef.current = next
          onChange?.(next)
        }}
        rows={Math.min(16, Math.max(6, effective.split('\n').length + 1))}
        readOnly={!editable}
        disabled={disabled}
        aria-label={title}
        className="mt-3 w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}

// Tiny local ref helper so we don't have to import useRef at the top.
function useLocalRef<T>(initial: T) {
  const [ref] = useState(() => ({ current: initial }))
  ref.current = initial
  return ref
}
