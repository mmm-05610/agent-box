import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { KeyInput } from './KeyInput'
import { PlusIcon, TrashIcon } from './icons'

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try { return JSON.stringify(value) } catch { return String(value) }
}

function parseValue(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try { return JSON.parse(trimmed) } catch { return value }
}

export interface KeyValueEditorProps {
  value: Record<string, unknown>
  onChange?: (next: Record<string, unknown>) => void
  readOnly?: boolean
  emptyLabel: string
  addLabel?: string
  showColumnHeader?: boolean
  hideAddButton?: boolean
  keyPlaceholder?: string
  valuePlaceholder?: string
}

/** Generic key-value pair editor.
 *  Used by OpenCode Extra Options + Model 属性/SDK 选项,
 *  reusable by any future form that needs structured dict editing. */
export function KeyValueEditor({
  value, onChange, readOnly, emptyLabel,
  addLabel,
  showColumnHeader = false,
  hideAddButton = false,
  keyPlaceholder,
  valuePlaceholder,
}: KeyValueEditorProps) {
  const { t } = useTranslation()
  const entries = Object.entries(value)
  const resolvedAddLabel = addLabel ?? t('providerForm.keyValue.add')
  const resolvedKeyPlaceholder = keyPlaceholder ?? t('providerForm.keyValue.keyPlaceholder')
  const resolvedValuePlaceholder = valuePlaceholder ?? t('providerForm.keyValue.valuePlaceholder')
  const replaceEntry = (index: number, key: string, nextValue: unknown) => {
    const next = Object.fromEntries(
      entries.map(([entryKey, entryValue], entryIndex) =>
        entryIndex === index ? [key, nextValue] : [entryKey, entryValue],
      ),
    )
    onChange?.(next)
  }

  return (
    <div className="space-y-2">
      {entries.length > 0 && showColumnHeader && (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span className="flex-1">{t('providerForm.keyValue.keyColumn')}</span>
          <span className="flex-1">{t('providerForm.keyValue.valueColumn')}</span>
          <span className="w-9" />
        </div>
      )}
      {entries.map(([key, entryValue], index) => (
        <div key={`${key}-${index}`} className="flex items-center gap-2">
          <KeyInput
            value={key}
            onChange={(newKey) => replaceEntry(index, newKey, entryValue)}
            disabled={readOnly || !onChange}
            placeholder={resolvedKeyPlaceholder}
          />
          <Input
            value={stringifyValue(entryValue)}
            onChange={(event) => replaceEntry(index, key, parseValue(event.target.value))}
            placeholder={resolvedValuePlaceholder}
            className="flex-1 font-mono text-sm"
            disabled={readOnly || !onChange}
          />
          <button
            type="button"
            onClick={() => onChange?.(Object.fromEntries(entries.filter((_, i) => i !== index)))}
            disabled={readOnly || !onChange}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={t('providerForm.keyValue.delete')}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      {entries.length === 0 && <p className="py-2 text-sm text-muted-foreground">{emptyLabel}</p>}
      {!hideAddButton && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange?.({ ...value, [`option-${Date.now()}`]: '' })}
          disabled={readOnly || !onChange}
          className="h-7 gap-1"
        >
          <PlusIcon />{resolvedAddLabel}
        </Button>
      )}
    </div>
  )
}
