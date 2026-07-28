import type { FetchedModel } from '@/api'

export interface ModelDropdownProps {
  models: FetchedModel[]
  onSelect: (model: FetchedModel) => void
  disabled?: boolean
  className?: string
}

export function ModelDropdown({ models, onSelect, disabled, className = '' }: ModelDropdownProps) {
  if (models.length === 0) return null
  return <select value="" onChange={(event) => {
    const model = models.find((item) => item.id === event.target.value)
    if (model) onSelect(model)
  }} disabled={disabled} className={`h-9 min-w-0 rounded-md border border-border bg-input px-2 text-xs text-foreground ${className}`}>
    <option value="">选择模型…</option>
    {models.map((model) => <option key={model.id} value={model.id}>{model.id}{model.ownedBy ? ` · ${model.ownedBy}` : ''}</option>)}
  </select>
}
