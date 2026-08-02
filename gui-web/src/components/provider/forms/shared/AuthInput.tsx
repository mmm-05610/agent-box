import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  disabled,
}: AuthInputProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const resolvedLabel = label || t('providerForm.authInput.defaultLabel')
  return (
    <Field label={resolvedLabel}>
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? (visible ? t('providerForm.authInput.visiblePlaceholder') : '••••••••')}
          type={visible ? 'text' : 'password'}
          className="pr-14 font-mono text-sm"
          disabled={disabled || readOnly}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={visible ? t('providerForm.authInput.hide') : t('providerForm.authInput.show')}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </Field>
  )
}
