import { useEffect, useState } from 'react'
import { Input } from '@/components/ui'

export interface KeyInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** Key input with placeholder-display logic.
 *  Keys starting with "option-" / "option_" (the timestamp placeholders we
 *  generate when adding new entries) display as empty so the user can type
 *  a real key without clearing the field first. Local state + onBlur
 *  prevents focus loss during editing. */
export function KeyInput({ value, onChange, disabled, placeholder, className }: KeyInputProps) {
  const isPlaceholder = value.startsWith('option-') || value.startsWith('option_')
  const displayValue = isPlaceholder ? '' : value
  const [localValue, setLocalValue] = useState(displayValue)

  useEffect(() => {
    setLocalValue(isPlaceholder ? '' : value)
  }, [value, isPlaceholder])

  return (
    <Input
      value={localValue}
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={() => {
        const trimmed = localValue.trim()
        if (!trimmed || trimmed === value) return
        onChange(trimmed)
      }}
      placeholder={placeholder}
      className={className ?? 'flex-1 font-mono text-sm'}
      disabled={disabled}
    />
  )
}
