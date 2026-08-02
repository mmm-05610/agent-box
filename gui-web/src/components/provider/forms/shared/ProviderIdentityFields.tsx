import { Input } from '@/components/ui'
import { useTranslation } from 'react-i18next'
import { Field } from './Field'

export interface ProviderIdentityValue {
  name: string
  notes: string
  websiteUrl: string
}

export interface ProviderIdentityFieldsProps extends ProviderIdentityValue {
  onChange: (patch: Partial<ProviderIdentityValue>) => void
  readOnly?: boolean
  apiKeyUrl?: string
  namePlaceholder?: string
}

export function ProviderIdentityFields({ name, notes, websiteUrl, onChange, readOnly, apiKeyUrl, namePlaceholder }: ProviderIdentityFieldsProps) {
  const { t } = useTranslation()
  const keyUrl = apiKeyUrl || websiteUrl
  const resolvedNamePlaceholder = namePlaceholder || t('providerForm.namePlaceholder.opencode')
  return <>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t('providerForm.providerName')}><Input value={name} onChange={(event) => onChange({ name: event.target.value })} placeholder={resolvedNamePlaceholder} className="text-sm" disabled={readOnly} /></Field>
      <Field label={t('providerForm.notes')}><Input value={notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder={t('providerForm.notesPlaceholder')} className="text-sm" disabled={readOnly} /></Field>
    </div>
    <Field label={t('providerForm.websiteUrl')}><Input value={websiteUrl} onChange={(event) => onChange({ websiteUrl: event.target.value })} placeholder={t('providerForm.websiteUrlPlaceholder')} className="font-mono text-sm" disabled={readOnly} /></Field>
    {keyUrl && <a href={keyUrl} target="_blank" rel="noreferrer" className="-mt-4 block text-sm text-blue-500 hover:underline">{t('providerForm.getApiKey')}</a>}
  </>
}
