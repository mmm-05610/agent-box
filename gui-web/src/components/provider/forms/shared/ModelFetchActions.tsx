import { Button } from '@/components/ui'
import { DownloadIcon, PlusIcon, SpinnerIcon } from './icons'

export interface ModelFetchActionsProps {
  fetching?: boolean
  onFetch: () => void
  onAdd: () => void
  fetchDisabled?: boolean
  addDisabled?: boolean
  fetchLabel?: string
  addLabel?: string
}

export function ModelFetchActions({ fetching, onFetch, onAdd, fetchDisabled, addDisabled, fetchLabel = '获取模型列表', addLabel = '添加模型' }: ModelFetchActionsProps) {
  return <div className="flex gap-2">
    <Button type="button" variant="outline" size="sm" onClick={onFetch} disabled={fetchDisabled || fetching} className="h-7 gap-1">
      {fetching ? <><SpinnerIcon />获取中…</> : <><DownloadIcon />{fetchLabel}</>}
    </Button>
    <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={addDisabled} className="h-7 gap-1"><PlusIcon />{addLabel}</Button>
  </div>
}
