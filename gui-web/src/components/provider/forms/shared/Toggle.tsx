export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

/** Compact pill toggle (h-5 w-9) — agent-box's signature style. */
export function Toggle({ checked, onChange, disabled, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-muted'} disabled:opacity-50`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-fast ${checked ? 'left-0.5 translate-x-4' : 'left-0.5'}`}
      />
    </button>
  )
}
