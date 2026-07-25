import type { ReactNode } from 'react'

export interface FieldProps {
  label: string
  hint?: ReactNode
  children: ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
