import { Input } from '@/components/ui'
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

export function ProviderIdentityFields({ name, notes, websiteUrl, onChange, readOnly, apiKeyUrl, namePlaceholder = '例如：OpenRouter' }: ProviderIdentityFieldsProps) {
  const keyUrl = apiKeyUrl || websiteUrl
  return <>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="供应商名称"><Input value={name} onChange={(event) => onChange({ name: event.target.value })} placeholder={namePlaceholder} className="text-sm" disabled={readOnly} /></Field>
      <Field label="备注"><Input value={notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="例如：公司专用账号" className="text-sm" disabled={readOnly} /></Field>
    </div>
    <Field label="官网链接"><Input value={websiteUrl} onChange={(event) => onChange({ websiteUrl: event.target.value })} placeholder="https://example.com" className="font-mono text-sm" disabled={readOnly} /></Field>
    {keyUrl && <a href={keyUrl} target="_blank" rel="noreferrer" className="-mt-4 block text-sm text-blue-500 hover:underline">获取 API Key</a>}
  </>
}
