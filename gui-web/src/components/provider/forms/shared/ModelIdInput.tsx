import { useEffect, useState } from 'react'
import { Input } from '@/components/ui'
import { ChevronIcon } from './icons'
import type { FetchedModel } from '@/api/models'

export interface ModelIdInputProps {
  value: string
  models: FetchedModel[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  /** Enable local-state + onBlur for rename support (OpenCode needs this). */
  renameOnBlur?: boolean
}

/** Model ID input + chevron dropdown to select from fetched models.
 *  When `renameOnBlur` is true, the field uses local state + onBlur to
 *  support renaming the model ID without focus loss on every keystroke. */
export function ModelIdInput({
  value,
  models,
  onChange,
  disabled,
  placeholder = 'model-id',
  renameOnBlur = false,
}: ModelIdInputProps) {
  const [open, setOpen] = useState(false)
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const commit = (next: string) => {
    if (renameOnBlur) {
      const trimmed = next.trim()
      if (trimmed && trimmed !== value) onChange(trimmed)
    } else {
      onChange(next)
    }
  }

  return (
    <div className="relative flex gap-1">
      <Input
        value={renameOnBlur ? localValue : value}
        onChange={(event) => {
          if (renameOnBlur) {
            setLocalValue(event.target.value)
          } else {
            onChange(event.target.value)
          }
        }}
        onBlur={() => {
          if (renameOnBlur) commit(localValue)
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 font-mono text-sm"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || models.length === 0}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
        title={models.length === 0 ? '请先获取模型列表' : '选择已获取的模型'}
      >
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute top-10 z-50 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
          {models.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                commit(item.id)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              {item.id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
