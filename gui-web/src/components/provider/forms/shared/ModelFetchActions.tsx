import { Button } from '@/components/ui'
import { useTranslation } from 'react-i18next'
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

export function ModelFetchActions({ fetching, onFetch, onAdd, fetchDisabled, addDisabled, fetchLabel, addLabel }: ModelFetchActionsProps) {
  const { t } = useTranslation()
  const resolvedFetchLabel = fetchLabel ?? t('providerForm.modelFetch.fetch')
  const resolvedAddLabel = addLabel ?? t('providerForm.modelFetch.add')
  return <div className="flex gap-2">
    <Button type="button" variant="outline" size="sm" onClick={onFetch} disabled={fetchDisabled || fetching} className="h-7 gap-1">
      {fetching ? <><SpinnerIcon />{t('providerForm.modelFetch.fetching')}</> : <><DownloadIcon />{resolvedFetchLabel}</>}
    </Button>
    <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={addDisabled} className="h-7 gap-1"><PlusIcon />{resolvedAddLabel}</Button>
  </div>
}
