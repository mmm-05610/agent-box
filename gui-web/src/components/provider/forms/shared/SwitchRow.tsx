import type { ReactNode } from 'react'
import { Toggle } from './Toggle'

export interface SwitchRowProps {
  title: string
  hint?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function SwitchRow({ title, hint, checked, onChange, disabled }: SwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  )
}
