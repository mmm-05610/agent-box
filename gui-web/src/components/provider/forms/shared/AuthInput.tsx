import { useState } from 'react'
import { Input } from '@/components/ui'
import { EyeIcon, EyeOffIcon } from './icons'
import { Field } from './Field'

export interface AuthInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  disabled?: boolean
}

export function AuthInput({
  label = 'API Key',
  value,
  onChange,
  placeholder,
  readOnly,
  disabled,
}: AuthInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? (visible ? 'your-api-key' : '••••••••')}
          type={visible ? 'text' : 'password'}
          className="pr-14 font-mono text-sm"
          disabled={disabled || readOnly}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={visible ? '隐藏' : '显示'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </Field>
  )
}
